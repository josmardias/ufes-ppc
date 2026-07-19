import { describe, expect, it } from 'vitest';
import { cloneProfileRecord, createProfileRecord, renameProfileRecord, validateProfileName } from './profile.js';

describe('validateProfileName', () => {
  it('rejects an empty name', () => {
    expect(validateProfileName('', [])).toBe('empty');
    expect(validateProfileName('   ', [])).toBe('empty');
  });

  it('rejects a name that duplicates an existing profile', () => {
    const existing = [{ name: 'Maria' }];
    expect(validateProfileName('Maria', existing)).toBe('duplicate');
  });

  it('accepts a non-empty, unique name', () => {
    expect(validateProfileName('Maria', [])).toBeNull();
  });

  it('excludes the given profile id from the duplicate check (UC-08 renaming to its own name)', () => {
    const existing = [{ id: 'p1', name: 'Maria' }];
    expect(validateProfileName('Maria', existing, 'p1')).toBeNull();
    expect(validateProfileName('Maria', existing, 'p2')).toBe('duplicate');
  });
});

describe('createProfileRecord', () => {
  it('builds a ProfileRecord with the given input and empty planning data', () => {
    const profile = createProfileRecord({
      name: '  Maria  ',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
    });

    expect(profile.id).toBeTypeOf('string');
    expect(profile.name).toBe('Maria');
    expect(profile.ingressYear).toBe(2024);
    expect(profile.ingressYearSemester).toBe(1);
    expect(profile.shift).toBe('morning');
    expect(profile.ppcId).toBeNull();
    expect(profile.shiftFilter).toBeNull();
    expect(profile.semesters).toEqual([]);
    expect(profile.creditEntries).toEqual([]);
    expect(profile.customSections).toEqual([]);
  });

  it('generates distinct ids for each profile', () => {
    const a = createProfileRecord({ name: 'A', ingressYear: 2024, ingressYearSemester: 1, shift: 'day' });
    const b = createProfileRecord({ name: 'B', ingressYear: 2024, ingressYearSemester: 1, shift: 'day' });
    expect(a.id).not.toBe(b.id);
  });
});

describe('cloneProfileRecord', () => {
  it('copies all planning data under a new name and a fresh id', () => {
    const source = createProfileRecord({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    source.ppcId = 'engenharia-eletrica-2022';
    source.semesters = [{ sections: [{ subjectCode: 'ELE01', failed: false, audit: false }] }];
    source.creditEntries = [{ subjectCode: 'MAT01', audit: false }];

    const clone = cloneProfileRecord(source, '  Maria (cópia)  ');

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe('Maria (cópia)');
    expect(clone.ppcId).toBe(source.ppcId);
    expect(clone.semesters).toEqual(source.semesters);
    expect(clone.creditEntries).toEqual(source.creditEntries);
  });

  it('does not share references with the source profile', () => {
    const source = createProfileRecord({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    source.semesters = [{ sections: [] }];

    const clone = cloneProfileRecord(source, 'Copy');
    clone.semesters[0].sections.push({ subjectCode: 'ELE01', failed: false, audit: false });

    expect(source.semesters[0].sections).toEqual([]);
  });
});

describe('renameProfileRecord', () => {
  it('updates the name and preserves everything else', () => {
    const profile = createProfileRecord({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const renamed = renameProfileRecord(profile, '  Maria Silva  ');

    expect(renamed.id).toBe(profile.id);
    expect(renamed.name).toBe('Maria Silva');
    expect(renamed.ingressYear).toBe(profile.ingressYear);
  });
});
