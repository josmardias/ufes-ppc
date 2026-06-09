// The Zustand store — single owner of in-memory app state (see
// docs/ARCHITECTURE.md, "src/store"). Only this module calls src/storage;
// every action here writes through to localStorage synchronously.

import { create } from 'zustand';
import { loadEnvelope, saveEnvelope } from '../storage/envelope.js';

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
}));
