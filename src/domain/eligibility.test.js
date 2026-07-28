import { describe, expect, it } from 'vitest';
import {
  buildCandidateSubjects,
  buildCombinedCandidatePool,
  candidateSectionKey,
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
      suggestedSemester: 3,
    },
    {
      code: 'ELE02',
      name: 'Lab. Circuitos I',
      prerequisites: [],
      corequisites: [],
      equivalents: [],
      suggestedSemester: null,
    },
  ],
};

const offerings = {
  subjects: [
    {
      code: 'MAT01',
      sections: [{ turma: '01', professor: 'X', shift: 'morning', sessions: [] }],
    },
    {
      code: 'MAT02',
      sections: [{ turma: '01', professor: 'X', shift: 'morning', sessions: [] }],
    },
    {
      code: 'ELE01',
      sections: [{ turma: '01', professor: 'X', shift: 'afternoon', sessions: [] }],
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
    classification: 'required',
    ...overrides,
  });
}

describe('buildCandidateSubjects', () => {
  it('excludes a Subject whose prerequisites are not satisfied', () => {
    const result = candidates();
    expect(result.map((c) => c.subjectCode)).not.toContain('MAT02');
  });

  it('includes a Subject once its prerequisites are satisfied', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.map((c) => c.subjectCode)).toContain('MAT02');
  });

  it('excludes a Subject already fulfilled without an open Audit Mark', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.map((c) => c.subjectCode)).not.toContain('MAT01');
  });

  it('re-includes a Subject whose fulfillment carries an open Audit Mark', () => {
    const result = candidates({
      fulfillmentBefore: new Map([['MAT01', { audit: true }]]),
    });
    expect(result.map((c) => c.subjectCode)).toContain('MAT01');
  });

  it('never checks co-requisites itself — that is the shared look-ahead rule\'s job (pruneCorequisiteLookahead)', () => {
    const result = candidates();
    expect(result.map((c) => c.subjectCode)).toContain('ELE01');
  });

  it('filters Sections by the Shift filter, dropping a Subject with no matching Sections', () => {
    const result = candidates({ shiftFilter: 'afternoon' });
    expect(result.map((c) => c.subjectCode)).not.toContain('MAT01');
  });

  it('keeps a null-shift (session-less) Section under every Shift filter value', () => {
    const noShiftOfferings = {
      subjects: [
        {
          code: 'MAT01',
          sections: [{ turma: '01', professor: 'X', shift: null, sessions: [] }],
        },
      ],
    };
    for (const shiftFilter of ['morning', 'afternoon', 'day']) {
      const result = candidates({ offerings: noShiftOfferings, shiftFilter });
      expect(result.map((c) => c.subjectCode)).toContain('MAT01');
    }
  });

  it('merges Sections offered under an equivalent code into the same candidate Subject', () => {
    const equivalentPpc = {
      id: 'test-ppc',
      subjects: [
        {
          code: 'MAT01',
          name: 'Cálculo I',
          prerequisites: [],
          corequisites: [],
          equivalents: ['MAT01-OLD'],
          suggestedSemester: 1,
        },
      ],
    };
    const equivalentOfferings = {
      subjects: [
        {
          code: 'MAT01',
          sections: [{ turma: '01', professor: 'X', shift: 'day', sessions: [] }],
        },
        {
          code: 'MAT01-OLD',
          sections: [{ turma: '02', professor: 'Y', shift: 'day', sessions: [] }],
        },
      ],
    };
    const result = candidates({
      ppc: equivalentPpc,
      offerings: equivalentOfferings,
    });
    const matches = result.filter((c) => c.subjectCode === 'MAT01');
    expect(matches).toHaveLength(1);
    expect(matches[0].sections).toHaveLength(2);
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
    expect(result.some((c) => c.subjectName === 'Trabalho')).toBe(true);
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
    expect(result.some((c) => c.subjectName === 'Trabalho')).toBe(false);
  });

  it('marks a Custom Section stale when its Subject link no longer resolves', () => {
    const result = candidates({
      customSections: [
        {
          id: 'c1',
          name: 'Trabalho',
          applicability: 1,
          subjectCode: 'DOES-NOT-EXIST',
          sessions: [],
        },
      ],
    });
    const custom = result.find((c) => c.subjectName === 'Trabalho');
    expect(custom.stale).toBe(true);
  });

  it('never lists Custom Sections for the optional classification (UC-27)', () => {
    const result = candidates({
      classification: 'optional',
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
    expect(result.some((c) => c.subjectName === 'Trabalho')).toBe(false);
  });

  it('assigns "core" tier to a Subject suggested at or before the semester being planned', () => {
    const result = candidates({ semesterNumber: 1 });
    expect(result.find((c) => c.subjectCode === 'MAT01').tier).toBe('core');
  });

  it('assigns "other" tier to a Subject suggested for a later semester', () => {
    const result = candidates({
      semesterNumber: 1,
      fulfillmentBefore: new Map([['MAT01', { audit: false }]]),
    });
    expect(result.find((c) => c.subjectCode === 'ELE01').tier).toBe('other');
  });

  it('assigns "core" tier to a Subject with no Suggested Semester regardless of semesterNumber', () => {
    const result = candidates({
      semesterNumber: 1,
      fulfillmentBefore: new Map([
        ['MAT01', { audit: false }],
        ['ELE02', { audit: false }],
      ]),
    });
    // ELE02 has no offering Section in the fixture; assert via a Custom Section instead.
    const custom = buildCandidateSubjects({
      ppc,
      offerings,
      yearSemester: 1,
      fulfillmentBefore: new Map(),
      sameSemesterCodes: new Set(),
      shiftFilter: 'day',
      classification: 'required',
      semesterNumber: 1,
      customSections: [
        {
          id: 'c1',
          name: 'Lab copy',
          applicability: 1,
          subjectCode: 'ELE02',
          sessions: [],
        },
      ],
    });
    expect(custom.find((c) => c.subjectCode === 'ELE02').tier).toBe('core');
    expect(result).toBeTruthy();
  });

  it('assigns "core" tier when semesterNumber is not provided', () => {
    const result = candidates();
    expect(result.find((c) => c.subjectCode === 'MAT01').tier).toBe('core');
  });

  describe('classification', () => {
    const classifiedPpc = {
      id: 'classified-ppc',
      subjects: [
        {
          code: 'REQ01',
          name: 'Obrigatória',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'required',
        },
        {
          code: 'OPT01',
          name: 'Optativa',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'optional',
        },
      ],
    };
    const classifiedOfferings = {
      subjects: [
        {
          code: 'REQ01',
          sections: [{ turma: '01', shift: 'day', sessions: [] }],
        },
        {
          code: 'OPT01',
          sections: [{ turma: '01', shift: 'day', sessions: [] }],
        },
      ],
    };

    it('lists only Required Subjects when classification is "required"', () => {
      const result = buildCandidateSubjects({
        ppc: classifiedPpc,
        offerings: classifiedOfferings,
        yearSemester: 1,
        fulfillmentBefore: new Map(),
        sameSemesterCodes: new Set(),
        customSections: [],
        shiftFilter: 'day',
        classification: 'required',
      });
      expect(result.map((c) => c.subjectCode)).toEqual(['REQ01']);
    });

    it('lists only Optional Subjects when classification is "optional"', () => {
      const result = buildCandidateSubjects({
        ppc: classifiedPpc,
        offerings: classifiedOfferings,
        yearSemester: 1,
        fulfillmentBefore: new Map(),
        sameSemesterCodes: new Set(),
        customSections: [],
        shiftFilter: 'day',
        classification: 'optional',
      });
      expect(result.map((c) => c.subjectCode)).toEqual(['OPT01']);
    });

    it('treats a Subject with no known classification as Required', () => {
      const noClassPpc = {
        id: 'no-class-ppc',
        subjects: [
          {
            code: 'X01',
            name: 'Sem classificação',
            prerequisites: [],
            corequisites: [],
            equivalents: [],
          },
        ],
      };
      const noClassOfferings = {
        subjects: [
          { code: 'X01', sections: [{ turma: '01', shift: 'day', sessions: [] }] },
        ],
      };
      const result = buildCandidateSubjects({
        ppc: noClassPpc,
        offerings: noClassOfferings,
        yearSemester: 1,
        fulfillmentBefore: new Map(),
        sameSemesterCodes: new Set(),
        customSections: [],
        shiftFilter: 'day',
        classification: 'required',
      });
      expect(result.map((c) => c.subjectCode)).toEqual(['X01']);
    });

    it('excludes a hidden Optional Subject when classification is "optional" (UC-28)', () => {
      const result = buildCandidateSubjects({
        ppc: classifiedPpc,
        offerings: classifiedOfferings,
        yearSemester: 1,
        fulfillmentBefore: new Map(),
        sameSemesterCodes: new Set(),
        customSections: [],
        shiftFilter: 'day',
        classification: 'optional',
        hiddenSubjects: ['OPT01'],
      });
      expect(result).toEqual([]);
    });
  });
});

