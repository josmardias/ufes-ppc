import { describe, expect, it } from 'vitest';
import { resolveSubjectByCode, totalFulfilledWorkload } from './subjects.js';

const ppc = {
  id: 'test-ppc',
  subjects: [
    { code: 'ELE01', name: 'Circuitos I', workloadHours: 60, equivalents: ['OLD01'] },
    { code: 'ELE02', name: 'Circuitos II', workloadHours: 60, equivalents: [] },
  ],
};

describe('resolveSubjectByCode', () => {
  it('resolves a Subject by its own code', () => {
    expect(resolveSubjectByCode(ppc, 'ELE01')?.code).toBe('ELE01');
  });

  it('resolves a Subject by an equivalent code', () => {
    expect(resolveSubjectByCode(ppc, 'OLD01')?.code).toBe('ELE01');
  });

  it('returns null for an unknown code', () => {
    expect(resolveSubjectByCode(ppc, 'ZZZ99')).toBeNull();
  });

  it('returns null for a null/undefined code', () => {
    expect(resolveSubjectByCode(ppc, null)).toBeNull();
    expect(resolveSubjectByCode(ppc, undefined)).toBeNull();
  });
});

describe('totalFulfilledWorkload', () => {
  it('sums the workload of every fulfilled Subject known to the PPC', () => {
    const fulfillment = new Map([
      ['ELE01', { audit: false }],
      ['ELE02', { audit: false }],
    ]);
    expect(totalFulfilledWorkload(ppc, fulfillment)).toBe(120);
  });

  it('ignores fulfillment entries that do not resolve to a Subject in this PPC', () => {
    const fulfillment = new Map([['ZZZ99', { audit: false }]]);
    expect(totalFulfilledWorkload(ppc, fulfillment)).toBe(0);
  });
});
