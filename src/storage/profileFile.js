// Export/import serialization for a single Student profile (UC-06, UC-07 —
// see docs/USE_CASES.md). Reuses the envelope's migration pipeline so
// profiles exported by older versions of the app keep importing cleanly
// (see docs/ARCHITECTURE.md, "Export / import").

import { CURRENT_SCHEMA_VERSION, migrateEnvelope } from './envelope.js';
import { validateImportedProfile } from '../domain/importProfile.js';

/**
 * Serializes a profile for export (UC-07). The internal `id` is stripped,
 * since importing always assigns a fresh one.
 * @param {import('../domain/types.js').ProfileRecord} profile
 */
export function serializeProfileForExport(profile) {
  const { id, ...rest } = profile;
  return { schemaVersion: CURRENT_SCHEMA_VERSION, profile: rest };
}

/**
 * Parses, migrates, and validates a profile file's raw text content (UC-06).
 * Never returns a profile in a degraded state — malformed files and
 * profiles referencing an unknown Course Curriculum (PPC) are rejected.
 * @param {string} raw
 * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }
 *   |{ ok: false, error: 'invalid'|'unknown-ppc' }}
 */
export function parseProfileFile(raw) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { ok: false, error: 'invalid' };
  }

  if (
    typeof parsed !== 'object' ||
    parsed === null ||
    typeof parsed.schemaVersion !== 'number' ||
    typeof parsed.profile !== 'object' ||
    parsed.profile === null
  ) {
    return { ok: false, error: 'invalid' };
  }

  let migrated;
  try {
    migrated = migrateEnvelope({ schemaVersion: parsed.schemaVersion, activeProfileId: null, profiles: [parsed.profile] });
  } catch {
    return { ok: false, error: 'invalid' };
  }

  const profile = migrated.profiles[0];
  const error = validateImportedProfile(profile);
  if (error) return { ok: false, error };

  return { ok: true, profile };
}