describe('excludeAlreadyPlannedSections', () => {
  it('excludes an offering Section already present by Subject code + turma + sessions', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          tier: 'core',
          sections: [
            { kind: 'offering', subjectCode: 'MAT01', turma: '01', sessions: [] },
          ],
        },
      ],
      [
        {
          id: 's1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          sessions: [],
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toEqual([]);
  });

  it('keeps a rescheduled turma addable (an Offering Mismatch, not excluded here)', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          tier: 'core',
          sections: [
            {
              kind: 'offering',
              subjectCode: 'MAT01',
              turma: '01',
              sessions: [
                { day: 'Seg', startTime: '08:00', endTime: '10:00' },
              ],
            },
          ],
        },
      ],
      [
        {
          id: 's1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          // Stale embedded copy: the turma's sessions changed since it was planned.
          sessions: [{ day: 'Ter', startTime: '10:00', endTime: '12:00' }],
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toHaveLength(1);
  });

  it('keeps a different turma of an already-planned Subject (a Duplicate Subject, not excluded here)', () => {
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: 'MAT01',
          subjectName: 'Cálculo I',
          stale: false,
          tier: 'core',
          sections: [
            { kind: 'offering', subjectCode: 'MAT01', turma: '02', sessions: [] },
          ],
        },
      ],
      [
        {
          id: 's1',
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
    const sessions = [{ day: 'Seg', startTime: '10:00', endTime: '12:00' }];
    const result = excludeAlreadyPlannedSections(
      [
        {
          subjectCode: null,
          subjectName: 'Trabalho',
          stale: false,
          tier: 'core',
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
          id: 's1',
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
          tier: 'core',
          sections: [
            { kind: 'offering', subjectCode: 'MAT01', turma: '01', sessions: [] },
          ],
        },
      ],
      [
        {
          id: 's1',
          kind: 'offering',
          subjectCode: 'MAT01',
          turma: '01',
          sessions: [],
          failed: false,
          audit: false,
        },
      ],
    );
    expect(result).toHaveLength(0);
  });
});

