/**
 * src/domain/schedule.js
 *
 * Pure domain functions for schedule conflict detection.
 * No framework, no storage, no UI — only plain JS logic.
 *
 * Operates on:
 *   Class { name: string, subjectCode: string, slots: Slot[] }
 *   Slot  { day: string, start: "HH:MM", end: "HH:MM" }
 */

import { hhmmToMinutes, overlaps, normalizeDay } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Converts a raw slot {day, start, end} into a validated, normalised form.
 * Returns null when any field is missing or the interval is invalid.
 *
 * @param {{day:string, start:string, end:string}} slot
 * @returns {{day:string, startMin:number, endMin:number, start:string, end:string}|null}
 */
function parseSlot(slot) {
  if (!slot || typeof slot !== "object") return null;

  const day = normalizeDay(slot.day);
  const start = String(slot.start ?? "").trim();
  const end = String(slot.end ?? "").trim();

  const startMin = hhmmToMinutes(start);
  const endMin = hhmmToMinutes(end);

  if (!day) return null;
  if (startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;

  return { day, startMin, endMin, start, end };
}

/**
 * Returns every overlapping slot pair between two classes.
 * Each entry in the returned array is the raw slot from class A that overlaps
 * with at least one slot from class B (duplicates removed by slot identity).
 *
 * A slot appears in the result once per overlap it participates in, so callers
 * that only need to know *whether* overlap exists should stop at the first hit.
 *
 * @param {Array<{day:string, start:string, end:string}>} slotsA
 * @param {Array<{day:string, start:string, end:string}>} slotsB
 * @returns {Array<{day:string, start:string, end:string}>} Unique overlapping slots from both classes.
 */
function findOverlappingSlots(slotsA, slotsB) {
  /** @type {Set<string>} Keys of slots already added to the result */
  const seen = new Set();
  /** @type {Array<{day:string, start:string, end:string}>} */
  const result = [];

  for (const rawA of slotsA) {
    const a = parseSlot(rawA);
    if (!a) continue;

    for (const rawB of slotsB) {
      const b = parseSlot(rawB);
      if (!b) continue;

      // Slots must be on the same weekday to conflict.
      if (a.day !== b.day) continue;

      if (overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) {
        // Collect the overlapping slots from both sides (deduplicated by key).
        for (const s of [rawA, rawB]) {
          const key = `${normalizeDay(s.day)}|${s.start}|${s.end}`;
          if (!seen.has(key)) {
            seen.add(key);
            result.push({ day: normalizeDay(s.day), start: s.start, end: s.end });
          }
        }
      }
    }
  }

  return result;
}

/**
 * Returns true when two classes have at least one pair of sessions on the same
 * day whose time intervals overlap. Short-circuits on the first hit.
 *
 * @param {Array<{day:string, start:string, end:string}>} slotsA
 * @param {Array<{day:string, start:string, end:string}>} slotsB
 * @returns {boolean}
 */
function anySlotOverlaps(slotsA, slotsB) {
  for (const rawA of slotsA) {
    const a = parseSlot(rawA);
    if (!a) continue;

    for (const rawB of slotsB) {
      const b = parseSlot(rawB);
      if (!b) continue;

      if (a.day !== b.day) continue;

      if (overlaps(a.startMin, a.endMin, b.startMin, b.endMin)) {
        return true;
      }
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Detects all schedule conflicts among a set of Classes in the same Curriculum
 * Semester.
 *
 * Two Classes conflict when at least one session of class A is on the same
 * weekday and has an overlapping time interval with at least one session of
 * class B (half-open interval comparison: [start, end)).
 *
 * Each pair is reported at most once (A vs B, never also B vs A).
 *
 * @param {Array<{subjectCode:string, slots:Array<{day:string, start:string, end:string}>}>} classes
 * @returns {Array<{a:string, b:string, slots:Array<{day:string, start:string, end:string}>}>}
 */
export function detectConflicts(classes) {
  if (!Array.isArray(classes) || classes.length < 2) return [];

  /** @type {Array<{a:string, b:string, slots:Array<{day:string, start:string, end:string}>}>} */
  const conflicts = [];

  for (let i = 0; i < classes.length - 1; i++) {
    const classA = classes[i];
    const slotsA = Array.isArray(classA?.slots) ? classA.slots : [];

    for (let j = i + 1; j < classes.length; j++) {
      const classB = classes[j];
      const slotsB = Array.isArray(classB?.slots) ? classB.slots : [];

      const overlappingSlots = findOverlappingSlots(slotsA, slotsB);

      if (overlappingSlots.length > 0) {
        conflicts.push({
          a: classA.subjectCode,
          b: classB.subjectCode,
          slots: overlappingSlots,
        });
      }
    }
  }

  return conflicts;
}

/**
 * Returns true when any two Classes in the provided array have a schedule
 * conflict. Optimised to short-circuit on the first conflict found without
 * collecting the full set of overlapping slots.
 *
 * @param {Array<{subjectCode:string, slots:Array<{day:string, start:string, end:string}>}>} classes
 * @returns {boolean}
 */
export function hasConflicts(classes) {
  if (!Array.isArray(classes) || classes.length < 2) return false;

  for (let i = 0; i < classes.length - 1; i++) {
    const classA = classes[i];
    const slotsA = Array.isArray(classA?.slots) ? classA.slots : [];

    for (let j = i + 1; j < classes.length; j++) {
      const classB = classes[j];
      const slotsB = Array.isArray(classB?.slots) ? classB.slots : [];

      if (anySlotOverlaps(slotsA, slotsB)) {
        return true;
      }
    }
  }

  return false;
}