// Candidate Section lists for planning a Planned Semester (see
// docs/USE_CASES.md, UC-11 "Add a New Planned Semester", UC-12 "Add a
// Section to a Planned Semester", and UC-27 "Add an Optional Section to a
// Planned Semester"). Pure, framework-agnostic — the caller supplies the
// fulfillment state to plan against (see domain/evaluation.js).

import { resolveSubjectByCode } from './subjects.js';
import { sectionMatchesShiftFilter } from './schedule.js';

/**
 * @typedef {Object} CandidateSubject
 * @property {string|null} subjectCode - canonical PPC Subject code, or null for an unlinked Custom Section
 * @property {string} subjectName
 * @property {boolean} stale - true for a Custom Section whose link no longer resolves in the PPC
 * @property {"core"|"other"} tier - "core" when the Subject's Suggested Semester is at or before
 *   the semester being planned (or it has none); "other" when suggested for a later semester
 *   (see docs/USE_CASES.md, UC-11 step 5)
 * @property {Array<{kind: "offering"|"custom", subjectCode: string|null, turma?: string,
 *   shift?: string, targetCourseId?: string, targetCourseName?: string, sessions: import('./types.js').Session[],
 *   custom?: object}>} sections
 */

/** A stable identity key for a candidate section template, used to track selection across filter changes. */
export function candidateSectionKey(section) {
  return section.kind === 'custom'
    ? `custom:${section.sourceCustomId}`
    : `offering:${section.subjectCode}:${section.turma}`;
}

/**
 * The tier a Subject belongs to in the two-tier listing (see docs/USE_CASES.md,
 * UC-11 step 5): "core" (likely enrollment) when its Suggested Semester is at
 * or before `semesterNumber`, or it has none; "other" otherwise. Tier
 * assignment is Subject-level.
 * @param {{suggestedSemester: number|null}} subject
 * @param {number|null} semesterNumber
 */
function tierOf(subject, semesterNumber) {
  if (subject.suggestedSemester == null || semesterNumber == null)
    return 'core';
  return subject.suggestedSemester <= semesterNumber ? 'core' : 'other';
}

/**
 * Builds the candidate Subjects (grouped, each with its available Sections)
 * for planning a Planned Semester at `yearSemester`, given the fulfillment
 * state before that semester. Excludes Subjects already fulfilled unless
 * their fulfillment carries an open Audit Mark (see docs/DOMAIN.md, Audit
 * Mark), and Subjects whose prerequisites aren't satisfied. Co-requisites
 * are NOT checked here — the shared co-requisite look-ahead rule (UC-11 step
 * 8, UC-12 "Co-requisite rule", UC-27) is a separate, cross-classification
 * pass; see `pruneCorequisiteLookahead` / `buildCombinedCandidatePool` below,
 * which every caller is expected to run afterward.
 *
 * @param {{
 *   ppc: {id: string, subjects: Array},
 *   offerings: {subjects: Array}|undefined,
 *   yearSemester: 1|2,
 *   fulfillmentBefore: Map<string, {audit: boolean}>,
 *   sameSemesterCodes: Set<string>,
 *   customSections: import('./types.js').CustomSection[],
 *   shiftFilter: "morning"|"afternoon"|"day",
 *   classification: "required"|"optional" - restricts the listing to Subjects of this
 *     classification (see docs/DOMAIN.md, Subject); a Subject with no known classification
 *     counts as "required". Custom Sections are only ever listed for "required" (UC-27
 *     never lists them — the Student's own catalog lives in UC-12).
 *   semesterNumber?: number|null - the 1-based ordinal of the semester being planned, used
 *     to derive each candidate's `tier`
 *   hiddenSubjects?: string[] - Optional Subject codes to exclude from the listing (UC-28);
 *     only meaningful when classification is "optional"
 * }} params
 * @returns {CandidateSubject[]}
 */
