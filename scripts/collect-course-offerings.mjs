#!/usr/bin/env node
// Stage 2 of the offerings pipeline (see docs/ARCHITECTURE.md, "Data
// Pipeline"): builds each course's per-Year-Semester snapshots from the
// Stage 1 department JSONs in scripts/output/ (produced by
// extract-offerings.mjs), filtered down to that course's PPC (produced by
// extract-subjects-*.mjs).
//
// Usage: node scripts/collect-course-offerings.mjs

import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { collectCourseSnapshot } from './lib/collect-offerings.mjs';
import { COURSES as courses } from './lib/courses-config.mjs';

const scriptsDir = dirname(fileURLToPath(import.meta.url));
const outputDir = join(scriptsDir, 'output');

function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

function loadDepartmentOfferings(year, semester) {
  const suffix = `-${year}-${semester}.offerings.json`;
  const files = readdirSync(outputDir).filter((f) => f.endsWith(suffix));
  return files.map((f) => readJson(join(outputDir, f)));
}

for (const course of courses) {
  const ppc = readJson(join(outputDir, `${course.ppcId}.subjects.json`));

  for (const [yearSemester, sourceSemester] of Object.entries(course.yearSemesters)) {
    const departmentOfferings = loadDepartmentOfferings(sourceSemester.year, sourceSemester.semester);
    if (departmentOfferings.length === 0) {
      throw new Error(
        `No department offering JSONs found for ${sourceSemester.year}/${sourceSemester.semester} ` +
          `(Year Semester ${yearSemester} of ${course.ppcId}). Run extract-offerings.mjs first.`,
      );
    }

    const { snapshot, missingCodes } = collectCourseSnapshot({
      ppc,
      yearSemester: Number(yearSemester),
      sourceSemester,
      departmentOfferings,
    });

    const sectionCount = snapshot.subjects.reduce((n, s) => n + s.sections.length, 0);
    console.log(
      `${course.ppcId} YS${yearSemester} (from ${sourceSemester.year}/${sourceSemester.semester}): ` +
        `${snapshot.subjects.length} subjects, ${sectionCount} sections`,
    );
    if (missingCodes.length > 0) {
      console.log(`  not offered this source semester: ${missingCodes.join(', ')}`);
    }

    const outPath = join(outputDir, `${course.ppcId}.ys${yearSemester}.offerings.json`);
    writeFileSync(outPath, JSON.stringify(snapshot, null, 2) + '\n', 'utf8');
    console.log(`  wrote ${outPath}`);
  }
}
