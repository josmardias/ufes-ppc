// See docs/ARCHITECTURE.md, "Testing Policy": storage tests use an
// in-memory localStorage stub rather than a full DOM environment.

import { beforeEach, describe, expect, it } from 'vitest';
import { CURRENT_SCHEMA_VERSION, STORAGE_KEY, defaultEnvelope, loadEnvelope, saveEnvelope } from './envelope.js';
import { InMemoryStorage } from '../test/inMemoryStorage.js';

beforeEach(() => {
  globalThis.localStorage = new InMemoryStorage();
});

describe('envelope storage', () => {
  it('returns a default envelope when nothing is stored', () => {
    expect(loadEnvelope()).toEqual(defaultEnvelope());
  });

  it('round-trips a saved envelope', () => {
    const envelope = { schemaVersion: CURRENT_SCHEMA_VERSION, activeProfileId: 'p1', profiles: [{ id: 'p1' }] };
    saveEnvelope(envelope);
    expect(loadEnvelope()).toEqual(envelope);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTypeOf('string');
  });

  it('throws on corrupted JSON instead of silently discarding it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(() => loadEnvelope()).toThrow(/corrupted/);
  });

  it('throws when the stored schema version has no migration path', () => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({ schemaVersion: 0, activeProfileId: null, profiles: [] }));
    expect(() => loadEnvelope()).toThrow(/No migration available/);
  });
});
