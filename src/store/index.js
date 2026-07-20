// The Zustand store — single owner of in-memory app state (see
// docs/ARCHITECTURE.md, "src/store"). Only this module calls src/storage;
// every action here writes through to localStorage synchronously.

import { create } from 'zustand';
import {
  STORAGE_KEY,
  loadEnvelope,
  saveEnvelope,
} from '../storage/envelope.js';
import {
  parseProfileFile,
  serializeProfileForExport,
} from '../storage/profileFile.js';
import { getPpc } from '../data/index.js';
import {
  cloneProfileRecord,
  createProfileRecord,
  renameProfileRecord,
  validateProfileName,
} from '../domain/profile.js';
import {
  addPlannedSemester as addPlannedSemesterDomain,
  addSectionToSemester as addSectionToSemesterDomain,
  deleteLastPlannedSemester,
  removeSectionFromSemester as removeSectionFromSemesterDomain,
  toggleSectionMark,
} from '../domain/semester.js';

function persist(get) {
  const { schemaVersion, activeProfileId, profiles } = get();
  saveEnvelope({ schemaVersion, activeProfileId, profiles });
}

/**
 * Finds the profile by id, applies `updater` to build its replacement, and
 * writes the updated profile list through to storage. Returns the updated
 * profile, or null if no profile with that id exists.
 */
function updateProfile(get, set, id, updater) {
  const { profiles } = get();
  const profile = profiles.find((p) => p.id === id);
  if (!profile) return null;

  const updated = updater(profile);
  set({ profiles: profiles.map((p) => (p.id === id ? updated : p)) });
  persist(get);
  return updated;
}

export const useStore = create((set, get) => ({
  ...loadEnvelope(),

  /** True once another tab has written the envelope (see "Concurrent tabs" below). */
  storageChangedElsewhere: false,

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
    set({
      profiles: profiles.map((profile) =>
        profile.id === id ? renamed : profile,
      ),
    });
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
    const collision = profiles.find(
      (profile) => profile.name === parsed.profile.name,
    );
    if (collision && !overwrite)
      return { ok: false, error: 'duplicate', name: parsed.profile.name };

    const imported = { ...parsed.profile, id: crypto.randomUUID() };
    const nextProfiles = collision
      ? profiles.map((profile) =>
          profile.id === collision.id ? imported : profile,
        )
      : [...profiles, imported];

    set({ profiles: nextProfiles });
    persist(get);
    return { ok: true, profile: imported };
  },

  /**
   * Sets the Course Curriculum (PPC) a profile follows (UC-11 step 3, UC-24).
   * Only allowed while the profile has no Planned Semesters; switching to a
   * different PPC additionally requires no Credit Entries (see
   * docs/DOMAIN.md, Student). Also (re-)derives the profile's `courseId`
   * from the chosen PPC (see docs/ARCHITECTURE.md, `ProfileRecord`).
   * @returns {{ ok: true, profile: import('../domain/types.js').ProfileRecord }
   *   |{ ok: false, error: 'not-found'|'has-semesters'|'has-credit-entries' }}
   */
  setProfilePpc(id, ppcId) {
    const { profiles } = get();
    const profile = profiles.find((p) => p.id === id);
    if (!profile) return { ok: false, error: 'not-found' };
    if (profile.semesters.length > 0)
      return { ok: false, error: 'has-semesters' };
    if (profile.ppcId !== ppcId && profile.creditEntries.length > 0)
      return { ok: false, error: 'has-credit-entries' };

    const updated = updateProfile(get, set, id, (p) => ({
      ...p,
      ppcId,
      courseId: getPpc(ppcId)?.courseId ?? null,
    }));
    return { ok: true, profile: updated };
  },

  /** Persists the Shift filter toggle (UC-12); pass `null` to clear it. */
  setShiftFilter(id, shiftFilter) {
    updateProfile(get, set, id, (profile) => ({ ...profile, shiftFilter }));
  },

  /**
   * Creates the next Planned Semester containing exactly `sections` (UC-11).
   * `sections` must already be built PlannedSection objects (see
   * domain/semester.js, createPlannedSection).
   */
  addPlannedSemester(id, sections) {
    updateProfile(get, set, id, (profile) =>
      addPlannedSemesterDomain(profile, sections),
    );
  },

  /** Removes the last Planned Semester and all its contents (UC-14). */
  deleteLastSemester(id) {
    updateProfile(get, set, id, deleteLastPlannedSemester);
  },

  /** Adds a Section to a Planned Semester (UC-12). */
  addSectionToSemester(id, semesterIndex, section) {
    updateProfile(get, set, id, (profile) =>
      addSectionToSemesterDomain(profile, semesterIndex, section),
    );
  },

  /** Removes a Section from a Planned Semester by id (UC-13). */
  removeSectionFromSemester(id, semesterIndex, sectionId) {
    updateProfile(get, set, id, (profile) =>
      removeSectionFromSemesterDomain(profile, semesterIndex, sectionId),
    );
  },

  /** Toggles a Failed Mark on a Planned Section (UC-22/23). */
  toggleFailedMark(id, semesterIndex, sectionId) {
    updateProfile(get, set, id, (profile) =>
      toggleSectionMark(profile, semesterIndex, sectionId, 'failed'),
    );
  },

  /** Toggles an Audit Mark on a Planned Section (UC-20/21). */
  toggleAuditMark(id, semesterIndex, sectionId) {
    updateProfile(get, set, id, (profile) =>
      toggleSectionMark(profile, semesterIndex, sectionId, 'audit'),
    );
  },
}));

// Cross-tab awareness (see docs/ARCHITECTURE.md, "Concurrent tabs"): the
// `storage` event fires only in *other* tabs than the one that wrote the
// value, so this never fires for the tab's own writes. There is no
// cross-tab state merging; the store just flags the conflict so the UI can
// warn the user and offer a reload.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (event) => {
    if (event.key === STORAGE_KEY)
      useStore.setState({ storageChangedElsewhere: true });
  });
}
