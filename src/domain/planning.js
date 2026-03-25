/**
 * src/domain/planning.js
 *
 * Pure domain functions for curriculum planning.
 * No React, no localStorage, no UI — only plain JS logic.
 *
 * Operates on the domain shapes described in DOMAIN.md:
 *
 *   Profile {
 *     name: string,
 *     course: string|null,
 *     ingressYear: number|null,
 *     ingressYearSemester: 1|2|null,
 *     semesters: CurriculumSemester[],
 *     creditEntries: CreditEntry[],
 *     customOffer: { 1: object|null, 2: object|null },
 *   }
 *
 *   CurriculumSemester {
 *     label: string,        // e.g. "2024/1" — derived from ingress info
 *     offerSemester: 1|2,   // which Year Semester's offer applies here
 *     classes: Class[],
 *   }
 *
 *   Class {
 *     name: string,         // section identifier, e.g. "06.1 N"
 *     subjectCode: string,  // subject code, e.g. "ELE15923"
 *     subjectName: string,  // subject display name
 *     slots: Slot[],        // weekly schedule entries
 *   }
 *
 *   Slot { day: string, start: "HH:MM", end: "HH:MM" }
 *
 *   CreditEntry { subjectCode: string, grantPosition: number }
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
 *     id: string,
 *     instructor: string|null,
 *     slots: Slot[],
 *   }
 *
 *   Equivalences { [currentCode: string]: string[] }
 */

import { hhmmToMinutes } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns all codes that can satisfy a given target code — the target itself
 * plus every code listed in equivalences[target].
 *
 * @param {string} targetCode
 * @param {Object.<string, string[]>} equivalences
 * @returns {Set<string>}
 */
function equivalentCodes(targetCode, equivalences) {
  const set = new Set([targetCode]);
  const extras = equivalences?.[targetCode];
  if (Array.isArray(extras)) {
    for (const c of extras) set.add(c);
  }
  return set;
}

/**
 * Returns true when passedCodes contains the target code or any of its
 * equivalents.
 *
 * @param {string} targetCode
 * @param {Set<string>} passedCodes
 * @param {Object.<string, string[]>} equivalences
 * @returns {boolean}
 */
function isSatisfied(targetCode, passedCodes, equivalences) {
  for (const c of equivalentCodes(targetCode, equivalences)) {
    if (passedCodes.has(c)) return true;
  }
  return false;
}

/**
 * Builds the set of subject codes fulfilled by semesters strictly before
 * semesterIndex, plus applicable credit entries.
 *
 * @param {CurriculumSemester[]} semesters
 * @param {CreditEntry[]} creditEntries
 * @param {number} semesterIndex — 0-based index of the semester being evaluated
 * @returns {Set<string>}
 */
function buildCompletedBefore(semesters, creditEntries, semesterIndex) {
  const set = new Set();

  for (let i = 0; i < semesterIndex && i < (semesters ?? []).length; i++) {
    for (const cls of semesters[i].classes ?? []) {
      if (cls?.subjectCode) set.add(cls.subjectCode);
    }
  }

  for (const entry of creditEntries ?? []) {
    const k = entry.grantPosition;
    if (k === 0) {
      set.add(entry.subjectCode);
    } else if (semesterIndex >= k) {
      set.add(entry.subjectCode);
    }
  }

  return set;
}

/**
 * Builds a lookup map from an offer object: subject code → Subject.
 *
 * @param {object|null} offer
 * @returns {Map<string, object>}
 */
function buildOfferMap(offer) {
  const map = new Map();
  for (const subject of offer?.subjects ?? []) {
    if (subject?.code) map.set(subject.code, subject);
  }
  return map;
}

/**
 * Returns true when an offer class belongs to the requested shift.
 *
 * Shift rules:
 *   "dia"   — all classes pass
 *   "manha" — at least one slot starts before 12:00
 *   "tarde" — at least one slot starts at 12:00 or later
 *
 * @param {object} offerClass — OfferClass with slots
 * @param {string} shift      — "dia" | "manha" | "tarde"
 * @returns {boolean}
 */
function offerClassMatchesShift(offerClass, shift) {
  if (!shift || shift === "dia") return true;
  const slots = offerClass?.slots;
  if (!Array.isArray(slots) || slots.length === 0) return false;

  const NOON = 12 * 60;
  for (const slot of slots) {
    const mins = hhmmToMinutes(slot?.start);
    if (mins === null) continue;
    if (shift === "manha" && mins < NOON) return true;
    if (shift === "tarde" && mins >= NOON) return true;
  }
  return false;
}

