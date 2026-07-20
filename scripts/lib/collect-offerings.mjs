// Stage 2 of the offerings pipeline (see docs/ARCHITECTURE.md, "Data
// Pipeline"): builds one course snapshot per Year Semester from the Stage 1
// department JSONs, filtered down to the course's PPC.

import { computeShift } from './parse-offerings.mjs';

/**
 * Builds the set of Subject codes relevant to a PPC: its own Subject codes
 * (required + optional) plus every code listed in an `equivalents` entry —
 * Sections offered under an equivalent code belong in the snapshot too and
 * fulfill the target Subject at evaluation time (see DOMAIN.md, Equivalence).
 */
function buildRelevantCodeSet(ppc) {
  const codes = new Set();
  for (const subject of [...ppc.required, ...ppc.optional]) {
    codes.add(subject.code);
    for (const equivalent of subject.equivalents) codes.add(equivalent);
  }
  return codes;
}

/**
 * Strips a cohort/entry-semester marker from a course code (e.g. "12 B" →
 * "12", see docs/DOMAIN.md, Section) — the id must identify the course only,
 * never a cohort. Codes with no such marker are returned unchanged.
 */
export function normalizeCourseId(rawCode) {
  const trimmed = rawCode.trim();
  const match = trimmed.match(/^(\d+)\s+[A-Z]+$/);
  return match ? match[1] : trimmed;
}

/**
 * Strips the Enrollment Scope and seat-count fields, which are not part of
 * the Offerings dataset (see docs/ARCHITECTURE.md, "Offerings dataset") —
 * this tool does not model enrollment eligibility. Keeps the Section's
 * target course as `targetCourseId`/`targetCourseName` (id normalized, see
 * `normalizeCourseId`). Also validates that the stored `shift` matches what
 * the Sections' own sessions recompute to, per the "Validation" step in
 * docs/ARCHITECTURE.md's Data Pipeline section.
 */
function toSnapshotSection(section, subjectCode) {
  const recomputedShift = computeShift(section.sessions);
  if (recomputedShift !== section.shift) {
    throw new Error(
      `Shift mismatch for ${subjectCode} turma ${section.turma}: stored "${section.shift}", recomputed "${recomputedShift}".`,
    );
  }
  return {
    turma: section.turma,
    professor: section.professor,
    sessions: section.sessions,
    shift: section.shift,
    targetCourseId: normalizeCourseId(section.targetCourseCode),
    targetCourseName: section.targetCourseName,
  };
}

/**
 * Builds one course snapshot for a single Year Semester from the Stage 1
 * department JSONs available for that Year Semester's source semester (see
 * docs/ARCHITECTURE.md, "Offerings dataset" and "Data Pipeline").
 *
 * Returns the snapshot plus, separately, the PPC Subject codes that were not
 * found in any department offering for this source semester — informational
 * (a Subject simply not offered that term), never written to the snapshot
 * itself.
 */
export function collectCourseSnapshot({
  ppc,
  yearSemester,
  sourceSemester,
  departmentOfferings,
}) {
  const relevantCodes = buildRelevantCodeSet(ppc);
  const foundCodes = new Set();
  const subjects = [];

  for (const offering of departmentOfferings) {
    for (const subject of offering.subjects) {
      if (!relevantCodes.has(subject.code)) continue;
      foundCodes.add(subject.code);
      subjects.push({
        code: subject.code,
        name: subject.name,
        workloadHours: subject.workloadHours,
        sections: subject.sections.map((s) =>
          toSnapshotSection(s, subject.code),
        ),
      });
    }
  }

  subjects.sort((a, b) => a.code.localeCompare(b.code));
  const missingCodes = [...relevantCodes]
    .filter((c) => !foundCodes.has(c))
    .sort();

  const snapshot = { ppcId: ppc.ppcId, yearSemester, sourceSemester, subjects };
  return { snapshot, missingCodes };
}
