// Cascading requisite/signal evaluation across a Student's Planned
// Semesters (see docs/DOMAIN.md, Planned Semester, Unmet Requisite, Failed
// Mark, Schedule Conflict, Duplicate Subject, Redundant Enrollment, Audit
// Mark). This is the one place that recomputes the fulfillment set semester
// by semester — nothing here is persisted; the caller re-runs it on every
// edit (see docs/ARCHITECTURE.md, Persistence).

import { resolveSubjectByCode, totalFulfilledWorkload } from './subjects.js';
import {
  plannedSectionOffering,
  plannedSectionSessions,
  sectionsOverlap,
} from './schedule.js';
import { semesterPosition } from './semester.js';

/**
 * @typedef {Object} FulfillmentEntry
 * @property {boolean} audit - whether the fulfillment carries an open Audit Mark
 * @property {{kind: "credit"}|{kind: "section", semesterIndex: number, sectionId: string}} source
 */

/**
 * @typedef {Object} EvaluatedSection
 * @property {string|null} resolvedSubjectCode - the canonical PPC Subject code, or null if unresolved
 * @property {import('./types.js').Session[]} sessions
 * @property {string|null} targetCourseId - the Section's target course (see docs/DOMAIN.md, Section); null for a Custom Section or an unresolved offering Section
 * @property {string|null} targetCourseName
 * @property {{unmetRequisite: boolean, scheduleConflict: boolean, duplicateSubject: boolean, redundantEnrollment: boolean}} signals
 */

/**
 * @typedef {Object} EvaluatedSemester
 * @property {number} index
 * @property {number} year
 * @property {1|2} yearSemester
 * @property {"clean"|"warnings"|"errors"} status
 * @property {(import('./types.js').PlannedSection & EvaluatedSection)[]} sections
 * @property {Map<string, FulfillmentEntry>} fulfillmentBefore - fulfillment state before this semester
 * @property {Set<string>} sameSemesterCodes - Subject codes covered by any Section in this semester
 */

function statusFromSignals(sections) {
  let hasWarning = false;
  for (const section of sections) {
    if (section.signals.unmetRequisite) return 'errors';
    if (
      section.signals.scheduleConflict ||
      section.signals.duplicateSubject ||
      section.signals.redundantEnrollment
    ) {
      hasWarning = true;
    }
  }
  return hasWarning ? 'warnings' : 'clean';
}

/**
 * Evaluates every Planned Semester in a profile in sequence, deriving
 * planning signals and per-semester status. See docs/DOMAIN.md, "Planned
 * Semester" for the fulfillment and cascading rules this implements.
 *
 * @param {import('./types.js').ProfileRecord} profile
 * @param {{id: string, subjects: Array}} ppc
 * @param {{1?: {subjects: Array}, 2?: {subjects: Array}}} offeringsByYearSemester - Offerings
 *   snapshot per Year Semester (1|2), e.g. `{1: getOfferings(ppc.id, 1), 2: getOfferings(ppc.id, 2)}`
 * @returns {{semesters: EvaluatedSemester[], fulfillmentAfter: Map<string, FulfillmentEntry>}}
 */
export function evaluatePlan(profile, ppc, offeringsByYearSemester) {
  const fulfillment = new Map();
  for (const entry of profile.creditEntries) {
    fulfillment.set(entry.subjectCode, {
      audit: entry.audit,
      source: { kind: 'credit' },
    });
  }

  const semesters = profile.semesters.map((semester, index) => {
    const { year, yearSemester } = semesterPosition(
      profile.ingressYear,
      profile.ingressYearSemester,
      index,
    );
    const offerings = offeringsByYearSemester[yearSemester];
    const fulfillmentBefore = new Map(fulfillment);
    const workloadBefore = totalFulfilledWorkload(ppc, fulfillmentBefore);

    const resolved = semester.sections.map((section) => ({
      section,
      subject: resolveSubjectByCode(ppc, section.subjectCode),
      sessions: plannedSectionSessions(section, offerings),
      offering: plannedSectionOffering(section, offerings),
    }));

    const sameSemesterCodes = new Set(
      resolved.filter((r) => r.subject).map((r) => r.subject.code),
    );

    const countByCode = new Map();
    for (const r of resolved) {
      if (!r.subject) continue;
      countByCode.set(
        r.subject.code,
        (countByCode.get(r.subject.code) ?? 0) + 1,
      );
    }

    const evaluatedSections = resolved.map(
      ({ section, subject, sessions, offering }) => {
        const scheduleConflict = resolved.some(
          (other) =>
            other.section !== section &&
            sectionsOverlap(sessions, other.sessions),
        );
        const duplicateSubject =
          subject != null && countByCode.get(subject.code) > 1;

        let unmetRequisite = false;
        let redundantEnrollment = false;
        if (subject) {
          const prereqsSatisfied = subject.prerequisites.every((code) =>
            fulfillmentBefore.has(code),
          );
          const coreqsSatisfied = subject.corequisites.every(
            (code) =>
              fulfillmentBefore.has(code) || sameSemesterCodes.has(code),
          );
          const workloadSatisfied =
            subject.minWorkloadHours == null ||
            workloadBefore >= subject.minWorkloadHours;
          unmetRequisite =
            !prereqsSatisfied || !coreqsSatisfied || !workloadSatisfied;

          const priorFulfillment = fulfillmentBefore.get(subject.code);
          redundantEnrollment =
            priorFulfillment != null && !priorFulfillment.audit;
        }

        return {
          ...section,
          resolvedSubjectCode: subject?.code ?? null,
          sessions,
          targetCourseId: offering?.targetCourseId ?? null,
          targetCourseName: offering?.targetCourseName ?? null,
          signals: {
            unmetRequisite,
            scheduleConflict,
            duplicateSubject,
            redundantEnrollment,
          },
        };
      },
    );

    // Sections that fulfill their own requisites (and aren't Failed) update
    // the running fulfillment map for later semesters — a Failed Mark or an
    // Unmet Requisite confers nothing forward (see docs/DOMAIN.md).
    for (const evaluatedSection of evaluatedSections) {
      if (
        evaluatedSection.resolvedSubjectCode &&
        !evaluatedSection.failed &&
        !evaluatedSection.signals.unmetRequisite
      ) {
        fulfillment.set(evaluatedSection.resolvedSubjectCode, {
          audit: evaluatedSection.audit,
          source: {
            kind: 'section',
            semesterIndex: index,
            sectionId: evaluatedSection.id,
          },
        });
      }
    }

    return {
      index,
      year,
      yearSemester,
      status: statusFromSignals(evaluatedSections),
      sections: evaluatedSections,
      fulfillmentBefore,
      sameSemesterCodes,
    };
  });

  return { semesters, fulfillmentAfter: fulfillment };
}