export function buildCandidateSubjects({
  ppc,
  offerings,
  yearSemester,
  fulfillmentBefore,
  sameSemesterCodes,
  customSections,
  shiftFilter,
  classification,
  semesterNumber = null,
  hiddenSubjects = [],
}) {
  function isEligible(subject) {
    const subjectClassification = subject.classification ?? 'required';
    if (subjectClassification !== classification) return false;
    if (classification === 'optional' && hiddenSubjects.includes(subject.code))
      return false;

    const fulfilled = fulfillmentBefore.has(subject.code);
    const openAudit = fulfillmentBefore.get(subject.code)?.audit === true;
    if (fulfilled && !openAudit) return false;
    if (!subject.prerequisites.every((code) => fulfillmentBefore.has(code)))
      return false;
    return true;
  }

  const candidates = [];
  // Sections offered under an equivalent code resolve to the same canonical
  // Subject (see docs/DOMAIN.md, Equivalence) — e.g. an old code kept around
  // for a transition period. Group them into a single candidate per Subject
  // rather than pushing one per offered code, which would otherwise produce
  // sibling entries sharing the same `subjectCode` (and React key).
  const byCode = new Map();

  for (const offeredSubject of offerings?.subjects ?? []) {
    const subject = resolveSubjectByCode(ppc, offeredSubject.code);
    if (!subject || !isEligible(subject)) continue;

    const sections = offeredSubject.sections.filter((section) =>
      sectionMatchesShiftFilter(section.shift, shiftFilter),
    );
    if (sections.length === 0) continue;

    const mappedSections = sections.map((section) => ({
      kind: 'offering',
      subjectCode: offeredSubject.code,
      turma: section.turma,
      shift: section.shift,
      targetCourseId: section.targetCourseId,
      targetCourseName: section.targetCourseName,
      sessions: section.sessions,
    }));

    const existing = byCode.get(subject.code);
    if (existing) {
      existing.sections.push(...mappedSections);
      continue;
    }

    const candidate = {
      subjectCode: subject.code,
      subjectName: subject.name,
      stale: false,
      tier: tierOf(subject, semesterNumber),
      sections: mappedSections,
    };
    byCode.set(subject.code, candidate);
    candidates.push(candidate);
  }

  if (classification === 'required') {
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
        tier: linkedSubject ? tierOf(linkedSubject, semesterNumber) : 'core',
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
 * Prunes the co-requisite look-ahead — the rule shared by UC-11 step 8,
 * UC-12's "Co-requisite rule", and UC-27 (see docs/USE_CASES.md): a Subject
 * with co-requisites is kept only when each co-requisite is already
 * fulfilled at that point in the plan, already planned in the selected
 * Planned Semester (`sameSemesterCodes`), or itself present in `candidates`
 * — selecting it could otherwise only produce an Unmet Requisite. Exclusions
 * cascade to a fixpoint: removing a Subject may cause Subjects that
 * co-required it to be removed too.
 *
 * `candidates` is expected to be the COMBINED pool — required ∪ optional,
 * with hidden Subjects already excluded by the caller (via
 * `buildCandidateSubjects`'s `hiddenSubjects`) — so that a required Subject's
 * co-requisite can be satisfied by an optional Subject in the pool and vice
 * versa. Evaluated against the shift-filtered pool; callers should re-run
 * this after any filter change. Prunes the listing only; it never touches
 * the user's selection.
 * @param {CandidateSubject[]} candidates
 * @param {{subjects: Array}} ppc
 * @param {Map<string, {audit: boolean}>} fulfillmentBefore
 * @param {Set<string>} [sameSemesterCodes]
 * @returns {CandidateSubject[]}
 */
export function pruneCorequisiteLookahead(
  candidates,
  ppc,
  fulfillmentBefore,
  sameSemesterCodes = new Set(),
) {
  const listedCodes = new Set(
    candidates.filter((c) => c.subjectCode != null).map((c) => c.subjectCode),
  );

  let changed = true;
  while (changed) {
    changed = false;
    for (const code of listedCodes) {
      const subject = resolveSubjectByCode(ppc, code);
      const coreqsSatisfied = subject.corequisites.every(
        (req) =>
          fulfillmentBefore.has(req) ||
          sameSemesterCodes.has(req) ||
          listedCodes.has(req),
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

/**
 * Builds the required and optional candidate pools together and applies the
 * shared co-requisite look-ahead rule across their union (UC-11 step 8,
 * UC-12 "Co-requisite rule", UC-27), then returns each classification's
 * pruned candidates separately for display — so a Subject in one
 * classification can be kept alive by a co-requisite belonging to the
 * other, without ever displaying the other classification where it doesn't
 * belong (e.g. UC-11 lists Required Subjects only, UC-27 lists Optional
 * Subjects only).
 * @param {Object} params - same shape as `buildCandidateSubjects`, minus `classification`
 * @param {string[]} [params.hiddenSubjects] - excluded from the optional pool only (UC-28)
 * @returns {{ required: CandidateSubject[], optional: CandidateSubject[] }}
 */
export function buildCombinedCandidatePool({
  ppc,
  offerings,
  yearSemester,
  fulfillmentBefore,
  sameSemesterCodes,
  customSections,
  shiftFilter,
  semesterNumber = null,
  hiddenSubjects = [],
}) {
  const required = buildCandidateSubjects({
    ppc,
    offerings,
    yearSemester,
    fulfillmentBefore,
    sameSemesterCodes,
    customSections,
    shiftFilter,
    classification: 'required',
    semesterNumber,
  });
  const optional = buildCandidateSubjects({
    ppc,
    offerings,
    yearSemester,
    fulfillmentBefore,
    sameSemesterCodes,
    customSections: [],
    shiftFilter,
    classification: 'optional',
    semesterNumber,
    hiddenSubjects,
  });

  const pruned = pruneCorequisiteLookahead(
    [...required, ...optional],
    ppc,
    fulfillmentBefore,
    sameSemesterCodes,
  );
  const prunedCodes = new Set(
    pruned.filter((c) => c.subjectCode != null).map((c) => c.subjectCode),
  );

  return {
    required: required.filter(
      (c) => c.subjectCode == null || prunedCodes.has(c.subjectCode),
    ),
    optional: optional.filter((c) => prunedCodes.has(c.subjectCode)),
  };
}