// ---------------------------------------------------------------------------
// inferNextSemester
// ---------------------------------------------------------------------------

/**
 * Infers the index and Year Semester label for the next CurriculumSemester.
 *
 * Returns:
 *   semesterIndex  — 0-based index of the new semester in the semesters array
 *   offerSemester  — 1 or 2: which Year Semester's offer to use
 *   label          — e.g. "2025/1" if ingress info is available, else null
 *
 * @param {CurriculumSemester[]} semesters — existing semesters
 * @param {number|null} ingressYear        — e.g. 2024
 * @param {1|2|null} ingressYearSemester   — 1 or 2
 * @param {number} baseYear                — fallback year when ingress unknown
 * @param {1|2} baseOfferSemester          — fallback offer semester
 * @returns {{ semesterIndex: number, offerSemester: 1|2, label: string|null }}
 */
export function inferNextSemester(
  semesters,
  ingressYear,
  ingressYearSemester,
  baseYear,
  baseOfferSemester,
) {
  const semesterIndex = (semesters ?? []).length;

  const startSem = ingressYearSemester ?? baseOfferSemester ?? 1;
  const offerSemester = (((startSem - 1) + semesterIndex) % 2) + 1;

  let label = null;
  if (ingressYear != null && ingressYearSemester != null) {
    const totalHalfYears = (ingressYearSemester - 1) + semesterIndex;
    const year = ingressYear + Math.floor(totalHalfYears / 2);
    const sem = (totalHalfYears % 2) + 1;
    label = `${year}/${sem}`;
  }

  return { semesterIndex, offerSemester, label };
}

// ---------------------------------------------------------------------------
// generateSemester
// ---------------------------------------------------------------------------

/**
 * Generates the Classes for the next CurriculumSemester.
 *
 * Each eligible Subject produces one Class per OfferClass. Two Classes with
 * the same subjectCode represent two candidate Classes for that Subject.
 * Classes are filtered by shift when shift !== "dia".
 *
 * @param {{
 *   semesters:            CurriculumSemester[],
 *   creditEntries:        CreditEntry[],
 *   ppcJson:              object,
 *   offer:                object|null,
 *   shift:                string,
 *   ingressYear:          number|null,
 *   ingressYearSemester:  1|2|null,
 *   baseYear:             number,
 *   baseOfferSemester:    1|2,
 *   equivalences:         object,
 * }} opts
 * @returns {{ newSemester: CurriculumSemester, semesterIndex: number, offerSemester: 1|2 }}
 */
export function generateSemester({
  semesters = [],
  creditEntries = [],
  ppcJson,
  offer,
  shift = "dia",
  ingressYear = null,
  ingressYearSemester = null,
  baseYear,
  baseOfferSemester,
  equivalences,
} = {}) {
  const { semesterIndex, offerSemester, label } = inferNextSemester(
    semesters,
    ingressYear,
    ingressYearSemester,
    baseYear,
    baseOfferSemester,
  );

  const equiv = equivalences ?? {};
  const courses = ppcJson?.courses ?? {};
  const offerMap = buildOfferMap(offer);

  const completedBefore = buildCompletedBefore(semesters, creditEntries, semesterIndex);

  const alreadyPlanned = new Set();
  for (const sem of semesters) {
    for (const cls of sem.classes ?? []) {
      if (cls?.subjectCode) alreadyPlanned.add(cls.subjectCode);
    }
  }

  // First pass: collect courses with satisfied prerequisites
  const candidateCodes = new Set();
  for (const code of Object.keys(courses)) {
    const course = courses[code];
    if (!course) continue;
    if (alreadyPlanned.has(code)) continue;
    if (completedBefore.has(code)) continue;

    let prereqsOk = true;
    for (const req of course.prereq ?? []) {
      if (!isSatisfied(req, completedBefore, equiv)) {
        prereqsOk = false;
        break;
      }
    }
    if (prereqsOk) candidateCodes.add(code);
  }

  // Second pass: filter by co-requisites using the full candidate set
  const classes = [];
  for (const code of candidateCodes) {
    const course = courses[code];
    if (!course) continue;

    const coReqPool = new Set([...completedBefore, ...candidateCodes]);
    let coreqsOk = true;
    for (const req of course.coreq ?? []) {
      if (!isSatisfied(req, coReqPool, equiv)) {
        coreqsOk = false;
        break;
      }
    }
    if (!coreqsOk) continue;

    const offerSubject = offerMap.get(code);
    if (!offerSubject) continue; // skip subjects not present in the offer

    const subjectName = offerSubject.name ?? course?.name ?? "";
    const allOfferClasses = offerSubject?.classes ?? [];
    const filteredOfferClasses = allOfferClasses.filter((c) => offerClassMatchesShift(c, shift));

    if (filteredOfferClasses.length === 0) {
      // Subject is in the offer but no class matches the requested shift —
      // keep as a placeholder so the user can still see and select it.
      classes.push({ name: "", subjectCode: code, subjectName, slots: [] });
    } else {
      for (const offerClass of filteredOfferClasses) {
        classes.push({
          name: String(offerClass?.id ?? "").trim(),
          subjectCode: code,
          subjectName,
          slots: Array.isArray(offerClass?.slots) ? offerClass.slots : [],
        });
      }
    }
  }

  const newSemester = {
    label: label ?? `${semesterIndex + 1}`,
    offerSemester,
    classes,
  };

  return { newSemester, semesterIndex, offerSemester };
}

