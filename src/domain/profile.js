/**
 * Creates a new Student profile.
 *
 * @param {object} params
 * @param {string} params.name - The student's name. Must not be empty.
 * @param {string} [params.course] - The course the student is enrolled in (optional).
 * @param {1|2} [params.ingressYearSemester] - Whether the student ingressed in the 1st or 2nd semester of the year (optional).
 * @param {number} [params.ingressYear] - The year the student ingressed (optional).
 * @returns {{ name: string, course: string|null, ingressYearSemester: 1|2|null, ingressYear: number|null, semesters: [] }}
 */
export function createProfile({ name, course = null, ingressYearSemester = null, ingressYear = null }) {
  if (!name || name.trim() === "") {
    throw new Error("Student name must not be empty.");
  }

  return {
    name: name.trim(),
    course: course ?? null,
    ingressYearSemester: ingressYearSemester ?? null,
    ingressYear: ingressYear ?? null,
    semesters: [],
    creditEntries: [],
  };
}

/**
 * Clones an existing Student profile under a new name.
 * All planning data (semesters, course, ingress info) is deeply copied.
 *
 * @param {object} profile - The existing profile to clone.
 * @param {string} newName - The name for the cloned profile. Must not be empty and must differ from the original.
 * @returns {object} A new profile object with the same data and the new name.
 */
export function cloneProfile(profile, newName) {
  if (!newName || newName.trim() === "") {
    throw new Error("Profile name must not be empty.");
  }

  if (newName.trim() === profile.name) {
    throw new Error("Cloned profile name must differ from the original.");
  }

  return {
    ...structuredClone(profile),
    name: newName.trim(),
  };
}

/**
 * Returns the list of semesters in a Student profile, in chronological order.
 *
 * @param {object} profile - The Student profile.
 * @returns {object[]} The list of semesters.
 */
export function listSemesters(profile) {
  return profile.semesters;
}

/**
 * Returns the next semester number (position) for a Student profile.
 * The first semester is 1, the second is 2, and so on.
 * Returns null if the profile has no ingress information yet.
 *
 * @param {object} profile - The Student profile.
 * @returns {number} The next semester number.
 */
export function getNextSemesterNumber(profile) {
  return profile.semesters.length + 1;
}

/**
 * Returns a specific semester from a Student profile by its Year Semester label.
 *
 * @param {object} profile - The Student profile.
 * @param {string} label - The Year Semester label to look up (e.g. "2024/1").
 * @returns {object|undefined} The semester object, or undefined if not found.
 */
export function getSemester(profile, label) {
  return profile.semesters.find((s) => s.label === label);
}

/**
 * Validates a parsed profile object from an imported file.
 * Throws if the profile does not meet the minimum required shape.
 *
 * @param {unknown} data - The parsed JSON data from the imported file.
 * @returns {object} The validated profile object.
 */
export function validateImportedProfile(data) {
  if (!data || typeof data !== "object") {
    throw new Error("Invalid profile: must be an object.");
  }

  if (!data.name || typeof data.name !== "string" || data.name.trim() === "") {
    throw new Error("Invalid profile: name must be a non-empty string.");
  }

  if (!Array.isArray(data.semesters)) {
    throw new Error("Invalid profile: semesters must be an array.");
  }

  return data;
}

/**
 * Serializes a Student profile to a JSON string for export.
 *
 * @param {object} profile - The Student profile to serialize.
 * @returns {string} A JSON string representation of the profile.
 */
export function serializeProfile(profile) {
  return JSON.stringify(profile, null, 2);
}

/**
 * Returns the list of Credit Entries on a Student profile.
 *
 * @param {object} profile - The Student profile.
 * @returns {object[]} The list of Credit Entries.
 */
export function getCreditEntries(profile) {
  return profile.creditEntries;
}

/**
 * Adds a Credit Entry to a Student profile.
 *
 * A Credit Entry records a Subject from the Student's Course Curriculum that
 * has been formally credited to them. The grant position indicates when the
 * credit became available: 0 means before the course began, and a positive
 * integer refers to the plan index of the Planned Semester during which the
 * credit was granted.
 *
 * @param {object} profile - The Student profile to modify.
 * @param {string} subjectCode - The code of the credited Subject. Must exist in the curriculum.
 * @param {number} grantPosition - Plan index at which the credit was granted (0 = before course start).
 * @returns {object} A new profile object with the Credit Entry added.
 */
export function addCreditEntry(profile, subjectCode, grantPosition) {
  if (!subjectCode || typeof subjectCode !== "string" || subjectCode.trim() === "") {
    throw new Error("Subject code must not be empty.");
  }

  if (typeof grantPosition !== "number" || !Number.isInteger(grantPosition) || grantPosition < 0) {
    throw new Error("Grant position must be a non-negative integer.");
  }

  const existing = getCreditEntries(profile);

  if (existing.some((e) => e.subjectCode === subjectCode.trim())) {
    throw new Error(`A Credit Entry for subject "${subjectCode}" already exists.`);
  }

  return {
    ...profile,
    creditEntries: [...existing, { subjectCode: subjectCode.trim(), grantPosition }],
  };
}

/**
 * Removes a Credit Entry from a Student profile by subject code.
 *
 * @param {object} profile - The Student profile to modify.
 * @param {string} subjectCode - The code of the Subject whose Credit Entry should be removed.
 * @returns {object} A new profile object with the Credit Entry removed.
 */
export function removeCreditEntry(profile, subjectCode) {
  const existing = getCreditEntries(profile);

  if (!existing.some((e) => e.subjectCode === subjectCode)) {
    throw new Error(`No Credit Entry found for subject "${subjectCode}".`);
  }

  return {
    ...profile,
    creditEntries: existing.filter((e) => e.subjectCode !== subjectCode),
  };
}