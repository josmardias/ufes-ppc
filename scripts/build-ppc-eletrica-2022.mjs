#!/usr/bin/env node
/**
 * build-ppc-eletrica-2022.mjs
 *
 * Parses the UFES Electrical Engineering PPC PDF (2022 version) and generates
 * a JSON file in the same format as ppc-2022.json (produced by processar-ppc.mjs
 * from D2 input).
 *
 * The PDF "Disciplinas do Currículo" section (starting around page 26) contains
 * entries in the following layout (as extracted by pdf-parse):
 *
 *   CODE + ORDINAL_PERIOD  (e.g. "ELE159231º", "ELE1597010º", "INF16014-")
 *   Departamento\nde ...\n<dept name>
 *   SUBJECT NAME (multi-line, all-caps)
 *   CREDITS + C.H.S + DISTRIBUTION  (e.g. "23030-0-0-0")
 *   [Co-requisito:\nCODE]*
 *   [Disciplina:\nCODE]*
 *   [Carga horária\nvencida: NNNN]*
 *   TYPE  (OB | OP | EC | EL)
 *
 * Output format:
 * {
 *   version: 1,
 *   courses: {
 *     "CODE": { code, name, suggestedSemester, prereq: [], coreq: [] },
 *     ...
 *   }
 * }
 *
 * Input:  scripts/input/ppc_engenharia_eletrica_-_2022_24.07.25.pdf (fixed path)
 * Output: src/data/ppc-eletrica-2022.json (fixed path)
 *
 * Usage:
 *   node scripts/build-ppc-eletrica-2022.mjs
 */

import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const pdfParse = require("pdf-parse");

const IN_PATH = "scripts/input/ppc_engenharia_eletrica_-_2022_24.07.25.pdf";
const OUT_PATH = "src/data/ppc-eletrica-2022.json";

// ---------------------------------------------------------------------------
// Text extraction
// ---------------------------------------------------------------------------

