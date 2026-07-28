// Pure profile creation and validation logic (UC-02, UC-15, UC-28 —
// see docs/USE_CASES.md).

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
 * Seeds the completed-history Credit Entries at profile creation (UC-02 step
 * 4, see docs/DOMAIN.md, Credit Entry): a Credit Entry for every Required
 * Subject (a Subject with no known classification counts as Required, see
 * docs/DOMAIN.md, Subject) whose Suggested Semester is at or before
 * `completedSemesters`. Optional Subjects and Subjects without a Suggested
 * Semester are never seeded.
 * @param {{subjects: Array}} ppc
 * @param {number} completedSemesters
 * @returns {import('./types.js').CreditEntry[]}
 */
export function seedCreditEntries(ppc, completedSemesters) {
  return ppc.subjects
    .filter(
      (subject) =>
        subject.classification !== 'optional' &&
        subject.suggestedSemester != null &&
        subject.suggestedSemester <= completedSemesters,
    )
    .map((subject) => ({ subjectCode: subject.code, audit: false }));
}

/**
 * Builds a new ProfileRecord (UC-02). Assumes `name` has already been
 * validated with `validateProfileName`. The Course Curriculum (PPC) is
 * chosen at creation via the course → PPC cascade, so `ppcId`/`courseId` are
 * never null; `completedSemesters` seeds the completed history as Credit
 * Entries (see `seedCreditEntries`) and offsets where Planned Semesters
 * start (see docs/DOMAIN.md, Planned Semester).
 * @param {{ name: string, ingressYear: number, ingressYearSemester: 1|2,
 *   shift: "day"|"morning"|"afternoon", ppc: {id: string, courseId: string, subjects: Array},
 *   completedSemesters: number }} input
 * @returns {import('./types.js').ProfileRecord}
 */
export function createProfileRecord({
  name,
  ingressYear,
  ingressYearSemester,
  shift,
  ppc,
  completedSemesters,
}) {
  return {
    id: crypto.randomUUID(),
    name: name.trim(),
    ppcId: ppc.id,
    courseId: ppc.courseId,
    ingressYear,
    ingressYearSemester,
    completedSemesters,
    shift,
    shiftFilter: null,
    semesters: [],
    creditEntries: seedCreditEntries(ppc, completedSemesters),
    customSections: [],
    hiddenSubjects: [],
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

/**
 * Marks an Optional Subject as hidden (UC-28), so it stops being offered
 * when planning. Idempotent — hiding an already-hidden Subject is a no-op.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} subjectCode
 * @returns {import('./types.js').ProfileRecord}
 */
export function hideSubjectRecord(profile, subjectCode) {
  if (profile.hiddenSubjects.includes(subjectCode)) return profile;
  return {
    ...profile,
    hiddenSubjects: [...profile.hiddenSubjects, subjectCode],
  };
}

/**
 * Restores a previously hidden Optional Subject (UC-28), so it is offered
 * normally again.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} subjectCode
 * @returns {import('./types.js').ProfileRecord}
 */
export function restoreSubjectRecord(profile, subjectCode) {
  return {
    ...profile,
    hiddenSubjects: profile.hiddenSubjects.filter(
      (code) => code !== subjectCode,
    ),
  };
}

/**
 * Validates a candidate Credit Entry (UC-15) against the Student's profile
 * and Course Curriculum.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {{subjects: Array}} ppc
 * @param {string} subjectCode
 * @returns {'unknown-subject'|'duplicate'|null} the validation error, or null if valid
 */
export function validateCreditEntry(profile, ppc, subjectCode) {
  if (!ppc.subjects.some((subject) => subject.code === subjectCode))
    return 'unknown-subject';
  if (profile.creditEntries.some((entry) => entry.subjectCode === subjectCode))
    return 'duplicate';
  return null;
}

/**
 * Adds a Credit Entry for a Subject (UC-15). Assumes `subjectCode` has
 * already been validated with `validateCreditEntry`.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} subjectCode
 * @returns {import('./types.js').ProfileRecord}
 */
export function addCreditEntryRecord(profile, subjectCode) {
  return {
    ...profile,
    creditEntries: [...profile.creditEntries, { subjectCode, audit: false }],
  };
}

/**
 * Removes a Credit Entry by Subject code (UC-15) — this also removes any
 * Audit Mark it carried, since the mark lives and dies with its carrier
 * (see docs/DOMAIN.md, Audit Mark).
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} subjectCode
 * @returns {import('./types.js').ProfileRecord}
 */
export function removeCreditEntryRecord(profile, subjectCode) {
  return {
    ...profile,
    creditEntries: profile.creditEntries.filter(
      (entry) => entry.subjectCode !== subjectCode,
    ),
  };
}

/**
 * Toggles the Audit Mark on a Credit Entry (UC-20/21) — the credit-carrier
 * half of the Audit Mark feature (see docs/DOMAIN.md, Audit Mark); the
 * Section-carrier half is `toggleSectionMark` in domain/semester.js.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {string} subjectCode
 * @returns {import('./types.js').ProfileRecord}
 */
export function toggleCreditEntryAudit(profile, subjectCode) {
  return {
    ...profile,
    creditEntries: profile.creditEntries.map((entry) =>
      entry.subjectCode === subjectCode
        ? { ...entry, audit: !entry.audit }
        : entry,
    ),
  };
}
