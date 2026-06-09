// Eager-loads the static datasets in src/data/ppcs and src/data/offerings
// (see docs/ARCHITECTURE.md, "src/data"): all data access is synchronous,
// and adding a dataset file requires no registry edits — Vite's
// `import.meta.glob` (eager mode) discovers files at build time.

const ppcModules = import.meta.glob('./ppcs/*.json', { eager: true });
const offeringModules = import.meta.glob('./offerings/*.json', { eager: true });

function unwrap(mod) {
  return mod.default ?? mod;
}

/** PPC dataset (see docs/ARCHITECTURE.md, "PPC dataset"), keyed by PPC id. */
export const ppcs = Object.fromEntries(Object.values(ppcModules).map(unwrap).map((ppc) => [ppc.id, ppc]));

/**
 * Offerings snapshots (see docs/ARCHITECTURE.md, "Offerings dataset"), keyed
 * by PPC id, then by Year Semester (1 | 2).
 */
export const offerings = {};
for (const mod of Object.values(offeringModules)) {
  const snapshot = unwrap(mod);
  offerings[snapshot.ppcId] ??= {};
  offerings[snapshot.ppcId][snapshot.yearSemester] = snapshot;
}

/** Looks up a PPC by id, or `undefined` if it isn't in the registry. */
export function getPpc(id) {
  return ppcs[id];
}

/**
 * Looks up a course's Offerings snapshot for a Year Semester, or `undefined`
 * if it isn't in the registry.
 */
export function getOfferings(ppcId, yearSemester) {
  return offerings[ppcId]?.[yearSemester];
}
