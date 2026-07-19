// Cross-tab conflict warning (see docs/ARCHITECTURE.md, "Concurrent tabs").
// Shown app-wide once another tab has written the persisted envelope.

import { useStore } from '../store/index.js';

export default function StorageConflictBanner() {
  const changed = useStore((state) => state.storageChangedElsewhere);
  if (!changed) return null;

  return (
    <div className="flex items-center justify-between gap-4 bg-amber-100 px-4 py-2 text-sm text-amber-900">
      <span>Os dados foram alterados em outra aba.</span>
      <button
        type="button"
        onClick={() => window.location.reload()}
        className="shrink-0 rounded bg-amber-900 px-3 py-1 text-white"
      >
        Recarregar
      </button>
    </div>
  );
}
