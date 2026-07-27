// See docs/ARCHITECTURE.md, "Testing Policy": storage tests use an
// in-memory localStorage stub rather than a full DOM environment.

import { beforeEach, describe, expect, it } from 'vitest';
import {
  CURRENT_SCHEMA_VERSION,
  STORAGE_KEY,
  defaultEnvelope,
  loadEnvelope,
  saveEnvelope,
} from './envelope.js';
import { InMemoryStorage } from '../test/inMemoryStorage.js';

beforeEach(() => {
  globalThis.localStorage = new InMemoryStorage();
});

describe('envelope storage', () => {
  it('returns a default envelope when nothing is stored', () => {
    expect(loadEnvelope()).toEqual(defaultEnvelope());
  });

  it('round-trips a saved envelope', () => {
    const envelope = {
      schemaVersion: CURRENT_SCHEMA_VERSION,
      activeProfileId: 'p1',
      profiles: [{ id: 'p1' }],
    };
    saveEnvelope(envelope);
    expect(loadEnvelope()).toEqual(envelope);
    expect(localStorage.getItem(STORAGE_KEY)).toBeTypeOf('string');
  });

  it('throws on corrupted JSON instead of silently discarding it', () => {
    localStorage.setItem(STORAGE_KEY, '{not json');
    expect(() => loadEnvelope()).toThrow(/corrupted/);
  });

  it('throws when the stored schema version has no migration path', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({ schemaVersion: 0, activeProfileId: null, profiles: [] }),
    );
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
        profiles: [
          { id: 'p1', ppcId: 'engenharia-eletrica-2022', semesters: [] },
        ],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.profiles[0].courseId).toBe('06');
  });

  it('ends up with the migrateV2toV3-backfilled PPC when ppcId was null (see that describe block below)', () => {
    // migrateEnvelope always runs the full migration chain to
    // CURRENT_SCHEMA_VERSION, so a null ppcId does not stay null: it is
    // subsequently backfilled by migrateV2toV3.
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: null,
        profiles: [{ id: 'p1', ppcId: null, semesters: [] }],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.profiles[0].courseId).toBe('06');
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

describe('migrateV2toV3 (backfills ppcId/courseId, adds completedSemesters/hiddenSubjects)', () => {
  it('backfills ppcId and courseId with hardcoded values when ppcId was null', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeProfileId: null,
        profiles: [
          { id: 'p1', ppcId: null, courseId: null, semesters: [] },
        ],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.profiles[0].ppcId).toBe('engenharia-eletrica-2022');
    expect(envelope.profiles[0].courseId).toBe('06');
    expect(envelope.profiles[0].completedSemesters).toBe(0);
    expect(envelope.profiles[0].hiddenSubjects).toEqual([]);
  });

  it('leaves an already-set ppcId/courseId untouched', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeProfileId: null,
        profiles: [
          {
            id: 'p1',
            ppcId: 'engenharia-eletrica-2022',
            courseId: '06',
            semesters: [],
          },
        ],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.profiles[0].ppcId).toBe('engenharia-eletrica-2022');
    expect(envelope.profiles[0].courseId).toBe('06');
  });

  it('sets completedSemesters to 0 and hiddenSubjects to [] regardless of prior state', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 2,
        activeProfileId: null,
        profiles: [
          {
            id: 'p1',
            ppcId: 'engenharia-eletrica-2022',
            courseId: '06',
            semesters: [{ sections: [] }],
          },
        ],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.profiles[0].completedSemesters).toBe(0);
    expect(envelope.profiles[0].hiddenSubjects).toEqual([]);
  });

  it('migrates a schema version 1 envelope all the way to the current version', () => {
    localStorage.setItem(
      STORAGE_KEY,
      JSON.stringify({
        schemaVersion: 1,
        activeProfileId: null,
        profiles: [{ id: 'p1', ppcId: null, semesters: [] }],
      }),
    );

    const envelope = loadEnvelope();

    expect(envelope.schemaVersion).toBe(CURRENT_SCHEMA_VERSION);
    expect(envelope.profiles[0].ppcId).toBe('engenharia-eletrica-2022');
    expect(envelope.profiles[0].courseId).toBe('06');
    expect(envelope.profiles[0].completedSemesters).toBe(0);
    expect(envelope.profiles[0].hiddenSubjects).toEqual([]);
  });
});
