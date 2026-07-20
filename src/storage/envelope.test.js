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

describe('migrateV1toV2 (adds ProfileRecord.courseId)', () => {
  it('derives courseId from the PPC referenced by ppcId', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: null,
        profiles: [{ id: 'p1', ppcId: 'engenharia-eletrica-2022', semesters: [] }],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.profiles[0].courseId).toBe('06');
  });

  it('sets courseId to null when ppcId is null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 1, activeProfileId: null, profiles: [{ id: 'p1', ppcId: null, semesters: [] }] }),
    );

    const envelope = loadEnvelope();

    expect(envelope.profiles[0].courseId).toBeNull();
  });

  it('sets courseId to null when ppcId no longer resolves', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: null,
        profiles: [{ id: 'p1', ppcId: 'does-not-exist', semesters: [] }],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.profiles[0].courseId).toBeNull();
  });
});
