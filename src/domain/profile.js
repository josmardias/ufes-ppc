// Pure profile creation and validation logic (UC-02 — see docs/USE_CASES.md).

/**
 * Validates a candidate profile name against existing profiles.
 * Shared by profile creation (UC-02), cloning (UC-04), and renaming (UC-08).
 * @param {string} name
 * @param {import('./types.js').ProfileRecord[]} existingProfiles
 * @param {string} [excludeId] - a profile id to exclude from the duplicate
 *   check, so renaming a profile to its own current name is not a conflict
 * @returns {'empty'|'duplicate'|null} the validation error, or null if valid
 */
export function validateProfileName(name, existingProfiles, excludeId) {
  const trimmed = name.trim();
  if (!trimmed) return 'empty';
  const others =
    excludeId == null
      ? existingProfiles
      : existingProfiles.filter((profile) => profile.id !== excludeId);
  if (others.some((profile) => profile.name === trimmed)) return 'duplicate';
  return null;
}

/**
 * Builds a new ProfileRecord (UC-02). Assumes `name` has already been
 * validated with `validateProfileName`.
 * @param {{ name: string, ingressYear: number, ingressYearSemester: 1|2, shift: "day"|"morning"|"afternoon" }} input
 * @returns {import('./types.js').ProfileRecord}
 */
export function createProfileRecord({
  name,
  ingressYear,
  ingressYearSemester,
  shift,
}) {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    ppcId: null,
    courseId: null,
    ingressYear,
    ingressYearSemester,
    shift,
    shiftFilter: null,
    semesters: [],
    creditEntries: [],
    customSections: [],
  };
}

/**
 * Builds a copy of an existing profile under a new name (UC-04), including
 * all its planning data. Assumes `newName` has already been validated.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} newName
 * @returns {import('./types.js').ProfileRecord}
 */
export function cloneProfileRecord(profile, newName) {
  return {
    ...structuredClone(profile),
    id: crypto.randomUUID(),
    name: newName.trim(),
  };
}

/**
 * Renames an existing profile (UC-08). Assumes `newName` has already been
 * validated.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} newName
 * @returns {import('./types.js').ProfileRecord}
 */
export function renameProfileRecord(profile, newName) {
  return { ...profile, name: newName.trim() };
}
