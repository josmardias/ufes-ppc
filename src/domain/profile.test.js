import { describe, expect, it } from 'vitest';
import {
  addCreditEntryRecord,
  cloneProfileRecord,
  createProfileRecord,
  hideSubjectRecord,
  removeCreditEntryRecord,
  renameProfileRecord,
  restoreSubjectRecord,
  seedCreditEntries,
  toggleCreditEntryAudit,
  validateCreditEntry,
  validateProfileName,
} from './profile.js';

const ppc = {
  id: 'test-ppc',
  courseId: '06',
  subjects: [
    { code: 'MAT01', name: 'Cálculo I', suggestedSemester: 1 },
    { code: 'MAT02', name: 'Cálculo II', suggestedSemester: 2 },
    {
      code: 'OPT01',
      name: 'Optativa X',
      suggestedSemester: 1,
      classification: 'optional',
    },
    { code: 'ELE05', name: 'Sem sugestão', suggestedSemester: null },
    {
      code: 'ELE06',
      name: 'Requerida explícita',
      suggestedSemester: 2,
      classification: 'required',
    },
  ],
};

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

describe('seedCreditEntries', () => {
  it('seeds a Credit Entry for each Required Subject suggested at or before completedSemesters', () => {
    const entries = seedCreditEntries(ppc, 1);
    expect(entries).toEqual([{ subjectCode: 'MAT01', audit: false }]);
  });

  it('includes Subjects with no known classification as Required', () => {
    const entries = seedCreditEntries(ppc, 2);
    const codes = entries.map((e) => e.subjectCode);
    expect(codes).toContain('MAT02');
  });

  it('never seeds an Optional Subject', () => {
    const entries = seedCreditEntries(ppc, 5);
    expect(entries.map((e) => e.subjectCode)).not.toContain('OPT01');
  });

  it('never seeds a Subject with no Suggested Semester', () => {
    const entries = seedCreditEntries(ppc, 5);
    expect(entries.map((e) => e.subjectCode)).not.toContain('ELE05');
  });

  it('returns no entries when completedSemesters is 0', () => {
    expect(seedCreditEntries(ppc, 0)).toEqual([]);
  });

  it('excludes a Subject suggested after completedSemesters', () => {
    const entries = seedCreditEntries(ppc, 1);
    expect(entries.map((e) => e.subjectCode)).not.toContain('MAT02');
    expect(entries.map((e) => e.subjectCode)).not.toContain('ELE06');
  });
});

describe('createProfileRecord', () => {
  it('builds a ProfileRecord with the given input, chosen PPC, and empty planning data', () => {
    const profile = createProfileRecord({
      name: '  Maria  ',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });

    expect(profile.id).toBeTypeOf('string');
    expect(profile.name).toBe('Maria');
    expect(profile.ingressYear).toBe(2024);
    expect(profile.ingressYearSemester).toBe(1);
    expect(profile.shift).toBe('morning');
    expect(profile.ppcId).toBe('test-ppc');
    expect(profile.courseId).toBe('06');
    expect(profile.completedSemesters).toBe(0);
    expect(profile.shiftFilter).toBeNull();
    expect(profile.semesters).toEqual([]);
    expect(profile.creditEntries).toEqual([]);
    expect(profile.customSections).toEqual([]);
    expect(profile.hiddenSubjects).toEqual([]);
  });

  it('seeds Credit Entries for the completed history (UC-02 step 4)', () => {
    const profile = createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 1,
    });

    expect(profile.creditEntries).toEqual([
      { subjectCode: 'MAT01', audit: false },
    ]);
  });

  it('generates distinct ids for each profile', () => {
    const a = createProfileRecord({
      name: 'A',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'day',
      ppc,
      completedSemesters: 0,
    });
    const b = createProfileRecord({
      name: 'B',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'day',
      ppc,
      completedSemesters: 0,
    });
    expect(a.id).not.toBe(b.id);
  });
});

