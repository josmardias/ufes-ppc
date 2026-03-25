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
 *     classes: Class[],
 *   }
 *
 *   Class {
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
 * Returns all validated schedule intervals for a Class.
 * Reads directly from cls.slots.
 *
 * @param {object} cls
 * @returns {Array<{day:string, startMin:number, endMin:number}>}
 */
function classIntervals(cls) {
  return (Array.isArray(cls?.slots) ? cls.slots : [])
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
 * Returns a safe, normalised array of Classes from a CurriculumSemester.
 *
 * @param {object} semester
 * @returns {object[]}
 */
function safeClasses(semester) {
  return Array.isArray(semester?.classes) ? semester.classes.filter(Boolean) : [];
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Returns a list of human-readable (pt-BR) reasons that prevent generating the
 * next semester from the supplied CurriculumSemester.
 *
 * Blocking conditions:
 *   1. Any two Classes have overlapping schedule slots.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {string[]} Array of pt-BR blocking reason strings (empty when clear).
 */
export function blockingReasons(semester) {
  const classes = safeClasses(semester);
  const reasons = [];

  // Pairwise schedule conflicts between classes.
  for (let i = 0; i < classes.length - 1; i++) {
    const iIntervals = classIntervals(classes[i]);
    for (let j = i + 1; j < classes.length; j++) {
      if (anyIntervalsOverlap(iIntervals, classIntervals(classes[j]))) {
        reasons.push(
          `Conflito de horário: ${classes[i].subjectCode} × ${classes[j].subjectCode}`,
        );
      }
    }
  }

  return reasons;
}

/**
 * Returns true when any two Classes in the CurriculumSemester have at least one
 * pair of schedule slots on the same weekday with overlapping time intervals.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {boolean}
 */
export function semesterHasScheduleConflict(semester) {
  const classes = safeClasses(semester);

  for (let i = 0; i < classes.length - 1; i++) {
    const iIntervals = classIntervals(classes[i]);
    for (let j = i + 1; j < classes.length; j++) {
      if (anyIntervalsOverlap(iIntervals, classIntervals(classes[j]))) {
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
 * of every Class that participates in that conflict slot.
 *
 * @param {object} semester - A CurriculumSemester.
 * @returns {Array<{ day: string, blockStart: number, subjectCodes: string[] }>}
 */
export function allScheduleConflicts(semester) {
  const classes = safeClasses(semester);

  /** @type {Map<string, Set<string>>} */
  const buckets = new Map();

  for (let i = 0; i < classes.length - 1; i++) {
    const iIntervals = classIntervals(classes[i]);

    for (let j = i + 1; j < classes.length; j++) {
      const jIntervals = classIntervals(classes[j]);

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
          bucket.add(classes[i].subjectCode);
          bucket.add(classes[j].subjectCode);
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
 * Returns all course-section pairs whose schedule overlaps the given time block
 * on the given weekday.
 *
 * @param {string} day      - Canonical weekday (e.g. "Mon").
 * @param {number} startMin - Block start in minutes since 00:00 (inclusive).
 * @param {number} endMin   - Block end in minutes since 00:00 (exclusive).
 * @param {object} semester - A CurriculumSemester.
 * @returns {Array<{ courseCode: string, sectionCode: string }>}
 */
export function sectionsInSlot(day, startMin, endMin, semester) {
  const normalDay = normalizeDay(day);
  const classes = safeClasses(semester);
  /** @type {Array<{ courseCode: string, sectionCode: string }>} */
  const result = [];

  for (const cls of classes) {
    const intervals = classIntervals(cls);
    const hits = intervals.some(
      (iv) =>
        iv.day === normalDay && overlaps(iv.startMin, iv.endMin, startMin, endMin),
    );
    if (hits) {
      result.push({
        courseCode: String(cls?.subjectCode ?? "").trim(),
        sectionCode: String(cls?.name ?? "").trim(),
      });
    }
  }

  return result;
}

/**
 * Returns all course-section pairs that are present in the block
 * [blockStart, blockEnd) on the given weekday — but only when there are two or
 * more such sections (i.e. an actual conflict exists).
 *
 * Returns an empty array when fewer than two candidates occupy the block.
 *
 * @param {string} day        - Canonical weekday (e.g. "Tue").
 * @param {number} blockStart - Block start in minutes since 00:00 (inclusive).
 * @param {number} blockEnd   - Block end in minutes since 00:00 (exclusive).
 * @param {object} semester   - A CurriculumSemester.
 * @returns {Array<{ courseCode: string, sectionCode: string }>}
 */
export function conflictCandidatesForBlock(day, blockStart, blockEnd, semester) {
  const candidates = sectionsInSlot(day, blockStart, blockEnd, semester);
  return candidates.length >= 2 ? candidates : [];
}

/**
 * Designates the Class identified by (courseCode, sectionCode) as the winner
 * for that subject, then removes any other classes that conflict in schedule
 * with the winning class.
 *
 * Rules:
 *   - For the winning class (matching both courseCode AND sectionCode): keep as-is.
 *   - Remove all other classes for the same courseCode (other candidate sections).
 *   - For every remaining class (different courseCode): remove it if its slots
 *     overlap with the winning class's slots on any day.
 *
 * Does NOT mutate the input semester or any of its class objects.
 *
 * @param {string} courseCode   - The subjectCode of the class to resolve.
 * @param {string} sectionCode  - The winning section identifier (class.name).
 * @param {object} semester     - A CurriculumSemester.
 * @returns {object} New CurriculumSemester with updated classes.
 */
export function resolveWinningSection(courseCode, sectionCode, semester) {
  const classes = safeClasses(semester);

  // Find the winning class and compute its intervals for pruning.
  const winningClass = classes.find(
    (c) => c?.subjectCode === courseCode && String(c?.name ?? "").trim() === sectionCode,
  );
  const winningIntervals = winningClass ? classIntervals(winningClass) : [];

  const updatedClasses = classes.filter((cls) => {
    // Always keep the winning class.
    if (cls === winningClass) return true;

    // Remove other candidate sections for the same subject.
    if (cls?.subjectCode === courseCode) return false;

    // For every other subject, remove if its slots conflict with the winner.
    if (winningIntervals.length === 0) return true;
    const cIntervals = classIntervals(cls);
    return !anyIntervalsOverlap(cIntervals, winningIntervals);
  });

  return { ...semester, classes: updatedClasses };
}