import { describe, expect, it } from 'vitest';
import { validateImportedProfile } from './importProfile.js';

function validProfile(overrides = {}) {
  return {
    name: 'Maria',
    ppcId: null,
    ingressYear: 2024,
    ingressYearSemester: 1,
    shift: 'morning',
    shiftFilter: null,
    semesters: [],
    creditEntries: [],
    customSections: [],
    ...overrides,
  };
}

describe('validateImportedProfile', () => {
  it('accepts a well-formed profile with no PPC yet', () => {
    expect(validateImportedProfile(validProfile())).toBeNull();
  });

  it('accepts a well-formed profile referencing a known PPC', () => {
    expect(validateImportedProfile(validProfile({ ppcId: 'engenharia-eletrica-2022' }))).toBeNull();
  });

  it('rejects a profile referencing an unknown PPC', () => {
    expect(validateImportedProfile(validProfile({ ppcId: 'does-not-exist' }))).toBe('unknown-ppc');
  });

  it('rejects non-object input', () => {
    expect(validateImportedProfile(null)).toBe('invalid');
    expect(validateImportedProfile('not a profile')).toBe('invalid');
  });

  it('rejects a missing or empty name', () => {
    expect(validateImportedProfile(validProfile({ name: '' }))).toBe('invalid');
    expect(validateImportedProfile(validProfile({ name: undefined }))).toBe('invalid');
  });

  it('rejects an invalid ingressYearSemester', () => {
    expect(validateImportedProfile(validProfile({ ingressYearSemester: 3 }))).toBe('invalid');
  });

  it('rejects an invalid shift', () => {
    expect(validateImportedProfile(validProfile({ shift: 'night' }))).toBe('invalid');
  });

  it('rejects non-array planning data', () => {
    expect(validateImportedProfile(validProfile({ semesters: null }))).toBe('invalid');
    expect(validateImportedProfile(validProfile({ creditEntries: {} }))).toBe('invalid');
    expect(validateImportedProfile(validProfile({ customSections: 'nope' }))).toBe('invalid');
  });
});
