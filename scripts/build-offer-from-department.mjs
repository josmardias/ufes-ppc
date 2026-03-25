#!/usr/bin/env node
/**
 * build-offer-from-department.mjs
 *
 * Parser for "Oferta de Disciplinas por Departamento (Modelo Ufes)" PDFs.
 * Targets files like:
 *   scripts/input/oferta-departamento-ambiental-2026-01.pdf
 *   scripts/input/oferta-departamento-elétrica-2026-01.pdf
 *   ...
 *
 * PDF structure per subject block:
 *
 *   <CODE NAME>                      e.g. "DEA04772 SISTEMA DE ABASTECIMENTO DE ÁGUAS"
 *   "CH Total Disciplina:"
 *   <credit_hours>                   e.g. "60"
 *   "Turma" "Curso" "Escopo" ...    column headers — skipped (pt-BR PDF header)
 *
 *   Then one or more section blocks, each shaped as:
 *
 *   <instructor>                     UPPERCASE words (or "PROFESSOR NÃO DEFINIDO")
 *   <vagas_aumentadas>               integer, usually "0"
 *   <vagas_ofertadas>                integer
 *   <section_id>                     e.g. "01", "06.1", "08-1", "12B"
 *   <course_name>                    e.g. "07 - Engenharia Ambiental"
 *   <escopo>                         integer
 *   <status>                         single letter: M S A H L I
 *   <ocupadas>                       integer
 *   <disponíveis>                    integer
 *   [<Dia> <HH:MM> <HH:MM>] ...     zero or more schedule rows (abbreviated weekday)
 *
 * Page headers (noise) look like:
 *   "Hora:Data:"
 *   "UNIVERSIDADE FEDERAL DO ESPÍRITO SANTO"
 *   "Oferta de Disciplinas por Departamento (Modelo Ufes)"
 *   "Nome da DisciplinaDepartamento:Departamento de Engenharia Ambiental"
 *   "2026/1º Semestre"
 *   "Página:   115/03/202616:56:45"
 *   "Período:"
 *
 * Footer legend (noise):
 *   "Escopo"
 *   "1 - Exclusiva para Alunos do Curso"
 *   "2 - Para Alunos que têm a disciplina no currículo3 - ..."
 *   "Situação"
 *   "A - Análise"
 *   ...
 *
 * Output JSON (same schema as build-data-offer.mjs / build-data-offer-v2.mjs):
 * {
 *   year, semester, source_pdf, generated_at,
 *   subjects: [
 *     {
 *       code, name, credit_hours,
 *       classes: [
 *         { id, targetCourseCode, targetCourseName, instructor, schedules: [{ day, start, end }] }
 *       ]
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node scripts/build-offer-from-department.mjs --pdf <file.pdf> [options]
 *
 * Options:
 *   --year     <YYYY>       override year     (default: inferred from PDF header)
 *   --semester <1|2>        override semester (default: inferred from PDF header)
 *   --out      <file.json>  output path       (default: src/data/<stem>.json)
 *   --debug                 print debug info to stderr
 *
 * Dependencies:
 *   npm i pdf-parse
 */