async function extractText(pdfPath) {
  const buf = await fs.readFile(pdfPath);
  const data = await pdfParse(buf);
  return data.text;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Normalise Unicode whitespace/dashes that pdf-parse sometimes produces.
 */
function normalise(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .trim();
}

/**
 * Returns true when a string looks like a UFES subject code.
 * E.g.  ELE15923  INF15927  MAT09590  QUI15926  FIS13696  STA15932
 */
function isSubjectCode(s) {
  // UFES subject codes: exactly 3 uppercase letters + 5 digits
  return /^[A-Z]{3}[0-9]{5}$/.test((s ?? "").trim());
}

/**
 * Parse a code+period token like "ELE159231º", "ELE1597010º", "INF16014-".
 * Returns { code, semester } where semester is null for optativas ("-").
 */
function parseCodeSemesterToken(token) {
  // UFES subject codes are always exactly 3 uppercase letters + 5 digits (e.g. ELE15923, MAT09590).
  // The suggested semester ordinal follows immediately: "ELE159231º", "ELE1597010º", "INF16014-".
  // We must be precise about the code length to avoid consuming digits from the semester number.

  // Try "CODE(3 letters + 5 digits) + semester(1-2 digits) + º"
  const m = token.match(/^([A-Z]{3}[0-9]{5})(\d{1,2})º$/);
  if (m) return { code: m[1], semester: parseInt(m[2], 10) };

  // Optativas use "-" instead of a period
  const m2 = token.match(/^([A-Z]{3}[0-9]{5})-$/);
  if (m2) return { code: m2[1], semester: null };

  return null;
}

// ---------------------------------------------------------------------------
// Section extraction
// ---------------------------------------------------------------------------

/**
 * Locate the "Disciplinas do Currículo" section in the extracted text.
 *
 * The section starts after the second occurrence of "Disciplinas do Currículo"
 * (the first is in the table of contents) and ends at the "Atividades Complementares"
 * heading that introduces the complementary-activities table.
 *
 * Within the section we include both mandatory (OB) and elective (OP/EC) blocks.
 */
function extractCurriculumSection(fullText) {
  // Skip the first occurrence (TOC entry "Disciplinas do Currículo\n26")
  const firstIdx = fullText.indexOf("Disciplinas do Currículo");
  if (firstIdx === -1) throw new Error("Could not find 'Disciplinas do Currículo' in PDF text.");

  const secondIdx = fullText.indexOf("Disciplinas do Currículo", firstIdx + 1);
  if (secondIdx === -1) throw new Error("Could not find second occurrence of 'Disciplinas do Currículo'.");

  // The section ends when "Atividades Complementares" appears as a heading
  // (not the TOC entry – we look for it after the curriculum section starts).
  const endIdx = fullText.indexOf("\nAtividades Complementares\n", secondIdx);
  if (endIdx === -1) {
    // Fallback: end at "Equivalências" section
    const eqIdx = fullText.indexOf("\nEquivalências\n", secondIdx);
    if (eqIdx === -1) throw new Error("Could not find end of curriculum section.");
    return fullText.substring(secondIdx, eqIdx);
  }

  return fullText.substring(secondIdx, endIdx);
}

// ---------------------------------------------------------------------------
// Main parser
// ---------------------------------------------------------------------------

/**
 * Parse all subjects from the curriculum section text.
 *
 * Strategy: tokenise the section into logical lines, then walk through
 * them as a state machine that recognises each subject entry.
 *
 * Raw PDF layout per entry (blank lines stripped, page headers stripped):
 *
 *   <CODE><ORDINAL>           ← e.g. "ELE159231º" or "INF16014-"
 *   Departamento              ← start of dept block (sometimes merged with next line)
 *   de ...                    ← dept continuation lines
 *   <DEPT NAME>               ← dept name
 *   <SUBJECT NAME LINE 1>     ← all-caps name (may span several lines)
 *   <SUBJECT NAME LINE N>
 *   <CrCHSDistrib>            ← e.g. "23030-0-0-0"  (credits+CHS merged)
 *   [Co-requisito:]           ← optional, followed by code on next line
 *   [<COREQ CODE>]
 *   [Disciplina:]             ← optional prereq, followed by code on next line
 *   [<PREREQ CODE>]
 *   [Carga horária]           ← "Carga horária vencida: NNNN" (split across lines)
 *   [vencida: NNNN]
 *   <TYPE>                    ← OB | OP | EC | EL
 */
function parseCurriculumSection(sectionText) {
  // Strip page headers injected by pdf-parse between pages.
  // They appear as:
  //   \n\n\nUniversidade Federal do Espírito Santo\n<page-section-title>\n
  // where <page-section-title> is a repeated section heading (not a subject code).
  // We must NOT remove lines that contain subject codes, so we strip only the
  // university name line and the immediately following line IF it is a known
  // section heading (all non-digit, non-code text) or a standalone page number.
  let cleaned = sectionText
    // Remove the university header line plus a following standalone page number
    .replace(/\n{2,}Universidade Federal do Esp[^\n]*\n\d+\n/g, "\n")
    // Remove the university header line plus a following known section heading
    // (lines that are NOT subject code lines — i.e. don't start with 3 uppercase letters + 5 digits)
    .replace(
      /\n{2,}Universidade Federal do Esp[^\n]*\n(?![A-Z]{3}[0-9]{5})[^\n]*\n/g,
      "\n",
    )
    // Any remaining isolated university name lines
    .replace(/\n{2,}Universidade Federal do Esp[^\n]*\n/g, "\n")
    .replace(/\u00BA/g, "º") // normalize ordinal indicator
    .replace(/\r/g, "");

  // Pre-process lines to split concatenated tokens that pdf-parse collapses:
  //   1. "NAME...DIGITS-DIGITS-DIGITS-DIGITS[TYPE]"  → split before the distrib
  //   2. "DIGITS-DIGITS-DIGITS-DIGITSTTYPE"          → split before the type
  // These happen when the PDF column layout merges adjacent cells.
  function splitConcatenatedLine(line) {
    // Pattern: all-caps name text immediately followed by distrib (and optional type)
    // e.g. "FÍSICA I46060-0-0-0"  "PROGRAMAÇÃO I36030-0-30-0OB"
    const namePlusDistrib = line.match(
      /^([A-ZÁÉÍÓÚÀÂÊÎÔÛÃÕÇ\s\u00C0-\u024F]+?)(\d+(?:-\d+){3})(OB|OP|EC|EL)?$/
    );
    if (namePlusDistrib && /[A-Z]{2}/.test(namePlusDistrib[1])) {
      const parts = [namePlusDistrib[1].trim(), namePlusDistrib[2]];
      if (namePlusDistrib[3]) parts.push(namePlusDistrib[3]);
      return parts;
    }

    // Pattern: distrib immediately followed by type (no name prefix)
    // e.g. "23030-0-0-0OB"
    const distribPlusType = line.match(/^(\d+(?:-\d+){3})(OB|OP|EC|EL)$/);
    if (distribPlusType) {
      return [distribPlusType[1], distribPlusType[2]];
    }

    return [line];
  }

  // Split into non-empty lines, expanding concatenated tokens
  const rawLines = cleaned
    .split("\n")
    .map(normalise)
    .filter((l) => l.length > 0)
    .flatMap(splitConcatenatedLine);

  /**
   * State machine values:
   *   SEEKING      – looking for a code+period token
   *   IN_DEPT      – consuming department lines
   *   IN_NAME      – consuming subject name lines
   *   IN_DIST      – consumed the CrCHSDistrib line, now reading req lines / type
   */
  const STATE = {
    SEEKING: "SEEKING",
    IN_DEPT: "IN_DEPT",
    IN_NAME: "IN_NAME",
    IN_DIST: "IN_DIST",
  };

  const subjects = []; // array of parsed subject objects
  let state = STATE.SEEKING;

  // Current entry being built
  let cur = null;

  /** Detect the Cr+CHS+distribution line like "23030-0-0-0" or "103000-300-0-0" */
  function isDistribLine(line) {
    // Pattern: digits (credits+CHS concatenated) followed by digits-digits-digits-digits
    // e.g.  "23030-0-0-0"  "469090-0-0-0"  "103000-300-0-0"  "2600-0-0-60"
    return /^\d+-\d+-\d+-\d+$/.test(line.replace(/\s/g, ""));
  }

  /** Detect entry type marker */
  function isTypeLine(line) {
    return /^(OB|OP|EC|EL)$/.test(line.trim());
  }

  /** True when a line is all-uppercase text (subject name fragment) */
  function isAllCaps(line) {
    // Must have at least one letter; all letters are uppercase
    return /[A-Z]/.test(line) && line === line.toUpperCase();
  }

  /** Flush current entry into subjects array */
  function flush() {
    if (!cur) return;
    subjects.push({
      code: cur.code,
      name: cur.nameParts.join(" ").trim(),
      suggestedSemester: cur.semester,
      prereq: cur.prereq,
      coreq: cur.coreq,
      type: cur.type,
    });
    cur = null;
  }

  // --- section-level header lines to skip ---
  const SKIP_PATTERNS = [
    /^Disciplinas (Obrigatórias|Optativas|do Currículo)/,
    /^Carga Horária Exigida/,
    /^Crédito Exigido/,
    /^DepartamentoCódigo/,
    /^Departamento\s*Código/,
    /^Distribuição/,
    /^T\.E\.L\.X/,
    /^Pré-Requisitos/,
    /^T - Carga/,
    /^E - Carga/,
    /^L - Carga/,
    /^OB -/,
    /^OP -/,
    /^EC -/,
    /^EL -/,
    /^X - Carga/,
    /^\d{2}-.*Carga Horária Exigida/,
    /^Nome da Disciplina/,
    /^CrC\.H\.S/,
  ];

  function shouldSkipLine(line) {
    return SKIP_PATTERNS.some((p) => p.test(line));
  }

  // Flags used inside IN_DIST to track multi-line constructs
  let awaitingCoreqCode = false;
  let awaitingPrereqCode = false;
  let awaitingCargaHoraria = false; // "Carga horária" → next line "vencida: NNNN"

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    if (shouldSkipLine(line)) continue;

    switch (state) {
      // ---------------------------------------------------------------
      case STATE.SEEKING: {
        // Try to identify the start of an entry: a code+period token.
        // In the raw PDF the code and ordinal are concatenated without spaces,
        // e.g. "ELE159231º" or "INF16014-".
        const parsed = parseCodeSemesterToken(line);
        if (parsed) {
          flush();
          cur = {
            code: parsed.code,
            semester: parsed.semester,
            nameParts: [],
            prereq: [],
            coreq: [],
            type: null,
          };
          awaitingCoreqCode = false;
          awaitingPrereqCode = false;
          awaitingCargaHoraria = false;
          state = STATE.IN_DEPT;
        }
        // else: ignore noise lines while seeking
        break;
      }

      // ---------------------------------------------------------------
      case STATE.IN_DEPT: {
        // Consume department lines until we hit an all-caps name or distrib.
        // Dept lines start with "Departamento" or "de ..." etc.
        // Sometimes the dept is on the same line as the code (rare).
        if (isDistribLine(line)) {
          // Unusual: no name lines, go straight to dist
          state = STATE.IN_DIST;
          break;
        }
        if (isTypeLine(line)) {
          // Unexpected but handle gracefully
          cur.type = line.trim();
          flush();
          state = STATE.SEEKING;
          break;
        }
        // dept lines: "Departamento", "de ...", dept proper name → skip
        // name lines: all-caps → transition to IN_NAME
        if (isAllCaps(line) && !line.startsWith("Departamento")) {
          cur.nameParts.push(line);
          state = STATE.IN_NAME;
        }
        // else: dept line, skip
        break;
      }

      // ---------------------------------------------------------------
      case STATE.IN_NAME: {
        if (isDistribLine(line)) {
          state = STATE.IN_DIST;
          break;
        }
        if (isTypeLine(line)) {
          cur.type = line.trim();
          flush();
          state = STATE.SEEKING;
          break;
        }
        if (isAllCaps(line)) {
          cur.nameParts.push(line);
        }
        // else: skip (dept overflow, noise)
        break;
      }

      // ---------------------------------------------------------------
      case STATE.IN_DIST: {
        if (awaitingCoreqCode) {
          awaitingCoreqCode = false;
          if (isSubjectCode(line)) {
            cur.coreq.push(line.trim());
          }
          break;
        }

        if (awaitingPrereqCode) {
          awaitingPrereqCode = false;
          if (isSubjectCode(line)) {
            cur.prereq.push(line.trim());
          }
          break;
        }

        if (awaitingCargaHoraria) {
          awaitingCargaHoraria = false;
          // line is "vencida: NNNN" – we record the special prereq marker
          const m = line.match(/vencida:\s*(\d+)/);
          if (m) {
            cur.prereq.push(`Carga-horária-vencida-${m[1]}`);
          }
          break;
        }

        if (line === "Co-requisito:") {
          awaitingCoreqCode = true;
          break;
        }

        if (line === "Disciplina:") {
          awaitingPrereqCode = true;
          break;
        }

        if (line === "Carga horária") {
          awaitingCargaHoraria = true;
          break;
        }

        // Inline "Carga horária vencida: NNNN" (sometimes on one line)
        if (/^Carga horária\s+vencida:\s*\d+/.test(line)) {
          const m = line.match(/vencida:\s*(\d+)/);
          if (m) cur.prereq.push(`Carga-horária-vencida-${m[1]}`);
          break;
        }

        if (isTypeLine(line)) {
          cur.type = line.trim();
          flush();
          state = STATE.SEEKING;
          break;
        }

        // New entry started? (pdf sometimes runs entries together)
        const parsed = parseCodeSemesterToken(line);
        if (parsed) {
          // flush current without having seen a type line
          flush();
          cur = {
            code: parsed.code,
            semester: parsed.semester,
            nameParts: [],
            prereq: [],
            coreq: [],
            type: null,
          };
          awaitingCoreqCode = false;
          awaitingPrereqCode = false;
          awaitingCargaHoraria = false;
          state = STATE.IN_DEPT;
        }
        // else: ignore noise (page numbers, headers already filtered above)
        break;
      }
    }
  }

  // Flush last entry
  flush();

  return subjects;
}

