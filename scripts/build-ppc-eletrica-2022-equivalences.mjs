#!/usr/bin/env node
/**
 * scripts/build-ppc-eletrica-2022-equivalences.mjs
 *
 * Extracts legacy-to-current discipline code mappings from the UFES
 * "Equivalências por Curso" PDF and writes them as a JSON file.
 *
 * The PDF structure (per discipline block) is:
 *   <LEGACY_CODE>BLOCO 1<legacy name>Equivalências:
 *   Disciplinas Vencida
 *   <CURRENT_CODE><CURRENT NAME>        ← one or more lines
 *   (next block or section header)
 *
 * Output shape:
 *   {
 *     "generated_at": "...",
 *     "source_pdf": "...",
 *     "equivalences": {
 *       "EPR15969": ["EPR07923"],
 *       "HID15930": ["DEA07756"],
 *       ...
 *     }
 *   }
 *
 * Usage:
 *   node scripts/build-ppc-eletrica-2022-equivalences.mjs [--pdf <path>] [--out <path>] [--debug]
 *
 * Defaults:
 *   --pdf  scripts/input/EquivalenciasporCurso.pdf
 *   --out  src/data/ppc-eletrica-2022-equivalences.json
 *
 * Dependencies: pdf-parse (already installed)
 */

import fs from "node:fs";
import fsp from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pdf from "pdf-parse";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

function parseArgs(argv) {
  const out = {
    pdf: path.resolve(__dirname, "input/EquivalenciasporCurso.pdf"),
    out: path.resolve(__dirname, "../src/data/ppc-eletrica-2022-equivalences.json"),
    debug: false,
  };

  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--debug") {
      out.debug = true;
      continue;
    }
    if (a === "--pdf") {
      out.pdf = argv[++i];
      continue;
    }
    if (a === "--out") {
      out.out = argv[++i];
      continue;
    }
    if (a === "-h" || a === "--help") {
      console.log(
        "Usage: node build-ppc-eletrica-2022-equivalences.mjs [--pdf <path>] [--out <path>] [--debug]",
      );
      process.exit(0);
    }
    console.error(`Unknown argument: ${a}`);
    process.exit(1);
  }

  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function makeLogger(enabled) {
  return (...args) => {
    if (enabled) console.error("[debug]", ...args);
  };
}

