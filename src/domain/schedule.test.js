import { describe, expect, it } from 'vitest';
import {
  effectiveShiftFilter,
  plannedSectionSessions,
  sectionMatchesShiftFilter,
  sectionsOverlap,
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
    expect(sectionsOverlap([], [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }])).toBe(false);
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
    expect(effectiveShiftFilter({ shift: 'morning', shiftFilter: 'afternoon' })).toBe('afternoon');
  });

  it('falls back to the profile shift when no toggle is set', () => {
    expect(effectiveShiftFilter({ shift: 'morning', shiftFilter: null })).toBe('morning');
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
        sections: [{ turma: '01', sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }] }],
      },
    ],
  };

  it('resolves an offering Section by subject code and turma', () => {
    const section = { kind: 'offering', subjectCode: 'ELE01', turma: '01' };
    expect(plannedSectionSessions(section, offerings)).toEqual([{ day: 'Seg', startTime: '08:00', endTime: '10:00' }]);
  });

  it('returns an empty array for an unresolved offering Section', () => {
    const section = { kind: 'offering', subjectCode: 'ELE99', turma: '01' };
    expect(plannedSectionSessions(section, offerings)).toEqual([]);
  });

  it('returns the embedded sessions for a Custom Section', () => {
    const section = { kind: 'custom', custom: { name: 'Estágio', sessions: [] } };
    expect(plannedSectionSessions(section, offerings)).toEqual([]);
  });
});
