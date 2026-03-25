/**
 * src/domain/calendar.js
 *
 * Pure domain functions for schedule conflict detection and resolution.
 * No framework, no storage, no UI — only plain JS logic.
 *
 * Operates on the Class shape described in DOMAIN.md:
 *
 *   CurriculumSemester {
 *     label: string,
 *     offerSemester: 1|2,
 *     sections: Section[],
 *   }
 *
 *   Section {
 *     name: string,        // section identifier, e.g. "06.1 N"
 *     subjectCode: string, // subject code, e.g. "ELE15923"
 *     slots: Slot[],       // schedule entries
 *   }
 *
 *   Slot { day: string, start: "HH:MM", end: "HH:MM" }
 */

import { hhmmToMinutes, overlaps, normalizeDay } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Parses a raw schedule slot into a validated, normalised interval.
 * Returns null when any required field is missing or the interval is invalid.
 *
 * @param {{day:string, start:string, end:string}} slot
 * @returns {{day:string, startMin:number, endMin:number}|null}
 */
function parseSlot(slot) {
  if (!slot || typeof slot !== "object") return null;

  const day = normalizeDay(slot.day);
  const startMin = hhmmToMinutes(String(slot.start ?? "").trim());
  const endMin = hhmmToMinutes(String(slot.end ?? "").trim());

  if (!day) return null;
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;

  return { day, startMin, endMin };
}

/**
 * Returns all validated schedule intervals for a Section.
 * Reads directly from sec.slots.
 *
 * @param {object} sec
 * @returns {Array<{day:string, startMin:number, endMin:number}>}
 */
function sectionIntervals(sec) {
  return (Array.isArray(sec?.slots) ? sec.slots : [])
    .map(parseSlot)
    .filter(Boolean);
}

/**
 * Returns true when the two interval arrays have at least one overlapping pair
 * on the same weekday. Short-circuits on the first hit.
 *
 * @param {Array<{day:string, startMin:number, endMin:number}>} intervalsA
 * @param {Array<{day:string, startMin:number, endMin:number}>} intervalsB
 * @returns {boolean}
 */