describe('pruneCorequisiteLookahead', () => {
  it('keeps a Subject with no co-requisites', () => {
    const result = pruneCorequisiteLookahead(
      [{ subjectCode: 'MAT01', subjectName: 'Cálculo I', stale: false, sections: [] }],
      ppc,
      new Map(),
    );
    expect(result.map((c) => c.subjectCode)).toEqual(['MAT01']);
  });

  it('drops a Subject whose co-requisite is neither fulfilled nor listed', () => {
    const result = pruneCorequisiteLookahead(
      [{ subjectCode: 'ELE01', subjectName: 'Circuitos I', stale: false, sections: [] }],
      ppc,
      new Map(),
    );
    expect(result).toEqual([]);
  });

  it('keeps a Subject whose co-requisite is already fulfilled', () => {
    const result = pruneCorequisiteLookahead(
      [{ subjectCode: 'ELE01', subjectName: 'Circuitos I', stale: false, sections: [] }],
      ppc,
      new Map([['ELE02', { audit: false }]]),
    );
    expect(result.map((c) => c.subjectCode)).toEqual(['ELE01']);
  });

  it('keeps a Subject whose co-requisite is itself present in the pool', () => {
    const result = pruneCorequisiteLookahead(
      [
        { subjectCode: 'ELE01', subjectName: 'Circuitos I', stale: false, sections: [] },
        { subjectCode: 'ELE02', subjectName: 'Lab. Circuitos I', stale: false, sections: [] },
      ],
      ppc,
      new Map(),
    );
    expect(result.map((c) => c.subjectCode).sort()).toEqual(['ELE01', 'ELE02']);
  });

  it('keeps a Subject whose co-requisite is already planned in the same semester (sameSemesterCodes)', () => {
    const result = pruneCorequisiteLookahead(
      [{ subjectCode: 'ELE01', subjectName: 'Circuitos I', stale: false, sections: [] }],
      ppc,
      new Map(),
      new Set(['ELE02']),
    );
    expect(result.map((c) => c.subjectCode)).toEqual(['ELE01']);
  });

  it('cascades: dropping a co-requisite also drops Subjects that depended on it', () => {
    const cascadingPpc = {
      id: 'cascading-ppc',
      subjects: [
        {
          code: 'A',
          name: 'A',
          prerequisites: [],
          corequisites: ['B'],
          equivalents: [],
        },
        {
          code: 'B',
          name: 'B',
          prerequisites: [],
          corequisites: ['C'],
          equivalents: [],
        },
      ],
    };
    const result = pruneCorequisiteLookahead(
      [
        { subjectCode: 'A', subjectName: 'A', stale: false, sections: [] },
        { subjectCode: 'B', subjectName: 'B', stale: false, sections: [] },
      ],
      cascadingPpc,
      new Map(),
    );
    expect(result).toEqual([]);
  });

  it('never prunes an unlinked Custom Section (null subjectCode)', () => {
    const result = pruneCorequisiteLookahead(
      [{ subjectCode: null, subjectName: 'Trabalho', stale: false, sections: [] }],
      ppc,
      new Map(),
    );
    expect(result.map((c) => c.subjectName)).toEqual(['Trabalho']);
  });

  it('honors a combined required + optional pool: a required Subject kept alive by an optional co-requisite present in the pool', () => {
    const mixedPpc = {
      id: 'mixed-ppc',
      subjects: [
        {
          code: 'REQ01',
          name: 'Obrigatória',
          prerequisites: [],
          corequisites: ['OPT01'],
          equivalents: [],
          classification: 'required',
        },
        {
          code: 'OPT01',
          name: 'Optativa',
          prerequisites: [],
          corequisites: [],
          equivalents: [],
          classification: 'optional',
        },
      ],
    };
    const combinedPool = [
      { subjectCode: 'REQ01', subjectName: 'Obrigatória', stale: false, sections: [] },
      { subjectCode: 'OPT01', subjectName: 'Optativa', stale: false, sections: [] },
    ];
    const result = pruneCorequisiteLookahead(combinedPool, mixedPpc, new Map());
    expect(result.map((c) => c.subjectCode).sort()).toEqual(['OPT01', 'REQ01']);
  });
});

