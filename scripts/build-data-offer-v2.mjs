#!/usr/bin/env node
/**
 * build-data-offer-v2.mjs
 *
 * Alternative offer PDF parser → JSON, targeting the "tabular" layout used
 * in oferta-eng-ambiental-2025-2.pdf (and likely other 2025-2 reports).
 *
 * Differences from build-data-offer.mjs (v1):
 *   - Subject codes use " - " as separator:  "BIO04817 - BIOLOGIA I"
 *   - Subject name can span two consecutive lines
 *   - Weekdays are abbreviated (Seg, Ter, Qua, Qui, Sex, Sáb)
 *   - Columns are presented one token per line in this order per schedule row:
 *
 *       <Período>           integer (curriculum period, e.g. "1", "3", "9")
 *       [<CODE - NAME>]     only on the first row of a new subject (may be split across 2 lines)
 *       [<CH>]              credit hours — only on first row of each subject
 *       <Turma>             section id, e.g. "01", "7", "07"
 *       <Escopo>            integer
 *       <Situação>          single letter: M S A H L I
 *       <Vagas Ofertadas>   integer (or "40+5" style)
 *       <Vagas Ocupadas>    integer
 *       <Vagas Disponíveis> integer (or negative, shown as plain integer)
 *       [<Dia>]             abbreviated weekday — absent when no schedule
 *       [<Início>]          HH:MM
 *       [<Fim>]             HH:MM
 *       [<Docente>]         UPPERCASE words — absent when not yet assigned
 *
 *   When a subject has multiple schedule slots the section header columns
 *   (Turma … Disponíveis) are repeated for each slot.
 *   When a subject has multiple sections those are also repeated.
 *
 * Output JSON schema (same as v1):
 * {
 *   year, semester, source_pdf, generated_at,
 *   subjects: [
 *     {
 *       code, name, credit_hours,
 *       sections: [
 *         { id, instructor, schedules: [{ day, start, end }] }
 *       ]
 *     }
 *   ]
 * }
 *
 * Usage:
 *   node scripts/build-data-offer-v2.mjs --pdf <file.pdf> [--year <YYYY>] [--semester <1|2>] [--out <file.json>] [--debug]
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
  node scripts/build-data-offer-v2.mjs --pdf <file.pdf> [options]

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
// Period inference
// ---------------------------------------------------------------------------

function inferPeriod(lines) {
  const sample = lines.slice(0, 40);
  for (const line of sample) {
    // "Relatório Oferta - [07] Engenharia Ambiental | 2025 | 2º Semestre"
    const mB = line.match(/\|\s*(\d{4})\s*\|\s*([12])º\s+Semestre/i);
    if (mB) return { year: Number(mB[1]), semester: Number(mB[2]) };
    // "2026/1º Semestre"
    const mA = line.match(/(\d{4})\/([12])º\s+Semestre/i);
    if (mA) return { year: Number(mA[1]), semester: Number(mA[2]) };
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

/** "30", "45", "60+5", "40+5", "300", … */
function isIntegerLike(s) {
  return /^\d+(\+\d+)?$/.test(s);
}

/** HH:MM */
function isTimeToken(s) {
  return /^\d{2}:\d{2}$/.test(s);
}

/** Single status letter */
function isStatusLetter(s) {
  return /^[SAMHLI]$/.test(s);
}

/**
 * Abbreviated weekday map → canonical short English key.
 * The PDF uses 3-char abbreviations with accents.
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
 * Matches "CODE - NAME" where CODE is like BIO04817, DEA04764, MAT09570, etc.
 * Returns { code, name } or null.
 * Name may be partial (the next line can be a continuation).
 */
function parseSubjectLine(s) {
  const m = s.match(/^([A-Z]{2,5}\d{5})\s+-\s+(.+)$/);
  if (!m) return null;
  return { code: m[1].trim(), name: m[2].trim() };
}

/**
 * A "period" token: a small integer (1-10 typically) that precedes each row.
 * We distinguish it from section IDs (also small integers) by position/context.
 */
