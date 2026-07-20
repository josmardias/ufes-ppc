// Candidate Section lists for planning a Planned Semester (see
// docs/USE_CASES.md, UC-11 "Add a New Planned Semester" and UC-12 "Add a
// Section to a Planned Semester"). Pure, framework-agnostic — the caller
// supplies the fulfillment state to plan against (see domain/evaluation.js).

import { resolveSubjectByCode } from './subjects.js';
import { sectionMatchesShiftFilter } from './schedule.js';

/**
 * @typedef {Object} CandidateSubject
 * @property {string|null} subjectCode - canonical PPC Subject code, or null for an unlinked Custom Section
 * @property {string} subjectName
 * @property {boolean} stale - true for a Custom Section whose link no longer resolves in the PPC
 * @property {Array<{kind: "offering"|"custom", subjectCode: string|null, turma?: string,
 *   shift?: string, targetCourseId?: string, targetCourseName?: string, sessions: import('./types.js').Session[],
 *   custom?: object}>} sections
 */

/**
 * Builds the candidate Subjects (grouped, each with its available Sections)
 * for planning a Planned Semester at `yearSemester`, given the fulfillment
 * state before that semester. Excludes Subjects already fulfilled unless
 * their fulfillment carries an open Audit Mark (see docs/DOMAIN.md, Audit
 * Mark), and Subjects whose prerequisites aren't satisfied. Co-requisites
 * are checked only when `checkCorequisites` is true — UC-11's review screen
 * does not check them, UC-12's add-Section list does.
 *
 * @param {{
 *   ppc: {id: string, subjects: Array},
 *   offerings: {subjects: Array}|undefined,
 *   yearSemester: 1|2,
 *   fulfillmentBefore: Map<string, {audit: boolean}>,
 *   sameSemesterCodes: Set<string>,
 *   customSections: import('./types.js').CustomSection[],
 *   shiftFilter: "morning"|"afternoon"|"day",
 *   checkCorequisites: boolean,
 *   courseFilter?: "own"|"all" - Section target-course toggle (see docs/DOMAIN.md, Section); defaults to "own"
 *   profileCourseId?: string|null - the Student's course id, matched against a Section's `targetCourseId`
 *   semesterFilter?: "suggested"|"advance" - Suggested Semester toggle (see docs/DOMAIN.md, Suggested Semester);
 *     "suggested" (default) excludes Subjects suggested for a later semester than `semesterNumber`
 *   semesterNumber?: number|null - the 1-based ordinal of the semester being planned, matched against a Subject's `suggestedSemester`
 *   classificationFilter?: "required"|"all" - Subject classification toggle (see docs/DOMAIN.md, Subject);
 *     "required" (default) restricts to Required Subjects; "all" also includes Optional ones
 * }} params
 * @returns {CandidateSubject[]}
 */
/** A stable identity key for a candidate section template, used to track selection across filter changes. */
export function candidateSectionKey(section) {
  return section.kind === 'custom'
    ? `custom:${section.sourceCustomId}`
    : `offering:${section.subjectCode}:${section.turma}`;
}

/**
 * Whether an offering Section matches the effective course filter (see
 * docs/DOMAIN.md, Section): "own" restricts to Sections whose target course
 * matches the profile's course id, PPC-version-agnostic; "all" matches
 * everything. A Section or profile with no known course id/target defaults
 * to matching, so callers that don't track course identity are unaffected.
 */
function matchesCourseFilter(targetCourseId, courseFilter, profileCourseId) {
  if (courseFilter !== 'own') return true;
  if (profileCourseId == null || targetCourseId == null) return true;
  return targetCourseId === profileCourseId;
}

/**
 * Whether a Subject matches the effective semester filter (see docs/DOMAIN.md,
 * Suggested Semester): "suggested" restricts to Subjects with no Suggested
 * Semester, or one at or before the semester being planned; "advance"
 * matches everything, including Subjects suggested for a later semester. A
 * Subject with no Suggested Semester, or a caller with no known semester
 * number, always matches.
 */
function matchesSemesterFilter(
  suggestedSemester,
  semesterFilter,
  semesterNumber,
) {
  if (semesterFilter !== 'suggested') return true;
  if (suggestedSemester == null || semesterNumber == null) return true;
  return suggestedSemester <= semesterNumber;
}

/**
 * Whether a Subject matches the effective classification filter (see
 * docs/DOMAIN.md, Subject): "required" restricts to Required Subjects;
 * anything else (e.g. "all") matches everything, including Optional
 * Subjects. A Subject with no known classification always matches.
 */
function matchesClassificationFilter(classification, classificationFilter) {
  if (classificationFilter !== 'required') return true;
  if (classification == null) return true;
  return classification === 'required';
}