describe('buildCombinedCandidatePool', () => {
  const mixedPpc = {
    id: 'mixed-ppc',
    subjects: [
      {
        code: 'REQ01',
        name: 'Obrigatória',
        prerequisites: [],
        corequisites: ['OPT01'],
        equivalents: [],
        classification: 'required',
      },
      {
        code: 'OPT01',
        name: 'Optativa',
        prerequisites: [],
        corequisites: [],
        equivalents: [],
        classification: 'optional',
      },
    ],
  };
  const mixedOfferings = {
    subjects: [
      { code: 'REQ01', sections: [{ turma: '01', shift: 'day', sessions: [] }] },
      { code: 'OPT01', sections: [{ turma: '01', shift: 'day', sessions: [] }] },
    ],
  };

  function combined(overrides = {}) {
    return buildCombinedCandidatePool({
      ppc: mixedPpc,
      offerings: mixedOfferings,
      yearSemester: 1,
      fulfillmentBefore: new Map(),
      sameSemesterCodes: new Set(),
      customSections: [],
      shiftFilter: 'day',
      ...overrides,
    });
  }

  it('keeps a Required Subject alive via an Optional co-requisite present in the pool', () => {
    const result = combined();
    expect(result.required.map((c) => c.subjectCode)).toEqual(['REQ01']);
    expect(result.optional.map((c) => c.subjectCode)).toEqual(['OPT01']);
  });

  it('drops the Required Subject once its Optional co-requisite is hidden (UC-28)', () => {
    const result = combined({ hiddenSubjects: ['OPT01'] });
    expect(result.required).toEqual([]);
    expect(result.optional).toEqual([]);
  });

  it('never lists Custom Sections in the optional half (UC-27)', () => {
    const result = combined({
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
    expect(result.required.some((c) => c.subjectName === 'Trabalho')).toBe(
      true,
    );
    expect(result.optional.some((c) => c.subjectName === 'Trabalho')).toBe(
      false,
    );
  });
});

describe('candidateSectionKey', () => {
  it('builds a distinct key per offering Section', () => {
    expect(
      candidateSectionKey({ kind: 'offering', subjectCode: 'MAT01', turma: '01' }),
    ).toBe('offering:MAT01:01');
  });

  it('builds a distinct key per Custom Section', () => {
    expect(
      candidateSectionKey({ kind: 'custom', sourceCustomId: 'c1' }),
    ).toBe('custom:c1');
  });
});
