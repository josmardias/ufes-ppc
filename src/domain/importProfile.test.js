import { describe, expect, it } from 'vitest';
import { validateImportedProfile } from './importProfile.js';

function validProfile(overrides = {}) {
  return {
    name: 'Maria',
    ppcId: 'engenharia-eletrica-2022',
    courseId: '06',
    ingressYear: 2024,
    ingressYearSemester: 1,
    completedSemesters: 0,
    shift: 'morning',
    shiftFilter: null,
    semesters: [],
    creditEntries: [],
    customSections: [],
    hiddenSubjects: [],
    ...overrides,
  };
}

describe('validateImportedProfile', () => {
  it('accepts a well-formed profile referencing a known PPC', () => {
    expect(validateImportedProfile(validProfile())).toBeNull();
  });

  it('rejects a null or missing ppcId', () => {
    expect(validateImportedProfile(validProfile({ ppcId: null }))).toBe(
      'invalid',
    );
  });

  it('rejects a null or missing courseId', () => {
    expect(validateImportedProfile(validProfile({ courseId: null }))).toBe(
      'invalid',
    );
  });

  it('rejects an invalid courseId', () => {
    expect(validateImportedProfile(validProfile({ courseId: 42 }))).toBe(
      'invalid',
    );
  });

  it('rejects a profile referencing an unknown PPC', () => {
    expect(
      validateImportedProfile(validProfile({ ppcId: 'does-not-exist' })),
    ).toBe('unknown-ppc');
  });

  it('rejects non-object input', () => {
    expect(validateImportedProfile(null)).toBe('invalid');
    expect(validateImportedProfile('not a profile')).toBe('invalid');
  });

  it('rejects a missing or empty name', () => {
    expect(validateImportedProfile(validProfile({ name: '' }))).toBe('invalid');
    expect(validateImportedProfile(validProfile({ name: undefined }))).toBe(
      'invalid',
    );
  });

  it('rejects an invalid ingressYearSemester', () => {
    expect(
      validateImportedProfile(validProfile({ ingressYearSemester: 3 })),
    ).toBe('invalid');
  });

  it('rejects a negative or non-integer completedSemesters', () => {
    expect(
      validateImportedProfile(validProfile({ completedSemesters: -1 })),
    ).toBe('invalid');
    expect(
      validateImportedProfile(validProfile({ completedSemesters: 1.5 })),
    ).toBe('invalid');
    expect(
      validateImportedProfile(validProfile({ completedSemesters: null })),
    ).toBe('invalid');
  });

  it('rejects an invalid shift', () => {
    expect(validateImportedProfile(validProfile({ shift: 'night' }))).toBe(
      'invalid',
    );
  });

  it('rejects non-array planning data', () => {
    expect(validateImportedProfile(validProfile({ semesters: null }))).toBe(
      'invalid',
    );
    expect(validateImportedProfile(validProfile({ creditEntries: {} }))).toBe(
      'invalid',
    );
    expect(
      validateImportedProfile(validProfile({ customSections: 'nope' })),
    ).toBe('invalid');
    expect(
      validateImportedProfile(validProfile({ hiddenSubjects: 'nope' })),
    ).toBe('invalid');
  });
});
