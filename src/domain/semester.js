// Planned Semester position/label derivation and pure mutation helpers (see
// docs/DOMAIN.md, Planned Semester; docs/USE_CASES.md, UC-11 through UC-14,
// UC-20 through UC-23). All functions here return new profile objects —
// they never mutate their input.

/**
 * Derives the calendar year and Year Semester (1|2) of the Planned Semester
 * at `index` (0-based, relative to the plan's own start), from the
 * Student's ingress information. Planned Semesters alternate Year Semesters
 * starting at the ingress one, offset by `completedSemesters` (see
 * docs/DOMAIN.md, Planned Semester): the first Planned Semester takes the
 * position right after the completed-semester count recorded at profile
 * creation (UC-02), so `index` 0 actually lands at absolute position
 * `completedSemesters`.
 * @param {number} ingressYear
 * @param {1|2} ingressYearSemester
 * @param {number} index
 * @param {number} [completedSemesters]
 */
export function semesterPosition(
  ingressYear,
  ingressYearSemester,
  index,
  completedSemesters = 0,
) {
  const absolute = index + completedSemesters + (ingressYearSemester - 1);
  return {
    year: ingressYear + Math.floor(absolute / 2),
    yearSemester: (absolute % 2) + 1,
  };
}

/**
 * The number of semesters fully elapsed between the Student's ingress
 * information and `today` (see docs/USE_CASES.md, UC-02): the derived
 * default and cap for the "last completed semester" input at profile
 * creation and editing (UC-24). Never negative — a Student cannot have
 * completed semesters before their own ingress.
 * @param {number} ingressYear
 * @param {1|2} ingressYearSemester
 * @param {Date} [today]
 */
export function elapsedSemesters(ingressYear, ingressYearSemester, today = new Date()) {
  const nowYearSemester = today.getMonth() < 6 ? 1 : 2;
  const absolute = (today.getFullYear() - ingressYear) * 2 + (nowYearSemester - 1);
  const offset = absolute - (ingressYearSemester - 1);
  return Math.max(0, offset);
}

/** Formats a semester position as "2024/1". */
export function formatYearSemesterLabel({ year, yearSemester }) {
  return `${year}/${yearSemester}`;
}

/**
 * The index of the Planned Semester matching the real-world current date, or
 * `null` if the plan hasn't reached it (or is already past it). Assumes the
 * common academic convention: Year Semester 1 runs January–June, 2 runs
 * July–December.
 * @param {import('./types.js').ProfileRecord} profile
 * @param {Date} [today]
 */
export function currentSemesterIndex(profile, today = new Date()) {
  const nowYearSemester = today.getMonth() < 6 ? 1 : 2;
  const absolute =
    (today.getFullYear() - profile.ingressYear) * 2 + (nowYearSemester - 1);
  const offset = absolute - (profile.ingressYearSemester - 1);
  const index = offset - (profile.completedSemesters ?? 0);
  return index >= 0 && index < profile.semesters.length ? index : null;
}

/**
 * Builds a persisted PlannedSection from a candidate section template (see
 * domain/eligibility.js) — keeps only the fields that belong in the
 * persisted shape (see docs/ARCHITECTURE.md, Persistence): an `offering`
 * Section is a reference (subject code + turma), while a `custom` Section
 * embeds an independent copy.
 */
export function createPlannedSection(candidateSection) {
  const { kind, subjectCode, turma, custom } = candidateSection;
  const base = {
    id: crypto.randomUUID(),
    kind,
    subjectCode,
    failed: false,
    audit: false,
  };
  return kind === 'custom' ? { ...base, custom } : { ...base, turma };
}

/** Appends a new Planned Semester containing exactly `sections` (UC-11). */
export function addPlannedSemester(profile, sections) {
  return { ...profile, semesters: [...profile.semesters, { sections }] };
}

/**
 * Removes the last Planned Semester and all its contents (UC-14). Clears the
 * persisted Shift filter toggle when no Planned Semesters remain.
 */
export function deleteLastPlannedSemester(profile) {
  const semesters = profile.semesters.slice(0, -1);
  return {
    ...profile,
    semesters,
    shiftFilter: semesters.length === 0 ? null : profile.shiftFilter,
  };
}

/** Adds a Section to a Planned Semester (UC-12). */
export function addSectionToSemester(profile, semesterIndex, section) {
  return {
    ...profile,
    semesters: profile.semesters.map((semester, index) =>
      index === semesterIndex
        ? { sections: [...semester.sections, section] }
        : semester,
    ),
  };
}

/** Removes a Section from a Planned Semester by id (UC-13). */
export function removeSectionFromSemester(profile, semesterIndex, sectionId) {
  return {
    ...profile,
    semesters: profile.semesters.map((semester, index) =>
      index === semesterIndex
        ? {
            sections: semester.sections.filter(
              (section) => section.id !== sectionId,
            ),
          }
        : semester,
    ),
  };
}

/**
 * Toggles a Failed Mark or Audit Mark on a Planned Section (UC-20/21, UC-22/23).
 * @param {import('./types.js').ProfileRecord} profile
 * @param {number} semesterIndex
 * @param {string} sectionId
 * @param {"failed"|"audit"} mark
 */
export function toggleSectionMark(profile, semesterIndex, sectionId, mark) {
  return {
    ...profile,
    semesters: profile.semesters.map((semester, index) =>
      index === semesterIndex
        ? {
            sections: semester.sections.map((section) =>
              section.id === sectionId
                ? { ...section, [mark]: !section[mark] }
                : section,
            ),
          }
        : semester,
    ),
  };
}
