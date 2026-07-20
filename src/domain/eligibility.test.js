import { describe, expect, it } from 'vitest';
import {
  buildCandidateSubjects,
  excludeAlreadyPlannedSections,
  pruneCorequisiteLookahead,
} from './eligibility.js';

const ppc = {
  id: 'test-ppc',
  subjects: [
    {
      code: 'MAT01',
      name: 'Cálculo I',
      prerequisites: [],
      corequisites: [],
      equivalents: [],
      suggestedSemester: 1,
    },
    {
      code: 'MAT02',
      name: 'Cálculo II',
      prerequisites: ['MAT01'],
      corequisites: [],
      equivalents: [],
      suggestedSemester: 2,
    },
    {
      code: 'ELE01',
      name: 'Circuitos I',
      prerequisites: [],
      corequisites: ['ELE02'],
      equivalents: [],
    },
    {
      code: 'ELE02',
      name: 'Lab. Circuitos I',
      prerequisites: [],
      corequisites: [],
      equivalents: [],
    },
  ],
};

const offerings = {
  subjects: [
    {
      code: 'MAT01',
      sections: [
        { turma: '01', professor: 'A', shift: 'morning', sessions: [] },
      ],
    },
    {
      code: 'MAT02',
      sections: [
        { turma: '01', professor: 'B', shift: 'afternoon', sessions: [] },
      ],
    },
    {
      code: 'ELE01',
      sections: [
        { turma: '01', professor: 'C', shift: 'morning', sessions: [] },
      ],
    },
  ],
};

function candidates(overrides = {}) {
  return buildCandidateSubjects({
    ppc,
    offerings,
    yearSemester: 1,
    fulfillmentBefore: new Map(),
    sameSemesterCodes: new Set(),
    customSections: [],
    shiftFilter: 'day',
    checkCorequisites: false,
    ...overrides,
  });
}

