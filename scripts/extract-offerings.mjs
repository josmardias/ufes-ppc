#!/usr/bin/env node
// Extracts departments/subjects/sections from scripts/input/oferta-departamento-*.pdf
// and writes one JSON file per matching PDF to scripts/output/.
//
// This is Stage 1 (parser) of the offerings pipeline described in
// docs/ARCHITECTURE.md — one JSON per department per source semester, not yet
// filtered down to any course's PPC. Stage 2 (collector, building per-course
// Year Semester snapshots) is not implemented by this script.
//
// Usage: node scripts/extract-offerings.mjs

import { readdirSync, mkdirSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseOfertaPdf } from './lib/parse-offerings.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const inputDir = join(scriptsDir, 'input');
const outputDir = join(scriptsDir, 'output');

const pdfFiles = readdirSync(inputDir).filter((f) => f.startsWith('oferta-departamento-') && f.endsWith('.pdf'));

if (pdfFiles.length === 0) {
  console.error(`No oferta-departamento-*.pdf files found in ${inputDir}`);
  process.exit(1);
}

mkdirSync(outputDir, { recursive: true });

for (const file of pdfFiles) {
  const pdfPath = join(inputDir, file);
  console.log(`Parsing ${file}...`);
  const oferta = parseOfertaPdf(pdfPath);

  const sectionCount = oferta.subjects.reduce((n, s) => n + s.sections.length, 0);
  console.log(`  ${oferta.department} (${oferta.yearSemester.year}/${oferta.yearSemester.semester}): ${oferta.subjects.length} subjects, ${sectionCount} sections`);

  const outName = file.replace(/^oferta-departamento-/, '').replace(/\.pdf$/, '');
  const outPath = join(outputDir, `${outName}.offerings.json`);
  writeFileSync(outPath, JSON.stringify(oferta, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${outPath}`);
}
