#!/usr/bin/env node
// Copies validated data from scripts/output/ (git-ignored intermediate) into
// src/data/ (see docs/ARCHITECTURE.md, "src/data" and "Data Pipeline"):
//
// - src/data/ppcs/<id>.json — committed for hand-crafted PPCs. Engenharia
//   Elétrica's is script-generated from the official PDF (not hand-edited),
//   so it is git-ignored instead and regenerated on every build, same
//   treatment as Offerings below.
// - src/data/offerings/<ppcId>.ys<N>.offerings.json — never committed
//   (git-ignored): regenerated on every build from the source PDFs in
//   scripts/input.
//
// Run after scripts/validate-data.mjs.
//
// Usage: node scripts/copy-to-data.mjs

import { readdirSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptsDir, 'output');
const dataDir = join(scriptsDir, '..', 'src', 'data');
const ppcsDir = join(dataDir, 'ppcs');
const offeringsDir = join(dataDir, 'offerings');

const ppcFiles = readdirSync(outputDir).filter((f) => f.endsWith('.ppc.json'));
const offeringsFiles = readdirSync(outputDir).filter((f) => /\.ys\d+\.offerings\.json$/.test(f));

if (ppcFiles.length === 0 && offeringsFiles.length === 0) {
  console.error(`Nothing to copy: no *.ppc.json or *.ys*.offerings.json found in ${outputDir}.`);
  process.exit(1);
}

mkdirSync(ppcsDir, { recursive: true });
mkdirSync(offeringsDir, { recursive: true });

for (const file of ppcFiles) {
  const id = file.replace(/\.ppc\.json$/, '');
  const destPath = join(ppcsDir, `${id}.json`);
  writeFileSync(destPath, readFileSync(join(outputDir, file)));
  console.log(`copied ${file} -> ${destPath}`);
}

for (const file of offeringsFiles) {
  const destPath = join(offeringsDir, file);
  writeFileSync(destPath, readFileSync(join(outputDir, file)));
  console.log(`copied ${file} -> ${destPath}`);
}
