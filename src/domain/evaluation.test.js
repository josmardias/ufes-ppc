import { describe, expect, it } from 'vitest';
import { evaluatePlan } from './evaluation.js';

const ppc = {
  id: 'test-ppc',
  subjects: [
    {
      code: 'MAT01',
      name: 'Cálculo I',
      workloadHours: 60,
      prerequisites: [],
      corequisites: [],
      equivalents: ['MAT01-OLD'],
      minWorkloadHours: null,
    },
    {
      code: 'MAT02',
      name: 'Cálculo II',
      workloadHours: 60,
      prerequisites: ['MAT01'],
      corequisites: [],
      equivalents: [],
      minWorkloadHours: null,
    },
    {
      code: 'ELE01',
      name: 'Circuitos I',
      workloadHours: 60,
      prerequisites: ['MAT01'],
      corequisites: ['ELE02'],
      equivalents: [],
      minWorkloadHours: null,
    },
    {
      code: 'ELE02',
      name: 'Lab. Circuitos I',
      workloadHours: 30,
      prerequisites: [],
      corequisites: [],
      equivalents: [],
      minWorkloadHours: null,
    },
    {
      code: 'EST01',
      name: 'Estágio',
      workloadHours: 200,
      prerequisites: [],
      corequisites: [],
      equivalents: [],
      minWorkloadHours: 100,
    },
  ],
};

function section(subjectCode, turma, sessions = []) {
  return {
    kind: 'offering',
    subjectCode,
    turma,
    sessions,
    failed: false,
    audit: false,
    id: `${subjectCode}-${turma}`,
  };
}

function baseProfile(overrides = {}) {
  return {
    ingressYear: 2024,
    ingressYearSemester: 1,
    semesters: [],
    creditEntries: [],
    customSections: [],
    ...overrides,
  };
}

