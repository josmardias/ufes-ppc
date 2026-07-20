import { describe, expect, it } from 'vitest';
import {
  effectiveShiftFilter,
  keeperRemovalIds,
  plannedSectionOffering,
  plannedSectionSessions,
  sectionMatchesShiftFilter,
  sectionOverlapsWindow,
  sectionsConflictForPass,
  sectionsConflictInWindow,
  sectionsOverlap,
  stillConflicted,
  timeToMinutes,
} from './schedule.js';

describe('sectionsOverlap', () => {
  it('detects overlapping sessions on the same day', () => {
    const a = [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }];
    const b = [{ day: 'Seg', startTime: '09:00', endTime: '11:00' }];
    expect(sectionsOverlap(a, b)).toBe(true);
  });

  it('does not flag sessions that only touch at the boundary', () => {
    const a = [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }];
    const b = [{ day: 'Seg', startTime: '10:00', endTime: '12:00' }];
    expect(sectionsOverlap(a, b)).toBe(false);
  });

  it('ignores sessions on different days', () => {
    const a = [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }];
    const b = [{ day: 'Ter', startTime: '08:00', endTime: '10:00' }];
    expect(sectionsOverlap(a, b)).toBe(false);
  });

  it('returns false when either side has no sessions', () => {
    expect(
      sectionsOverlap(
        [],
        [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
      ),
    ).toBe(false);
  });
});

// A/B/C non-transitive chain (see docs/USE_CASES.md, UC-25): A 10–12, B
// 11–13, C 12:30–14. A and C don't overlap each other. A and C additionally
// each carry a Wednesday session that overlaps the *other's* Wednesday
// session — a real conflict, but outside every window used below, so it
// must never affect window-scoped results.
const sectionA = {
  id: 'A',
  resolvedSubjectCode: 'MAT01',
  sessions: [
    { day: 'Seg', startTime: '10:00', endTime: '12:00' },
    { day: 'Qua', startTime: '09:30', endTime: '10:30' },
  ],
};
const sectionB = {
  id: 'B',
  resolvedSubjectCode: 'MAT01',
  sessions: [{ day: 'Seg', startTime: '11:00', endTime: '13:00' }],
};
const sectionC = {
  id: 'C',
  resolvedSubjectCode: 'MAT01',
  sessions: [
    { day: 'Seg', startTime: '12:30', endTime: '14:00' },
    { day: 'Qua', startTime: '09:00', endTime: '10:00' },
  ],
};
const windowA = { day: 'Seg', startTime: '10:00', endTime: '12:00' };
const windowB = { day: 'Seg', startTime: '11:00', endTime: '13:00' };

describe('sectionOverlapsWindow', () => {
  it('is true for a Section with a session overlapping the window (membership test)', () => {
    expect(sectionOverlapsWindow(sectionA.sessions, windowA)).toBe(true);
    expect(sectionOverlapsWindow(sectionB.sessions, windowA)).toBe(true);
  });

  it("clicking A's window admits only A and B, not C", () => {
    expect(sectionOverlapsWindow(sectionC.sessions, windowA)).toBe(false);
  });

  it("clicking B's window admits all three", () => {
    expect(sectionOverlapsWindow(sectionA.sessions, windowB)).toBe(true);
    expect(sectionOverlapsWindow(sectionB.sessions, windowB)).toBe(true);
    expect(sectionOverlapsWindow(sectionC.sessions, windowB)).toBe(true);
  });

  it('is true for a multi-session Section when only one session overlaps', () => {
    expect(sectionOverlapsWindow(sectionA.sessions, windowB)).toBe(true);
  });

  it('does not flag sessions that only touch at the boundary', () => {
    const touching = [{ day: 'Seg', startTime: '12:00', endTime: '14:00' }];
    expect(sectionOverlapsWindow(touching, windowA)).toBe(false);
  });

  it('is false for a Section with no sessions', () => {
    expect(sectionOverlapsWindow([], windowA)).toBe(false);
  });
});