// ---------------------------------------------------------------------------
// JSON builder
// ---------------------------------------------------------------------------

/**
 * Builds the final ppc JSON object from parsed subjects.
 *
 * We include ALL subjects regardless of type (OB/OP/EC/EL) so that
 * prerequisite references can always be resolved.
 *
 * The special "Carga-horária-vencida-NNNN" pseudo-subject (used as a
 * prerequisite for the mandatory internship) is added as a course node
 * with no name and no semester.
 */
function buildPpcJson(subjects) {
  const courses = new Map(); // code -> courseObj

  const getOrCreate = (code) => {
    if (!courses.has(code)) {
      courses.set(code, {
        code,
        name: "",
        suggestedSemester: null,
        prereq: [],
        coreq: [],
      });
    }
    return courses.get(code);
  };

  // 1. Create all course nodes
  for (const s of subjects) {
    const c = getOrCreate(s.code);
    if (!c.name && s.name) c.name = s.name;
    if (c.suggestedSemester === null && s.suggestedSemester != null) {
      c.suggestedSemester = s.suggestedSemester;
    }
  }

  // 2. Populate prereq/coreq arrays from parsed subjects
  for (const s of subjects) {
    for (const preCode of s.prereq) {
      // Ensure the dependency node exists (may be a pseudo-node like Carga-horária-vencida-*)
      getOrCreate(preCode);
      const target = getOrCreate(s.code);
      if (!target.prereq.includes(preCode)) {
        target.prereq.push(preCode);
      }
    }

    for (const coCode of s.coreq) {
      getOrCreate(coCode);
      const target = getOrCreate(s.code);
      if (!target.coreq.includes(coCode)) {
        target.coreq.push(coCode);
      }
    }
  }

  // 3. Sort arrays for stability
  for (const c of courses.values()) {
    c.prereq.sort();
    c.coreq.sort();
  }

  // 4. Build ordered courses object (sorted by code)
  const sortedCodes = Array.from(courses.keys()).sort();
  const coursesObj = {};
  for (const code of sortedCodes) {
    coursesObj[code] = courses.get(code);
  }

  return {
    version: 1,
    courses: coursesObj,
  };
}