describe('evaluatePlan', () => {
  it('marks a Subject fulfilled by a non-failed Section as satisfying a later prerequisite', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        { sections: [section('MAT02', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[1].sections[0].signals.unmetRequisite).toBe(false);
  });

  it('offsets each Planned Semester\'s position by completedSemesters (the plan starts right after the completed count)', () => {
    const profile = baseProfile({
      completedSemesters: 2,
      semesters: [{ sections: [] }],
    });
    const result = evaluatePlan(profile, ppc, {});
    // Ingress 2024/1; with 2 completed semesters, the first Planned Semester
    // (plan index 0) lands at absolute position 2 => 2025/1.
    expect(result.semesters[0].year).toBe(2025);
    expect(result.semesters[0].yearSemester).toBe(1);
  });

  it('flags an Unmet Requisite when the prerequisite was never planned', () => {
    const profile = baseProfile({
      semesters: [{ sections: [section('MAT02', '01')] }],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[0].sections[0].signals.unmetRequisite).toBe(true);
    expect(result.semesters[0].status).toBe('errors');
  });

  it('cascades: a Failed prerequisite confers nothing forward, flagging dependents recursively', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [{ ...section('MAT01', '01'), failed: true }] },
        { sections: [section('MAT02', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[1].sections[0].signals.unmetRequisite).toBe(true);
  });

  it('Credit Entries fulfill a Subject from the very start of the timeline', () => {
    const profile = baseProfile({
      creditEntries: [{ subjectCode: 'MAT01', audit: false }],
      semesters: [{ sections: [section('MAT02', '01')] }],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[0].sections[0].signals.unmetRequisite).toBe(false);
  });

  it('satisfies a co-requisite planned in the same semester', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        { sections: [section('ELE01', '01'), section('ELE02', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    const ele01 = result.semesters[1].sections.find(
      (s) => s.subjectCode === 'ELE01',
    );
    expect(ele01.signals.unmetRequisite).toBe(false);
  });

  it('flags an Unmet Requisite when the co-requisite is missing from the same semester', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        { sections: [section('ELE01', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    const ele01 = result.semesters[1].sections.find(
      (s) => s.subjectCode === 'ELE01',
    );
    expect(ele01.signals.unmetRequisite).toBe(true);
  });

  it('resolves an equivalent code to its canonical Subject for fulfillment', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01-OLD', '01')] },
        { sections: [section('MAT02', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[0].sections[0].resolvedSubjectCode).toBe('MAT01');
    expect(result.semesters[1].sections[0].signals.unmetRequisite).toBe(false);
  });

  it('evaluates a minWorkloadHours threshold requisite against fulfilled workload', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        { sections: [section('EST01', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    // Only 60h fulfilled (MAT01), Estágio requires 100h.
    expect(result.semesters[1].sections[0].signals.unmetRequisite).toBe(true);
  });

  it('flags a Duplicate Subject when two Sections in the same semester fulfill the same Subject', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01'), section('MAT01', '02')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(
      result.semesters[0].sections.every((s) => s.signals.duplicateSubject),
    ).toBe(true);
    expect(result.semesters[0].status).toBe('warnings');
  });

  it('flags a Schedule Conflict for overlapping sessions in the same semester', () => {
    const offerings = {
      subjects: [
        {
          code: 'MAT01',
          sections: [
            {
              turma: '01',
              sessions: [{ day: 'Seg', startTime: '08:00', endTime: '10:00' }],
            },
          ],
        },
        {
          code: 'ELE02',
          sections: [
            {
              turma: '01',
              sessions: [{ day: 'Seg', startTime: '09:00', endTime: '11:00' }],
            },
          ],
        },
      ],
    };
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01'), section('ELE02', '01')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, { 1: offerings });
    expect(
      result.semesters[0].sections.every((s) => s.signals.scheduleConflict),
    ).toBe(true);
  });

  it("resolves an offering Section's target course from the Offerings snapshot", () => {
    const offerings = {
      subjects: [
        {
          code: 'MAT01',
          sections: [
            {
              turma: '01',
              targetCourseId: '11',
              targetCourseName: 'Engenharia Mecânica',
              sessions: [],
            },
          ],
        },
      ],
    };
    const profile = baseProfile({
      semesters: [{ sections: [section('MAT01', '01')] }],
    });
    const result = evaluatePlan(profile, ppc, { 1: offerings });
    expect(result.semesters[0].sections[0].targetCourseId).toBe('11');
    expect(result.semesters[0].sections[0].targetCourseName).toBe(
      'Engenharia Mecânica',
    );
  });

  it('leaves the target course null for a Custom Section or an unresolved offering Section', () => {
    const profile = baseProfile({
      semesters: [
        {
          sections: [
            section('MAT99', '01'),
            {
              kind: 'custom',
              subjectCode: null,
              custom: { name: 'Estágio', sessions: [] },
              failed: false,
              audit: false,
              id: 'c1',
            },
          ],
        },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(
      result.semesters[0].sections.every(
        (s) => s.targetCourseId === null && s.targetCourseName === null,
      ),
    ).toBe(true);
  });

  it('flags a Redundant Enrollment when a Subject is already fulfilled without an open Audit Mark', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        { sections: [section('MAT01', '02')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[1].sections[0].signals.redundantEnrollment).toBe(
      true,
    );
  });

  it('suppresses the Redundant Enrollment flag when the fulfillment carries an open Audit Mark', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [{ ...section('MAT01', '01'), audit: true }] },
        { sections: [section('MAT01', '02')] },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[1].sections[0].signals.redundantEnrollment).toBe(
      false,
    );
  });

  it('a Failed Mark still satisfies a same-semester co-requisite', () => {
    const profile = baseProfile({
      semesters: [
        { sections: [section('MAT01', '01')] },
        {
          sections: [
            section('ELE01', '01'),
            { ...section('ELE02', '01'), failed: true },
          ],
        },
      ],
    });
    const result = evaluatePlan(profile, ppc, {});
    const ele01 = result.semesters[1].sections.find(
      (s) => s.subjectCode === 'ELE01',
    );
    expect(ele01.signals.unmetRequisite).toBe(false);
  });

  it('computes a clean status when there are no signals', () => {
    const profile = baseProfile({
      semesters: [{ sections: [section('MAT01', '01')] }],
    });
    const result = evaluatePlan(profile, ppc, {});
    expect(result.semesters[0].status).toBe('clean');
  });
});
