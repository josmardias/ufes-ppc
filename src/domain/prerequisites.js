/**
 * Pure domain functions for prerequisite and co-requisite evaluation.
 *
 * Data shapes expected by these functions:
 *   Course:         { code: string, prereq: string[], coreq: string[] }
 *   Equivalences:   { [targetCode: string]: string[] }
 *   Semester:       { classes: Array<{ code: string }> }
 *   CreditEntry:    { subjectCode: string, grantPosition: number }
 */

// ---------------------------------------------------------------------------
// getEquivalentCodes
// ---------------------------------------------------------------------------

/**
 * Returns the full set of codes that can satisfy a given target code.
 * This includes the target code itself plus all codes listed in
 * equivalences[targetCode] (if any).
 *
 * @param {string} targetCode - The subject code to look up.
 * @param {Object.<string, string[]>} equivalences - The equivalences map.
 * @returns {Set<string>} All codes that satisfy the target.
 */
export function getEquivalentCodes(targetCode, equivalences) {
  const result = new Set([targetCode]);
  const equiv = equivalences[targetCode];
  if (Array.isArray(equiv)) {
    for (const code of equiv) {
      result.add(code);
    }
  }
  return result;
}

// ---------------------------------------------------------------------------
// isSatisfied
// ---------------------------------------------------------------------------

/**
 * Returns true if passedCodes contains the target code or any of its
 * equivalents as defined in the equivalences map.
 *
 * @param {string} targetCode - The subject code that must be satisfied.
 * @param {Set<string>} passedCodes - The set of codes the student has passed.
 * @param {Object.<string, string[]>} equivalences - The equivalences map.
 * @returns {boolean}
 */
