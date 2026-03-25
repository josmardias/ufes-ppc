#!/usr/bin/env node
/**
 * build-data.mjs
 *
 * Data pipeline entrypoint. Runs all data-generation scripts in order so that
 * src/data/ is fully populated before the Vite app build starts.
 *
 * Steps (in order):
 *   1. build-ppc-eletrica-2022.mjs — parses the 2022 EE PPC PDF → src/data/ppc-eletrica-2022.json
 *   2. build-ppc-eletrica-2022-equivalences.mjs — extracts equivalences → src/data/equivalencias.json
 *   3. build-offer-from-department.mjs (×N) — parses every
 *      scripts/input/oferta-departamento-*.pdf → src/data/<stem>.json
 *
 * Usage:
 *   node scripts/build-data.mjs [--debug]
 *
 * Options:
 *   --debug    Pass --debug through to every sub-script
 */

import { spawnSync }  from "node:child_process";
import fs             from "node:fs";
import path           from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT      = path.resolve(__dirname, "..");
const NODE      = process.execPath;
const debug     = process.argv.includes("--debug");

// ---------------------------------------------------------------------------
// Discover all department-offer PDFs
// ---------------------------------------------------------------------------

const INPUT_DIR = path.join(ROOT, "scripts", "input");

const DEPARTMENT_PDFS = fs
  .readdirSync(INPUT_DIR)
  .filter((f) => f.startsWith("oferta-departamento-") && f.endsWith(".pdf"))
  .sort()
  .map((f) => path.join("scripts", "input", f));

if (DEPARTMENT_PDFS.length === 0) {
  console.error(
    `No oferta-departamento-*.pdf files found in ${INPUT_DIR}. Nothing to do.`,
  );
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Runner
// ---------------------------------------------------------------------------

/**
 * Runs a Node script and streams its output to the terminal.
 * Returns true on success, false on failure.
 */
function run(scriptPath, args) {
  const result = spawnSync(NODE, [scriptPath, ...args], {
    cwd:      ROOT,
    stdio:    "inherit",
    encoding: "utf8",
  });
  return result.status === 0;
}

// ---------------------------------------------------------------------------
// Steps
// ---------------------------------------------------------------------------

/** @type {{ label: string, run: () => boolean }[]} */
const STEPS = [
  {
    label: "PPC Engenharia Elétrica 2022",
    run: () => run(path.join(__dirname, "build-ppc-eletrica-2022.mjs"), []),
  },
  {
    label: "PPC Engenharia Elétrica 2022 — Equivalences",
    run: () => run(path.join(__dirname, "build-ppc-eletrica-2022-equivalences.mjs"), []),
  },
  ...DEPARTMENT_PDFS.map((pdf) => ({
  label: `Department offer: ${path.basename(pdf)}`,
  run: () =>
    run(path.join(__dirname, "build-offer-from-department.mjs"), [
      "--pdf", pdf,
      ...(debug ? ["--debug"] : []),
    ]),
  })),

];

// ---------------------------------------------------------------------------
// Execute
// ---------------------------------------------------------------------------

console.log(`Found ${DEPARTMENT_PDFS.length} department PDF(s) to process.\n`);

let anyFailed = false;

for (const step of STEPS) {
  console.log(`── ${step.label}`);
  const ok = step.run();
  if (!ok) {
    console.error(`✗ Step failed: ${step.label}`);
    anyFailed = true;
    // Keep going so all errors surface in one pass.
  }
}

console.log("");

if (anyFailed) {
  console.error("Data pipeline finished with errors. Aborting.");
  process.exit(1);
}

console.log("Data pipeline complete. All steps succeeded.");