/**
 * src/domain/offer.js
 *
 * Pure domain functions for offer manipulation and class grouping.
 * No React, no localStorage, no UI — only plain JS logic.
 *
 * Operates on the Offer shape used throughout the app:
 *
 *   Offer {
 *     semester: 1|2,
 *     subjects: Subject[],
 *   }
 *
 *   Subject {
 *     code: string,
 *     name: string,
 *     creditHours: number|null,
 *     classes: OfferClass[],
 *   }
 *
 *   OfferClass {
 *     id: string,          // section identifier, e.g. "06.1 N"
 *     instructor: string|null,
 *     slots: Slot[],
 *   }
 *
 *   Slot { day: string, start: "HH:MM", end: "HH:MM" }
 *
 *   Class {
 *     name: string,        // section identifier (from OfferClass.id)
 *     subjectCode: string,
 *     subjectName: string,
 *     slots: Slot[],
 *   }
 *
 *   SubjectGroup {
 *     subjectCode: string,
 *     subjectName: string,
 *     classes: Class[],
 *   }
 */

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

/** Start-of-afternoon cutoff in minutes (13:00). */
const AFTERNOON_CUTOFF_MIN = 13 * 60;

// ---------------------------------------------------------------------------
// Offer normalisation
// ---------------------------------------------------------------------------

/**
 * Returns an empty Offer object for the given semester.
 *
 * @param {1|2} semester
 * @returns {{ semester: 1|2, subjects: [] }}
 */
export function emptyOffer(semester) {
  return { semester, subjects: [] };
}

/**
 * Normalises a raw offer value into a well-formed Offer object.
 * Returns an empty offer when the input is absent or malformed.
 *
 * @param {unknown} raw
 * @param {1|2} semester
 * @returns {{ semester: 1|2, subjects: object[] }}
 */
export function normalizeOffer(raw, semester) {
  if (!raw || !Array.isArray(raw.subjects)) return emptyOffer(semester);
  return raw;
}

// ---------------------------------------------------------------------------
// Custom offer mutation
// ---------------------------------------------------------------------------

/**
 * Inserts or updates a section inside a custom offer object, creating the
 * subject entry if it does not exist yet. Returns the updated offer object
 * without mutating the original.
 *
 * If the section id already exists for that subject, new slots are appended
 * (deduped by day+start+end). Otherwise the full section is appended as a
 * new class.
 *
 * @param {object|null} currentOffer  — existing custom offer for the semester (may be null)
 * @param {1|2}         semester      — 1 or 2
 * @param {string}      subjectCode   — subject code, e.g. "ELE15940"
 * @param {{ id: string, slots: object[], instructor?: string }} section
 * @param {string}      [subjectName] — display name for the subject
 * @returns {object} Updated offer with the same shape as a system offer object.
 */
export function upsertCustomSection(
  currentOffer,
  semester,
  subjectCode,
  section,
  subjectName = "",
) {
  const current = normalizeOffer(currentOffer, semester);
  const existing = current.subjects.find((s) => s.code === subjectCode);

  let newSubjects;

  if (existing) {
    const alreadyHas = existing.classes.some((c) => c.id === section.id);

    newSubjects = current.subjects.map((s) => {
      if (s.code !== subjectCode) return s;

      const updatedClasses = alreadyHas
        ? // Section exists — append new slots (dedup by day+start+end)
          s.classes.map((c) => {
            if (c.id !== section.id) return c;
            const existingKeys = new Set(
              (c.slots ?? []).map((sl) => `${sl.day}|${sl.start}|${sl.end}`),
            );
            const newSlots = (section.slots ?? []).filter(
              (sl) => !existingKeys.has(`${sl.day}|${sl.start}|${sl.end}`),
            );
            return { ...c, slots: [...(c.slots ?? []), ...newSlots] };
          })
        : [...s.classes, section];

      return {
        ...s,
        name: s.name && s.name !== subjectCode ? s.name : subjectName || s.name,
        classes: updatedClasses,
      };
    });
  } else {
    newSubjects = [
      ...current.subjects,
      {
        code: subjectCode,
        name: subjectName || subjectCode,
        creditHours: null,
        classes: [section],
      },
    ];
  }

  return { ...current, semester, subjects: newSubjects };
}

// ---------------------------------------------------------------------------
// Class grouping
// ---------------------------------------------------------------------------

/**
 * Groups an array of Section objects by subjectCode, returning one SubjectGroup
 * per unique subjectCode. The order of groups follows the first occurrence of
 * each subjectCode in the input array.
 *
 * @param {Array<{ subjectCode: string, subjectName?: string, [key: string]: unknown }>} sections
 * @returns {Array<{ subjectCode: string, subjectName: string, sections: object[] }>}
 */
export function groupSectionsBySubject(sections) {
  const map = new Map();
  for (const sec of Array.isArray(sections) ? sections : []) {
    const code = sec.subjectCode;
    if (!map.has(code)) {
      map.set(code, { subjectCode: code, subjectName: sec.subjectName ?? "", sections: [] });
    }
    map.get(code).sections.push(sec);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Shift filtering
// ---------------------------------------------------------------------------

/**
 * Returns true when the given Section has at least one slot that falls within
 * the requested shift, or when the shift is "dia" (all-day — no filter).
 *
 * Shift rules:
 *   "dia"   — always true
 *   "manha" — slot start before 13:00
 *   "tarde" — slot start at or after 13:00
 *
 * @param {{ slots: Array<{ start: string }> }} sec
 * @param {"dia"|"manha"|"tarde"|string} shift
 * @returns {boolean}
 */
export function sectionMatchesShift(sec, shift) {
  if (shift === "dia") return true;
  return (sec.slots ?? []).some((slot) => {
    const mins =
      parseInt(String(slot.start ?? "").split(":")[0] ?? "0", 10) * 60;
    return shift === "manha" ? mins < AFTERNOON_CUTOFF_MIN : mins >= AFTERNOON_CUTOFF_MIN;
  });
}