#!/usr/bin/env node
// Extracts subject equivalences from scripts/input/ppc_engenharia_eletrica_equivalencias_*.pdf
// and writes one JSON file per matching PDF to scripts/output/.
//
// Scoped to Engenharia Elétrica only — see lib/parse-equivalencias-eletrica.mjs.
// Other courses' equivalences PDFs will need their own parser + extraction script.
//
// Output maps each subject's own code to the list of codes that satisfy it
// (the shape of a PPC subject's `equivalents` field, see docs/ARCHITECTURE.md).
// This is a standalone equivalences document (per docs/DOMAIN.md, Equivalence),
// so merging it into the committed engenharia-eletrica-*.subjects.json is a
// manual step, not done by this script.
//
// Usage: node scripts/extract-equivalencias-eletrica.mjs

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEletricaEquivalenciasPdf } from './lib/parse-equivalencias-eletrica.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const inputDir = join(scriptsDir, 'input');
const outputDir = join(scriptsDir, 'output');

const pdfFiles = readdirSync(inputDir).filter(
  (f) =>
    f.startsWith('ppc_engenharia_eletrica_equivalencias_') &&
    f.endsWith('.pdf'),
);

if (pdfFiles.length === 0) {
  console.error(
    `No ppc_engenharia_eletrica_equivalencias_*.pdf files found in ${inputDir}`,
  );
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

for (const file of pdfFiles) {
  const pdfPath = join(inputDir, file);
  console.log(`Parsing ${file}...`);
  const result = parseEletricaEquivalenciasPdf(pdfPath);

  const subjectCount = Object.keys(result.equivalences).length;
  const equivCount = Object.values(result.equivalences).reduce(
    (n, codes) => n + codes.length,
    0,
  );
  console.log(
    `  ${result.ppcId}: ${subjectCount} subjects with equivalences, ${equivCount} equivalent codes total`,
  );

  const outPath = join(outputDir, `${result.ppcId}.equivalences.json`);
  writeFileSync(outPath, JSON.stringify(result, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${outPath}`);
}