describe('sectionsConflictInWindow', () => {
  it('detects a conflict between adjacent members of the chain', () => {
    expect(
      sectionsConflictInWindow(sectionA.sessions, sectionB.sessions, windowB),
    ).toBe(true);
    expect(
      sectionsConflictInWindow(sectionB.sessions, sectionC.sessions, windowB),
    ).toBe(true);
  });

  it('does not flag members that both overlap the window but not each other', () => {
    expect(
      sectionsConflictInWindow(sectionA.sessions, sectionC.sessions, windowB),
    ).toBe(false);
  });

  it('ignores an overlap between the two Sections that falls outside the window', () => {
    // Sanity check: A and C really do overlap on Wednesday...
    expect(sectionsOverlap(sectionA.sessions, sectionC.sessions)).toBe(true);
    // ...but that overlap is outside windowB, so it must not count here.
    expect(
      sectionsConflictInWindow(sectionA.sessions, sectionC.sessions, windowB),
    ).toBe(false);
  });

  it('does not flag sessions that only touch at the boundary', () => {
    const a = [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }];
    const b = [{ day: 'Seg', startTime: '10:00', endTime: '12:00' }];
    const window = { day: 'Seg', startTime: '08:00', endTime: '12:00' };
    expect(sectionsConflictInWindow(a, b, window)).toBe(false);
  });
});

describe('sectionsConflictForPass', () => {
  it('delegates to the window-scoped rule for a Schedule Conflict pass', () => {
    expect(
      sectionsConflictForPass(sectionA, sectionB, 'conflict', windowB),
    ).toBe(true);
    expect(
      sectionsConflictForPass(sectionA, sectionC, 'conflict', windowB),
    ).toBe(false);
  });

  it('compares resolved Subject codes for a Duplicate Subject pass, ignoring the window', () => {
    expect(sectionsConflictForPass(sectionA, sectionB, 'duplicate', null)).toBe(
      true,
    );
    expect(
      sectionsConflictForPass(
        sectionA,
        { ...sectionC, resolvedSubjectCode: 'ELE02' },
        'duplicate',
        null,
      ),
    ).toBe(false);
  });

  it('never flags Sections with no resolved Subject as duplicates', () => {
    const a = { ...sectionA, resolvedSubjectCode: null };
    const b = { ...sectionB, resolvedSubjectCode: null };
    expect(sectionsConflictForPass(a, b, 'duplicate', null)).toBe(false);
  });
});

describe('keeperRemovalIds', () => {
  it('removes only the adjacent member, keeping the non-overlapping third one (non-transitive chain)', () => {
    expect(
      keeperRemovalIds(
        [sectionA, sectionB, sectionC],
        'A',
        'conflict',
        windowB,
      ),
    ).toEqual(['B']);
  });

  it('keeps a member whose only overlap with the keeper falls outside the window', () => {
    // A and C overlap on Wednesday (outside windowB), yet keeping A must not remove C.
    const removed = keeperRemovalIds(
      [sectionA, sectionB, sectionC],
      'A',
      'conflict',
      windowB,
    );
    expect(removed).not.toContain('C');
  });

  it('removes every other member for a Duplicate Subject pass, regardless of schedule', () => {
    const a = { id: 'a', resolvedSubjectCode: 'MAT01', sessions: [] };
    const b = {
      id: 'b',
      resolvedSubjectCode: 'MAT01',
      sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
    };
    const c = {
      id: 'c',
      resolvedSubjectCode: 'MAT01',
      sessions: [{ day: 'Ter', startTime: '08:00', endTime: '10:00' }],
    };
    expect(keeperRemovalIds([a, b, c], 'a', 'duplicate', null).sort()).toEqual([
      'b',
      'c',
    ]);
  });

  it('returns an empty array when the keeper id matches no member', () => {
    expect(
      keeperRemovalIds([sectionA, sectionB], 'missing', 'conflict', windowA),
    ).toEqual([]);
  });
});