function isPeriodToken(s) {
  return /^\d{1,2}$/.test(s);
}

/**
 * Does this line look like a page-header / footer noise line we should skip?
 */
const NOISE_PATTERNS = [
  /^Relatório Oferta/i,
  /^Escopo:/i,
  /^Situação:/i,
  /^\d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}/,   // timestamp
  /^Página\s+\d+\/\d+/i,
  /^Período$/i,
  /^Disciplina$/i,
  /^CH$/i,
  /^Turma$/i,
  /^Escopo$/i,
  /^Situação$/i,
  /^Vagas$/i,
  /^Ofertadas$/i,
  /^Ocupadas$/i,
  /^Disponíveis$/i,
  /^Horários$/i,
  /^Dia$/i,
  /^Início$/i,
  /^Fim$/i,
  /^Docente$/i,
];

function isNoiseLine(s) {
  return NOISE_PATTERNS.some((p) => p.test(s));
}

/**
 * Heuristic: is this line likely an instructor name?
 * ALL-CAPS words, at least 2 words, no digits.
 * We also allow prepositions in mixed case (DE, DA, DO, DOS, DAS).
 */
function isInstructorLine(s) {
  if (!s || /\d/.test(s)) return false;
  // must be mostly uppercase letters + spaces
  if (!/^[A-ZÁÀÂÃÉÊÍÓÔÕÚÇ\s]+$/i.test(s)) return false;
  const words = s.trim().split(/\s+/);
  if (words.length < 2) return false;
  // at least one word must be >= 3 chars to avoid false positives
  return words.some((w) => w.length >= 3);
}

// ---------------------------------------------------------------------------
// Core parser
// ---------------------------------------------------------------------------

/**
 * Parse the flat token stream produced by pdf-parse into a structured list
 * of subjects with sections and schedules.
 *
 * The algorithm works as a small state machine over the cleaned line array.
 *
 * State transitions:
 *
 *  IDLE ──(subject line found)──► GOT_SUBJECT
 *  GOT_SUBJECT ──(CH integer)──► GOT_CH
 *  GOT_CH ──(period token)──► IN_ROW   (start consuming a schedule row)
 *  IN_ROW: collect turma, escopo, status, ofertadas, ocupadas, disponíveis,
 *          then optionally: dia, início, fim, docente
 *          after each complete row, stay IN_ROW to absorb more rows for the
 *          same subject, or transition back to IDLE when a new subject line
 *          or EOF arrives.
 *
 * Complication: the period token that precedes the FIRST row of a new subject
 * appears BEFORE the subject line, so we need a small look-behind / two-token
 * buffer.
 *
 * Actual line sequence for first row of a subject:
 *   <period>
 *   <CODE - NAME>          ← parseSubjectLine succeeds
 *   [<name continuation>]  ← optional second line of name
 *   <CH>
 *   <turma>
 *   <escopo>
 *   <status>
 *   <ofertadas>
 *   <ocupadas>
 *   <disponíveis>
 *   [<dia>]
 *   [<início>]
 *   [<fim>]
 *   [<docente>]
 *
 * Subsequent rows for the SAME subject (same or different section):
 *   <period>               ← same period number, NOT followed by a subject line
 *   <turma>
 *   <escopo>
 *   <status>
 *   <ofertadas>
 *   <ocupadas>
 *   <disponíveis>
 *   [<dia>]
 *   [<início>]
 *   [<fim>]
 *   [<docente>]
 */
function parseOffer(lines, dbg) {
  // Remove noise lines first
  const toks = lines.filter((l) => !isNoiseLine(l));

  const subjects = [];                    // accumulated output
  let currentSubject = null;             // { code, name, credit_hours, sections: Map }
  // sections keyed by section id (turma string)
  // each section: { id, instructor: string|null, schedules: [] }

  function flushSubject() {
    if (!currentSubject) return;
    const sectionsArr = [];
    for (const [, sec] of currentSubject.sections) {
      // Sort schedules by day order
      const dayOrder = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
      sec.schedules.sort((a, b) => (dayOrder[a.day] ?? 9) - (dayOrder[b.day] ?? 9));
      sectionsArr.push({
        id: sec.id,
        instructor: sec.instructor ?? null,
        schedules: sec.schedules,
      });
    }
    // merge with existing subject if code already seen (shouldn't happen but be safe)
    const existing = subjects.find((s) => s.code === currentSubject.code);
    if (existing) {
      existing.sections.push(...sectionsArr);
    } else {
      subjects.push({
        code: currentSubject.code,
        name: currentSubject.name,
        credit_hours: currentSubject.credit_hours,
        sections: sectionsArr,
      });
    }
    dbg(`flushed: ${currentSubject.code} "${currentSubject.name}" — ${sectionsArr.length} section(s)`);
    currentSubject = null;
  }

  function startSubject(code, name, ch) {
    flushSubject();
    currentSubject = {
      code,
      name,
      credit_hours: ch,
      sections: new Map(),
    };
    dbg(`subject: ${code} "${name}" ch=${ch}`);
  }

  function ensureSection(turmaId) {
    if (!currentSubject.sections.has(turmaId)) {
      currentSubject.sections.set(turmaId, { id: turmaId, instructor: null, schedules: [] });
    }
    return currentSubject.sections.get(turmaId);
  }

  // -------------------------------------------------------------------------
  // Main scan loop
  //
  // We use an index-based scan so we can peek ahead / skip tokens.
  // -------------------------------------------------------------------------

  let i = 0;
  const n = toks.length;

  /**
   * Shared helper: once we have parsed sub.code/sub.name and consumed the
   * subject line(s), finish opening the subject (optional name continuation +
   * CH) and consume its first schedule row.
   */
  function openSubjectAt(sub, idx) {
    let i = idx;

    // Optional name continuation
    if (i < n) {
      const maybeContd = toks[i];
      if (
        !isIntegerLike(maybeContd) &&
        !isTimeToken(maybeContd) &&
        !isStatusLetter(maybeContd) &&
        !parseSubjectLine(maybeContd) &&
        !isNoiseLine(maybeContd) &&
        !parseWeekday(maybeContd)
      ) {
        sub.name = sub.name + " " + maybeContd;
        i++;
      }
    }

    // CH
    const chTok = toks[i] ?? "";
    const ch = isIntegerLike(chTok) ? Number(chTok.split("+")[0]) : 0;
    if (isIntegerLike(chTok)) i++;

    startSubject(sub.code, sub.name, ch);

    // First schedule row (no leading period — it was already consumed)
    const row = consumeRow(toks, i);
    if (row) {
      const sec = ensureSection(row.turma);
      if (row.instructor && !sec.instructor) sec.instructor = row.instructor;
      if (row.day) sec.schedules.push({ day: row.day, start: row.start, end: row.end });
      i = row.nextIndex;
    }
    return i;
  }

  while (i < n) {
    const tok = toks[i];

    // ---- Check for subject-opening sequence (period-prefixed) --------------
    // Pattern: <period> <CODE - NAME> [<name-cont>] <CH> <turma> …

    if (isPeriodToken(tok)) {
      // Peek at next token
      const next = toks[i + 1] ?? "";
      const sub = parseSubjectLine(next);
      if (sub) {
        // This IS the start of a new subject block.
        i += 2; // consume period + subject line
        i = openSubjectAt(sub, i);
        continue;
      }
      // Not a subject opener — fall through to normal token handling below.
    }

    // ---- Subject line without a leading period token -----------------------
    // Some elective subjects at the end of the PDF have no curriculum period.
    // Pattern: <CODE - NAME> [<name-cont>] <CH> <turma> …

    {
      const sub = parseSubjectLine(tok);
      if (sub) {
        i += 1; // consume subject line
        i = openSubjectAt(sub, i);
        continue;
      }
    }

    // ---- Subsequent rows for the current subject ---------------------------
    // Pattern: <period> <turma> <escopo> <status> <ofertadas> <ocupadas> <disponíveis> [<dia> <início> <fim>] [<docente>]

    if (currentSubject && isPeriodToken(tok)) {
      i++; // consume period
      const row = consumeRow(toks, i);
      if (row) {
        const sec = ensureSection(row.turma);
        if (row.instructor && !sec.instructor) sec.instructor = row.instructor;
        if (row.day) sec.schedules.push({ day: row.day, start: row.start, end: row.end });
        i = row.nextIndex;
      }
      continue;
    }

    // ---- Anything else: skip -----------------------------------------------
    i++;
  }

  flushSubject();
  return subjects;
}

