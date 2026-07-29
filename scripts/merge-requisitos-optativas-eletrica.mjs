#!/usr/bin/env node
// Merges prerequisites for optional subjects from
// ppc_engenharia_eletrica_requisitos_optativas_*.d2 into the matching
// scripts/output/<ppcId>.subjects.json, augmenting each named subject's
// `prerequisites` field with the prerequisite codes from the d2 graph (see
// lib/parse-requisitos-optativas-eletrica.mjs for the edge direction).
//
// Run after extract-subjects-eletrica.mjs, before assemble-ppc.mjs.
//
// Usage: node scripts/merge-requisitos-optativas-eletrica.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseRequisitosOptativasD2 } from './lib/parse-requisitos-optativas-eletrica.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const inputDir = join(scriptsDir, 'input');
const outputDir = join(scriptsDir, 'output');

const d2Files = readdirSync(inputDir).filter(
  (f) =>
    f.startsWith('ppc_engenharia_eletrica_requisitos_optativas_') &&
    f.endsWith('.d2'),
);

if (d2Files.length === 0) {
  console.error(
    `No ppc_engenharia_eletrica_requisitos_optativas_*.d2 file found in ${inputDir}`,
  );
  process.exit(1);
}

const d2Path = join(inputDir, d2Files[0]);
const edges = parseRequisitosOptativasD2(d2Path);

const subjectsFiles = readdirSync(outputDir).filter((f) =>
  f.endsWith('.subjects.json'),
);

if (subjectsFiles.length === 0) {
  console.error(
    `No *.subjects.json files found in ${outputDir}. Run extract-subjects-eletrica.mjs first.`,
  );
  process.exit(1);
}

for (const file of subjectsFiles) {
  const subjectsPath = join(outputDir, file);
  const subjects = JSON.parse(readFileSync(subjectsPath, 'utf8'));
  const allSubjects = [...subjects.required, ...subjects.optional];
  const byCode = new Map(allSubjects.map((s) => [s.code, s]));

  let added = 0;
  let alreadyPresent = 0;
  const unresolvedTargets = new Set();

  for (const { prerequisite, subject: subjectCode } of edges) {
    const subject = byCode.get(subjectCode);
    if (!subject) {
      // Code not present in this PPC (e.g. a subject dropped from the
      // current curriculum) — nothing to attach the requisite to.
      unresolvedTargets.add(subjectCode);
      continue;
    }
    if (subject.prerequisites.includes(prerequisite)) {
      alreadyPresent++;
      continue;
    }
    subject.prerequisites.push(prerequisite);
    added++;
  }

  if (unresolvedTargets.size > 0) {
    console.warn(
      `  ${file}: ${unresolvedTargets.size} subject code(s) from the d2 file not found in subjects.json: ${[...unresolvedTargets].join(', ')}`,
    );
  }

  writeFileSync(subjectsPath, JSON.stringify(subjects, null, 2) + '\n', 'utf8');
  console.log(
    `${file}: merged optional-subject prerequisites: ${added} added, ${alreadyPresent} already present.`,
  );
  console.log(`  wrote ${subjectsPath}`);
}
