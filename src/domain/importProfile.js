// Validation for imported Student profiles (UC-06 — see docs/USE_CASES.md).

import { getPpc } from '../data/index.js';

const SHIFTS = ['day', 'morning', 'afternoon'];

/**
 * Validates the shape of an imported profile and checks that its Course
 * Curriculum (PPC), if any, resolves in the current datasets — a profile is
 * never imported in a degraded state.
 * @param {unknown} profile
 * @returns {'invalid'|'unknown-ppc'|null} the validation error, or null if valid
 */
export function validateImportedProfile(profile) {
  if (typeof profile !== 'object' || profile === null) return 'invalid';
  if (typeof profile.name !== 'string' || !profile.name.trim())
    return 'invalid';
  if (typeof profile.ppcId !== 'string' || !profile.ppcId) return 'invalid';
  if (typeof profile.courseId !== 'string' || !profile.courseId)
    return 'invalid';
  if (!Number.isInteger(profile.ingressYear)) return 'invalid';
  if (profile.ingressYearSemester !== 1 && profile.ingressYearSemester !== 2)
    return 'invalid';
  if (
    !Number.isInteger(profile.completedSemesters) ||
    profile.completedSemesters < 0
  )
    return 'invalid';
  if (!SHIFTS.includes(profile.shift)) return 'invalid';
  if (profile.shiftFilter !== null && !SHIFTS.includes(profile.shiftFilter))
    return 'invalid';
  if (!Array.isArray(profile.semesters)) return 'invalid';
  if (!Array.isArray(profile.creditEntries)) return 'invalid';
  if (!Array.isArray(profile.customSections)) return 'invalid';
  if (!Array.isArray(profile.hiddenSubjects)) return 'invalid';

  if (!getPpc(profile.ppcId)) return 'unknown-ppc';

  return null;
}
