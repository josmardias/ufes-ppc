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
 *     label: string,          // e.g. "2024/1" — derived from ingress info
 *     offerSemester: 1|2,     // which Year Semester's offer applies here
 *     classes: Class[],
 *   }
 *
 *   Class {
 *     name: string,        // turma identifier, e.g. "06.1 N"
 *     subjectCode: string, // subject code, e.g. "ELE15923"
 *     slots: Slot[],       // schedule entries
 *   }
 *
 *   Slot { dia: string, inicio: "HH:MM", fim: "HH:MM" }
 *
 *   CreditEntry { subjectCode: string, grantPosition: number }
 */

import { hhmmToMinutes } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Returns all codes that can satisfy a given target code — the target itself
 * plus every code listed in equivalencias[target].
 *
 * @param {string} targetCode
 * @param {Object.<string, string[]>} equivalencias
 * @returns {Set<string>}
 */
function equivalentCodes(targetCode, equivalencias) {
  const set = new Set([targetCode]);
  const extras = equivalencias?.[targetCode];
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
 * @param {Object.<string, string[]>} equivalencias
 * @returns {boolean}
 */
function isSatisfied(targetCode, passedCodes, equivalencias) {
  for (const c of equivalentCodes(targetCode, equivalencias)) {
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
      // Credit becomes available after semester k ends (1-based k)
      set.add(entry.subjectCode);
    }
  }

  return set;
}

/**
 * Builds a lookup map from an offer JSON object: subject code → disciplina.
 *
 * @param {object|null} offerJson
 * @returns {Map<string, object>}
 */
function buildOfferMap(offerJson) {
  const map = new Map();
  for (const d of offerJson?.disciplinas ?? []) {
    if (d?.codigo) map.set(d.codigo, d);
  }
  return map;
}

/**
 * Returns true when a turma (from the offer JSON) belongs to the requested shift.
 *
 * Shift rules:
 *   "dia"   — all turmas pass
 *   "manha" — at least one horario starts before 12:00
 *   "tarde" — at least one horario starts at 12:00 or later
 *
 * @param {object} turma  — offer JSON turma object with horarios
 * @param {string} turno  — "dia" | "manha" | "tarde"
 * @returns {boolean}
 */
function offerTurmaMatchesShift(turma, turno) {
  if (!turno || turno === "dia") return true;
  const horarios = turma?.horarios;
  if (!Array.isArray(horarios) || horarios.length === 0) return false;

  const NOON = 12 * 60;
  for (const h of horarios) {
    const mins = hhmmToMinutes(h?.inicio);
    if (mins === null) continue;
    if (turno === "manha" && mins < NOON) return true;
    if (turno === "tarde" && mins >= NOON) return true;
  }
  return false;
}

/**
 * Converts an offer-JSON turma entry into a Class object.
 *
 * @param {object} offerTurma  — { turma: string, horarios: Horario[], docente?: string }
 * @param {string} subjectCode — subject code, e.g. "ELE15923"
 * @returns {Class}
 */