export function isSatisfied(targetCode, passedCodes, equivalences) {
  const candidates = getEquivalentCodes(targetCode, equivalences);
  for (const code of candidates) {
    if (passedCodes.has(code)) {
      return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// buildFulfilledSet
// ---------------------------------------------------------------------------

/**
 * Builds the set of subject codes that are fulfilled up to (but not including)
 * the semester at upToIndex, optionally including the current semester's
 * classes for co-requisite checking.
 *
 * Inclusion rules:
 *   - Semesters with index < upToIndex always contribute their classes.
 *   - The semester at upToIndex contributes its classes only when
 *     includeCurrentForCoreq is true.
 *   - Credits with grantPosition = 0 are always included.
 *   - Credits with grantPosition = k (k >= 1) are included when:
 *       • prereq mode (includeCurrentForCoreq = false): upToIndex > k - 1
 *         i.e. upToIndex >= k  (the credit was granted at the end of semester k)
 *       • coreq mode  (includeCurrentForCoreq = true):  upToIndex >= k - 1
 *         i.e. upToIndex >= k - 1
 *
 * @param {Array<{classes: Array<{code: string}>}>} semesters - Ordered list of semesters.
 * @param {Array<{subjectCode: string, grantPosition: number}>} creditEntries - Credit entries.
 * @param {number} upToIndex - 0-based index of the semester being evaluated.
 * @param {boolean} includeCurrentForCoreq - When true, include classes from the
 *   current semester (at upToIndex) to support co-requisite checking.
 * @returns {Set<string>} Fulfilled subject codes.
 */
export function buildFulfilledSet(semesters, creditEntries, upToIndex, includeCurrentForCoreq) {
  const fulfilled = new Set();

  // Add classes from semesters strictly before upToIndex.
  for (let i = 0; i < upToIndex && i < semesters.length; i++) {
    for (const cls of semesters[i].classes) {
      // Support both subjectCode (current) and legacy shape (code/codigo)
      const code = cls.subjectCode ?? cls.code ?? cls.codigo;
      if (code) fulfilled.add(code);
    }
  }

  // Optionally add classes from the current semester (co-requisite mode).
  if (includeCurrentForCoreq && upToIndex < semesters.length) {
    for (const cls of semesters[upToIndex].classes) {
      const code = cls.subjectCode ?? cls.code ?? cls.codigo;
      if (code) fulfilled.add(code);
    }
  }

  // Add credit entries according to their grantPosition.
  for (const entry of creditEntries) {
    const k = entry.grantPosition;

    if (k === 0) {
      // Granted before any semester — always fulfilled.
      fulfilled.add(entry.subjectCode);
    } else {
      // k is 1-based: credit becomes available after semester k ends.
      // prereq mode: upToIndex >= k  (i.e. upToIndex > k - 1)
      // coreq mode:  upToIndex >= k - 1
      const threshold = includeCurrentForCoreq ? k - 1 : k;
      if (upToIndex >= threshold) {
        fulfilled.add(entry.subjectCode);
      }
    }
  }

  return fulfilled;
}

// ---------------------------------------------------------------------------
// isEligible
// ---------------------------------------------------------------------------

/**
 * Returns true if all prerequisites and co-requisites of a course are
 * satisfied given the fulfilledCodes set.
 *
 * A course with no prerequisites and no co-requisites is always eligible.
 *
 * @param {{ code: string, prereq: string[], coreq: string[] }} course
 * @param {Set<string>} fulfilledCodes - Codes considered fulfilled for this check.
 * @param {Object.<string, string[]>} equivalences - The equivalences map.
 * @returns {boolean}
 */
export function isEligible(course, fulfilledCodes, equivalences) {
  for (const req of course.prereq) {
    if (!isSatisfied(req, fulfilledCodes, equivalences)) {
      return false;
    }
  }
  for (const req of course.coreq) {
    if (!isSatisfied(req, fulfilledCodes, equivalences)) {
      return false;
    }
  }
  return true;
}

// ---------------------------------------------------------------------------
// getEligibleCourses
// ---------------------------------------------------------------------------

/**
 * Returns the subset of allCourses that a student is eligible to enroll in
 * for the semester at semesterIndex.
 *
 * A course is eligible when:
 *   • All its prerequisites are fulfilled by semesters strictly before
 *     semesterIndex (or by applicable credit entries).
 *   • All its co-requisites are fulfilled by semesters up to and including
 *     semesterIndex (or by applicable credit entries).
 *   • Its code does not already appear in any semester's classes (i.e. it has
 *     not yet been planned).
 *
 * @param {Array<{code: string, prereq: string[], coreq: string[]}>} allCourses
 * @param {Array<{classes: Array<{code: string}>}>} semesters
 * @param {Array<{subjectCode: string, grantPosition: number}>} creditEntries
 * @param {number} semesterIndex - 0-based index of the target semester.
 * @param {Object.<string, string[]>} equivalences - The equivalences map.
 * @returns {Array<{code: string, prereq: string[], coreq: string[]}>}
 */
export function getEligibleCourses(allCourses, semesters, creditEntries, semesterIndex, equivalences) {
  // Build the set of already-planned course codes across all semesters.
  const alreadyPlanned = new Set();
  for (const semester of semesters) {
    for (const cls of semester.classes) {
      // Support both subjectCode (current) and legacy shape (code/codigo)
      const code = cls.subjectCode ?? cls.code ?? cls.codigo;
      if (code) alreadyPlanned.add(code);
    }
  }

  // Fulfilled set for prerequisite checking (excludes current semester).
  const fulfilledForPrereqs = buildFulfilledSet(semesters, creditEntries, semesterIndex, false);

  // Fulfilled set for co-requisite checking (includes current semester).
  const fulfilledForCoreqs = buildFulfilledSet(semesters, creditEntries, semesterIndex, true);

  return allCourses.filter((course) => {
    // Exclude courses already planned in any semester.
    if (alreadyPlanned.has(course.code)) {
      return false;
    }

    // Check prerequisites against the pre-current-semester set.
    for (const req of course.prereq) {
      if (!isSatisfied(req, fulfilledForPrereqs, equivalences)) {
        return false;
      }
    }

    // Check co-requisites against the set that includes the current semester.
    for (const req of course.coreq) {
      if (!isSatisfied(req, fulfilledForCoreqs, equivalences)) {
        return false;
      }
    }

    return true;
  });
}