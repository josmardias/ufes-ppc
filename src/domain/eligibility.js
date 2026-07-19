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
 * @property {Array<{kind: "offering"|"custom", subjectCode: string|null, turma?: string, professor?: string,
 *   shift?: string, sessions: import('./types.js').Session[], custom?: object}>} sections
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
 * }} params
 * @returns {CandidateSubject[]}
 */
/** A stable identity key for a candidate section template, used to track selection across filter changes. */
export function candidateSectionKey(section) {
  return section.kind === 'custom' ? `custom:${section.sourceCustomId}` : `offering:${section.subjectCode}:${section.turma}`;
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
}) {
  function isEligible(subject) {
    const fulfilled = fulfillmentBefore.has(subject.code);
    const openAudit = fulfillmentBefore.get(subject.code)?.audit === true;
    if (fulfilled && !openAudit) return false;
    if (!subject.prerequisites.every((code) => fulfillmentBefore.has(code))) return false;
    if (checkCorequisites) {
      const coreqsSatisfied = subject.corequisites.every(
        (code) => fulfillmentBefore.has(code) || sameSemesterCodes.has(code),
      );
      if (!coreqsSatisfied) return false;
    }
    return true;
  }

  const candidates = [];

  for (const offeredSubject of offerings?.subjects ?? []) {
    const subject = resolveSubjectByCode(ppc, offeredSubject.code);
    if (!subject || !isEligible(subject)) continue;

    const sections = offeredSubject.sections.filter((section) => sectionMatchesShiftFilter(section.shift, shiftFilter));
    if (sections.length === 0) continue;

    candidates.push({
      subjectCode: subject.code,
      subjectName: subject.name,
      stale: false,
      sections: sections.map((section) => ({
        kind: 'offering',
        subjectCode: offeredSubject.code,
        turma: section.turma,
        professor: section.professor,
        shift: section.shift,
        sessions: section.sessions,
      })),
    });
  }

  for (const custom of customSections) {
    if (custom.applicability !== 'both' && custom.applicability !== yearSemester) continue;

    const linkedSubject = custom.subjectCode ? resolveSubjectByCode(ppc, custom.subjectCode) : null;
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