// ---------------------------------------------------------------------------
// addSemester
// ---------------------------------------------------------------------------

/**
 * Appends a new CurriculumSemester to the profile's semesters array.
 * Returns a new semesters array — does not mutate the input.
 *
 * @param {CurriculumSemester[]} semesters
 * @param {CurriculumSemester} newSemester
 * @returns {CurriculumSemester[]}
 */
export function addSemester(semesters, newSemester) {
  return [...(semesters ?? []), newSemester];
}

// ---------------------------------------------------------------------------
// removeSemester
// ---------------------------------------------------------------------------

/**
 * Removes the CurriculumSemester at the given 0-based index.
 * Returns a new semesters array — does not mutate the input.
 *
 * @param {CurriculumSemester[]} semesters
 * @param {number} semesterIndex
 * @returns {CurriculumSemester[]}
 */
export function removeSemester(semesters, semesterIndex) {
  return (semesters ?? []).filter((_, i) => i !== semesterIndex);
}

// ---------------------------------------------------------------------------
// replaceSemester
// ---------------------------------------------------------------------------

/**
 * Replaces the CurriculumSemester at the given 0-based index with a new one.
 * Returns a new semesters array — does not mutate the input.
 *
 * @param {CurriculumSemester[]} semesters
 * @param {number} semesterIndex
 * @param {CurriculumSemester} updatedSemester
 * @returns {CurriculumSemester[]}
 */
export function replaceSemester(semesters, semesterIndex, updatedSemester) {
  return (semesters ?? []).map((s, i) => (i === semesterIndex ? updatedSemester : s));
}

// ---------------------------------------------------------------------------
// addClass
// ---------------------------------------------------------------------------

/**
 * Adds a Class to a CurriculumSemester. Duplicates are detected by both
 * subjectCode AND name together — the same Class added twice is a no-op.
 * A second Class for the same Subject but a different section is appended as
 * a separate entry.
 * Returns a new CurriculumSemester — does not mutate the input.
 *
 * @param {CurriculumSemester} semester
 * @param {Class} newClass
 * @returns {CurriculumSemester}
 */
export function addClass(semester, newClass) {
  const key = `${newClass.subjectCode}::${newClass.name}`;
  const exists = (semester.classes ?? []).some(
    (c) => `${c.subjectCode}::${c.name}` === key,
  );

  if (exists) return semester;

  return {
    ...semester,
    classes: [...(semester.classes ?? []), newClass],
  };
}

// ---------------------------------------------------------------------------
// removeClass
// ---------------------------------------------------------------------------

/**
 * Removes all Classes with the given subjectCode from a CurriculumSemester.
 * Returns a new CurriculumSemester — does not mutate the input.
 *
 * @param {CurriculumSemester} semester
 * @param {string} subjectCode
 * @returns {CurriculumSemester}
 */
export function removeClass(semester, subjectCode) {
  return {
    ...semester,
    classes: (semester.classes ?? []).filter((c) => c.subjectCode !== subjectCode),
  };
}

// ---------------------------------------------------------------------------
// calcAvailableToAdd
// ---------------------------------------------------------------------------

/**
 * Returns the Classes eligible to be added to a specific CurriculumSemester.
 *
 * Eligibility uses the same prereq/coreq rules as generateSemester, but
 * operates on an explicitly provided semesterIndex. Each eligible OfferClass
 * becomes one Class entry. Classes already in earlier semesters are excluded.
 *
 * @param {{
 *   semesters:         CurriculumSemester[],
 *   creditEntries:     CreditEntry[],
 *   ppcJson:           object,
 *   offer:             object|null,
 *   shift:             string,
 *   semesterIndex:     number,
 *   equivalences:      object,
 * }} opts
 * @returns {Class[]}
 */
