/**
 * src/domain/offer.js
 *
 * Pure domain functions for offer manipulation and class grouping.
 * No React, no localStorage, no UI — only plain JS logic.
 *
 * Operates on the Offer shape used throughout the app:
 *
 *   Offer {
 *     semestre: 1|2,
 *     disciplinas: Disciplina[],
 *   }
 *
 *   Disciplina {
 *     semestre: 1|2,
 *     periodo: string,
 *     codigo: string,
 *     nome: string,
 *     carga_horaria: number|null,
 *     turmas: Turma[],
 *   }
 *
 *   Turma {
 *     turma: string,         // section identifier, e.g. "06.1 N"
 *     horarios: Slot[],
 *     docente?: string,
 *   }
 *
 *   Slot { dia: string, inicio: "HH:MM", fim: "HH:MM" }
 *
 *   Class {
 *     name: string,        // turma identifier
 *     subjectCode: string,
 *     slots: Slot[],
 *     nome?: string,
 *   }
 *
 *   SubjectGroup {
 *     subjectCode: string,
 *     nome: string,
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
 * @param {1|2} semestre
 * @returns {{ semestre: 1|2, disciplinas: [] }}
 */
export function emptyOffer(semestre) {
  return { semestre, disciplinas: [] };
}

/**
 * Normalises a raw offer value into a well-formed Offer object.
 * Returns an empty offer when the input is absent or malformed.
 *
 * @param {unknown} raw
 * @param {1|2} semestre
 * @returns {{ semestre: 1|2, disciplinas: object[] }}
 */
export function normalizeOffer(raw, semestre) {
  if (!raw || !Array.isArray(raw.disciplinas)) return emptyOffer(semestre);
  return raw;
}

// ---------------------------------------------------------------------------
// Custom offer mutation
// ---------------------------------------------------------------------------

/**
 * Inserts or updates a section inside a custom offer object, creating the
 * discipline entry if it does not exist yet. Returns the updated offer object
 * without mutating the original.
 *
 * If the section's turma code already exists for that discipline, new horarios
 * are appended (deduped by dia+inicio+fim). Otherwise the full section is
 * appended as a new turma.
 *
 * @param {object|null} currentOffer  — existing custom offer for the semester (may be null)
 * @param {1|2}         semestre      — 1 or 2
 * @param {string}      courseCode    — subject code, e.g. "ELE15940"
 * @param {{ turma: string, horarios: object[], docente?: string }} section
 * @param {string}      [courseName]  — display name for the discipline
 * @returns {object} Updated offer with the same shape as a system offer JSON.
 */
export function upsertCustomSection(
  currentOffer,
  semestre,
  courseCode,
  section,
  courseName = "",
) {
  const current = normalizeOffer(currentOffer, semestre);
  const existing = current.disciplinas.find((d) => d.codigo === courseCode);

  let newDisciplinas;

  if (existing) {
    const alreadyHas = existing.turmas.some(
      (t) => (t.turma ?? t.codigo) === section.turma,
    );

    newDisciplinas = current.disciplinas.map((d) => {
      if (d.codigo !== courseCode) return d;

      const updatedTurmas = alreadyHas
        ? // Section exists — append new horarios (dedup by dia+inicio+fim)
          d.turmas.map((t) => {
            if ((t.turma ?? t.codigo) !== section.turma) return t;
            const existingKeys = new Set(
              (t.horarios ?? []).map((h) => `${h.dia}|${h.inicio}|${h.fim}`),
            );
            const newHorarios = (section.horarios ?? []).filter(
              (h) => !existingKeys.has(`${h.dia}|${h.inicio}|${h.fim}`),
            );
            return { ...t, horarios: [...(t.horarios ?? []), ...newHorarios] };
          })
        : [...d.turmas, section];

      return {
        ...d,
        nome: d.nome && d.nome !== courseCode ? d.nome : courseName || d.nome,
        turmas: updatedTurmas,
      };
    });
  } else {
    newDisciplinas = [
      ...current.disciplinas,
      {
        semestre,
        periodo: "",
        codigo: courseCode,
        nome: courseName || courseCode,
        carga_horaria: null,
        turmas: [section],
      },
    ];
  }

  return { ...current, semestre, disciplinas: newDisciplinas };
}

// ---------------------------------------------------------------------------
// Class grouping
// ---------------------------------------------------------------------------

/**
 * Groups an array of Class objects by subjectCode, returning one SubjectGroup
 * per unique subjectCode. The order of groups follows the first occurrence of
 * each subjectCode in the input array.
 *
 * @param {Array<{ subjectCode: string, nome?: string, [key: string]: unknown }>} classes
 * @returns {Array<{ subjectCode: string, nome: string, classes: object[] }>}
 */
export function groupClassesBySubject(classes) {
  const map = new Map();
  for (const cls of Array.isArray(classes) ? classes : []) {
    const code = cls.subjectCode;
    if (!map.has(code)) {
      map.set(code, { subjectCode: code, nome: cls.nome ?? "", classes: [] });
    }
    map.get(code).classes.push(cls);
  }
  return Array.from(map.values());
}

// ---------------------------------------------------------------------------
// Shift filtering
// ---------------------------------------------------------------------------

/**
 * Returns true when the given Class has at least one slot that falls within
 * the requested shift, or when the shift is "dia" (all-day — no filter).
 *
 * Shift rules:
 *   "dia"   — always true
 *   "manha" — slot inicio before 13:00
 *   "tarde" — slot inicio at or after 13:00
 *
 * @param {{ slots: Array<{ inicio: string }> }} cls
 * @param {"dia"|"manha"|"tarde"|string} shift
 * @returns {boolean}
 */
export function classMatchesShift(cls, shift) {
  if (shift === "dia") return true;
  return (cls.slots ?? []).some((h) => {
    const mins =
      parseInt(String(h.inicio ?? "").split(":")[0] ?? "0", 10) * 60;
    return shift === "manha" ? mins < AFTERNOON_CUTOFF_MIN : mins >= AFTERNOON_CUTOFF_MIN;
  });
}