#!/usr/bin/env node
/**
 * build-data.mjs
 *
 * Data pipeline entrypoint. Runs all data-generation scripts in order so that
 * src/data/ is fully populated before the Vite app build starts.
 *
 * Steps (in order):
 *   1. build-data-offer.mjs (×5) — parses each offer PDF → src/data/oferta-semestre-<YYYY>-s<n>.json
 *
 * Usage:
 *   node scripts/build-data.mjs [--debug]
 *
 * Optional:
 *   --debug    Pass --debug through to every script that supports it
 */

import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, "..");
const NODE = process.execPath;
const debug = process.argv.includes("--debug");

/** @type {string[]} */
const OFFERS = [
  "scripts/input/oferta-eng-ambiental-2026-1.pdf",
  "scripts/input/oferta-eng-civil-2026-1.pdf",
  "scripts/input/oferta-eng-computacao-2026-1.pdf",
  "scripts/input/oferta-eng-eletrica-2026-1.pdf",
  "scripts/input/oferta-eng-mecanica-2026-1.pdf",
];

/**
 * Runs a Node script and streams its output to the terminal.
 * Returns true on success, false on failure.
 *
 * @param {string} scriptPath  Absolute path to the .mjs script
 * @param {string[]} args      Arguments to pass to the script
 * @returns {boolean}
 */
function run(scriptPath, args) {
  const result = spawnSync(NODE, [scriptPath, ...args], {
    cwd: ROOT,
    stdio: "inherit",
    encoding: "utf8",
  });
  return result.status === 0;
}

/** @type {{ label: string, run: () => boolean }[]} */
const STEPS = [
  ...OFFERS.map((pdf) => ({
    label: `Offer: ${path.basename(pdf)}`,
    run: () =>
      run(path.join(__dirname, "build-data-offer.mjs"), [
        "--pdf", pdf,
        ...(debug ? ["--debug"] : []),
      ]),
  })),
];

let anyFailed = false;

for (const step of STEPS) {
  console.log(`\n── ${step.label}`);
  const ok = step.run();
  if (!ok) {
    console.error(`\n✗ Step failed: ${step.label}`);
    anyFailed = true;
    // Continue so all errors surface in one pass.
  }
}

console.log("");

if (anyFailed) {
  console.error("Data pipeline finished with errors. Aborting.");
  process.exit(1);
}

console.log("Data pipeline complete. All steps succeeded.");