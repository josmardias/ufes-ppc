// PPC Subject resolution and workload helpers (see docs/DOMAIN.md, Subject
// and Equivalence). Pure, framework-agnostic.

/**
 * Resolves a code (as a Section was offered under — possibly an equivalent)
 * to its PPC Subject: an exact match on the Subject's own code takes
 * priority, otherwise the Subject whose `equivalents` list contains the code
 * (see docs/DOMAIN.md, Equivalence). Returns `null` if the code resolves to
 * nothing in this PPC.
 * @param {{subjects: Array}} ppc
 * @param {string|null|undefined} code
 */
export function resolveSubjectByCode(ppc, code) {
  if (!code) return null;
  return ppc.subjects.find((s) => s.code === code) ?? ppc.subjects.find((s) => s.equivalents.includes(code)) ?? null;
}

/**
 * Total workload (in hours) of every Subject fulfilled in a fulfillment map
 * (see docs/DOMAIN.md, Credit Entry) — used to evaluate a `minWorkloadHours`
 * requisite (e.g. Est\u00e1gio Supervisionado).
 * @param {{subjects: Array}} ppc
 * @param {Map<string, {audit: boolean}>} fulfillment - keyed by canonical Subject code
 */
export function totalFulfilledWorkload(ppc, fulfillment) {
  let total = 0;
  for (const code of fulfillment.keys()) {
    const subject = ppc.subjects.find((s) => s.code === code);
    if (subject) total += subject.workloadHours;
  }
  return total;
}