function turmaToClass(offerTurma, subjectCode) {
  return {
    name: String(offerTurma?.turma ?? offerTurma?.codigo ?? "").trim(),
    subjectCode,
    slots: Array.isArray(offerTurma?.horarios) ? offerTurma.horarios : [],
  };
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

  // offerSemester cycles 1→2→1→2… starting from ingressYearSemester (or baseOfferSemester)
  const startSem = ingressYearSemester ?? baseOfferSemester ?? 1;
  const offerSemester = (((startSem - 1) + semesterIndex) % 2) + 1;

  let label = null;
  if (ingressYear != null && ingressYearSemester != null) {
    // Total half-years elapsed since ingress
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
 * Each eligible Subject produces one Class per Offering turma. Two
 * Classes with the same subjectCode represent two candidate Classes for that
 * Subject. Classes are filtered by shift when turno !== "dia".
 *
 * @param {{
 *   semesters:        CurriculumSemester[],
 *   creditEntries:    CreditEntry[],
 *   ppcJson:          object,
 *   offerJson:        object|null,
 *   turno:            string,
 *   ingressYear:      number|null,
 *   ingressYearSemester: 1|2|null,
 *   baseYear:         number,
 *   baseOfferSemester: 1|2,
 *   equivalenciasJson: object,
 * }} opts
 * @returns {{ newSemester: CurriculumSemester, semesterIndex: number, offerSemester: 1|2 }}
 */
export function generateSemester({
  semesters = [],
  creditEntries = [],
  ppcJson,
  offerJson,
  turno = "dia",
  ingressYear = null,
  ingressYearSemester = null,
  baseYear,
  baseOfferSemester,
  equivalenciasJson,
} = {}) {
  const { semesterIndex, offerSemester, label } = inferNextSemester(
    semesters,
    ingressYear,
    ingressYearSemester,
    baseYear,
    baseOfferSemester,
  );

  const equivalencias = equivalenciasJson?.equivalencias ?? {};
  const courses = ppcJson?.courses ?? {};
  const offerMap = buildOfferMap(offerJson);

  // Codes completed in terms strictly before this new semester
  const completedBefore = buildCompletedBefore(semesters, creditEntries, semesterIndex);

  // Codes already planned in any semester (to avoid duplication)
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
      if (!isSatisfied(req, completedBefore, equivalencias)) {
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
      if (!isSatisfied(req, coReqPool, equivalencias)) {
        coreqsOk = false;
        break;
      }
    }
    if (!coreqsOk) continue;

    const offerDisciplina = offerMap.get(code);
    const allTurmas = offerDisciplina?.turmas ?? [];
    const filteredTurmas = allTurmas.filter((t) => offerTurmaMatchesShift(t, turno));

    if (filteredTurmas.length === 0) {
      // Subject has no Offering turmas matching the shift — add a schedule-less Class
      classes.push({ name: "", subjectCode: code, slots: [] });
    } else {
      for (const t of filteredTurmas) {
        classes.push(turmaToClass(t, code));
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
 * Adds a Class to a Curriculum Semester. Duplicates are detected by both
 * subjectCode AND name together — the same Class added twice is a no-op.
 * A second Class for the same Subject but a different turma is appended as
 * a separate entry; the student holds two candidate Classes for that Subject.
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

  if (exists) {
    // Exact duplicate — no-op
    return semester;
  }

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
 * operates on an explicitly provided semesterIndex. Each eligible offer turma
 * becomes one Class entry. Classes already in the target semester are
 * NOT excluded — the caller decides what to do with duplicates.
 *
 * @param {{
 *   semesters:        CurriculumSemester[],
 *   creditEntries:    CreditEntry[],
 *   ppcJson:          object,
 *   offerJson:        object|null,
 *   turno:            string,
 *   semesterIndex:    number,
 *   equivalenciasJson: object,
 * }} opts
 * @returns {Class[]}
 */
export function calcAvailableToAdd({
  semesters = [],
  creditEntries = [],
  ppcJson,
  offerJson,
  turno = "dia",
  semesterIndex,
  equivalenciasJson,
} = {}) {
  const equivalencias = equivalenciasJson?.equivalencias ?? {};
  const courses = ppcJson?.courses ?? {};
  const offerMap = buildOfferMap(offerJson);

  // Codes completed in semesters strictly before semesterIndex
  const completedBefore = buildCompletedBefore(semesters, creditEntries, semesterIndex);

  // Codes already planned in earlier semesters (but NOT in the target semester)
  const alreadyPlanned = new Set();
  for (let i = 0; i < (semesters ?? []).length; i++) {
    if (i === semesterIndex) continue;
    if (i < semesterIndex) {
      // Earlier semesters: these are "done"
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
      if (!isSatisfied(req, completedBefore, equivalencias)) {
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
      if (!isSatisfied(req, coReqPool, equivalencias)) {
        coreqsOk = false;
        break;
      }
    }
    if (!coreqsOk) continue;

    const offerDisciplina = offerMap.get(code);
    const allTurmas = offerDisciplina?.turmas ?? [];
    const filteredTurmas = allTurmas.filter((t) => offerTurmaMatchesShift(t, turno));

    if (filteredTurmas.length === 0) {
      // Subject has no Offering turmas matching the shift — add a schedule-less Class
      result.push({ name: "", subjectCode: code, slots: [] });
    } else {
      for (const t of filteredTurmas) {
        result.push(turmaToClass(t, code));
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
 *   - If one side is null, returns the other (cloned shallowly).
 *   - For each discipline in customOffer:
 *     - If its codigo already exists in systemOffer, its turmas are merged
 *       (union by turma identifier, preferring existing).
 *     - Otherwise, the discipline is appended.
 *
 * @param {object|null} systemOffer
 * @param {object|null} customOffer
 * @returns {object}
 */
export function mergeOffers(systemOffer, customOffer) {
  const empty = { semestre: 0, disciplinas: [] };

  if (!systemOffer && !customOffer) return empty;
  if (!systemOffer) return { ...empty, ...customOffer };
  if (!customOffer) return systemOffer;

  /**
   * Returns the canonical key for an offer turma entry.
   * The offer JSON uses "turma" as the section identifier.
   *
   * @param {object} t
   * @returns {string}
   */
  function turmaKey(t) {
    return String(t?.turma ?? t?.codigo ?? "").trim();
  }

  /**
   * Merges two turma arrays, deduplicating by turma key.
   *
   * @param {object[]} base
   * @param {object[]} incoming
   * @returns {object[]}
   */
  function mergeTurmas(base, incoming) {
    const seen = new Set((base ?? []).map(turmaKey));
    const result = [...(base ?? [])];
    for (const t of incoming ?? []) {
      const k = turmaKey(t);
      if (k && !seen.has(k)) {
        seen.add(k);
        result.push(t);
      }
    }
    return result;
  }

  const disciplinaMap = new Map();
  const disciplinas = [];

  for (const d of systemOffer?.disciplinas ?? []) {
    if (!d?.codigo) continue;
    const clone = { ...d, turmas: [...(d.turmas ?? [])] };
    disciplinaMap.set(d.codigo, clone);
    disciplinas.push(clone);
  }

  for (const d of customOffer?.disciplinas ?? []) {
    if (!d?.codigo) continue;
    if (disciplinaMap.has(d.codigo)) {
      const existing = disciplinaMap.get(d.codigo);
      existing.turmas = mergeTurmas(existing.turmas, d.turmas);
    } else {
      const clone = { ...d, turmas: [...(d.turmas ?? [])] };
      disciplinaMap.set(d.codigo, clone);
      disciplinas.push(clone);
    }
  }

  return { ...systemOffer, disciplinas };
}