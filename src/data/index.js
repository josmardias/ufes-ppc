/**
 * src/data/index.js
 *
 * Central data access module for the UFES course planner.
 *
 * Responsibilities:
 *   1. Import and re-export the PPC and equivalences JSON files under the
 *      field names expected by the domain layer.
 *   2. Load all per-department offer files, adapt their shape to the internal
 *      Offer shape used by domain/planning.js and domain/offer.js, and
 *      merge them into two combined semester offers (semester 1 and semester 2).
 *
 * Offer shape:
 *   {
 *     semester: 1|2,
 *     subjects: Array<{
 *       code: string,
 *       name: string,
 *       creditHours: number|null,
 *       classes: Array<{
 *         id: string,
 *         instructor: string|null,
 *         slots: Array<{ day: string, start: string, end: string }>,
 *       }>,
 *     }>,
 *   }
 *
 * Source offer shape (what the build scripts produce):
 *   {
 *     year: number,
 *     semester: 1|2,
 *     source_pdf: string,
 *     generated_at: string,
 *     subjects: Array<{
 *       code: string,
 *       name: string,
 *       credit_hours: number,
 *       classes: Array<{
 *         id: string,
 *         targetCourseCode: string,
 *         targetCourseName: string,
 *         instructor: string|null,
 *         schedules: Array<{ day: string, start: string, end: string }>,
 *       }>,
 *     }>,
 *   }
 */

// ---------------------------------------------------------------------------
// PPC and equivalences
// ---------------------------------------------------------------------------

import ppcRaw from "./ppc-eletrica-2022.json";
import equivalencesRaw from "./ppc-eletrica-2022-equivalences.json";

/**
 * The PPC (Projeto Pedagógico de Curso) for Engenharia Elétrica 2022.
 * Shape: { version, courses: { [code]: { code, name, suggestedSemester, prereq[], coreq[] } } }
 */
export const ppcJson = ppcRaw;

/**
 * Equivalences map: { [currentCode]: string[] }
 * Maps each current subject code to the legacy codes that satisfy it.
 */
export const equivalences = equivalencesRaw.equivalences ?? {};

// ---------------------------------------------------------------------------
// Shape adapter
// ---------------------------------------------------------------------------

/**
 * Adapts a full source offer file into the internal Offer shape.
 * Strips fields irrelevant to the domain (targetCourseCode, targetCourseName).
 *
 * @param {{ semester: number, subjects: object[] }} raw
 * @returns {{ semester: number, subjects: object[] }}
 */
function adaptOffer(raw) {
  return {
    semester: raw.semester,
    subjects: (raw.subjects ?? []).map((subject) => ({
      code: String(subject.code ?? "").trim(),
      name: String(subject.name ?? "").trim(),
      creditHours: subject.credit_hours ?? null,
      classes: (subject.classes ?? []).map((cls) => ({
        id: String(cls.id ?? "").trim(),
        instructor: cls.instructor ?? null,
        slots: (cls.schedules ?? []).map((s) => ({
          day: s.day,
          start: s.start,
          end: s.end,
        })),
      })),
    })),
  };
}

// ---------------------------------------------------------------------------
// Department offer imports — semester 2 2025
// ---------------------------------------------------------------------------

import ofertaAmbiental2025s2 from "./oferta-departamento-ambiental-2025-2.json";
import ofertaEletrica2025s2 from "./oferta-departamento-eletrica-2025-2.json";
import ofertaEstatistica2025s2 from "./oferta-departamento-estatistica-2025-2.json";
import ofertaFisica2025s2 from "./oferta-departamento-fisica-2025-2.json";
import ofertaInformatica2025s2 from "./oferta-departamento-informatica-2025-2.json";
import ofertaMatematica2025s2 from "./oferta-departamento-matematica-2025-2.json";
import ofertaProducao2025s2 from "./oferta-departamento-producao-2025-2.json";

// ---------------------------------------------------------------------------
// Department offer imports — semester 1 2026
// ---------------------------------------------------------------------------

import ofertaAmbiental2026s1 from "./oferta-departamento-ambiental-2026-1.json";
import ofertaEletrica2026s1 from "./oferta-departamento-eletrica-2026-1.json";
import ofertaEstatistica2026s1 from "./oferta-departamento-estatistica-2026-1.json";
import ofertaFisica2026s1 from "./oferta-departamento-fisica-2026-1.json";
import ofertaInformatica2026s1 from "./oferta-departamento-informatica-2026-1.json";
import ofertaMatematica2026s1 from "./oferta-departamento-matematica-2026-1.json";
import ofertaProducao2026s1 from "./oferta-departamento-producao-2026-1.json";
import ofertaQuimica2026s1 from "./oferta-departamento-quimica-2026-1.json";

// ---------------------------------------------------------------------------
// Merge helper
// ---------------------------------------------------------------------------

/**
 * Merges an array of adapted Offer objects (all with the same semester) into a
 * single Offer. Subjects are deduplicated by code; classes are merged by id.
 *
 * @param {number} semester — 1 or 2
 * @param {object[]} offers — adapted offer objects
 * @returns {{ semester: number, subjects: object[] }}
 */
function mergeAdaptedOffers(semester, offers) {
  /** @type {Map<string, { code, name, creditHours, classes: object[] }>} */
  const subjectMap = new Map();

  for (const offer of offers) {
    for (const subject of offer.subjects ?? []) {
      if (!subject.code) continue;

      if (!subjectMap.has(subject.code)) {
        subjectMap.set(subject.code, {
          code: subject.code,
          name: subject.name,
          creditHours: subject.creditHours,
          classes: [],
        });
      }

      const existing = subjectMap.get(subject.code);
      const seenIds = new Set(existing.classes.map((c) => c.id));

      for (const cls of subject.classes ?? []) {
        if (!seenIds.has(cls.id)) {
          seenIds.add(cls.id);
          existing.classes.push(cls);
        }
      }
    }
  }

  return {
    semester,
    subjects: Array.from(subjectMap.values()),
  };
}

// ---------------------------------------------------------------------------
// Combined offers
// ---------------------------------------------------------------------------

/**
 * All department offers for semester 2 (2025), merged into one Offer object.
 */
export const offer2Json = mergeAdaptedOffers(2, [
  adaptOffer(ofertaAmbiental2025s2),
  adaptOffer(ofertaEletrica2025s2),
  adaptOffer(ofertaEstatistica2025s2),
  adaptOffer(ofertaFisica2025s2),
  adaptOffer(ofertaInformatica2025s2),
  adaptOffer(ofertaMatematica2025s2),
  adaptOffer(ofertaProducao2025s2),
]);

/**
 * All department offers for semester 1 (2026), merged into one Offer object.
 */
export const offer1Json = mergeAdaptedOffers(1, [
  adaptOffer(ofertaAmbiental2026s1),
  adaptOffer(ofertaEletrica2026s1),
  adaptOffer(ofertaEstatistica2026s1),
  adaptOffer(ofertaFisica2026s1),
  adaptOffer(ofertaInformatica2026s1),
  adaptOffer(ofertaMatematica2026s1),
  adaptOffer(ofertaProducao2026s1),
  adaptOffer(ofertaQuimica2026s1),
]);