function normalizeLine(s) {
  return (s ?? "")
    .replace(/\u00A0/g, " ")
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Returns true if the line starts with a UFES discipline code.
 * Format: 2–4 uppercase letters followed by 4–5 digits (e.g. ELE08521, EPR07923).
 */
function isCode(s) {
  return /^[A-Z]{2,4}\d{4,5}/.test(String(s ?? "").trim());
}

/**
 * Extracts just the code from a line that starts with a UFES discipline code.
 * E.g. "EPR07923BLOCO 1Aspectos..." → "EPR07923"
 *      "EPR15969ASPECTOS LEGAIS..."  → "EPR15969"
 *      "ELE-PROP-PROJETO..."         → null  (hyphen — not a real code)
 */
function extractCode(line) {
  const m = String(line ?? "").match(/^([A-Z]{2,4}\d{4,5})/);
  return m ? m[1] : null;
}

/**
 * Extracts the name portion after the code on a "current" discipline line.
 * E.g. "EPR15969ASPECTOS LEGAIS E ÉTICOS DA ENGENHARIA" → "ASPECTOS LEGAIS E ÉTICOS DA ENGENHARIA"
 * The name may be all-caps or mixed-case. Multiple spaces are collapsed.
 */
function extractNameAfterCode(line) {
  const code = extractCode(line);
  if (!code) return "";
  return String(line ?? "")
    .slice(code.length)
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

/**
 * State machine:
 *
 *   IDLE         — scanning for a legacy code line ("XXX99999BLOCO 1...")
 *   AFTER_LEGACY — saw legacy code, waiting for "Disciplinas Vencida"
 *   AFTER_MARKER — saw marker, collecting current code lines until next block
 *
 * A "current code line" starts with a discipline code and is NOT a header or
 * section label. Each such line maps legacyCode → currentCode.
 *
 * One legacy code may map to multiple current codes (one-to-many equivalence).
 */
function parse(lines, dbg) {
  const equivalences = [];

  // Skip header/footer lines that match known patterns
  const isPageNoise = (s) =>
    s.startsWith("UNIVERSIDADE FEDERAL") ||
    s.startsWith("Equivalências por Curso") ||
    s.startsWith("Data:") ||
    s.startsWith("Hora:") ||
    s.startsWith("Situação:") ||
    s.startsWith("Curso:") ||
    s.startsWith("Versão:") ||
    s.startsWith("Página") ||
    s.startsWith("INTEGRALIZAÇÃO CURRICULAR") ||
    s.startsWith("Descrição da Estrutura") ||
    s === "Disciplina" ||
    s === "Disciplinas Obrigatórias" ||
    s === "Disciplinas Optativas" ||
    s === "02-Estágio Supervisionado" ||
    s === "04-Trabalho de Conclusão de Curso" ||
    /^\d{2}:\d{2}:\d{2}$/.test(s) || // time token
    /^\d{2}\/\d{2}\/\d{4}$/.test(s); // date token

  const MARKER = "Disciplinas Vencida";
  // A legacy code line has "BLOCO" immediately after the code (no space)
  const isLegacyLine = (s) => {
    const code = extractCode(s);
    if (!code) return false;
    return s.slice(code.length).startsWith("BLOCO");
  };

  let state = "IDLE";
  let legacyCode = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (isPageNoise(line)) continue;

    if (state === "IDLE") {
      if (isLegacyLine(line)) {
        legacyCode = extractCode(line);
        state = "AFTER_LEGACY";
        dbg("legacy code found:", legacyCode, "|", line);
      }
      continue;
    }

    if (state === "AFTER_LEGACY") {
      if (line === MARKER) {
        state = "AFTER_MARKER";
        dbg("marker found, waiting for current codes");
      } else if (isLegacyLine(line)) {
        // Another legacy block before seeing the marker — shouldn't happen but handle it
        legacyCode = extractCode(line);
        dbg("new legacy code (no marker):", legacyCode);
      }
      // Ignore other lines between legacy code and marker
      continue;
    }

    if (state === "AFTER_MARKER") {
      if (isLegacyLine(line)) {
        // Start of next legacy block
        legacyCode = extractCode(line);
        state = "AFTER_LEGACY";
        dbg("next legacy code:", legacyCode, "|", line);
        continue;
      }

      if (line === MARKER) {
        // Duplicate marker — ignore
        continue;
      }

      if (isCode(line)) {
        const currentCode = extractCode(line);
        const currentName = extractNameAfterCode(line);

        // Skip if current code is same as legacy (self-reference)
        if (currentCode === legacyCode) {
          dbg("skip self-reference:", currentCode);
          continue;
        }

        dbg("equivalence:", legacyCode, "→", currentCode, currentName);
        equivalences.push({
          legacy_code: legacyCode,
          current_code: currentCode,
          nome_novo: currentName,
        });
        continue;
      }

      // Non-code line that's not a new legacy block — could be a section header
      // or leftover text. If it's clearly a section header, reset to IDLE.
      if (
        line === "Disciplinas Obrigatórias" ||
        line === "Disciplinas Optativas" ||
        line.startsWith("Descrição da Estrutura") ||
        line.startsWith("02-") ||
        line.startsWith("04-")
      ) {
        state = "IDLE";
        legacyCode = null;
      }
      // Otherwise keep collecting (the line may be a continuation of a wrapped name)
    }
  }

  return equivalences;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const dbg = makeLogger(args.debug);

  if (!fs.existsSync(args.pdf)) {
    console.error(`PDF not found: ${args.pdf}`);
    process.exit(1);
  }

  dbg("reading:", args.pdf);
  const buf = await fsp.readFile(args.pdf);
  const data = await pdf(buf);

  const lines = String(data.text ?? "")
    .split("\n")
    .map(normalizeLine)
    .filter((l) => l.length > 0);

  dbg("lines:", lines.length);

  const equivalences = parse(lines, dbg);

  // Build inverted map: current_code → [legacy_code, ...] (deduplicated, sorted)
  const map = {};
  for (const { legacy_code, current_code } of equivalences) {
    if (!map[current_code]) map[current_code] = new Set();
    map[current_code].add(legacy_code);
  }

  // Convert Sets to sorted arrays and sort keys for stability
  const equivalencesMap = Object.fromEntries(
    Object.keys(map)
      .sort()
      .map((k) => [k, [...map[k]].sort()]),
  );

  const totalPairs = Object.values(equivalencesMap).reduce(
    (acc, v) => acc + v.length,
    0,
  );

  const payload = {
    generated_at: new Date().toISOString(),
    source_pdf: path.basename(args.pdf),
    total_legacy_codes: Object.keys(equivalencesMap).length,
    total_pairs: totalPairs,
    equivalences: equivalencesMap,
  };

  await fsp.mkdir(path.dirname(args.out), { recursive: true });
  await fsp.writeFile(
    args.out,
    JSON.stringify(payload, null, 2) + "\n",
    "utf8",
  );

  console.log(
    `OK: ${Object.keys(equivalencesMap).length} legacy codes, ${totalPairs} pairs`,
  );
  console.log(`JSON written to: ${args.out}`);

  // Print summary to stdout
  for (const [current, legacy] of Object.entries(equivalencesMap)) {
    console.log(`  ${legacy.join(", ")} → ${current}`);
  }
}

main().catch((err) => {
  console.error("Erro:", err?.stack ?? err);
  process.exit(1);
});