export function calcAvailableToAdd({
  semesters = [],
  creditEntries = [],
  ppcJson,
  offer,
  shift = "dia",
  semesterIndex,
  equivalences,
} = {}) {
  const equiv = equivalences ?? {};
  const courses = ppcJson?.courses ?? {};
  const offerMap = buildOfferMap(offer);

  const completedBefore = buildCompletedBefore(semesters, creditEntries, semesterIndex);

  const alreadyPlanned = new Set();
  for (let i = 0; i < (semesters ?? []).length; i++) {
    if (i === semesterIndex) continue;
    if (i < semesterIndex) {
      for (const cls of semesters[i].classes ?? []) {
        if (cls?.subjectCode) alreadyPlanned.add(cls.subjectCode);
      }
    }
  }

  // First pass: candidates with satisfied prerequisites
  const candidateCodes = new Set();
  for (const code of Object.keys(courses)) {
    const course = courses[code];
    if (!course) continue;
    if (alreadyPlanned.has(code)) continue;
    if (completedBefore.has(code)) continue;

    let prereqsOk = true;
    for (const req of course.prereq ?? []) {
      if (!isSatisfied(req, completedBefore, equiv)) {
        prereqsOk = false;
        break;
      }
    }
    if (prereqsOk) candidateCodes.add(code);
  }

  const result = [];
  for (const code of candidateCodes) {
    const course = courses[code];
    if (!course) continue;

    const coReqPool = new Set([...completedBefore, ...candidateCodes]);
    let coreqsOk = true;
    for (const req of course.coreq ?? []) {
      if (!isSatisfied(req, coReqPool, equiv)) {
        coreqsOk = false;
        break;
      }
    }
    if (!coreqsOk) continue;

    const offerSubject = offerMap.get(code);
    if (!offerSubject) continue; // skip subjects not present in the offer

    const subjectName = offerSubject.name ?? course?.name ?? "";
    const allOfferClasses = offerSubject?.classes ?? [];
    const filteredOfferClasses = allOfferClasses.filter((c) => offerClassMatchesShift(c, shift));

    if (filteredOfferClasses.length === 0) {
      // Subject is in the offer but no class matches the requested shift —
      // keep as a placeholder so the user can still see and select it.
      result.push({ name: "", subjectCode: code, subjectName, slots: [] });
    } else {
      for (const offerClass of filteredOfferClasses) {
        result.push({
          name: String(offerClass?.id ?? "").trim(),
          subjectCode: code,
          subjectName,
          slots: Array.isArray(offerClass?.slots) ? offerClass.slots : [],
        });
      }
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// mergeOffers
// ---------------------------------------------------------------------------

/**
 * Overlays a custom offer on top of the system offer.
 *
 * Rules:
 *   - If both are null/undefined, returns a default empty offer shape.
 *   - If one side is null, returns the other.
 *   - For each subject in customOffer:
 *     - If its code already exists in systemOffer, its classes are merged
 *       (union by id, preferring existing).
 *     - Otherwise, the subject is appended.
 *
 * @param {object|null} systemOffer
 * @param {object|null} customOffer
 * @returns {object}
 */
export function mergeOffers(systemOffer, customOffer) {
  const empty = { semester: 0, subjects: [] };

  if (!systemOffer && !customOffer) return empty;
  if (!systemOffer) return { ...empty, ...customOffer };
  if (!customOffer) return systemOffer;

  function classKey(c) {
    return String(c?.id ?? "").trim();
  }

  function mergeClasses(base, incoming) {
    const seen = new Set((base ?? []).map(classKey));
    const result = [...(base ?? [])];
    for (const c of incoming ?? []) {
      const k = classKey(c);
      if (k && !seen.has(k)) {
        seen.add(k);
        result.push(c);
      }
    }
    return result;
  }

  const subjectMap = new Map();
  const subjects = [];

  for (const s of systemOffer?.subjects ?? []) {
    if (!s?.code) continue;
    const clone = { ...s, classes: [...(s.classes ?? [])] };
    subjectMap.set(s.code, clone);
    subjects.push(clone);
  }

  for (const s of customOffer?.subjects ?? []) {
    if (!s?.code) continue;
    if (subjectMap.has(s.code)) {
      const existing = subjectMap.get(s.code);
      existing.classes = mergeClasses(existing.classes, s.classes);
    } else {
      const clone = { ...s, classes: [...(s.classes ?? [])] };
      subjectMap.set(s.code, clone);
      subjects.push(clone);
    }
  }

  return { ...systemOffer, subjects };
}