#!/usr/bin/env node
// Assembles every scripts/output/*.subjects.json (produced by
// extract-subjects-*.mjs, with equivalents already merged in by
// merge-equivalencias-*.mjs) into the final PPC dataset shape (see
// docs/ARCHITECTURE.md, "PPC dataset"): scripts/output/<id>.ppc.json.
// Course-agnostic — runs over every *.subjects.json found.
//
// Usage: node scripts/assemble-ppc.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { assemblePpc } from './lib/assemble-ppc.mjs';
import { COURSES } from './lib/courses-config.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptsDir, 'output');

const subjectsFiles = readdirSync(outputDir).filter((f) =>
  f.endsWith('.subjects.json'),
);

if (subjectsFiles.length === 0) {
  console.error(
    `No *.subjects.json files found in ${outputDir}. Run the PPC extraction scripts first.`,
  );
  process.exit(1);
}

for (const file of subjectsFiles) {
  const merged = JSON.parse(readFileSync(join(outputDir, file), 'utf8'));
  const course = COURSES.find((c) => c.ppcId === merged.ppcId);
  if (!course) {
    console.error(
      `No course config found for PPC "${merged.ppcId}" in scripts/lib/courses-config.mjs.`,
    );
    process.exit(1);
  }
  const ppc = assemblePpc(merged, course);

  console.log(
    `${ppc.id}: assembled ${ppc.subjects.length} subjects ` +
      `(${merged.required.length} required, ${merged.optional.length} optional).`,
  );

  const outPath = join(outputDir, `${ppc.id}.ppc.json`);
  writeFileSync(outPath, JSON.stringify(ppc, null, 2) + '\n', 'utf8');
  console.log(`  wrote ${outPath}`);
}
