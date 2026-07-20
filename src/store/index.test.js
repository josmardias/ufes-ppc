import { beforeEach, describe, expect, it, vi } from 'vitest';
import { InMemoryStorage } from '../test/inMemoryStorage.js';

beforeEach(() => {
  globalThis.localStorage = new InMemoryStorage();
  vi.resetModules();
});

describe('store', () => {
  it('loads the default envelope on first use', async () => {
    const { useStore } = await import('./index.js');
    const state = useStore.getState();
    expect(state.activeProfileId).toBeNull();
    expect(state.profiles).toEqual([]);
  });

  it('setActiveProfileId updates state and writes through to storage', async () => {
    const { useStore } = await import('./index.js');
    useStore.getState().setActiveProfileId('p1');
    expect(useStore.getState().activeProfileId).toBe('p1');

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().activeProfileId).toBe('p1');
  });

  it('createProfile adds the profile, makes it active, and persists it', async () => {
    const { useStore } = await import('./index.js');
    const result = useStore.getState().createProfile({
      name: 'Maria',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
    });

    expect(result.ok).toBe(true);
    expect(result.profile.name).toBe('Maria');
    expect(useStore.getState().profiles).toEqual([result.profile]);
    expect(useStore.getState().activeProfileId).toBe(result.profile.id);

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles).toEqual([result.profile]);
    expect(reloadedStore.getState().activeProfileId).toBe(result.profile.id);
  });

  it('createProfile rejects an empty name without persisting anything', async () => {
    const { useStore } = await import('./index.js');
    const result = useStore.getState().createProfile({
      name: '  ',
      ingressYear: 2024,
      ingressYearSemester: 1,
      shift: 'morning',
    });

    expect(result).toEqual({ ok: false, error: 'empty' });
    expect(useStore.getState().profiles).toEqual([]);
  });

  it('createProfile rejects a duplicate name without persisting anything', async () => {
    const { useStore } = await import('./index.js');
    useStore.getState().createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const result = useStore.getState().createProfile({
      name: 'Maria',
      ingressYear: 2025,
      ingressYearSemester: 2,
      shift: 'afternoon',
    });

    expect(result).toEqual({ ok: false, error: 'duplicate' });
    expect(useStore.getState().profiles).toHaveLength(1);
  });
});

describe('cloneProfile', () => {
  it('copies the profile under a new name without making it active (UC-04)', async () => {
    const { useStore } = await import('./index.js');
    const { profile: source } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const result = useStore.getState().cloneProfile(source.id, 'Maria (cópia)');

    expect(result.ok).toBe(true);
    expect(result.profile.id).not.toBe(source.id);
    expect(result.profile.name).toBe('Maria (cópia)');
    expect(useStore.getState().profiles).toHaveLength(2);
    expect(useStore.getState().activeProfileId).toBe(source.id);

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles).toHaveLength(2);
  });

  it('rejects a duplicate name without persisting anything', async () => {
    const { useStore } = await import('./index.js');
    const { profile: source } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const result = useStore.getState().cloneProfile(source.id, 'Maria');

    expect(result).toEqual({ ok: false, error: 'duplicate' });
    expect(useStore.getState().profiles).toHaveLength(1);
  });
});

describe('deleteProfile', () => {
  it('removes the profile and persists the change', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    useStore.getState().deleteProfile(profile.id);

    expect(useStore.getState().profiles).toEqual([]);

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles).toEqual([]);
  });

  it('clears the active selection when the deleted profile was active', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    useStore.getState().deleteProfile(profile.id);

    expect(useStore.getState().activeProfileId).toBeNull();
  });

  it('leaves the active selection untouched when a different profile is deleted', async () => {
    const { useStore } = await import('./index.js');
    const { profile: active } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const { profile: other } = useStore
      .getState()
      .createProfile({ name: 'João', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    useStore.getState().setActiveProfileId(active.id);

    useStore.getState().deleteProfile(other.id);

    expect(useStore.getState().activeProfileId).toBe(active.id);
  });
});

describe('renameProfile', () => {
  it('updates the name and persists the change', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const result = useStore.getState().renameProfile(profile.id, 'Maria Silva');

    expect(result.ok).toBe(true);
    expect(useStore.getState().profiles[0].name).toBe('Maria Silva');

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles[0].name).toBe('Maria Silva');
  });

  it('allows renaming a profile to its own current name', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const result = useStore.getState().renameProfile(profile.id, 'Maria');

    expect(result.ok).toBe(true);
  });

  it('rejects a name that duplicates another profile', async () => {
    const { useStore } = await import('./index.js');
    useStore.getState().createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const { profile: joao } = useStore
      .getState()
      .createProfile({ name: 'João', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const result = useStore.getState().renameProfile(joao.id, 'Maria');

    expect(result).toEqual({ ok: false, error: 'duplicate' });
    expect(useStore.getState().profiles.find((profile) => profile.id === joao.id).name).toBe('João');
  });
});

describe('exportProfile / importProfile', () => {
  it('round-trips a profile through export and import under a fresh id', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });

    const exported = useStore.getState().exportProfile(profile.id);
    expect(exported.profile.id).toBeUndefined();

    useStore.getState().deleteProfile(profile.id);
    const result = useStore.getState().importProfile(JSON.stringify(exported));

    expect(result.ok).toBe(true);
    expect(result.profile.id).not.toBe(profile.id);
    expect(result.profile.name).toBe('Maria');
    expect(useStore.getState().profiles).toEqual([result.profile]);
  });

  it('rejects import of an invalid file without persisting anything', async () => {
    const { useStore } = await import('./index.js');
    const result = useStore.getState().importProfile('{not json');

    expect(result).toEqual({ ok: false, error: 'invalid' });
    expect(useStore.getState().profiles).toEqual([]);
  });

  it('reports a duplicate name conflict without overwrite, and overwrites when asked', async () => {
    const { useStore } = await import('./index.js');
    const { profile: original } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const exported = useStore.getState().exportProfile(original.id);

    const conflict = useStore.getState().importProfile(JSON.stringify(exported));
    expect(conflict).toEqual({ ok: false, error: 'duplicate', name: 'Maria' });
    expect(useStore.getState().profiles).toHaveLength(1);

    const overwritten = useStore.getState().importProfile(JSON.stringify(exported), { overwrite: true });
    expect(overwritten.ok).toBe(true);
    expect(overwritten.profile.id).not.toBe(original.id);
    expect(useStore.getState().profiles).toEqual([overwritten.profile]);
  });

  it('rejects a profile referencing an unknown PPC', async () => {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    const exported = useStore.getState().exportProfile(profile.id);
    exported.profile.ppcId = 'does-not-exist';

    const result = useStore.getState().importProfile(JSON.stringify(exported));

    expect(result).toEqual({ ok: false, error: 'unknown-ppc' });
  });
});

describe('planner actions', () => {
  async function setup() {
    const { useStore } = await import('./index.js');
    const { profile } = useStore
      .getState()
      .createProfile({ name: 'Maria', ingressYear: 2024, ingressYearSemester: 1, shift: 'morning' });
    return { useStore, profileId: profile.id };
  }

  it('setProfilePpc persists the PPC while there are no Planned Semesters', async () => {
    const { useStore, profileId } = await setup();
    const result = useStore.getState().setProfilePpc(profileId, 'test-ppc');
    expect(result.ok).toBe(true);
    expect(useStore.getState().profiles[0].ppcId).toBe('test-ppc');

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles[0].ppcId).toBe('test-ppc');
  });

  it('setProfilePpc rejects switching once Planned Semesters exist', async () => {
    const { useStore, profileId } = await setup();
    useStore.getState().setProfilePpc(profileId, 'test-ppc');
    useStore.getState().addPlannedSemester(profileId, []);

    const result = useStore.getState().setProfilePpc(profileId, 'other-ppc');
    expect(result).toEqual({ ok: false, error: 'has-semesters' });
    expect(useStore.getState().profiles[0].ppcId).toBe('test-ppc');
  });

  it('setProfilePpc derives courseId from the chosen PPC', async () => {
    const { useStore, profileId } = await setup();
    const result = useStore.getState().setProfilePpc(profileId, 'engenharia-eletrica-2022');
    expect(result.ok).toBe(true);
    expect(useStore.getState().profiles[0].courseId).toBe('06');
  });

  it('setProfilePpc sets courseId to null for an unknown PPC', async () => {
    const { useStore, profileId } = await setup();
    const result = useStore.getState().setProfilePpc(profileId, 'test-ppc');
    expect(result.ok).toBe(true);
    expect(useStore.getState().profiles[0].courseId).toBeNull();
  });

  it('addPlannedSemester appends a semester with the given sections and persists it', async () => {
    const { useStore, profileId } = await setup();
    const section = { id: 's1', kind: 'offering', subjectCode: 'MAT01', turma: '01', failed: false, audit: false };

    useStore.getState().addPlannedSemester(profileId, [section]);

    expect(useStore.getState().profiles[0].semesters).toEqual([{ sections: [section] }]);

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles[0].semesters).toEqual([{ sections: [section] }]);
  });

  it('addSectionToSemester and removeSectionFromSemester mutate the targeted semester and persist', async () => {
    const { useStore, profileId } = await setup();
    useStore.getState().addPlannedSemester(profileId, []);
    const section = { id: 's1', kind: 'offering', subjectCode: 'MAT01', turma: '01', failed: false, audit: false };

    useStore.getState().addSectionToSemester(profileId, 0, section);
    expect(useStore.getState().profiles[0].semesters[0].sections).toEqual([section]);

    useStore.getState().removeSectionFromSemester(profileId, 0, 's1');
    expect(useStore.getState().profiles[0].semesters[0].sections).toEqual([]);
  });

  it('deleteLastSemester removes only the last semester and persists the change', async () => {
    const { useStore, profileId } = await setup();
    useStore.getState().addPlannedSemester(profileId, []);
    useStore.getState().addPlannedSemester(profileId, []);

    useStore.getState().deleteLastSemester(profileId);

    expect(useStore.getState().profiles[0].semesters).toHaveLength(1);

    vi.resetModules();
    const { useStore: reloadedStore } = await import('./index.js');
    expect(reloadedStore.getState().profiles[0].semesters).toHaveLength(1);
  });

  it('toggleFailedMark and toggleAuditMark flip the marks on the targeted section', async () => {
    const { useStore, profileId } = await setup();
    const section = { id: 's1', kind: 'offering', subjectCode: 'MAT01', turma: '01', failed: false, audit: false };
    useStore.getState().addPlannedSemester(profileId, [section]);

    useStore.getState().toggleFailedMark(profileId, 0, 's1');
    expect(useStore.getState().profiles[0].semesters[0].sections[0].failed).toBe(true);

    useStore.getState().toggleAuditMark(profileId, 0, 's1');
    expect(useStore.getState().profiles[0].semesters[0].sections[0].audit).toBe(true);
  });

  it('setShiftFilter persists the toggle', async () => {
    const { useStore, profileId } = await setup();
    useStore.getState().setShiftFilter(profileId, 'afternoon');
    expect(useStore.getState().profiles[0].shiftFilter).toBe('afternoon');
  });
});
