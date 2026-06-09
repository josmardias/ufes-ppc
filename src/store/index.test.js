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
});
