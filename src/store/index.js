// The Zustand store — single owner of in-memory app state (see
// docs/ARCHITECTURE.md, "src/store"). Only this module calls src/storage;
// every action here writes through to localStorage synchronously.

import { create } from 'zustand';
import { loadEnvelope, saveEnvelope } from '../storage/envelope.js';
import { parseProfileFile, serializeProfileForExport } from '../storage/profileFile.js';
import {
  cloneProfileRecord,
  createProfileRecord,
  renameProfileRecord,
  validateProfileName,
} from '../domain/profile.js';

function persist(get) {
  const { schemaVersion, activeProfileId, profiles } = get();
  saveEnvelope({ schemaVersion, activeProfileId, profiles });
}

export const useStore = create((set, get) => ({
  ...loadEnvelope(),

  /** Selects a profile as active (UC-03), persisting the choice. */
  setActiveProfileId(id) {
    set({ activeProfileId: id });
    persist(get);
  },

  /**
   * Creates a new Student profile (UC-02), makes it active, and persists it.
   * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }|{ ok: false, error: 'empty'|'duplicate' }}
   */
  createProfile(input) {
    const { profiles } = get();
    const error = validateProfileName(input.name, profiles);
    if (error) return { ok: false, error };

    const profile = createProfileRecord(input);
    set({ profiles: [...profiles, profile], activeProfileId: profile.id });
    persist(get);
    return { ok: true, profile };
  },

  /**
   * Clones an existing profile under a new name (UC-04), including all its
   * planning data. The clone is not made active.
   * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }|{ ok: false, error: 'empty'|'duplicate'|'not-found' }}
   */
  cloneProfile(id, newName) {
    const { profiles } = get();
    const source = profiles.find((profile) => profile.id === id);
    if (!source) return { ok: false, error: 'not-found' };

    const error = validateProfileName(newName, profiles);
    if (error) return { ok: false, error };

    const clone = cloneProfileRecord(source, newName);
    set({ profiles: [...profiles, clone] });
    persist(get);
    return { ok: true, profile: clone };
  },

  /**
   * Removes a profile and all its data (UC-05). Clears the active selection
   * if the deleted profile was active.
   */
  deleteProfile(id) {
    const { profiles, activeProfileId } = get();
    set({
      profiles: profiles.filter((profile) => profile.id !== id),
      activeProfileId: activeProfileId === id ? null : activeProfileId,
    });
    persist(get);
  },

  /**
   * Renames an existing profile (UC-08).
   * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }|{ ok: false, error: 'empty'|'duplicate'|'not-found' }}
   */
  renameProfile(id, newName) {
    const { profiles } = get();
    const target = profiles.find((profile) => profile.id === id);
    if (!target) return { ok: false, error: 'not-found' };

    const error = validateProfileName(newName, profiles, id);
    if (error) return { ok: false, error };

    const renamed = renameProfileRecord(target, newName);
    set({ profiles: profiles.map((profile) => (profile.id === id ? renamed : profile)) });
    persist(get);
    return { ok: true, profile: renamed };
  },

  /**
   * Serializes a profile for export (UC-07). Read-only — does not touch storage.
   * @returns {{ schemaVersion: number, profile: object }|null}
   */
  exportProfile(id) {
    const { profiles } = get();
    const profile = profiles.find((profile) => profile.id === id);
    return profile ? serializeProfileForExport(profile) : null;
  },

  /**
   * Imports a profile from a previously exported file's raw text content
   * (UC-06). If a profile with the same name already exists, the caller
   * must pass `overwrite: true` to replace it; otherwise the import is
   * rejected with a `duplicate` error so the UI can ask the user to confirm.
   * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }
   *   |{ ok: false, error: 'invalid'|'unknown-ppc'|'duplicate', name?: string }}
   */
  importProfile(raw, { overwrite = false } = {}) {
    const parsed = parseProfileFile(raw);
    if (!parsed.ok) return parsed;

    const { profiles } = get();
    const collision = profiles.find((profile) => profile.name === parsed.profile.name);
    if (collision && !overwrite) return { ok: false, error: 'duplicate', name: parsed.profile.name };

    const imported = { ...parsed.profile, id: crypto.randomUUID() };
    const nextProfiles = collision
      ? profiles.map((profile) => (profile.id === collision.id ? imported : profile))
      : [...profiles, imported];

    set({ profiles: nextProfiles });
    persist(get);
    return { ok: true, profile: imported };
  },
}));