import fs   from "node:fs";
import fsp  from "node:fs/promises";
import path from "node:path";
import pdf  from "pdf-parse";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage(exitCode = 1, msg = "") {
  if (msg) console.error("Error:", msg);
  console.error(`
Usage:
  node scripts/build-offer-from-department.mjs --pdf <file.pdf> [options]

Required:
  --pdf <file.pdf>

Options:
  --year     <YYYY>       override year     (default: inferred from PDF)
  --semester <1|2>        override semester (default: inferred from PDF)
  --out      <file.json>  output path       (default: src/data/<stem>.json)
  --debug                 print debug info to stderr
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = { pdf: null, year: null, semester: null, out: null, debug: false };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--pdf")      { out.pdf      = argv[++i]; continue; }
    if (a === "--year")     { out.year     = Number(argv[++i]); continue; }
    if (a === "--semester") { out.semester = Number(argv[++i]); continue; }
    if (a === "--out")      { out.out      = argv[++i]; continue; }
    if (a === "--debug")    { out.debug    = true; continue; }
    if (a === "--help" || a === "-h") usage(0);
    usage(1, `Unknown argument: ${a}`);
  }
  if (!out.pdf) usage(1, "--pdf is required");
  return out;
}

// ---------------------------------------------------------------------------
// Year/semester inference
// ---------------------------------------------------------------------------

function inferYearSemester(lines) {
  const sample = lines.slice(0, 40);
  for (const line of sample) {
    // "2026/1º Semestre"
    const mA = line.match(/(\d{4})\/([12])º\s+Semestre/i);
    if (mA) return { year: Number(mA[1]), semester: Number(mA[2]) };
    // "… | 2025 | 2º Semestre"
    const mB = line.match(/\|\s*(\d{4})\s*\|\s*([12])º\s+Semestre/i);
    if (mB) return { year: Number(mB[1]), semester: Number(mB[2]) };
  }
  return null;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(enabled) {
  return (...args) => { if (enabled) console.error("[debug]", ...args); };
}

function normalizeLine(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/** Plain integer OR "40+5" style */
function isIntegerLike(s) {
  return typeof s === "string" && /^\d+(\+\d+)?$/.test(s);
}

/** HH:MM */
function isTimeToken(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s);
}

/** Single status letter used by the system */
function isStatusLetter(s) {
  return typeof s === "string" && /^[SAMHLI]$/.test(s);
}

/**
 * Abbreviated weekday → canonical English key.
 * The department PDFs use the same 3-char abbreviations as oferta-v2.
 */
const WEEKDAY_MAP = {
  "seg": "Mon",
  "ter": "Tue",
  "qua": "Wed",
  "qui": "Thu",
  "sex": "Fri",
  "sáb": "Sat",
  "sab": "Sat",
  "dom": "Sun",
};

function parseWeekday(s) {
  if (typeof s !== "string") return null;
  return WEEKDAY_MAP[s.trim().toLowerCase()] ?? null;
}

/**
 * Match a subject header line: "<CODE> <NAME>"
 * CODE is 2-5 uppercase letters followed by 5 digits.
 * Returns { code, name } or null.
 */
function parseSubjectLine(s) {
  const m = s.match(/^([A-Z]{2,5}\d{5})\s+(.+)$/);
  if (!m) return null;
  return { code: m[1].trim(), name: m[2].trim() };
}

/**
 * A section turma ID: integers, optionally with a dot or dash suffix.
 * e.g. "01", "1", "06.1", "08-1", "08-2", "12B"
 * Must NOT match a plain single-digit escopo or a CH value — we distinguish
 * by context in the state machine, but the pattern itself is permissive.
 */
function isSectionToken(s) {
  return typeof s === "string" && /^\d[\w.\-]*$/.test(s.trim());
}

/**
 * A course name line: starts with 2 digits and a " - ".
 * e.g. "07 - Engenharia Ambiental", "02 - Arquitetura e Urbanismo"
 * Also handles "12 B - Matemática - Bacharelado".
 */
function isCourseLine(s) {
  return typeof s === "string" && /^\d{2}(\s+[A-Z])?\s+-\s+.+/i.test(s.trim());
}

/**
 * Parse a course line into its numeric code and name.
 * e.g. "06 - Engenharia Elétrica" → { code: "06", name: "Engenharia Elétrica" }
 */
function parseCourse(s) {
  const m = (s ?? "").trim().match(/^(\d{2}(?:\s+[A-Z])?)\s+-\s+(.+)$/i);
  if (!m) return null;
  return { code: m[1].replace(/\s+/, ""), name: m[2].trim() };
}

/**
 * Heuristic: looks like an instructor name.
 * All-caps words, at least 2 words, no digits.
 * Also matches "PROFESSOR NÃO DEFINIDO".
 */
function isInstructorLine(s) {
  if (!s || /\d/.test(s)) return false;
  if (!/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇÃÕÜ\s]+$/i.test(s)) return false;
  const words = s.trim().split(/\s+/);
  if (words.length < 2) return false;
  return words.some((w) => w.length >= 3);
}

// ---------------------------------------------------------------------------
// Noise filter
// ---------------------------------------------------------------------------

const NOISE_PATTERNS = [
  /^Hora:Data:/i,
  /^UNIVERSIDADE FEDERAL/i,
  /^Oferta de Disciplinas por Departamento/i,
  /^Nome da Disciplina/i,
  /^2026\/[12]º\s+Semestre/i,
  /^2025\/[12]º\s+Semestre/i,
  /^Página:/i,
  /^Período:$/i,
  // column headers
  /^Turma$/i,
  /^Curso$/i,
  /^Escopo$/i,
  /^Ofertadas$/i,
  /^Ocupadas$/i,
  /^Disponíveis$/i,
  /^Nome do Professor$/i,
  /^Situação$/i,
  /^Vagas$/i,
  /^Aumentadas$/i,
  // legend footer lines
  /^[1-5]\s+-\s+(Exclusiva|Para Alunos|Para qualquer)/i,
  /^[2-5]\s+-\s+Para/i,
  /^A\s+-\s+Análise/i,
  /^H\s+-\s+Ajuste/i,
  /^L\s+-\s+Lançamento/i,
  /^S\s+-\s+Solicitada/i,
  /^M\s+-\s+Matricula/i,
  /^I\s+-\s+Inativa/i,
  // multi-legend smashed onto one line by pdf-parse
  /^[2-5]\s+-\s+Para.+[2-5]\s+-\s+Para/i,
  /^A\s+-\s+Análise.+H\s+-\s+Ajuste/i,
  /^H\s+-\s+Ajuste.+I\s+-\s+Inativa/i,
  /^L\s+-\s+Lançamento.+M\s+-\s+Matricula/i,
  /^CH Total Disciplina:$/i,
];

function isNoiseLine(s) {
  return NOISE_PATTERNS.some((p) => p.test(s));
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * State machine over the cleaned token list.
 *
 * States:
 *   IDLE        — waiting for a subject header line
 *   GOT_CH      — consumed subject + CH, expecting section blocks
 *   IN_SECTION  — inside a section block consuming schedule rows
 *
 * Section block token order (after noise removal):
 *   <instructor>
 *   <vagas_aumentadas>   integer (usually "0") — skip
 *   <vagas_ofertadas>    integer               — skip
 *   <turma_id>
 *   <course_name>
 *   <escopo>             integer               — skip
 *   <status>             single letter         — skip
 *   <ocupadas>           integer               — skip
 *   <disponíveis>        integer               — skip
 *   [<Dia> <HH:MM> <HH:MM>] ...
 *
 * The section block ends when we see another instructor line OR a new subject
 * line OR EOF.
 */
function parseOffer(toks, dbg) {
  const subjects = [];
  let currentCode = null;
  let currentName = null;
  let currentCH   = 0;
  // sections for current subject, keyed by section id
  let currentClasses = new Map();

  // ---- helpers ----

  function flushSubject() {
    if (!currentCode) return;
    const classesArr = [];
    const dayOrder = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
    for (const [, cls] of currentClasses) {
      cls.schedules.sort((a, b) => (dayOrder[a.day] ?? 9) - (dayOrder[b.day] ?? 9));
      classesArr.push({
        id: cls.id,
        targetCourseCode: cls.targetCourseCode ?? null,
        targetCourseName: cls.targetCourseName ?? null,
        instructor: cls.instructor ?? null,
        schedules: cls.schedules,
      });
    }
    const existing = subjects.find((s) => s.code === currentCode);
    if (existing) {
      existing.classes.push(...classesArr);
    } else {
      subjects.push({ code: currentCode, name: currentName, credit_hours: currentCH, classes: classesArr });
    }
    dbg(`flushed: ${currentCode} "${currentName}" — ${classesArr.length} class(es)`);
    currentCode = null;
    currentName = null;
    currentCH   = 0;
    currentClasses = new Map();
  }

  function ensureClass(sectionId) {
    if (!currentClasses.has(sectionId)) {
      currentClasses.set(sectionId, { id: sectionId, targetCourseCode: null, targetCourseName: null, instructor: null, schedules: [] });
    }
    return currentClasses.get(sectionId);
  }

  // ---- scan ----

  const n = toks.length;
  let i = 0;

  while (i < n) {
    const tok = toks[i];

    // ---- New subject header ------------------------------------------------
    const sub = parseSubjectLine(tok);
    if (sub) {
      flushSubject();
      currentCode = sub.code;
      currentName = sub.name;
      dbg(`subject: ${currentCode} "${currentName}"`);
      i++;

      // Next token must be CH (the "CH Total Disciplina:" header was noise-stripped)
      if (i < n && isIntegerLike(toks[i])) {
        currentCH = Number(toks[i].split("+")[0]);
        dbg(`  ch: ${currentCH}`);
        i++;
      }
      continue;
    }

    // ---- Section block start: instructor line ------------------------------
    if (currentCode && isInstructorLine(tok)) {
      const instructor = tok === "PROFESSOR NÃO DEFINIDO" ? null : tok;
      i++; // consume instructor

      // vagas_aumentadas (integer, usually "0") — skip
      if (i < n && isIntegerLike(toks[i])) i++;
      // vagas_ofertadas — skip
      if (i < n && isIntegerLike(toks[i])) i++;

      // section_id
      let sectionId = "1";
      if (i < n && isSectionToken(toks[i]) && !isCourseLine(toks[i])) {
        sectionId = toks[i].replace(/^0+(?=\d)/, "") || toks[i]; // strip leading zeros from pure-numeric ids
        i++;
      }

      // course name line — capture
      let targetCourseCode = null;
      let targetCourseName = null;
      if (i < n && isCourseLine(toks[i])) {
        const parsed = parseCourse(toks[i]);
        if (parsed) { targetCourseCode = parsed.code; targetCourseName = parsed.name; }
        i++;
      }

      // escopo — skip
      if (i < n && isIntegerLike(toks[i])) i++;
      // status — skip
      if (i < n && isStatusLetter(toks[i])) i++;
      // ocupadas — skip
      if (i < n && isIntegerLike(toks[i])) i++;
      // disponíveis — skip
      if (i < n && isIntegerLike(toks[i])) i++;

      const sec = ensureClass(sectionId);
      if (targetCourseCode && !sec.targetCourseCode) sec.targetCourseCode = targetCourseCode;
      if (targetCourseName && !sec.targetCourseName) sec.targetCourseName = targetCourseName;
      if (instructor && !sec.instructor) sec.instructor = instructor;

      // Consume schedule rows: [<Dia> <HH:MM> <HH:MM>] ...
      while (i < n) {
        const day = parseWeekday(toks[i]);
        if (!day) break;
        i++; // consume day
        let start = null, end = null;
        if (i < n && isTimeToken(toks[i])) { start = toks[i]; i++; }
        if (i < n && isTimeToken(toks[i])) { end   = toks[i]; i++; }
        if (start && end) sec.schedules.push({ day, start, end });
      }

      dbg(`  section ${sectionId} instructor=${instructor ?? "null"} schedules=${sec.schedules.length}`);
      continue;
    }

    // ---- Anything else: skip ----------------------------------------------
    i++;
  }

  flushSubject();
  return subjects;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbg  = makeLogger(args.debug);

  const pdfPath = path.resolve(args.pdf);
  if (!fs.existsSync(pdfPath) || !fs.statSync(pdfPath).isFile()) {
    console.error(`File not found: ${args.pdf}`);
    process.exit(1);
  }

  dbg("reading pdf:", pdfPath);
  const buf  = await fsp.readFile(pdfPath);
  const data = await pdf(buf);

  const rawLines = String(data.text ?? "").split("\n").map(normalizeLine).filter((l) => l.length > 0);
  dbg("chars:", String(data.text ?? "").length, "raw lines:", rawLines.length);

  // Resolve year + semester
  if (args.year === null || args.semester === null) {
    const inferred = inferYearSemester(rawLines);
    if (!inferred && (args.year === null || args.semester === null)) {
      console.error(
        "Could not infer year/semester from PDF. " +
        "Pass --year <YYYY> --semester <1|2> explicitly.",
      );
      process.exit(1);
    }
    if (args.year     === null) { args.year     = inferred.year;     dbg("inferred year:", args.year); }
    if (args.semester === null) { args.semester = inferred.semester; dbg("inferred semester:", args.semester); }
  }

  // Default output path derived from the PDF basename
  if (!args.out) {
    const stem = path.basename(pdfPath, ".pdf");
    args.out = `src/data/${stem}.json`;
  }

  // Strip noise lines before handing to parser
  const toks = rawLines.filter((l) => !isNoiseLine(l));
  dbg("tokens after noise removal:", toks.length);

  const subjects = parseOffer(toks, dbg);

  const payload = {
    year:         args.year,
    semester:     args.semester,
    source_pdf:   path.basename(pdfPath),
    generated_at: new Date().toISOString(),
    subjects,
  };

  const outPath = path.resolve(args.out);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`OK: ${subjects.length} subjects → ${outPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });