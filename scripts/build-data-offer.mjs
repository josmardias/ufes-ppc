#!/usr/bin/env node
/**
 * build-data-offer.mjs
 *
 * Offer PDF parser -> JSON.
 *
 * Real PDF structure (per subject block):
 *
 *   <CODE NAME>                          e.g. "ELE15923 INTRODUÇÃO À ENGENHARIA ELÉTRICA"
 *   "CH Total"
 *   <credit_hours>                       e.g. "30"
 *   "Turma" "Curso" "Escopo" ...        (column headers — skipped)
 *   <available>                          integer
 *   <instructor>                         e.g. "ELIZANDRA PEREIRA ROQUE COELHO"
 *   <something>                          integer (noise)
 *   <slots>                              integer (noise)
 *   <section>                            e.g. "06.1 N"
 *   <course name>                        e.g. "06 - Engenharia Elétrica"
 *   <scope>                              integer
 *   <status>                             single letter e.g. "M"
 *   <offered>                            integer
 *   <occupied>                           integer
 *   <Weekday>                            e.g. "Terça-feira"
 *   <HH:MM>                              start time
 *   <HH:MM>                              end time
 *   ... (more schedules for same section)
 *   ... (more sections for same subject)
 *   <next CODE NAME> or page header
 *
 * Page headers carrying the year and semester (both formats observed in the wild):
 *   "2026/1º Semestre"
 *   "Relatório Oferta - [06] Engenharia Elétrica | 2025 | 2º Semestre"
 *   "Relatório Oferta - [06] Engenharia Elétrica | 2026 | 1º Semestre"
 *
 * Usage:
 *   node scripts/build-data-offer.mjs --pdf <file.pdf> [--year <YYYY>] [--semester <1|2>] [--out <file.json>] [--debug]
 *
 * Required:
 *   --pdf <file.pdf>
 *
 * Optional:
 *   --year <YYYY>      override the year     (default: inferred from PDF header)
 *   --semester 1|2     override the semester (default: inferred from PDF header)
 *   --out <file.json>  override output path  (default: src/data/<pdf-stem>.json, e.g. src/data/oferta-eng-eletrica-2026-1.json)
 *   --debug            log debug info to stderr
 *
 * Dependencies:
 *   npm i pdf-parse
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import pdf from "pdf-parse";

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function usage(exitCode = 1, msg = "") {
  if (msg) console.error(msg + "\n");
  console.error(
    [
      "Usage:",
      "  node scripts/build-data-offer.mjs --pdf <file.pdf> [--year <YYYY>] [--semester <1|2>] [--out <file.json>] [--debug]",
      "",
      "Examples:",
      "  node scripts/build-data-offer.mjs --pdf scripts/input/oferta_eng_eletrica.pdf",
      "  node scripts/build-data-offer.mjs --pdf scripts/input/oferta_eng_eletrica.pdf --out src/data/offer-eng-eletrica.json",
      "  node scripts/build-data-offer.mjs --pdf scripts/input/oferta_eng_eletrica.pdf --year 2026 --semester 1 --out src/data/offer-eng-eletrica-2026-1.json",
    ].join("\n"),
  );
  process.exit(exitCode);
}

function parseArgs(argv) {
  const out = { pdf: "", year: null, semester: null, out: "", debug: false };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "-h" || a === "--help") usage(0);
    if (a === "--debug") { out.debug = true; continue; }

    if (a === "--pdf") {
      const v = argv[i + 1];
      if (!v) usage(1, "Missing value for --pdf");
      out.pdf = v; i++; continue;
    }
    if (a === "--out") {
      const v = argv[i + 1];
      if (!v) usage(1, "Missing value for --out");
      out.out = v; i++; continue;
    }
    if (a === "--year") {
      const v = argv[i + 1];
      if (!v || !/^\d{4}$/.test(v)) usage(1, "Invalid value for --year (use a 4-digit year, e.g. 2026)");
      out.year = Number(v); i++; continue;
    }
    if (a === "--semester") {
      const v = argv[i + 1];
      if (!v || !/^[12]$/.test(v)) usage(1, "Invalid value for --semester (use 1 or 2)");
      out.semester = Number(v); i++; continue;
    }
    usage(1, `Unknown argument: ${a}`);
  }

  if (!out.pdf) usage(1, "Required parameter missing: --pdf <file.pdf>");
  // year, semester, and out are resolved later (after PDF is parsed) if not provided here

  return out;
}

// ---------------------------------------------------------------------------
// Period inference (year + semester)
// ---------------------------------------------------------------------------

/**
 * Scans the first ~30 normalised lines of the PDF for a period header and
 * returns both the year and semester.
 *
 * Recognised formats:
 *   "2026/1º Semestre"
 *     → Format A (short Modelo-Ufes header)
 *   "Relatório Oferta - [06] Engenharia Elétrica | 2025 | 2º Semestre"
 *     → Format B (full report title line)
 *
 * @param {string[]} lines  Normalised lines from the PDF
 * @returns {{ year: number, semester: 1|2 } | null}
 */
function inferPeriod(lines) {
  // Only scan the first 30 lines — the header always appears near the top.
  const sample = lines.slice(0, 30);
  for (const line of sample) {
    // Format A: "2026/1º Semestre"
    const mA = line.match(/(\d{4})\/([12])º\s+Semestre/i);
    if (mA) return { year: Number(mA[1]), semester: Number(mA[2]) };
    // Format B: "… | 2025 | 2º Semestre"
    const mB = line.match(/\|\s*(\d{4})\s*\|\s*([12])º\s+Semestre/i);
    if (mB) return { year: Number(mB[1]), semester: Number(mB[2]) };
  }
  return null;
}

function makeLogger(enabled) {
  return (...args) => { if (enabled) console.error("[debug]", ...args); };
}

// ---------------------------------------------------------------------------
// Text normalisation
// ---------------------------------------------------------------------------

function normalizeLine(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Token classifiers
// ---------------------------------------------------------------------------

/** "30", "45", "60", "90", … — any non-negative integer */
function isIntegerToken(s) {
  return typeof s === "string" && /^\d+$/.test(s.trim());
}

/** HH:MM */
function isTimeToken(s) {
  return typeof s === "string" && /^\d{2}:\d{2}$/.test(s.trim());
}

/**
 * Full Portuguese weekday names as they appear in the PDF.
 * Returns the canonical short English key, or null.
 */
const WEEKDAY_MAP = {
  "segunda-feira": "Mon",
  "terça-feira":   "Tue",
  "quarta-feira":  "Wed",
  "quinta-feira":  "Thu",
  "sexta-feira":   "Fri",
  "sábado":        "Sat",
  "sabado":        "Sat",
  "domingo":       "Sun",
};

function parseWeekday(s) {
  if (typeof s !== "string") return null;
  return WEEKDAY_MAP[s.trim().toLowerCase()] ?? null;
}

/**
 * Course name line: "06 - Engenharia Elétrica", "09 V - Engenharia de Produção -Vespertino", etc.
 * Anchored on exactly 2 leading digits so large noise integers (e.g. "99") don't match.
 */
function isCourseNameLine(s) {
  return typeof s === "string" && /^\d{2}(\s+[A-Z])?\s+-\s+.+/i.test(s.trim());
}

/**
 * A token is a section identifier when the line immediately following it is a
 * course name line. This covers all observed formats:
 *   "06.1 N"  (dot + shift letter)
 *   "10B.3"   (letter infix + dot)
 *   "08-1"    (dash-separated)
 *   "08V"     (alphanumeric suffix)
 *   "02V"     (alphanumeric suffix)
 *   "01NL"    (multi-letter suffix)
 *   "08"      (plain course number)
 *   "7"       (plain integer)
 *   "01"      (zero-padded integer)
 *
 * Pure integers are only accepted when their value is in 1..32 (valid UFES
 * course numbers), which prevents noise integers like "40" or "99" from
 * matching even when they happen to be followed by a course name line.
 *
 * @param {string} s       The candidate token
 * @param {string} next    The line immediately after it in the token stream
 */
function isSectionToken(s, next) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  if (/^\d+$/.test(t)) {
    // Pure integer: must be a plausible UFES course number (01–32)
    const n = Number(t);
    if (n < 1 || n > 32) return false;
  } else {
    // Must start with 1-2 digits followed by an alphanumeric/dot/dash suffix
    if (!/^\d{1,2}([A-Z0-9]*[\.\-]\d+(\s+[A-Z])?|[A-Z0-9]+)$/i.test(t)) return false;
  }
  // The line after must be a course name — this is the structural invariant
  return isCourseNameLine(next);
}

/**
 * Subject code+name line: "ELE15923 INTRODUÇÃO À ENGENHARIA ELÉTRICA"
 * Code: 2+ uppercase letters followed by 4+ digits, then a space, then the name.
 */
function parseSubjectLine(s) {
  const m = String(s ?? "").match(/^([A-Z]{2,}\d{4,})\s+(.+)$/);
  if (!m) return null;
  return { code: m[1].trim(), name: m[2].trim() };
}

/** Lines that are structural noise and should never be treated as instructor names. */
const NOISE_LINES = new Set([
  "CH Total",
  "Turma",
  "Curso",
  "Escopo",
  "Ofertadas",
  "Ocupadas",
  "Disponíveis",
  "Nome do Professor",
  "Situação",
  "Vagas",
  "Aumentadas",
  "Período",
  "Nome do Curso:",
  "Nome da Disciplina",
  "Hora:Data:",
  "UNIVERSIDADE FEDERAL DO ESPÍRITO SANTO",
  "Oferta de Disciplinas por Curso (Modelo Ufes)",
  "PROFESSOR NÃO DEFINIDO",
]);

function isNoiseLine(s) {
  if (typeof s !== "string") return true;
  const t = s.trim();
  if (NOISE_LINES.has(t)) return true;
  // Page header patterns
  if (/^\d+\/\d+º Semestre$/.test(t)) return true;                    // "2026/1º Semestre"
  if (/^Página:\s*\d/.test(t)) return true;                           // "Página: 1…"
  if (/^\d+\/\d+\/\d{4}\d{2}:\d{2}:\d{2}$/.test(t)) return true;    // "10/03/202618:30:47"
  if (/^\d+\s+-\s+.+/.test(t) && t.length < 60) return true;         // "06 - Engenharia Elétrica"
  // Scope/Status legend lines
  if (/^[1-5]\s+-\s+.+/.test(t)) return true;
  if (/^[A-Z]\s+-\s+.+/.test(t)) return true;
  // Single letter (status codes: M, A, H, I, L, S)
  if (/^[A-Z]$/.test(t)) return true;
  return false;
}

/**
 * Heuristic: is this token a real instructor name?
 * Must be ALL-CAPS words (Portuguese names come all-caps in this PDF),
 * at least 2 words, no digits, not a noise line.
 */
function isInstructorToken(s) {
  if (typeof s !== "string") return false;
  const t = s.trim();
  if (!t) return false;
  if (isNoiseLine(t)) return false;
  if (isIntegerToken(t)) return false;
  if (isTimeToken(t)) return false;
  if (isSectionToken(t)) return false;
  if (parseSubjectLine(t)) return false;
  if (parseWeekday(t) !== null) return false;
  // Must be 2+ words, all uppercase (accented chars allowed)
  const words = t.split(/\s+/).filter(Boolean);
  if (words.length < 2) return false;
  // Every word: uppercase letters + accented uppercase + hyphens allowed
  return words.every((w) => /^[A-ZÁÉÍÓÚÀÂÊÔÃÕÜÇÑ-]+$/i.test(w) && w === w.toUpperCase());
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * State machine over the normalised lines array.
 *
 * Transitions:
 *   IDLE             → on subject line    → AWAIT_CH
 *   AWAIT_CH         → on "CH Total"      → stay
 *                    → on integer         → AWAIT_INSTRUCTOR (ch captured)
 *   AWAIT_INSTRUCTOR → skip noise         → stay
 *                    → on instructor name → AWAIT_SECTION (instructor buffered)
 *                    → on section token   → IN_SECTION (no instructor found)
 *   AWAIT_SECTION    → on section token   → IN_SECTION
 *   IN_SECTION       → on weekday         → capture schedule (day+start+end)
 *                    → on section token   → new section
 *                    → on subject line    → flush + new subject
 *                    → on page noise      → stay
 *
 * The instructor buffered in AWAIT_INSTRUCTOR is attached to the first section.
 * Subsequent sections get their own instructor via a look-ahead in IN_SECTION.
 */
function parseOffer(lines, semester, dbg) {
  const subjects = [];

  // Current subject being built
  let code = null;
  let name = null;
  let creditHours = null;

  // sections: Map<sectionKey, { instructor: string, schedules: Map<key, {day,start,end}> }>
  let sections = null;
  let currentSectionKey = null;

  // State
  const S = { IDLE: 0, AWAIT_CH: 1, AWAIT_INSTRUCTOR: 2, AWAIT_SECTION: 3, IN_SECTION: 4 };
  let state = S.IDLE;

  // Buffered instructor found before the section token
  let pendingInstructor = "";

  function flushSubject() {
    if (code === null || sections === null) return;

    const sectionsArr = Array.from(sections.entries()).map(([section, info]) => {
      const dayOrder = { Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6, Sun: 7 };
      const schedules = Array.from(info.schedules.values()).sort((a, b) => {
        const d = (dayOrder[a.day] ?? 9) - (dayOrder[b.day] ?? 9);
        return d !== 0 ? d : a.start.localeCompare(b.start);
      });
      return { section, instructor: info.instructor, schedules };
    });

    sectionsArr.sort((a, b) => a.section.localeCompare(b.section));

    // Merge into an existing entry if this code was already flushed once (e.g. split across pages)
    const existing = subjects.find((s) => s.code === code);
    if (existing) {
      for (const sec of sectionsArr) {
        if (!existing.sections.find((s) => s.section === sec.section)) {
          existing.sections.push(sec);
        }
      }
      existing.sections.sort((a, b) => a.section.localeCompare(b.section));
      dbg(`merged: ${code} — +${sectionsArr.length} section(s)`);
    } else {
      subjects.push({ semester, code, name, credit_hours: creditHours, sections: sectionsArr });
      dbg(`flushed: ${code} — ${sectionsArr.length} section(s)`);
    }
  }

  function startSubject(c, n) {
    flushSubject();
    code = c;
    name = n;
    creditHours = null;
    sections = new Map();
    currentSectionKey = null;
    pendingInstructor = "";
    state = S.AWAIT_CH;
  }

  function ensureSection(key) {
    if (!sections.has(key)) {
      sections.set(key, { instructor: "", schedules: new Map() });
    }
    return sections.get(key);
  }

  function addSchedule(sectionKey, day, start, end) {
    const info = ensureSection(sectionKey);
    const key = `${day} ${start}-${end}`;
    if (!info.schedules.has(key)) {
      info.schedules.set(key, { day, start, end });
    }
  }

  for (let i = 0; i < lines.length; i++) {
    const tok = lines[i];

    // A new subject line always triggers a flush and resets state, regardless of current state.
    const subject = parseSubjectLine(tok);
    if (subject) {
      dbg(`subject: ${subject.code}`);
      startSubject(subject.code, subject.name);
      continue;
    }

    switch (state) {
      case S.IDLE:
        // Waiting for a subject line — nothing else is actionable.
        break;

      case S.AWAIT_CH:
        if (tok === "CH Total") break; // the header itself — skip
        if (isIntegerToken(tok)) {
          creditHours = Number(tok);
          dbg(`  ch: ${creditHours}`);
          state = S.AWAIT_INSTRUCTOR;
        }
        break;

      case S.AWAIT_INSTRUCTOR: {
        if (isNoiseLine(tok)) break;
        if (isTimeToken(tok)) break;
        if (parseWeekday(tok) !== null) {
          // Hit a schedule with no instructor — step back and let AWAIT_SECTION handle it
          state = S.AWAIT_SECTION;
          i--;
          break;
        }
        if (isSectionToken(tok, lines[i + 1])) {
          currentSectionKey = tok.trim();
          ensureSection(currentSectionKey);
          dbg(`  section (no instructor): ${currentSectionKey}`);
          state = S.IN_SECTION;
          break;
        }
        if (isIntegerToken(tok)) break;
        if (isInstructorToken(tok)) {
          pendingInstructor = tok.trim();
          dbg(`  pending instructor: ${pendingInstructor}`);
          state = S.AWAIT_SECTION;
          break;
        }
        break;
      }

      case S.AWAIT_SECTION: {
        if (isNoiseLine(tok)) break;
        if (isTimeToken(tok)) break;
        if (parseWeekday(tok) !== null) break;
        if (isSectionToken(tok, lines[i + 1])) {
          currentSectionKey = tok.trim();
          const info = ensureSection(currentSectionKey);
          if (pendingInstructor && !info.instructor) {
            info.instructor = pendingInstructor;
          }
          pendingInstructor = "";
          dbg(`  section: ${currentSectionKey} (instructor: "${info.instructor}")`);
          state = S.IN_SECTION;
        }
        break;
      }

      case S.IN_SECTION: {
        // New section token
        if (isSectionToken(tok, lines[i + 1])) {
          currentSectionKey = tok.trim();
          // Look ahead for an instructor between this section token and the first weekday
          let sectionInstructor = "";
          for (let k = i + 1; k < Math.min(lines.length, i + 12); k++) {
            const ahead = lines[k];
            if (parseWeekday(ahead) !== null) break;
            if (isSectionToken(ahead, lines[k + 1])) break;
            if (parseSubjectLine(ahead)) break;
            if (isInstructorToken(ahead)) { sectionInstructor = ahead.trim(); break; }
          }
          const info = ensureSection(currentSectionKey);
          if (sectionInstructor && !info.instructor) info.instructor = sectionInstructor;
          dbg(`  section: ${currentSectionKey} (instructor: "${info.instructor}")`);
          break;
        }

        // Weekday → expect start + end on the next two lines
        const day = parseWeekday(tok);
        if (day !== null) {
          const start = lines[i + 1];
          const end   = lines[i + 2];
          if (isTimeToken(start) && isTimeToken(end)) {
            addSchedule(currentSectionKey, day, start, end);
            dbg(`    schedule: ${day} ${start}-${end}`);
            i += 2;
          }
          break;
        }

        // Noise / integers / status letters — ignore
        break;
      }
    }
  }

  // Flush last subject
  flushSubject();

  return subjects;
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbg = makeLogger(args.debug);

  const pdfPath = path.resolve(args.pdf);
  if (!fs.existsSync(pdfPath) || !fs.statSync(pdfPath).isFile()) {
    console.error(`File not found: ${args.pdf}`);
    process.exit(1);
  }

  dbg("reading pdf:", pdfPath);
  const buf = await fsp.readFile(pdfPath);
  const data = await pdf(buf);

  const lines = String(data.text ?? "")
    .split("\n")
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  dbg("chars:", String(data.text ?? "").length, "lines:", lines.length);

  // Resolve year + semester: explicit CLI args take precedence; otherwise infer from PDF.
  if (args.year === null || args.semester === null) {
    const inferred = inferPeriod(lines);
    if (inferred === null && (args.year === null || args.semester === null)) {
      console.error(
        "Could not infer year/semester from PDF header. " +
        "Please pass --year <YYYY> --semester <1|2> explicitly.",
      );
      process.exit(1);
    }
    if (args.year === null) {
      args.year = inferred.year;
      dbg("inferred year:", args.year);
    } else {
      dbg("year (from CLI):", args.year);
    }
    if (args.semester === null) {
      args.semester = inferred.semester;
      dbg("inferred semester:", args.semester);
    } else {
      dbg("semester (from CLI):", args.semester);
    }
  } else {
    dbg("year (from CLI):", args.year);
    dbg("semester (from CLI):", args.semester);
  }

  // Resolve default output path now that year and semester are known.
  // Derives from the PDF basename: oferta-eng-eletrica-2026-1.pdf → src/data/oferta-eng-eletrica-2026-1.json
  if (!args.out) {
    const stem = path.basename(pdfPath, ".pdf");
    args.out = `src/data/${stem}.json`;
  }

  const subjects = parseOffer(lines, args.semester, dbg);

  const payload = {
    year: args.year,
    semester: args.semester,
    source_pdf: path.basename(pdfPath),
    generated_at: new Date().toISOString(),
    subjects,
  };

  const outPath = path.resolve(args.out);
  await fsp.mkdir(path.dirname(outPath), { recursive: true });
  await fsp.writeFile(outPath, JSON.stringify(payload, null, 2) + "\n", "utf8");

  console.log(`OK: ${subjects.length} subjects`);
  console.log(`JSON written to: ${outPath}`);
}

main().catch((err) => {
  console.error("Error:", err?.stack ?? err);
  process.exit(1);
});