describe('stillConflicted', () => {
  it('is true when at least one overlapping pair remains within the window', () => {
    expect(stillConflicted([sectionA, sectionB], 'conflict', windowA)).toBe(
      true,
    );
  });

  it('is false once pruning leaves no overlapping pair inside the window', () => {
    expect(stillConflicted([sectionA, sectionC], 'conflict', windowB)).toBe(
      false,
    );
  });

  it('is false for a single remaining member', () => {
    expect(stillConflicted([sectionA], 'conflict', windowA)).toBe(false);
  });

  it('is true for two or more members in a Duplicate Subject pass', () => {
    expect(stillConflicted([sectionA, sectionB], 'duplicate', null)).toBe(true);
  });

  it('is false for a single remaining member in a Duplicate Subject pass', () => {
    expect(stillConflicted([sectionA], 'duplicate', null)).toBe(false);
  });
});

describe('sectionMatchesShiftFilter', () => {
  it('shows everything under the "day" (whole day) filter', () => {
    expect(sectionMatchesShiftFilter('morning', 'day')).toBe(true);
    expect(sectionMatchesShiftFilter('afternoon', 'day')).toBe(true);
  });

  it('matches a section whose shift equals the filter', () => {
    expect(sectionMatchesShiftFilter('morning', 'morning')).toBe(true);
    expect(sectionMatchesShiftFilter('afternoon', 'morning')).toBe(false);
  });

  it('always shows day-shift sections regardless of the filter', () => {
    expect(sectionMatchesShiftFilter('day', 'morning')).toBe(true);
    expect(sectionMatchesShiftFilter('day', 'afternoon')).toBe(true);
  });
});

describe('effectiveShiftFilter', () => {
  it('uses the persisted toggle when set', () => {
    expect(
      effectiveShiftFilter({ shift: 'morning', shiftFilter: 'afternoon' }),
    ).toBe('afternoon');
  });

  it('falls back to the profile shift when no toggle is set', () => {
    expect(effectiveShiftFilter({ shift: 'morning', shiftFilter: null })).toBe(
      'morning',
    );
  });
});

describe('timeToMinutes', () => {
  it('converts an "HH:MM" string to minutes since midnight', () => {
    expect(timeToMinutes('00:00')).toBe(0);
    expect(timeToMinutes('09:30')).toBe(570);
    expect(timeToMinutes('23:59')).toBe(1439);
  });
});

describe('plannedSectionSessions', () => {
  const offerings = {
    subjects: [
      {
        code: 'ELE01',
        sections: [
          {
            turma: '01',
            sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
          },
        ],
      },
    ],
  };

  it('resolves an offering Section by subject code and turma', () => {
    const section = { kind: 'offering', subjectCode: 'ELE01', turma: '01' };
    expect(plannedSectionSessions(section, offerings)).toEqual([
      { day: 'Seg', startTime: '08:00', endTime: '10:00' },
    ]);
  });

  it('returns an empty array for an unresolved offering Section', () => {
    const section = { kind: 'offering', subjectCode: 'ELE99', turma: '01' };
    expect(plannedSectionSessions(section, offerings)).toEqual([]);
  });

  it('returns the embedded sessions for a Custom Section', () => {
    const section = {
      kind: 'custom',
      custom: { name: 'Estágio', sessions: [] },
    };
    expect(plannedSectionSessions(section, offerings)).toEqual([]);
  });
});

describe('plannedSectionOffering', () => {
  const offerings = {
    subjects: [
      {
        code: 'ELE01',
        sections: [
          {
            turma: '01',
            targetCourseId: '06',
            targetCourseName: 'Engenharia Elétrica',
            sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
          },
        ],
      },
    ],
  };

  it('resolves the raw Offerings-dataset Section by subject code and turma', () => {
    const section = { kind: 'offering', subjectCode: 'ELE01', turma: '01' };
    expect(plannedSectionOffering(section, offerings)).toEqual(
      offerings.subjects[0].sections[0],
    );
  });

  it('returns null for an unresolved offering Section', () => {
    const section = { kind: 'offering', subjectCode: 'ELE99', turma: '01' };
    expect(plannedSectionOffering(section, offerings)).toBeNull();
  });

  it('returns null for a Custom Section', () => {
    const section = {
      kind: 'custom',
      custom: { name: 'Estágio', sessions: [] },
    };
    expect(plannedSectionOffering(section, offerings)).toBeNull();
  });
});
