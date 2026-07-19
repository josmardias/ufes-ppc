import { describe, expect, it } from 'vitest';
import {
  addPlannedSemester,
  addSectionToSemester,
  createPlannedSection,
  currentSemesterIndex,
  deleteLastPlannedSemester,
  formatYearSemesterLabel,
  removeSectionFromSemester,
  semesterPosition,
  toggleSectionMark,
} from './semester.js';

describe('semesterPosition', () => {
  it('starts at the ingress Year Semester', () => {
    expect(semesterPosition(2024, 1, 0)).toEqual({ year: 2024, yearSemester: 1 });
    expect(semesterPosition(2024, 2, 0)).toEqual({ year: 2024, yearSemester: 2 });
  });

  it('alternates Year Semesters as the index advances, ingressing in Year Semester 1', () => {
    expect(semesterPosition(2024, 1, 1)).toEqual({ year: 2024, yearSemester: 2 });
    expect(semesterPosition(2024, 1, 2)).toEqual({ year: 2025, yearSemester: 1 });
    expect(semesterPosition(2024, 1, 3)).toEqual({ year: 2025, yearSemester: 2 });
  });

  it('alternates Year Semesters as the index advances, ingressing in Year Semester 2', () => {
    expect(semesterPosition(2024, 2, 1)).toEqual({ year: 2025, yearSemester: 1 });
    expect(semesterPosition(2024, 2, 2)).toEqual({ year: 2025, yearSemester: 2 });
  });
});

describe('formatYearSemesterLabel', () => {
  it('formats as "year/semester"', () => {
    expect(formatYearSemesterLabel({ year: 2024, yearSemester: 1 })).toBe('2024/1');
  });
});

describe('currentSemesterIndex', () => {
  it('returns the index matching the real-world current date', () => {
    const profile = { ingressYear: 2024, ingressYearSemester: 1, semesters: [{}, {}, {}] };
    // 2025 in the first half of the year is Year Semester 1, absolute index 2 => semester index 2.
    expect(currentSemesterIndex(profile, new Date(2025, 2, 1))).toBe(2);
  });

  it('returns null when the plan has not reached the current date yet', () => {
    const profile = { ingressYear: 2024, ingressYearSemester: 1, semesters: [{}] };
    expect(currentSemesterIndex(profile, new Date(2026, 2, 1))).toBeNull();
  });

  it('returns null when the current date precedes ingress', () => {
    const profile = { ingressYear: 2024, ingressYearSemester: 1, semesters: [{}] };
    expect(currentSemesterIndex(profile, new Date(2020, 2, 1))).toBeNull();
  });
});

describe('createPlannedSection', () => {
  it('generates an id and defaults failed/audit to false', () => {
    const section = createPlannedSection({ kind: 'offering', subjectCode: 'ELE01', turma: '01' });
    expect(section.id).toBeTypeOf('string');
    expect(section.failed).toBe(false);
    expect(section.audit).toBe(false);
    expect(section.subjectCode).toBe('ELE01');
  });
});

describe('addPlannedSemester / deleteLastPlannedSemester', () => {
  it('appends a new semester with the given sections', () => {
    const profile = { semesters: [] };
    const updated = addPlannedSemester(profile, [{ id: 's1' }]);
    expect(updated.semesters).toEqual([{ sections: [{ id: 's1' }] }]);
  });

  it('removes only the last semester', () => {
    const profile = { semesters: [{ sections: [{ id: 'a' }] }, { sections: [{ id: 'b' }] }], shiftFilter: 'morning' };
    const updated = deleteLastPlannedSemester(profile);
    expect(updated.semesters).toEqual([{ sections: [{ id: 'a' }] }]);
    expect(updated.shiftFilter).toBe('morning');
  });

  it('clears the shift filter when no semesters remain', () => {
    const profile = { semesters: [{ sections: [] }], shiftFilter: 'morning' };
    const updated = deleteLastPlannedSemester(profile);
    expect(updated.semesters).toEqual([]);
    expect(updated.shiftFilter).toBeNull();
  });
});

describe('addSectionToSemester / removeSectionFromSemester', () => {
  it('adds a section to the targeted semester only', () => {
    const profile = { semesters: [{ sections: [] }, { sections: [] }] };
    const updated = addSectionToSemester(profile, 1, { id: 's1' });
    expect(updated.semesters[0].sections).toEqual([]);
    expect(updated.semesters[1].sections).toEqual([{ id: 's1' }]);
  });

  it('removes a section by id from the targeted semester only', () => {
    const profile = { semesters: [{ sections: [{ id: 'a' }, { id: 'b' }] }] };
    const updated = removeSectionFromSemester(profile, 0, 'a');
    expect(updated.semesters[0].sections).toEqual([{ id: 'b' }]);
  });
});

describe('toggleSectionMark', () => {
  it('toggles the failed flag on the targeted section only', () => {
    const profile = { semesters: [{ sections: [{ id: 'a', failed: false, audit: false }] }] };
    const updated = toggleSectionMark(profile, 0, 'a', 'failed');
    expect(updated.semesters[0].sections[0].failed).toBe(true);
    expect(updated.semesters[0].sections[0].audit).toBe(false);
  });

  it('toggles the audit flag independently', () => {
    const profile = { semesters: [{ sections: [{ id: 'a', failed: false, audit: false }] }] };
    const updated = toggleSectionMark(profile, 0, 'a', 'audit');
    expect(updated.semesters[0].sections[0].audit).toBe(true);
  });
});