export function buildCandidateSubjects({
  ppc,
  offerings,
  yearSemester,
  fulfillmentBefore,
  sameSemesterCodes,
  customSections,
  shiftFilter,
  checkCorequisites,
  courseFilter = 'own',
  profileCourseId = null,
  semesterFilter = 'suggested',
  semesterNumber = null,
  classificationFilter = 'required',
}) {
  function isEligible(subject) {
    const fulfilled = fulfillmentBefore.has(subject.code);
    const openAudit = fulfillmentBefore.get(subject.code)?.audit === true;
    if (fulfilled && !openAudit) return false;
    if (!subject.prerequisites.every((code) => fulfillmentBefore.has(code)))
      return false;
    if (checkCorequisites) {
      const coreqsSatisfied = subject.corequisites.every(
        (code) => fulfillmentBefore.has(code) || sameSemesterCodes.has(code),
      );
      if (!coreqsSatisfied) return false;
    }
    if (
      !matchesSemesterFilter(
        subject.suggestedSemester,
        semesterFilter,
        semesterNumber,
      )
    )
      return false;
    if (
      !matchesClassificationFilter(subject.classification, classificationFilter)
    )
      return false;
    return true;
  }

  const candidates = [];

  for (const offeredSubject of offerings?.subjects ?? []) {
    const subject = resolveSubjectByCode(ppc, offeredSubject.code);
    if (!subject || !isEligible(subject)) continue;

    const sections = offeredSubject.sections.filter(
      (section) =>
        sectionMatchesShiftFilter(section.shift, shiftFilter) &&
        matchesCourseFilter(
          section.targetCourseId,
          courseFilter,
          profileCourseId,
        ),
    );
    if (sections.length === 0) continue;

    candidates.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      stale: false,
      sections: sections.map((section) => ({
        kind: 'offering',
        subjectCode: offeredSubject.code,
        turma: section.turma,
        shift: section.shift,
        targetCourseId: section.targetCourseId,
        targetCourseName: section.targetCourseName,
        sessions: section.sessions,
      })),
    });
  }

  for (const custom of customSections) {
    if (
      custom.applicability !== 'both' &&
      custom.applicability !== yearSemester
    )
      continue;

    const linkedSubject = custom.subjectCode
      ? resolveSubjectByCode(ppc, custom.subjectCode)
      : null;
    const stale = custom.subjectCode != null && linkedSubject == null;
    if (linkedSubject && !isEligible(linkedSubject)) continue;

    candidates.push({
      subjectCode: linkedSubject?.code ?? null,
      subjectName: linkedSubject?.name ?? custom.name,
      stale,
      sections: [
        {
          kind: 'custom',
          subjectCode: linkedSubject?.code ?? null,
          sourceCustomId: custom.id,
          custom: { name: custom.name, sessions: custom.sessions },
          sessions: custom.sessions,
        },
      ],
    });
  }

  return candidates;
}

/**
 * Whether a candidate Section is already present, as-is, in the target
 * Planned Semester (`currentSections`, the persisted shape — see
 * domain/semester.js, `createPlannedSection`). An offering Section matches
 * by Subject code + turma; a Custom Section has no persisted link back to
 * its catalog entry, so it matches by its embedded name and sessions
 * instead (see docs/DOMAIN.md, Custom Section).
 */
function matchesPlannedSection(section, planned) {
  if (planned.kind !== section.kind) return false;
  if (section.kind === 'offering')
    return (
      planned.subjectCode === section.subjectCode &&
      planned.turma === section.turma
    );
  return (
    planned.custom.name === section.custom.name &&
    JSON.stringify(planned.custom.sessions) ===
      JSON.stringify(section.custom.sessions)
  );
}

/**
 * Removes candidate Sections already present in `currentSections` (UC-12
 * step 2 refinement): adding the exact same Section again would be a
 * pointless duplicate — distinct from choosing a *different* Section of the
 * same Subject, which is allowed and separately flagged as a Duplicate
 * Subject. Drops a Subject entirely once every one of its Sections is
 * excluded this way.
 * @param {CandidateSubject[]} candidates
 * @param {import('./types.js').PlannedSection[]} currentSections
 * @returns {CandidateSubject[]}
 */
export function excludeAlreadyPlannedSections(candidates, currentSections) {
  return candidates
    .map((candidate) => ({
      ...candidate,
      sections: candidate.sections.filter(
        (section) =>
          !currentSections.some((planned) =>
            matchesPlannedSection(section, planned),
          ),
      ),
    }))
    .filter((candidate) => candidate.sections.length > 0);
}

/**
 * Prunes the co-requisite look-ahead (UC-11 step 7, see docs/USE_CASES.md):
 * a Subject with co-requisites is kept only when each co-requisite is
 * already fulfilled at that point in the plan or is itself present in the
 * pool — selecting it could otherwise only produce an Unmet Requisite.
 * Exclusions cascade to a fixpoint: removing a Subject may cause Subjects
 * that co-required it to be removed too. Evaluated against the visible
 * (already filtered) pool — callers should re-run this after any filter
 * change. Prunes the listing only; it never touches the user's selection.
 * @param {CandidateSubject[]} candidates
 * @param {{subjects: Array}} ppc
 * @param {Map<string, {audit: boolean}>} fulfillmentBefore
 * @returns {CandidateSubject[]}
 */
export function pruneCorequisiteLookahead(candidates, ppc, fulfillmentBefore) {
  const listedCodes = new Set(
    candidates.filter((c) => c.subjectCode != null).map((c) => c.subjectCode),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const code of listedCodes) {
      const subject = resolveSubjectByCode(ppc, code);
      const coreqsSatisfied = subject.corequisites.every(
        (req) => fulfillmentBefore.has(req) || listedCodes.has(req),
      );
      if (!coreqsSatisfied) {
        listedCodes.delete(code);
        changed = true;
      }
    }
  }

  return candidates.filter(
    (c) => c.subjectCode == null || listedCodes.has(c.subjectCode),
  );
}
