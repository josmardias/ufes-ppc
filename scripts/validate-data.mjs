#!/usr/bin/env node
// Deploy-time validation gate for scripts/output/*.ppc.json and
// *.ys*.offerings.json (see docs/ARCHITECTURE.md, "Data Pipeline" —
// Validation): schema checks plus referential integrity. Exits non-zero on
// any error, which fails the deploy (see docs/ARCHITECTURE.md, Deployment).
// Run after assemble-ppc.mjs and collect-course-offerings.mjs, before
// copy-to-data.mjs.
//
// Usage: node scripts/validate-data.mjs

import { readdirSync, readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { validatePpc, validateOfferings } from './lib/validate-data.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptsDir, 'output');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

const ppcFiles = readdirSync(outputDir).filter((f) => f.endsWith('.ppc.json'));
if (ppcFiles.length === 0) {
  console.error(`No *.ppc.json files found in ${outputDir}. Run assemble-ppc.mjs first.`);
  process.exit(1);
}

let hasErrors = false;
const relevantCodesByPpcId = new Map();

for (const file of ppcFiles) {
  const ppc = readJson(join(outputDir, file));
  const errors = validatePpc(ppc);
  if (errors.length > 0) {
    hasErrors = true;
    console.error(`${file}:`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    console.log(`${file}: OK (${ppc.subjects.length} subjects)`);
  }

  // Sections offered under an equivalent code belong to a course's snapshot
  // too (see docs/ARCHITECTURE.md, "Offerings dataset"), so the referential
  // check below allows both a PPC's own subject codes and its equivalents.
  const codes = new Set();
  for (const s of ppc.subjects ?? []) {
    codes.add(s.code);
    for (const eq of s.equivalents ?? []) codes.add(eq);
  }
  relevantCodesByPpcId.set(ppc.id, codes);
}

const offeringsFiles = readdirSync(outputDir).filter((f) => /\.ys\d+\.offerings\.json$/.test(f));
for (const file of offeringsFiles) {
  const snapshot = readJson(join(outputDir, file));
  const relevantCodes = relevantCodesByPpcId.get(snapshot.ppcId) ?? null;
  if (!relevantCodes) {
    hasErrors = true;
    console.error(`${file}:\n  - no matching PPC "${snapshot.ppcId}" found among ${ppcFiles.join(', ')}`);
    continue;
  }

  const errors = validateOfferings(snapshot, relevantCodes);
  if (errors.length > 0) {
    hasErrors = true;
    console.error(`${file}:`);
    for (const e of errors) console.error(`  - ${e}`);
  } else {
    const sectionCount = snapshot.subjects.reduce((n, s) => n + s.sections.length, 0);
    console.log(`${file}: OK (${snapshot.subjects.length} subjects, ${sectionCount} sections)`);
  }
}

if (hasErrors) {
  console.error('\nValidation failed.');
  process.exit(1);
}
console.log('\nAll data validated successfully.');
