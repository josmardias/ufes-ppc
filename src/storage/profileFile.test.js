import { describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION } from './envelope.js';
import { parseProfileFile, serializeProfileForExport } from './profileFile.js';

function sampleProfile(overrides = {}) {
  return {
    id: 'internal-id',
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

describe('serializeProfileForExport', () => {
  it('strips the internal id and records the current schema version', () => {
    const exported = serializeProfileForExport(sampleProfile());
    expect(exported).toEqual({
      schemaVersion: CURRENT_SCHEMA_VERSION,
      profile: {
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
      },
    });
  });
});

describe('parseProfileFile', () => {
  it('round-trips a serialized profile', () => {
    const exported = serializeProfileForExport(sampleProfile());
    const result = parseProfileFile(JSON.stringify(exported));
    expect(result).toEqual({ ok: true, profile: exported.profile });
  });

  it('rejects corrupted JSON', () => {
    expect(parseProfileFile('{not json')).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('rejects a file missing the expected envelope shape', () => {
    expect(parseProfileFile(JSON.stringify({ foo: 'bar' }))).toEqual({
      ok: false,
      error: 'invalid',
    });
  });

  it('rejects a profile referencing an unknown PPC', () => {
    const exported = serializeProfileForExport(
      sampleProfile({ ppcId: 'does-not-exist' }),
    );
    expect(parseProfileFile(JSON.stringify(exported))).toEqual({
      ok: false,
      error: 'unknown-ppc',
    });
  });

  it('accepts a profile referencing a known PPC', () => {
    const exported = serializeProfileForExport(
      sampleProfile({ ppcId: 'engenharia-eletrica-2022', courseId: '06' }),
    );
    const result = parseProfileFile(JSON.stringify(exported));
    expect(result.ok).toBe(true);
  });

  it('migrates and imports a file exported by schema version 1, before courseId/completedSemesters/hiddenSubjects existed (UC-06/UC-07)', () => {
    const legacyExport = {
      schemaVersion: 1,
      profile: {
        name: 'Maria',
        ppcId: null,
        ingressYear: 2024,
        ingressYearSemester: 1,
        shift: 'morning',
        shiftFilter: null,
        semesters: [],
        creditEntries: [],
        customSections: [],
      },
    };

    const result = parseProfileFile(JSON.stringify(legacyExport));

    expect(result.ok).toBe(true);
    expect(result.profile.ppcId).toBe('engenharia-eletrica-2022');
    expect(result.profile.courseId).toBe('06');
    expect(result.profile.completedSemesters).toBe(0);
    expect(result.profile.hiddenSubjects).toEqual([]);
  });
});
