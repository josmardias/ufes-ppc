// localStorage read/write and schema migrations (see docs/ARCHITECTURE.md,
// "src/storage" and "Persistence"). This is the only module allowed to call
// `localStorage`; it is called only by src/store.

import { getPpc } from '../data/index.js';

export const STORAGE_KEY = 'ufes-ppc:envelope';

/** Bumped on breaking shape changes; see the `migrations` map below. */
export const CURRENT_SCHEMA_VERSION = 2;

/** @returns {import('../domain/types.js').Envelope} */
export function defaultEnvelope() {
  return { schemaVersion: CURRENT_SCHEMA_VERSION, activeProfileId: null, profiles: [] };
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
      courseId: profile.ppcId ? (getPpc(profile.ppcId)?.courseId ?? null) : null,
    })),
  };
}

/**
 * Sequential migration functions, keyed by the schema version they migrate
 * FROM (e.g. `1: migrateV1toV2`).
 */
const migrations = { 1: migrateV1toV2 };

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
      throw new Error(`No migration available from schema version ${current.schemaVersion}`);
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
    throw new Error(`Stored data is corrupted and could not be parsed: ${error.message}`);
  }

  return migrateEnvelope(parsed);
}

/** @param {import('../domain/types.js').Envelope} envelope */
export function saveEnvelope(envelope) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(envelope));
}
