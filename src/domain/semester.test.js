import { describe, expect, it } from 'vitest';
import {
  addPlannedSemester,
  addSectionToSemester,
  createPlannedSection,
  currentSemesterIndex,
  deleteLastPlannedSemester,
  elapsedSemesters,
  formatYearSemesterLabel,
  removeSectionFromSemester,
  semesterOrdinal,
  semesterPosition,
  toggleSectionMark,
} from './semester.js';

describe('semesterPosition', () => {
  it('starts at the ingress Year Semester', () => {
    expect(semesterPosition(2024, 1, 0)).toEqual({
      year: 2024,
      yearSemester: 1,
    });
    expect(semesterPosition(2024, 2, 0)).toEqual({
      year: 2024,
      yearSemester: 2,
    });
  });

  it('alternates Year Semesters as the index advances, ingressing in Year Semester 1', () => {
    expect(semesterPosition(2024, 1, 1)).toEqual({
      year: 2024,
      yearSemester: 2,
    });
    expect(semesterPosition(2024, 1, 2)).toEqual({
      year: 2025,
      yearSemester: 1,
    });
    expect(semesterPosition(2024, 1, 3)).toEqual({
      year: 2025,
      yearSemester: 2,
    });
  });

  it('alternates Year Semesters as the index advances, ingressing in Year Semester 2', () => {
    expect(semesterPosition(2024, 2, 1)).toEqual({
      year: 2025,
      yearSemester: 1,
    });
    expect(semesterPosition(2024, 2, 2)).toEqual({
      year: 2025,
      yearSemester: 2,
    });
  });

  it('defaults completedSemesters to 0, matching the previous behavior', () => {
    expect(semesterPosition(2024, 1, 2)).toEqual(
      semesterPosition(2024, 1, 2, 0),
    );
  });

  it('offsets the index by completedSemesters (the first Planned Semester takes position completedSemesters + 1)', () => {
    // With 3 completed semesters, plan index 0 lands where plain index 3
    // would (see the "ingressing in Year Semester 1" case above).
    expect(semesterPosition(2024, 1, 0, 3)).toEqual({
      year: 2025,
      yearSemester: 2,
    });
    expect(semesterPosition(2024, 1, 1, 3)).toEqual(semesterPosition(2024, 1, 4));
  });
});

describe('semesterOrdinal', () => {
  it('is index + 1 when no semesters are completed', () => {
    expect(semesterOrdinal(0)).toBe(1);
    expect(semesterOrdinal(2)).toBe(3);
  });

  it('offsets by completedSemesters (the first Planned Semester displays completedSemesters + 1)', () => {
    expect(semesterOrdinal(0, 3)).toBe(4);
    expect(semesterOrdinal(1, 3)).toBe(5);
  });
});

describe('elapsedSemesters', () => {
  it('returns 0 when the current date is still the ingress semester', () => {
    expect(elapsedSemesters(2024, 1, new Date(2024, 2, 1))).toBe(0);
  });

  it('counts each fully elapsed Year Semester since ingress', () => {
    // Ingress 2024/1; by 2025/2 (second half), three semesters (2024/1,
    // 2024/2, 2025/1) have fully elapsed and 2025/2 is in progress.
    expect(elapsedSemesters(2024, 1, new Date(2025, 8, 1))).toBe(3);
  });

  it('never returns a negative number for a date preceding ingress', () => {
    expect(elapsedSemesters(2024, 1, new Date(2020, 2, 1))).toBe(0);
  });
});

describe('formatYearSemesterLabel', () => {
  it('formats as "year/semester"', () => {
    expect(formatYearSemesterLabel({ year: 2024, yearSemester: 1 })).toBe(
      '2024/1',
    );
  });
});

