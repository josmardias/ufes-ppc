#!/usr/bin/env node
// Merges scripts/output/<ppcId>.equivalences.json into the matching
// scripts/output/<ppcId>.subjects.json, filling each subject's `equivalents`
// field (see docs/ARCHITECTURE.md's PPC dataset shape).
//
// Scoped to Engenharia Elétrica only, following extract-equivalencias-eletrica.mjs
// and extract-subjects-eletrica.mjs. Run after both extraction scripts.
//
// Usage: node scripts/merge-equivalencias-eletrica.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptsDir, 'output');

const equivalenceFiles = readdirSync(outputDir).filter((f) => f.endsWith('.equivalences.json'));

if (equivalenceFiles.length === 0) {
  console.error(`No *.equivalences.json files found in ${outputDir}. Run extract-equivalencias-eletrica.mjs first.`);
  process.exit(1);
}

for (const equivFile of equivalenceFiles) {
  const ppcId = equivFile.replace(/\.equivalences\.json$/, '');
  const subjectsPath = join(outputDir, `${ppcId}.subjects.json`);

  let subjectsRaw;
  try {
    subjectsRaw = readFileSync(subjectsPath, 'utf8');
  } catch {
    console.error(`Skipping ${equivFile}: no matching ${ppcId}.subjects.json in ${outputDir}. Run extract-subjects-eletrica.mjs first.`);
    continue;
  }

  const { equivalences } = JSON.parse(readFileSync(join(outputDir, equivFile), 'utf8'));
  const subjects = JSON.parse(subjectsRaw);
  const allSubjects = [...subjects.required, ...subjects.optional];
  const subjectCodes = new Set(allSubjects.map((s) => s.code));

  let updated = 0;
  let overwritten = 0;
  for (const subject of allSubjects) {
    const codes = equivalences[subject.code];
    if (!codes) continue;
    if (subject.equivalents.length > 0) overwritten++;
    subject.equivalents = codes;
    updated++;
  }

  const unmatched = Object.keys(equivalences).filter((code) => !subjectCodes.has(code));
  if (unmatched.length > 0) {
    console.warn(`  ${ppcId}: ${unmatched.length} equivalence code(s) not found in subjects.json: ${unmatched.join(', ')}`);
  }

  writeFileSync(subjectsPath, JSON.stringify(subjects, null, 2) + '\n', 'utf8');
  console.log(
    `${ppcId}: merged equivalents into ${updated} subject(s)` +
      (overwritten ? ` (overwrote ${overwritten} pre-existing non-empty equivalents)` : '') +
      '.',
  );
  console.log(`  wrote ${subjectsPath}`);
}
