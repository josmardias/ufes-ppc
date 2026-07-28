// localStorage read/write and schema migrations (see docs/ARCHITECTURE.md,
// "src/storage" and "Persistence"). This is the only module allowed to call
// `localStorage`; it is called only by src/store.

import { getOfferings, getPpc } from '../data/index.js';
import { semesterPosition } from '../domain/semester.js';

export const STORAGE_KEY = 'ufes-ppc:envelope';

/** Bumped on breaking shape changes; see the `migrations` map below. */
export const CURRENT_SCHEMA_VERSION = 4;

/** @returns {import('../domain/types.js').Envelope} */
export function defaultEnvelope() {
  return {
    schemaVersion: CURRENT_SCHEMA_VERSION,
    activeProfileId: null,
    profiles: [],
  };
}

/**
 * Adds `ProfileRecord.courseId` (see docs/ARCHITECTURE.md, `ProfileRecord`):
 * the official UFES course code, derived from the PPC dataset referenced by
 * `ppcId` (null while `ppcId` is null, or if it no longer resolves).
 */
function migrateV1toV2(envelope) {
  return {
    ...envelope,
    schemaVersion: 2,
    profiles: envelope.profiles.map((profile) => ({
      ...profile,
      courseId: profile.ppcId
        ? (getPpc(profile.ppcId)?.courseId ?? null)
        : null,
    })),
  };
}

/**
 * Adds `ProfileRecord.completedSemesters` and `ProfileRecord.hiddenSubjects`
 * (see docs/ARCHITECTURE.md, `ProfileRecord`), and backfills `ppcId`/
 * `courseId` for profiles created before the PPC moved to profile creation
 * (UC-02), where both fields could still be null.
 *
 * The backfilled ids are HARDCODED, not looked up from the dataset registry
 * (`getPpc`) — see docs/ARCHITECTURE.md, "Migrations": a migration must be
 * deterministic forever, since a browser may hold years-old data, and a
 * later dataset addition must never change what an old migration produces.
 * `engenharia-eletrica-2022` was the only PPC in the registry when this
 * migration was authored. Do NOT replace this with a registry lookup.
 */
function migrateV2toV3(envelope) {
  return {
    ...envelope,
    schemaVersion: 3,
    profiles: envelope.profiles.map((profile) => ({
      ...profile,
      ppcId: profile.ppcId ?? 'engenharia-eletrica-2022',
      courseId: profile.ppcId ? profile.courseId : '06',
      // Existing plans already start their Planned Semesters at position 1.
      completedSemesters: 0,
      hiddenSubjects: [],
    })),
  };
}

/**
 * Backfills the embedded planning copy (`sessions`, `targetCourseId`/
 * `targetCourseName` — see docs/ARCHITECTURE.md, `ProfileRecord`) onto
 * planned offering Sections created before copies existed. A Section is
 * left untouched if it already carries a copy (`sessions != null`).
 *
 * This is the **one documented exception** to the migration-determinism
 * rule (see docs/ARCHITECTURE.md, Migrations): it reads the CURRENT
 * Offerings snapshot, deliberately — accepted because the user base at the
 * time was small and directly reachable. A Section that does not resolve
 * gets an empty copy (no sessions, no target course) and simply surfaces as
 * an Offering Mismatch (see docs/DOMAIN.md), which is the truth.
 */
function migrateV3toV4(envelope) {
  return {
    ...envelope,
    schemaVersion: 4,
    profiles: envelope.profiles.map((profile) => ({
      ...profile,
      semesters: profile.semesters.map((semester, index) => {
        const { yearSemester } = semesterPosition(
          profile.ingressYear,
          profile.ingressYearSemester,
          index,
          profile.completedSemesters,
        );
        const offerings = getOfferings(profile.ppcId, yearSemester);
        return {
          ...semester,
          sections: semester.sections.map((section) => {
            if (section.kind !== 'offering' || section.sessions != null) {
              return section;
            }
            const subject = offerings?.subjects.find(
              (s) => s.code === section.subjectCode,
            );
            const match = subject?.sections.find(
              (sec) => sec.turma === section.turma,
            );
            return {
              ...section,
              sessions: match?.sessions ?? [],
              targetCourseId: match?.targetCourseId ?? null,
              targetCourseName: match?.targetCourseName ?? null,
            };
          }),
        };
      }),
    })),
  };
}

/**
 * Sequential migration functions, keyed by the schema version they migrate
 * FROM (e.g. `1: migrateV1toV2`).
 */
const migrations = {
  1: migrateV1toV2,
  2: migrateV2toV3,
  3: migrateV3toV4,
};

/**
 * Applies sequential migrations to bring an envelope-shaped object up to
 * `CURRENT_SCHEMA_VERSION`. Exported so the profile import pipeline
 * (`src/storage/profileFile.js`, UC-06) can reuse it on a lone imported
 * profile wrapped in an envelope shape.
 */
export function migrateEnvelope(envelope) {
  let current = envelope;
  while (current.schemaVersion < CURRENT_SCHEMA_VERSION) {
    const migrateStep = migrations[current.schemaVersion];
    if (!migrateStep) {
      throw new Error(
        `No migration available from schema version ${current.schemaVersion}`,
      );
    }
    current = migrateStep(current);
  }
  return current;
}

/**
 * Loads the envelope from localStorage, migrating it to the current schema
 * version if needed. Returns a fresh default envelope if nothing is stored
 * yet. Malformed data is never silently discarded — it throws instead.
 */
export function loadEnvelope() {
  const raw = localStorage.getItem(STORAGE_KEY);
  if (raw == null) return defaultEnvelope();

  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    throw new Error(
      `Stored data is corrupted and could not be parsed: ${error.message}`,
    );
  }

  return migrateEnvelope(parsed);
}

/** @param {import('../domain/types.js').Envelope} envelope */
export function saveEnvelope(envelope) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}
