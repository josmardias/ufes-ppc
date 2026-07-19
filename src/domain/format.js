// Human-readable (pt-BR) formatting helpers for domain enums (see
// docs/DOMAIN.md, "Translation Dictionary"). Pure functions — no UI, no
// storage, shared by every page/component that displays a ProfileRecord.

/** @type {Record<import('./types.js').ProfileRecord['shift'], string>} */
export const SHIFT_LABELS = {
  day: 'Integral',
  morning: 'Manhã',
  afternoon: 'Tarde',
};

/**
 * Formats a profile's ingress Year Semester as "2022/1".
 * @param {import('./types.js').ProfileRecord} profile
 */
export function formatIngress(profile) {
  return `${profile.ingressYear}/${profile.ingressYearSemester}`;
}
