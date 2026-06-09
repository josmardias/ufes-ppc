// Thin selector wrapper over the store (see docs/ARCHITECTURE.md, "src/hooks").

import { useStore } from '../store/index.js';

/** @returns {import('../domain/types.js').ProfileRecord|null} */
export function useActiveProfile() {
  return useStore((state) => state.profiles.find((profile) => profile.id === state.activeProfileId) ?? null);
}