describe('currentSemesterIndex', () => {
  it('returns the index matching the real-world current date', () => {
    const profile = {
      ingressYear: 2024,
      ingressYearSemester: 1,
      completedSemesters: 0,
      semesters: [{}, {}, {}],
    };
    // 2025 in the first half of the year is Year Semester 1, absolute index 2 => semester index 2.
    expect(currentSemesterIndex(profile, new Date(2025, 2, 1))).toBe(2);
  });

  it('returns null when the plan has not reached the current date yet', () => {
    const profile = {
      ingressYear: 2024,
      ingressYearSemester: 1,
      completedSemesters: 0,
      semesters: [{}],
    };
    expect(currentSemesterIndex(profile, new Date(2026, 2, 1))).toBeNull();
  });

  it('returns null when the current date precedes ingress', () => {
    const profile = {
      ingressYear: 2024,
      ingressYearSemester: 1,
      completedSemesters: 0,
      semesters: [{}],
    };
    expect(currentSemesterIndex(profile, new Date(2020, 2, 1))).toBeNull();
  });

  it('shifts the matched index back by completedSemesters', () => {
    // Same calendar date as the first test (absolute index 2), but this
    // Student had already completed 2 semesters at profile creation, so the
    // plan's own index 0 is where absolute index 2 falls.
    const profile = {
      ingressYear: 2024,
      ingressYearSemester: 1,
      completedSemesters: 2,
      semesters: [{}],
    };
    expect(currentSemesterIndex(profile, new Date(2025, 2, 1))).toBe(0);
  });

  it('defaults completedSemesters to 0 when absent (legacy profile shape)', () => {
    const profile = {
      ingressYear: 2024,
      ingressYearSemester: 1,
      semesters: [{}, {}, {}],
    };
    expect(currentSemesterIndex(profile, new Date(2025, 2, 1))).toBe(2);
  });
});

describe('createPlannedSection', () => {
  it('generates an id and defaults failed/audit to false', () => {
    const section = createPlannedSection({
      kind: 'offering',
      subjectCode: 'ELE01',
      turma: '01',
      sessions: [],
    });
    expect(section.id).toBeTypeOf('string');
    expect(section.failed).toBe(false);
    expect(section.audit).toBe(false);
    expect(section.subjectCode).toBe('ELE01');
  });

  it('embeds the candidate\'s sessions and target course on an offering Section, never the professor', () => {
    const section = createPlannedSection({
      kind: 'offering',
      subjectCode: 'ELE01',
      turma: '01',
      shift: 'morning',
      targetCourseId: '12',
      targetCourseName: 'Engenharia Elétrica',
      professor: 'Fulano',
      sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
    });
    expect(section.sessions).toEqual([
      { day: 'Seg', startTime: '08:00', endTime: '10:00' },
    ]);
    expect(section.targetCourseId).toBe('12');
    expect(section.targetCourseName).toBe('Engenharia Elétrica');
    expect(section.professor).toBeUndefined();
  });

  it('defaults an offering Section\'s target course to null when the candidate has none', () => {
    const section = createPlannedSection({
      kind: 'offering',
      subjectCode: 'ELE01',
      turma: '01',
      sessions: [],
    });
    expect(section.targetCourseId).toBeNull();
    expect(section.targetCourseName).toBeNull();
  });

  it('embeds the custom copy on a Custom Section, without a top-level sessions field', () => {
    const custom = { name: 'Estágio', sessions: [] };
    const section = createPlannedSection({
      kind: 'custom',
      subjectCode: null,
      sourceCustomId: 'c1',
      custom,
    });
    expect(section.custom).toEqual(custom);
    expect(section.sessions).toBeUndefined();
  });
});

describe('addPlannedSemester / deleteLastPlannedSemester', () => {
  it('appends a new semester with the given sections', () => {
    const profile = { semesters: [] };
    const updated = addPlannedSemester(profile, [{ id: 's1' }]);
    expect(updated.semesters).toEqual([{ sections: [{ id: 's1' }] }]);
  });

  it('removes only the last semester', () => {
    const profile = {
      semesters: [{ sections: [{ id: 'a' }] }, { sections: [{ id: 'b' }] }],
      shiftFilter: 'morning',
    };
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
    const profile = {
      semesters: [{ sections: [{ id: 'a', failed: false, audit: false }] }],
    };
    const updated = toggleSectionMark(profile, 0, 'a', 'failed');
    expect(updated.semesters[0].sections[0].failed).toBe(true);
    expect(updated.semesters[0].sections[0].audit).toBe(false);
  });

  it('toggles the audit flag independently', () => {
    const profile = {
      semesters: [{ sections: [{ id: 'a', failed: false, audit: false }] }],
    };
    const updated = toggleSectionMark(profile, 0, 'a', 'audit');
    expect(updated.semesters[0].sections[0].audit).toBe(true);
  });
});