/**
 * Consume one schedule row starting at index `i` in `toks`.
 * Returns { turma, day, start, end, instructor, nextIndex } or null.
 *
 * Expected tokens at i:
 *   [ch]        credit hours — REPEATED on every subsequent row for the same
 *               subject (same integer value as the initial CH). We detect and
 *               skip it by peeking at the token after turma: if the token at
 *               i is an integer-like AND the token at i+1 is also integer-like
 *               AND i+2 is a status letter, then i is CH and i+1 is turma.
 *               Otherwise i is directly turma.
 *   turma      e.g. "01", "7", "07"
 *   escopo     integer
 *   status     single letter
 *   ofertadas  integer-like
 *   ocupadas   integer
 *   disponíveis integer
 *   [dia]      abbreviated weekday
 *   [início]   HH:MM
 *   [fim]      HH:MM
 *   [docente]  UPPERCASE words
 */
function consumeRow(toks, i) {
  const n = toks.length;

  // Detect and skip the optional repeated CH token.
  // Pattern when CH is present:  <ch:int> <turma:int> <escopo:int> <status:letter> …
  // Pattern when CH is absent:              <turma:int> <escopo:int> <status:letter> …
  // We distinguish by checking whether toks[i+2] is a status letter.
  if (
    isIntegerLike(toks[i]) &&
    isIntegerLike(toks[i + 1]) &&
    isStatusLetter(toks[i + 3])   // i=ch, i+1=turma, i+2=escopo(int), i+3=status
  ) {
    i++; // skip CH
  }

  // turma: an integer-like token (section id)
  const turma = toks[i];
  if (!turma || !isIntegerLike(turma)) return null;
  i++;

  // escopo: integer
  if (i < n && isIntegerLike(toks[i])) i++;

  // status: single letter
  if (i < n && isStatusLetter(toks[i])) i++;

  // ofertadas: integer-like (may be "40+5")
  if (i < n && isIntegerLike(toks[i])) i++;

  // ocupadas: integer
  if (i < n && isIntegerLike(toks[i])) i++;

  // disponíveis: integer (may be negative shown as plain integer)
  if (i < n && isIntegerLike(toks[i])) i++;

  // Optional schedule: dia, início, fim
  let day = null, start = null, end = null;
  if (i < n) {
    const maybeDay = parseWeekday(toks[i]);
    if (maybeDay) {
      day = maybeDay;
      i++;
      if (i < n && isTimeToken(toks[i])) { start = toks[i]; i++; }
      if (i < n && isTimeToken(toks[i])) { end   = toks[i]; i++; }
    }
  }

  // Optional instructor
  let instructor = null;
  if (i < n && isInstructorLine(toks[i])) {
    instructor = toks[i];
    i++;
  }

  return { turma: turma.replace(/^0+/, "") || "1", day, start, end, instructor, nextIndex: i };
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

  const lines = String(data.text ?? "")
    .split("\n")
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  dbg("chars:", String(data.text ?? "").length, "lines:", lines.length);

  // Resolve year + semester
  if (args.year === null || args.semester === null) {
    const inferred = inferPeriod(lines);
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

  // Default output path
  if (!args.out) {
    const stem = path.basename(pdfPath, ".pdf");
    args.out = `src/data/${stem}.json`;
  }

  const subjects = parseOffer(lines, dbg);

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