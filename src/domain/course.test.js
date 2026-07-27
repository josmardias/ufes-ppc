import { describe, expect, it } from 'vitest';
import { groupPpcsByCourse } from './course.js';

describe('groupPpcsByCourse', () => {
  it('groups PPC versions under their course', () => {
    const ppcs = [
      { id: 'a-2022', name: 'A 2022', courseId: '1', courseName: 'Curso A' },
      { id: 'b-2022', name: 'B 2022', courseId: '2', courseName: 'Curso B' },
    ];
    const result = groupPpcsByCourse(ppcs);
    expect(result).toEqual([
      { courseId: '1', courseName: 'Curso A', ppcs: [{ id: 'a-2022', name: 'A 2022' }] },
      { courseId: '2', courseName: 'Curso B', ppcs: [{ id: 'b-2022', name: 'B 2022' }] },
    ]);
  });

  it('collects multiple PPC versions of the same course together', () => {
    const ppcs = [
      { id: 'a-2018', name: 'A 2018', courseId: '1', courseName: 'Curso A' },
      { id: 'a-2022', name: 'A 2022', courseId: '1', courseName: 'Curso A' },
    ];
    const result = groupPpcsByCourse(ppcs);
    expect(result).toHaveLength(1);
    expect(result[0].ppcs.map((p) => p.id)).toEqual(['a-2018', 'a-2022']);
  });

  it('sorts courses by name and PPC versions within a course by name', () => {
    const ppcs = [
      { id: 'b-2022', name: 'B 2022', courseId: '2', courseName: 'Curso B' },
      { id: 'a-2022', name: 'A 2022', courseId: '1', courseName: 'Curso A' },
      { id: 'a-2018', name: 'A 2018', courseId: '1', courseName: 'Curso A' },
    ];
    const result = groupPpcsByCourse(ppcs);
    expect(result.map((c) => c.courseId)).toEqual(['1', '2']);
    expect(result[0].ppcs.map((p) => p.id)).toEqual(['a-2018', 'a-2022']);
  });

  it('returns an empty array for an empty input', () => {
    expect(groupPpcsByCourse([])).toEqual([]);
  });
});