describe('cloneProfileRecord', () => {
  function baseProfile() {
    return createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
  }

  it('copies all planning data under a new name and a fresh id', () => {
    const source = baseProfile();
    source.semesters = [
      { sections: [{ subjectCode: 'ELE01', failed: false, audit: false }] },
    ];
    source.creditEntries = [{ subjectCode: 'MAT01', audit: false }];

    const clone = cloneProfileRecord(source, '  Maria (cópia)  ');

    expect(clone.id).not.toBe(source.id);
    expect(clone.name).toBe('Maria (cópia)');
    expect(clone.ppcId).toBe(source.ppcId);
    expect(clone.semesters).toEqual(source.semesters);
    expect(clone.creditEntries).toEqual(source.creditEntries);
  });

  it('copies hiddenSubjects (UC-28)', () => {
    const source = baseProfile();
    source.hiddenSubjects = ['OPT01'];

    const clone = cloneProfileRecord(source, 'Copy');

    expect(clone.hiddenSubjects).toEqual(['OPT01']);
  });

  it('does not share references with the source profile', () => {
    const source = baseProfile();
    source.semesters = [{ sections: [] }];

    const clone = cloneProfileRecord(source, 'Copy');
    clone.semesters[0].sections.push({
      subjectCode: 'ELE01',
      failed: false,
      audit: false,
    });

    expect(source.semesters[0].sections).toEqual([]);
  });
});

describe('renameProfileRecord', () => {
  it('updates the name and preserves everything else', () => {
    const profile = createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
    const renamed = renameProfileRecord(profile, '  Maria Silva  ');

    expect(renamed.id).toBe(profile.id);
    expect(renamed.name).toBe('Maria Silva');
    expect(renamed.ingressYear).toBe(profile.ingressYear);
  });
});

describe('validateCreditEntry', () => {
  function baseProfile() {
    return createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
  }

  it('rejects a Subject that does not exist in the Course Curriculum (UC-15)', () => {
    expect(validateCreditEntry(baseProfile(), ppc, 'UNKNOWN')).toBe(
      'unknown-subject',
    );
  });

  it('rejects a Subject that already has a Credit Entry (UC-15)', () => {
    const profile = addCreditEntryRecord(baseProfile(), 'MAT01');
    expect(validateCreditEntry(profile, ppc, 'MAT01')).toBe('duplicate');
  });

  it('accepts a Subject from the Course Curriculum with no existing Credit Entry', () => {
    expect(validateCreditEntry(baseProfile(), ppc, 'MAT01')).toBeNull();
  });
});

describe('addCreditEntryRecord / removeCreditEntryRecord / toggleCreditEntryAudit', () => {
  function baseProfile() {
    return createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
  }

  it('adds a non-audit Credit Entry for the given Subject (UC-15)', () => {
    const updated = addCreditEntryRecord(baseProfile(), 'MAT01');
    expect(updated.creditEntries).toEqual([
      { subjectCode: 'MAT01', audit: false },
    ]);
  });

  it('removes a Credit Entry by Subject code, along with its Audit Mark (UC-15)', () => {
    let profile = addCreditEntryRecord(baseProfile(), 'MAT01');
    profile = toggleCreditEntryAudit(profile, 'MAT01');
    expect(profile.creditEntries).toEqual([
      { subjectCode: 'MAT01', audit: true },
    ]);

    const removed = removeCreditEntryRecord(profile, 'MAT01');
    expect(removed.creditEntries).toEqual([]);
  });

  it('leaves other Credit Entries untouched when removing one', () => {
    let profile = addCreditEntryRecord(baseProfile(), 'MAT01');
    profile = addCreditEntryRecord(profile, 'MAT02');

    const removed = removeCreditEntryRecord(profile, 'MAT01');
    expect(removed.creditEntries).toEqual([
      { subjectCode: 'MAT02', audit: false },
    ]);
  });

  it('toggles the Audit Mark on a Credit Entry (UC-20/21)', () => {
    const profile = addCreditEntryRecord(baseProfile(), 'MAT01');

    const marked = toggleCreditEntryAudit(profile, 'MAT01');
    expect(marked.creditEntries[0].audit).toBe(true);

    const unmarked = toggleCreditEntryAudit(marked, 'MAT01');
    expect(unmarked.creditEntries[0].audit).toBe(false);
  });
});

describe('hideSubjectRecord / restoreSubjectRecord', () => {
  it('adds a Subject code to hiddenSubjects', () => {
    const profile = createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
    const updated = hideSubjectRecord(profile, 'OPT01');
    expect(updated.hiddenSubjects).toEqual(['OPT01']);
  });

  it('is idempotent — hiding an already-hidden Subject changes nothing', () => {
    const profile = createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
    const once = hideSubjectRecord(profile, 'OPT01');
    const twice = hideSubjectRecord(once, 'OPT01');
    expect(twice.hiddenSubjects).toEqual(['OPT01']);
  });

  it('removes a Subject code from hiddenSubjects', () => {
    const profile = createProfileRecord({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
      ppc,
      completedSemesters: 0,
    });
    const hidden = hideSubjectRecord(profile, 'OPT01');
    const restored = restoreSubjectRecord(hidden, 'OPT01');
    expect(restored.hiddenSubjects).toEqual([]);
  });
});
