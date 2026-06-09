// Deploy-time validation rules for the assembled PPC and Offerings datasets
// (see docs/ARCHITECTURE.md, "Data Pipeline" — Validation): schema checks
// plus referential integrity. Pure functions — no I/O — so they're callable
// both from scripts/validate-data.mjs and from tests.

import { computeShift } from './parse-offerings.mjs';

const CODE_RE = /^[A-Z]{2,5}\d{4,6}$/;
const CLASSIFICATIONS = new Set(['required', 'optional']);
const DAYS = new Set(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Sab', 'Dom']);
const TIME_RE = /^\d{2}:\d{2}$/;

/**
 * Validates a single assembled PPC dataset (see docs/ARCHITECTURE.md, "PPC
 * dataset"): field shapes plus referential integrity of prerequisites/
 * corequisites against the PPC's own subject codes. Returns a list of
 * human-readable error strings (empty if valid).
 */
export function validatePpc(ppc) {
  const errors = [];
  if (typeof ppc.id !== 'string' || !ppc.id) errors.push('missing/invalid id');
  if (typeof ppc.name !== 'string' || !ppc.name) errors.push('missing/invalid name');
  if (!Array.isArray(ppc.subjects) || ppc.subjects.length === 0) {
    errors.push('missing/empty subjects array');
    return errors;
  }

  const codes = new Set(ppc.subjects.map((s) => s.code));
  const seen = new Set();
  for (const s of ppc.subjects) {
    const label = s.code ?? '<no code>';
    if (!CODE_RE.test(s.code)) errors.push(`${label}: invalid code format`);
    if (seen.has(s.code)) errors.push(`${label}: duplicate subject code`);
    seen.add(s.code);

    if (typeof s.name !== 'string' || !s.name) errors.push(`${label}: missing name`);
    if (typeof s.workloadHours !== 'number') errors.push(`${label}: missing/invalid workloadHours`);
    if (!CLASSIFICATIONS.has(s.classification)) errors.push(`${label}: invalid classification`);
    if (s.suggestedSemester !== null && typeof s.suggestedSemester !== 'number') {
      errors.push(`${label}: invalid suggestedSemester`);
    }
    if (s.minWorkloadHours !== null && typeof s.minWorkloadHours !== 'number') {
      errors.push(`${label}: invalid minWorkloadHours`);
    }
    if (!Array.isArray(s.prerequisites)) errors.push(`${label}: prerequisites must be an array`);
    if (!Array.isArray(s.corequisites)) errors.push(`${label}: corequisites must be an array`);
    if (!Array.isArray(s.equivalents)) errors.push(`${label}: equivalents must be an array`);

    for (const req of s.prerequisites ?? []) {
      if (!codes.has(req)) errors.push(`${label}: prerequisite ${req} does not resolve to a subject in this PPC`);
    }
    for (const req of s.corequisites ?? []) {
      if (!codes.has(req)) errors.push(`${label}: corequisite ${req} does not resolve to a subject in this PPC`);
    }
  }
  return errors;
}

/**
 * Validates a single course Offerings snapshot (see docs/ARCHITECTURE.md,
 * "Offerings dataset"): field shapes, session time/day validity, shift
 * recomputation, and referential integrity of subject codes against the
 * matching PPC's own subject codes plus equivalents (`relevantCodes`, or
 * `null` if the matching PPC wasn't found — that mismatch is reported by the
 * caller instead). Returns a list of human-readable error strings.
 */
export function validateOfferings(snapshot, relevantCodes) {
  const errors = [];
  if (typeof snapshot.ppcId !== 'string' || !snapshot.ppcId) errors.push('missing/invalid ppcId');
  if (snapshot.yearSemester !== 1 && snapshot.yearSemester !== 2) errors.push('yearSemester must be 1 or 2');
  if (!Array.isArray(snapshot.subjects)) {
    errors.push('missing subjects array');
    return errors;
  }

  for (const s of snapshot.subjects) {
    const label = s.code ?? '<no code>';
    if (!CODE_RE.test(s.code)) errors.push(`${label}: invalid code format`);
    if (relevantCodes && !relevantCodes.has(s.code)) {
      errors.push(`${label}: subject code does not resolve to the PPC (own subjects or equivalents)`);
    }
    if (!Array.isArray(s.sections)) {
      errors.push(`${label}: sections must be an array`);
      continue;
    }
    for (const section of s.sections) {
      const secLabel = `${label} turma ${section.turma ?? '?'}`;
      if (!Array.isArray(section.sessions)) {
        errors.push(`${secLabel}: sessions must be an array`);
        continue;
      }
      for (const session of section.sessions) {
        if (!DAYS.has(session.day)) errors.push(`${secLabel}: invalid session day "${session.day}"`);
        if (!TIME_RE.test(session.startTime) || !TIME_RE.test(session.endTime)) {
          errors.push(`${secLabel}: invalid session time format`);
        } else if (session.startTime >= session.endTime) {
          errors.push(`${secLabel}: session startTime not before endTime`);
        }
      }
      const recomputedShift = computeShift(section.sessions);
      if (recomputedShift !== section.shift) {
        errors.push(`${secLabel}: shift mismatch (stored "${section.shift}", recomputed "${recomputedShift}")`);
      }
    }
  }
  return errors;
}