function anyIntervalsOverlap(intervalsA, intervalsB) {
  for (const a of intervalsA) {
    for (const b of intervalsB) {
      if (a.day === b.day && overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Returns a safe, normalised array of Sections from a CurriculumSemester.
 *
 * @param {object} semester
 * @returns {object[]}
 */
function safeSections(semester) {
  return Array.isArray(semester?.sections) ? semester.sections.filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a list of human-readable (pt-BR) reasons that prevent generating the
 * next semester from the supplied CurriculumSemester.
 *
 * Blocking conditions:
 *   1. Any two Sections have overlapping schedule slots.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {string[]} Array of pt-BR blocking reason strings (empty when clear).
 */
export function blockingReasons(semester) {
  const sections = safeSections(semester);
  const reasons = [];

  // Pairwise schedule conflicts between sections.
  for (let i = 0; i < sections.length - 1; i++) {
    const iIntervals = sectionIntervals(sections[i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (anyIntervalsOverlap(iIntervals, sectionIntervals(sections[j]))) {
        reasons.push(
          `Conflito de horário: ${sections[i].subjectCode} × ${sections[j].subjectCode}`,
        );
      }
    }
  }

  return reasons;
}

/**
 * Returns true when any two Sections in the CurriculumSemester have at least one
 * pair of schedule slots on the same weekday with overlapping time intervals.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {boolean}
 */
export function semesterHasScheduleConflict(semester) {
  const sections = safeSections(semester);

  for (let i = 0; i < sections.length - 1; i++) {
    const iIntervals = sectionIntervals(sections[i]);
    for (let j = i + 1; j < sections.length; j++) {
      if (anyIntervalsOverlap(iIntervals, sectionIntervals(sections[j]))) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Returns descriptors for every schedule conflict found in the CurriculumSemester.
 *
 * Conflicts are grouped by { day, blockStart } where blockStart is the start
 * minute of the overlapping block. Each descriptor lists the subject codes
 * of every Section that participates in that conflict slot.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {Array<{ day: string, blockStart: number, subjectCodes: string[] }>}
 */
export function allScheduleConflicts(semester) {
  const sections = safeSections(semester);

  /** @type {Map<string, Set<string>>} */
  const buckets = new Map();

  for (let i = 0; i < sections.length - 1; i++) {
    const iIntervals = sectionIntervals(sections[i]);

    for (let j = i + 1; j < sections.length; j++) {
      const jIntervals = sectionIntervals(sections[j]);

      for (const a of iIntervals) {
        for (const b of jIntervals) {
          if (a.day !== b.day) continue;
          if (!overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) continue;

          const startMin = Math.min(a.startMin, b.startMin);
          const key = `${a.day}|${startMin}`;

          if (!buckets.has(key)) {
            buckets.set(key, new Set());
          }
          const bucket = buckets.get(key);
          bucket.add(sections[i].subjectCode);
          bucket.add(sections[j].subjectCode);
        }
      }
    }
  }

  return Array.from(buckets.entries()).map(([key, codesSet]) => {
    const [day, startStr] = key.split("|");
    return {
      day,
      blockStart: Number(startStr),
      subjectCodes: Array.from(codesSet),
    };
  });
}

/**
 * Returns all section pairs whose schedule overlaps the given time block
 * on the given weekday.
 *
 * @param {string} day      - Canonical weekday (e.g. "Mon").
 * @param {number} startMin - Block start in minutes since 00:00 (inclusive).
 * @param {number} endMin   - Block end in minutes since 00:00 (exclusive).
 * @param {object} semester - A CurriculumSemester.
 * @returns {Array<{ courseCode: string, sectionId: string }>}
 */
export function sectionsInSlot(day, startMin, endMin, semester) {
  const normalDay = normalizeDay(day);
  const sections = safeSections(semester);
  /** @type {Array<{ courseCode: string, sectionId: string }>} */
  const result = [];

  for (const sec of sections) {
    const intervals = sectionIntervals(sec);
    const hits = intervals.some(
      (iv) =>
        iv.day === normalDay && overlaps(iv.startMin, iv.endMin, startMin, endMin),
    );
    if (hits) {
      result.push({
        courseCode: String(sec?.subjectCode ?? "").trim(),
        sectionId: String(sec?.name ?? "").trim(),
      });
    }
  }

  return result;
}

/**
 * Returns all sections that are present in the block
 * [blockStart, blockEnd) on the given weekday — but only when there are two or
 * more such sections (i.e. an actual conflict exists).
 *
 * Returns an empty array when fewer than two candidates occupy the block.
 *
 * @param {string} day        - Canonical weekday (e.g. "Tue").
 * @param {number} blockStart - Block start in minutes since 00:00 (inclusive).
 * @param {number} blockEnd   - Block end in minutes since 00:00 (exclusive).
 * @param {object} semester   - A CurriculumSemester.
 * @returns {Array<{ courseCode: string, sectionId: string }>}
 */
export function conflictCandidatesForBlock(day, blockStart, blockEnd, semester) {
  const candidates = sectionsInSlot(day, blockStart, blockEnd, semester);
  return candidates.length >= 2 ? candidates : [];
}

/**
 * Designates the Section identified by (courseCode, sectionId) as the winner
 * for that subject, then removes any other sections that conflict in schedule
 * with the winning section.
 *
 * Rules:
 *   - For the winning section (matching both courseCode AND sectionId): keep as-is.
 *   - Remove all other sections for the same courseCode (other candidate sections).
 *   - For every remaining section (different courseCode): remove it if its slots
 *     overlap with the winning section's slots on any day.
 *
 * Does NOT mutate the input semester or any of its section objects.
 *
 * @param {string} courseCode - The subjectCode of the section to resolve.
 * @param {string} sectionId  - The winning section identifier (section.name).
 * @param {object} semester   - A CurriculumSemester.
 * @returns {object} New CurriculumSemester with updated sections.
 */
export function resolveWinningSection(courseCode, sectionId, semester) {
  const sections = safeSections(semester);

  // Find the winning section and compute its intervals for pruning.
  const winningSection = sections.find(
    (s) => s?.subjectCode === courseCode && String(s?.name ?? "").trim() === sectionId,
  );
  const winningIntervals = winningSection ? sectionIntervals(winningSection) : [];

  const updatedSections = sections.filter((sec) => {
    // Always keep the winning section.
    if (sec === winningSection) return true;

    // Remove other candidate sections for the same subject.
    if (sec?.subjectCode === courseCode) return false;

    // For every other subject, remove if its slots conflict with the winner.
    if (winningIntervals.length === 0) return true;
    const secIntervals = sectionIntervals(sec);
    return !anyIntervalsOverlap(secIntervals, winningIntervals);
  });

  return { ...semester, sections: updatedSections };
}