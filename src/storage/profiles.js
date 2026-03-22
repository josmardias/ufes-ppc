/**
 * src/storage/profiles.js
 *
 * The single module responsible for all localStorage access related to student
 * profiles. No domain logic lives here — only serialisation, deserialisation,
 * and error handling.
 *
 * Keys used in localStorage:
 *   ppc_alunos       — map of { [name]: ProfileRecord }
 *   ppc_aluno_ativo  — string (active student name)
 *
 * ProfileRecord shape:
 *   {
 *     name: string,
 *     course: string|null,
 *     ingressYear: number|null,
 *     ingressYearSemester: 1|2|null,
 *     semesters: CurriculumSemester[],
 *     creditEntries: CreditEntry[],
 *     customOffer: { 1: object|null, 2: object|null },
 *   }
 */

import { validateImportedProfile } from "../domain/profile.js";

// ---------------------------------------------------------------------------
// Storage key constants
// ---------------------------------------------------------------------------

/** Key for the map of all student profiles. */
const KEY_ALL_PROFILES = "ppc_alunos";

/** Key for the name of the currently active student. */
const KEY_ACTIVE_PROFILE = "ppc_aluno_ativo";

// ---------------------------------------------------------------------------
// Internal normalisation helper
// ---------------------------------------------------------------------------

/**
 * Normalises a raw stored value into the current ProfileRecord shape.
 *
 * @param {string} key - The map key (used as fallback name).
 * @param {unknown} raw - The raw value stored under this key.
 * @returns {object} A normalised ProfileRecord.
 */
function normaliseRecord(key, raw) {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {
      name: key,
      semesters: [],
      creditEntries: [],
      course: null,
      ingressYear: null,
      ingressYearSemester: null,
      customOffer: { 1: null, 2: null },
    };
  }

  const resolvedName =
    typeof raw.name === "string" && raw.name.trim() !== ""
      ? raw.name.trim()
      : key;

  return {
    name: resolvedName,
    semesters: Array.isArray(raw.semesters) ? raw.semesters : [],
    creditEntries: Array.isArray(raw.creditEntries) ? raw.creditEntries : [],
    course: raw.course ?? null,
    ingressYear: raw.ingressYear ?? null,
    ingressYearSemester: raw.ingressYearSemester ?? null,
    customOffer: raw.customOffer ?? { 1: null, 2: null },
  };
}

// ---------------------------------------------------------------------------
// Profiles map — read / write
// ---------------------------------------------------------------------------

/**
 * Reads and parses the full profiles map from localStorage.
 *
 * Returns an empty object when the key is absent or the stored data is
 * corrupt. Each entry is normalised to the current ProfileRecord shape,
 * including backward-compat migration of the legacy format.
 *
 * @returns {{ [name: string]: object }} Map of name → ProfileRecord.
 */
export function readAllProfiles() {
  try {
    const raw = localStorage.getItem(KEY_ALL_PROFILES);
    if (!raw) return {};

    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return {};
    }

    const result = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (!key) continue;
      result[key] = normaliseRecord(key, value);
    }
    return result;
  } catch {
    return {};
  }
}

/**
 * Serialises and writes the full profiles map to localStorage.
 *
 * Fails silently on quota-exceeded or private-mode errors so callers never
 * need to handle storage exceptions.
 *
 * @param {{ [name: string]: object }} profiles - Map of name → ProfileRecord.
 */
export function writeAllProfiles(profiles) {
  try {
    localStorage.setItem(KEY_ALL_PROFILES, JSON.stringify(profiles));
  } catch {
    // Quota exceeded or private browsing — silent failure by design.
  }
}

// ---------------------------------------------------------------------------
// Active profile name — read / write
// ---------------------------------------------------------------------------

/**
 * Reads the name of the currently active student from localStorage.
 *
 * @returns {string} The active student name, or `""` when absent or on error.
 */
export function readActiveProfileName() {
  try {
    return localStorage.getItem(KEY_ACTIVE_PROFILE) ?? "";
  } catch {
    return "";
  }
}

/**
 * Writes the active student name to localStorage.
 * When `name` is empty or null the key is removed entirely.
 *
 * @param {string|null|undefined} name - The name to persist.
 */
export function writeActiveProfileName(name) {
  try {
    if (name) {
      localStorage.setItem(KEY_ACTIVE_PROFILE, name);
    } else {
      localStorage.removeItem(KEY_ACTIVE_PROFILE);
    }
  } catch {
    // Silent failure — private browsing or storage unavailable.
  }
}

// ---------------------------------------------------------------------------
// Single-profile helpers
// ---------------------------------------------------------------------------

/**
 * Returns the ProfileRecord for a specific student name, or `null` if the
 * profile does not exist in storage.
 *
 * @param {string} name - The student name to look up.
 * @returns {object|null} The ProfileRecord, or null.
 */
export function readProfile(name) {
  try {
    const all = readAllProfiles();
    return all[name] ?? null;
  } catch {
    return null;
  }
}

/**
 * Writes (upserts) a single ProfileRecord into the profiles map.
 * Reads the current map, inserts or replaces the entry for `name`, then
 * writes the updated map back to localStorage.
 *
 * @param {string} name - The student name (map key).
 * @param {object} profile - The ProfileRecord to store.
 */
export function writeProfile(name, profile) {
  try {
    const all = readAllProfiles();
    all[name] = profile;
    writeAllProfiles(all);
  } catch {
    // Silent failure.
  }
}

/**
 * Removes the ProfileRecord for `name` from the profiles map.
 * If the profile does not exist, this is a no-op.
 *
 * @param {string} name - The student name to remove.
 */
export function deleteProfile(name) {
  try {
    const all = readAllProfiles();
    if (!(name in all)) return;
    delete all[name];
    writeAllProfiles(all);
  } catch {
    // Silent failure.
  }
}

// ---------------------------------------------------------------------------
// Import from external file
// ---------------------------------------------------------------------------

/**
 * Parses and validates a profile JSON string that originated from an external
 * file (e.g. a user-supplied import file).
 *
 * Unlike the other functions in this module, this one intentionally propagates
 * errors to the caller so that the UI layer can surface a meaningful message.
 *
 * Steps:
 *   1. Parse the JSON string.
 *   2. Call `validateImportedProfile` from the domain layer (throws on invalid).
 *   3. Return the validated profile object.
 *
 * @param {string} jsonString - Raw JSON text from an imported file.
 * @returns {object} The validated ProfileRecord.
 * @throws {Error} When the JSON is malformed or the profile fails domain validation.
 */
export function parseImportedProfileFile(jsonString) {
  const parsed = JSON.parse(jsonString); // intentionally not caught — propagate SyntaxError
  return validateImportedProfile(parsed); // intentionally not caught — propagate domain errors
}