// ---------------------------------------------------------------------------
// Entry point
// ---------------------------------------------------------------------------

async function main() {
  const inputPath = path.resolve(IN_PATH);
  const outPath = path.resolve(OUT_PATH);

  console.log(`Reading PDF: ${inputPath}`);
  const fullText = await extractText(inputPath);

  console.log("Extracting curriculum section...");
  const section = extractCurriculumSection(fullText);

  console.log("Parsing subjects...");
  const subjects = parseCurriculumSection(section);

  if (subjects.length === 0) {
    console.error("ERROR: No subjects were parsed. Please check the PDF format.");
    process.exit(1);
  }

  console.log(`Parsed ${subjects.length} subject entries.`);

  const ppc = buildPpcJson(subjects);

  await fs.mkdir(path.dirname(outPath), { recursive: true });
  await fs.writeFile(outPath, JSON.stringify(ppc, null, 2) + "\n", "utf8");

  console.log(`\nOK: PPC JSON written to: ${outPath}`);
  console.log(`Courses : ${Object.keys(ppc.courses).length}`);

  // Brief summary grouped by type (for verification)
  const byType = {};
  for (const s of subjects) {
    const t = s.type ?? "?";
    byType[t] = (byType[t] ?? 0) + 1;
  }
  console.log("\nSubject counts by type:");
  for (const [t, n] of Object.entries(byType).sort()) {
    console.log(`  ${t}: ${n}`);
  }
}

main().catch((err) => {
  console.error("Error:", err?.stack ?? err);
  process.exit(1);
});