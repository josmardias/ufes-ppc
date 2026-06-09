#!/usr/bin/env node
// Extracts required/optional subjects from scripts/input/ppc_engenharia_eletrica_*.pdf
// and writes one JSON file per matching PDF to scripts/output/.
//
// Scoped to Engenharia Elétrica only — see lib/parse-ppc-eletrica.mjs. Other
// courses' PPC PDFs will need their own parser + extraction script.
//
// Usage: node scripts/extract-subjects-eletrica.mjs

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseEletricaPpcPdf } from './lib/parse-ppc-eletrica.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const inputDir = join(scriptsDir, 'input');
const outputDir = join(scriptsDir, 'output');

const pdfFiles = readdirSync(inputDir).filter(
  (f) => f.startsWith('ppc_engenharia_eletrica_') && f.endsWith('.pdf') && !f.includes('_equivalencias_'),
);

if (pdfFiles.length === 0) {
  console.error(`No ppc_engenharia_eletrica_*.pdf files found in ${inputDir}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

for (const file of pdfFiles) {
  const pdfPath = join(inputDir, file);
  console.log(`Parsing ${file}...`);
  const ppc = parseEletricaPpcPdf(pdfPath);

  console.log(`  ${ppc.name} (${ppc.ppcId}): ${ppc.required.length} required, ${ppc.optional.length} optional subjects`);

  const outPath = join(outputDir, `${ppc.ppcId}.subjects.json`);
  writeFileSync(outPath, JSON.stringify(ppc, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${outPath}`);
}
