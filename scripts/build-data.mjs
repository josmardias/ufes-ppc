#!/usr/bin/env node
// Runs the full data pipeline in order (see docs/ARCHITECTURE.md, "Data
// Pipeline"): parsers, collector/assemble, validation, copy. Each stage is
// its own standalone script; this just runs them in sequence and stops at
// the first one that fails.
//
// Usage: node scripts/build-data.mjs

import { execFileSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const scriptsDir = dirname(fileURLToPath(import.meta.url));

const stages = [
  'extract-subjects-eletrica.mjs',
  'extract-equivalencias-eletrica.mjs',
  'merge-equivalencias-eletrica.mjs',
  'merge-requisitos-optativas-eletrica.mjs',
  'assemble-ppc.mjs',
  'extract-offerings.mjs',
  'collect-course-offerings.mjs',
  'validate-data.mjs',
  'copy-to-data.mjs',
];

for (const stage of stages) {
  execFileSync(process.execPath, [join(scriptsDir, stage)], {
    stdio: 'inherit',
  });
}
