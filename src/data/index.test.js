// Regression test for the src/data eager-glob loader (see index.js and
// docs/ARCHITECTURE.md, "src/data"). Requires `npm run build-data` to have
// populated src/data/ppcs and src/data/offerings first, since both are
// git-ignored / build-time generated.

import { describe, expect, it } from 'vitest';
import { getOfferings, getPpc, offerings, ppcs } from './index.js';

describe('src/data loader', () => {
  it('loads the Engenharia Elétrica PPC', () => {
    const ppc = getPpc('engenharia-eletrica-2022');
    expect(ppc).toBeDefined();
    expect(ppc.name).toBe('Engenharia Elétrica 2022');
    expect(ppc.subjects.length).toBeGreaterThan(0);
  });

  it('loads both Year Semester Offerings snapshots for that PPC', () => {
    const ys1 = getOfferings('engenharia-eletrica-2022', 1);
    const ys2 = getOfferings('engenharia-eletrica-2022', 2);
    expect(ys1?.subjects.length).toBeGreaterThan(0);
    expect(ys2?.subjects.length).toBeGreaterThan(0);
  });

  it('returns undefined for an unknown PPC or Year Semester', () => {
    expect(getPpc('does-not-exist')).toBeUndefined();
    expect(getOfferings('engenharia-eletrica-2022', 3)).toBeUndefined();
  });

  it('keys every registry entry by its own id', () => {
    for (const [id, ppc] of Object.entries(ppcs)) expect(ppc.id).toBe(id);
    for (const [ppcId, byYearSemester] of Object.entries(offerings)) {
      for (const [yearSemester, snapshot] of Object.entries(byYearSemester)) {
        expect(snapshot.ppcId).toBe(ppcId);
        expect(String(snapshot.yearSemester)).toBe(yearSemester);
      }
    }
  });
});
