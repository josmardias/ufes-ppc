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

/** Weekly grid column order (see docs/USE_CASES.md, UC-09 — Saturday is added only when used). */
export const WEEKDAY_ORDER = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** @type {Record<string, string>} */
export const WEEKDAY_LABELS = {
  Seg: 'Seg',
  Ter: 'Ter',
  Qua: 'Qua',
  Qui: 'Qui',
  Sex: 'Sex',
  Sáb: 'Sáb',
  Sab: 'Sáb',
  Dom: 'Dom',
};

/** Planning signal severity labels (see docs/DOMAIN.md, Planned Semester). */
export const STATUS_LABELS = {
  clean: 'Sem pendências',
  warnings: 'Com avisos',
  errors: 'Com erros',
};

/** Shift filter toggle options (see docs/DOMAIN.md, Planned Semester). */
export const SHIFT_FILTER_OPTIONS = [
  { value: 'morning', label: 'Manhã' },
  { value: 'afternoon', label: 'Tarde' },
  { value: 'day', label: 'Dia inteiro' },
];

export const SIGNAL_LABELS = {
  unmetRequisite: 'Requisito não atendido',
  scheduleConflict: 'Conflito de horário',
  duplicateSubject: 'Disciplina duplicada',
  redundantEnrollment: 'Matrícula redundante',
};