describe('buildCandidateSubjects', () => {
  it('excludes a Subject whose prerequisites are not satisfied', () => {
    const result = candidates();
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeUndefined();
  });

  it('includes a Subject once its prerequisites are satisfied', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeDefined();
  });

  it('excludes a Subject already fulfilled without an open Audit Mark', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeUndefined();
  });

  it('re-includes a Subject whose fulfillment carries an open Audit Mark', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: true }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
  });

  it('does not check co-requisites when checkCorequisites is false (UC-11)', () => {
    const result = candidates({ checkCorequisites: false });
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('excludes a Subject with an unmet co-requisite when checkCorequisites is true (UC-12)', () => {
    const result = candidates({ checkCorequisites: true });
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeUndefined();
  });

  it('includes a Subject whose co-requisite is planned in the same semester', () => {
    const result = candidates({
      checkCorequisites: true,
      sameSemesterCodes: new Set(['ELE02']),
    });
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('filters Sections by the Shift filter, dropping a Subject with no matching Sections', () => {
    const result = candidates({ shiftFilter: 'morning' });
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeUndefined();
  });

  it('includes a Custom Section applicable to this Year Semester', () => {
    const result = candidates({
      customSections: [
        {
          id: 'c1',
          name: 'Trabalho',
          applicability: 1,
          subjectCode: null,
          sessions: [],
        },
      ],
    });
    expect(result.find((c) => c.subjectName === 'Trabalho')).toBeDefined();
  });

  it('excludes a Custom Section not applicable to this Year Semester', () => {
    const result = candidates({
      customSections: [
        {
          id: 'c1',
          name: 'Trabalho',
          applicability: 2,
          subjectCode: null,
          sessions: [],
        },
      ],
    });
    expect(result.find((c) => c.subjectName === 'Trabalho')).toBeUndefined();
  });

  it('marks a Custom Section stale when its Subject link no longer resolves', () => {
    const result = candidates({
      customSections: [
        {
          id: 'c1',
          name: 'Turma extra',
          applicability: 'both',
          subjectCode: 'ZZZ99',
          sessions: [],
        },
      ],
    });
    expect(result.find((c) => c.subjectName === 'Turma extra')?.stale).toBe(
      true,
    );
  });

  it('excludes a Section targeted at another course when the course filter is "own"', () => {
    const result = candidates({
      courseFilter: 'own',
      profileCourseId: '06',
      offerings: {
        subjects: [
          {
            code: 'MAT01',
            sections: [
              {
                turma: '01',
                professor: 'A',
                shift: 'day',
                targetCourseId: '11',
                sessions: [],
              },
            ],
          },
        ],
      },
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeUndefined();
  });

  it('includes a Section targeted at another course when the course filter is "all"', () => {
    const result = candidates({
      courseFilter: 'all',
      profileCourseId: '06',
      offerings: {
        subjects: [
          {
            code: 'MAT01',
            sections: [
              {
                turma: '01',
                professor: 'A',
                shift: 'day',
                targetCourseId: '11',
                sessions: [],
              },
            ],
          },
        ],
      },
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
  });

  it('includes a Section targeted at the profile\'s own course under the "own" filter', () => {
    const result = candidates({
      courseFilter: 'own',
      profileCourseId: '06',
      offerings: {
        subjects: [
          {
            code: 'MAT01',
            sections: [
              {
                turma: '01',
                professor: 'A',
                shift: 'day',
                targetCourseId: '06',
                sessions: [],
              },
            ],
          },
        ],
      },
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
  });

  it('does not restrict Custom Sections by the course filter', () => {
    const result = candidates({
      courseFilter: 'own',
      profileCourseId: '06',
      customSections: [
        {
          id: 'c1',
          name: 'Trabalho',
          applicability: 1,
          subjectCode: null,
          sessions: [],
        },
      ],
    });
    expect(result.find((c) => c.subjectName === 'Trabalho')).toBeDefined();
  });

  it('includes a Subject suggested at or before the semester being planned when the semester filter is "suggested"', () => {
    const result = candidates({
      semesterFilter: 'suggested',
      semesterNumber: 1,
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
  });

  it('includes a Subject suggested for the current semester when the semester filter is "suggested"', () => {
    const result = candidates({
      semesterFilter: 'suggested',
      semesterNumber: 2,
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeDefined();
  });

  it('excludes a Subject suggested for a semester after the one being planned when the semester filter is "suggested"', () => {
    const result = candidates({
      semesterFilter: 'suggested',
      semesterNumber: 1,
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeUndefined();
  });

  it('includes a Subject suggested for a later semester when the semester filter is "advance"', () => {
    const result = candidates({
      semesterFilter: 'advance',
      semesterNumber: 1,
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'MAT02')).toBeDefined();
  });

  it('includes a Subject with no Suggested Semester regardless of the semester filter', () => {
    const result = candidates({
      semesterFilter: 'suggested',
      semesterNumber: 1,
    });
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('includes a Required Subject and excludes an Optional one when the classification filter is "required"', () => {
    const classifiedPpc = {
      id: 'test-ppc',
      subjects: [
        {
          code: 'MAT01',
          name: 'Cálculo I',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'required',
        },
        {
          code: 'ELE01',
          name: 'Circuitos I',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'optional',
        },
      ],
    };
    const result = candidates({
      ppc: classifiedPpc,
      classificationFilter: 'required',
      offerings: {
        subjects: [
          {
            code: 'MAT01',
            sections: [{ turma: '01', shift: 'day', sessions: [] }],
          },
          {
            code: 'ELE01',
            sections: [{ turma: '01', shift: 'day', sessions: [] }],
          },
        ],
      },
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeUndefined();
  });

  it('includes both Required and Optional Subjects when the classification filter is "all"', () => {
    const classifiedPpc = {
      id: 'test-ppc',
      subjects: [
        {
          code: 'MAT01',
          name: 'Cálculo I',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'required',
        },
        {
          code: 'ELE01',
          name: 'Circuitos I',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'optional',
        },
      ],
    };
    const result = candidates({
      ppc: classifiedPpc,
      classificationFilter: 'all',
      offerings: {
        subjects: [
          {
            code: 'MAT01',
            sections: [{ turma: '01', shift: 'day', sessions: [] }],
          },
          {
            code: 'ELE01',
            sections: [{ turma: '01', shift: 'day', sessions: [] }],
          },
        ],
      },
    });
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('does not restrict Custom Sections by the classification filter', () => {
    const result = candidates({
      classificationFilter: 'required',
      customSections: [
        {
          id: 'c1',
          name: 'Trabalho',
          applicability: 1,
          subjectCode: null,
          sessions: [],
        },
      ],
    });
    expect(result.find((c) => c.subjectName === 'Trabalho')).toBeDefined();
  });
});

describe('excludeAlreadyPlannedSections', () => {
  it('excludes an offering Section already present by Subject code + turma', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          sections: [
            {
              kind: 'offering',
              subjectCode: 'MAT01',
              turma: '01',
              sessions: [],
            },
          ],
        },
      ],
      [
        {
          id: 'p1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toEqual([]);
  });

  it('keeps a different turma of an already-planned Subject (a Duplicate Subject, not excluded here)', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          sections: [
            {
              kind: 'offering',
              subjectCode: 'MAT01',
              turma: '02',
              sessions: [],
            },
          ],
        },
      ],
      [
        {
          id: 'p1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toHaveLength(1);
  });

  it('excludes a Custom Section already present by embedded name + sessions', () => {
    const sessions = [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }];
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: null,
          subjectName: 'Trabalho',
          stale: false,
          sections: [
            {
              kind: 'custom',
              subjectCode: null,
              sourceCustomId: 'c1',
              custom: { name: 'Trabalho', sessions },
              sessions,
            },
          ],
        },
      ],
      [
        {
          id: 'p1',
          kind: 'custom',
          subjectCode: null,
          custom: { name: 'Trabalho', sessions },
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toEqual([]);
  });

  it('drops a Subject entirely once every Section is excluded', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          sections: [
            {
              kind: 'offering',
              subjectCode: 'MAT01',
              turma: '01',
              sessions: [],
            },
          ],
        },
      ],
      [
        {
          id: 'p1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeUndefined();
  });
});

describe('pruneCorequisiteLookahead', () => {
  it('keeps a Subject with no co-requisites', () => {
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          sections: [],
        },
      ],
      ppc,
      new Map(),
    );
    expect(result.find((c) => c.subjectCode === 'MAT01')).toBeDefined();
  });

  it('drops a Subject whose co-requisite is neither fulfilled nor listed', () => {
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: 'ELE01',
          subjectName: 'Circuitos I',
          stale: false,
          sections: [],
        },
      ],
      ppc,
      new Map(),
    );
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeUndefined();
  });

  it('keeps a Subject whose co-requisite is already fulfilled', () => {
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: 'ELE01',
          subjectName: 'Circuitos I',
          stale: false,
          sections: [],
        },
      ],
      ppc,
      new Map([['ELE02', { audit: false }]]),
    );
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('keeps a Subject whose co-requisite is itself present in the pool', () => {
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: 'ELE01',
          subjectName: 'Circuitos I',
          stale: false,
          sections: [],
        },
        {
          subjectCode: 'ELE02',
          subjectName: 'Lab. Circuitos I',
          stale: false,
          sections: [],
        },
      ],
      ppc,
      new Map(),
    );
    expect(result.find((c) => c.subjectCode === 'ELE01')).toBeDefined();
  });

  it('cascades: dropping a co-requisite also drops Subjects that depended on it', () => {
    const cascadingPpc = {
      id: 'test-ppc',
      subjects: [
        ...ppc.subjects,
        {
          code: 'ELE03',
          name: 'Circuitos II',
          prerequisites: [],
          corequisites: ['ELE01'],
          equivalents: [],
        },
      ],
    };
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: 'ELE01',
          subjectName: 'Circuitos I',
          stale: false,
          sections: [],
        },
        {
          subjectCode: 'ELE03',
          subjectName: 'Circuitos II',
          stale: false,
          sections: [],
        },
      ],
      cascadingPpc,
      new Map(),
    );
    expect(result).toEqual([]);
  });

  it('never prunes an unlinked Custom Section (null subjectCode)', () => {
    const result = pruneCorequisiteLookahead(
      [
        {
          subjectCode: null,
          subjectName: 'Trabalho',
          stale: false,
          sections: [],
        },
      ],
      ppc,
      new Map(),
    );
    expect(result).toHaveLength(1);
  });
});
