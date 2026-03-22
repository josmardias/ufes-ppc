import { useState, useCallback } from "react";
import {
  readAllProfiles,
  writeAllProfiles,
  readActiveProfileName,
  writeActiveProfileName,
  parseImportedProfileFile,
} from "../storage/profiles.js";
import {
  createProfile,
  cloneProfile,
  serializeProfile,
} from "../domain/profile.js";

/**
 * Storage layout (managed entirely by src/storage/profiles.js):
 *   ppc_alunos       -> { [name]: ProfileRecord }
 *   ppc_aluno_ativo  -> string (name of the currently selected student)
 *
 * ProfileRecord shape:
 *   {
 *     name: string,
 *     course: string|null,
 *     ingressYear: number|null,
 *     ingressYearSemester: 1|2|null,
 *     semesters: CurriculumSemester[],
 *     creditEntries: CreditEntry[],
 *     customOffer: { 1: object|null, 2: object|null },
 *   }
 *
 * This hook is the bridge between the storage/domain layers and the UI.
 * It must NOT call localStorage directly — all persistence goes through
 * src/storage/profiles.js.
 */

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages multiple student planning profiles.
 *
 * API:
 *   profiles                    -> string[]  (registered names, sorted)
 *   activeProfile               -> string    ("" if none selected)
 *   planning                    -> ProfileRecord | null  (active student's data)
 *
 *   selectProfile(name)
 *   createNewProfile(name)                     -> { ok, error }
 *   cloneNamedProfile(sourceName, newName)     -> { ok, error }
 *   deleteProfile(name)
 *   exportProfile(name)                        -> JSON string | null
 *   importProfileFromFile(name, jsonString)    -> { ok, error }
 *   renameProfile(oldName, newName)            -> { ok, error }
 *   logout()
 *
 *   updatePlanning(fn)    — apply fn(currentRecord) => newRecord for active student
 *   setCustomOffer(semester, offerJson)
 *   resetPlanning()
 */
export function usePlanning() {
  const [profilesMap, setProfilesMap] = useState(() => readAllProfiles());
  const [activeProfile, setActiveProfileState] = useState(
    () => readActiveProfileName(),
  );

  const planning =
    activeProfile && profilesMap[activeProfile]
      ? profilesMap[activeProfile]
      : null;

  // ---------------------------------------------------------------------------
  // Internal: persist the full map and sync React state
  // ---------------------------------------------------------------------------

  const persistMap = useCallback((next) => {
    writeAllProfiles(next);
    setProfilesMap(next);
  }, []);

  // ---------------------------------------------------------------------------
  // Profile selection / creation / removal
  // ---------------------------------------------------------------------------

  const selectProfile = useCallback(
    (name) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed || !profilesMap[trimmed]) return;
      writeActiveProfileName(trimmed);
      setActiveProfileState(trimmed);
    },
    [profilesMap],
  );

  const createNewProfile = useCallback(
    (name) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };
      if (profilesMap[trimmed])
        return { ok: false, error: "Já existe um aluno com esse nome." };

      let newRecord;
      try {
        newRecord = createProfile({ name: trimmed });
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }

      const next = { ...profilesMap, [trimmed]: newRecord };
      persistMap(next);
      writeActiveProfileName(trimmed);
      setActiveProfileState(trimmed);
      return { ok: true, error: null };
    },
    [profilesMap, persistMap],
  );

  const cloneNamedProfile = useCallback(
    (sourceName, newName) => {
      const trimmed = String(newName ?? "").trim();
      if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };
      if (profilesMap[trimmed])
        return { ok: false, error: "Já existe um aluno com esse nome." };
      const source = profilesMap[sourceName];
      if (!source)
        return { ok: false, error: "Aluno de origem não encontrado." };

      let cloned;
      try {
        cloned = cloneProfile(source, trimmed);
      } catch (e) {
        return { ok: false, error: e?.message ?? String(e) };
      }

      const next = { ...profilesMap, [trimmed]: cloned };
      persistMap(next);
      writeActiveProfileName(trimmed);
      setActiveProfileState(trimmed);
      return { ok: true, error: null };
    },
    [profilesMap, persistMap],
  );

  const removeProfile = useCallback(
    (name) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed || !profilesMap[trimmed]) return;
      const next = { ...profilesMap };
      delete next[trimmed];
      persistMap(next);
      if (activeProfile === trimmed) {
        writeActiveProfileName("");
        setActiveProfileState("");
      }
    },
    [profilesMap, activeProfile, persistMap],
  );

  const exportProfile = useCallback(
    (name) => {
      const record = profilesMap[name];
      if (!record) return null;
      try {
        return serializeProfile(record);
      } catch {
        return null;
      }
    },
    [profilesMap],
  );

  const importProfileFromFile = useCallback(
    (name, jsonString) => {
      const trimmed = String(name ?? "").trim();
      if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };

      let parsed;
      try {
        parsed = parseImportedProfileFile(jsonString);
      } catch (e) {
        return { ok: false, error: `Arquivo inválido: ${e?.message ?? e}` };
      }

      // Merge into an existing record if one exists, preserving metadata not
      // present in the imported file.
      const existing = profilesMap[trimmed] ?? {
        name: trimmed,
        semesters: [],
        creditEntries: [],
        course: null,
        ingressYear: null,
        ingressYearSemester: null,
        customOffer: { 1: null, 2: null },
      };

      const merged = {
        ...existing,
        name: trimmed,
        semesters: Array.isArray(parsed.semesters)
          ? parsed.semesters
          : existing.semesters,
      };

      const next = { ...profilesMap, [trimmed]: merged };
      persistMap(next);
      writeActiveProfileName(trimmed);
      setActiveProfileState(trimmed);
      return { ok: true, error: null };
    },
    [profilesMap, persistMap],
  );

  const renameProfile = useCallback(
    (oldName, newName) => {
      const trimmedOld = String(oldName ?? "").trim();
      const trimmedNew = String(newName ?? "").trim();

      if (!trimmedNew) return { ok: false, error: "Nome não pode ser vazio." };
      if (trimmedNew === trimmedOld)
        return {
          ok: false,
          error: "O novo nome deve ser diferente do atual.",
        };
      if (profilesMap[trimmedNew])
        return { ok: false, error: "Já existe um aluno com esse nome." };
      if (!profilesMap[trimmedOld])
        return { ok: false, error: "Aluno não encontrado." };

      const next = { ...profilesMap };
      next[trimmedNew] = { ...next[trimmedOld], name: trimmedNew };
      delete next[trimmedOld];
      persistMap(next);

      if (activeProfile === trimmedOld) {
        writeActiveProfileName(trimmedNew);
        setActiveProfileState(trimmedNew);
      }

      return { ok: true, error: null };
    },
    [profilesMap, activeProfile, persistMap],
  );

  const logout = useCallback(() => {
    writeActiveProfileName("");
    setActiveProfileState("");
  }, []);

  // ---------------------------------------------------------------------------
  // Operations on the active student's planning data
  // ---------------------------------------------------------------------------

  /**
   * Applies a transform function to the active student's ProfileRecord and
   * persists the result. fn receives the current record and must return the
   * new record.
   */
  const updatePlanning = useCallback(
    (fn) => {
      if (!activeProfile) return;
      setProfilesMap((current) => {
        const record = current[activeProfile];
        if (!record) return current;
        const updated = fn(record);
        const next = { ...current, [activeProfile]: updated };
        writeAllProfiles(next);
        return next;
      });
    },
    [activeProfile],
  );

  const setCustomOffer = useCallback(
    (semester, offerJson) => {
      updatePlanning((record) => ({
        ...record,
        customOffer: {
          ...(record.customOffer ?? { 1: null, 2: null }),
          [semester]: offerJson,
        },
      }));
    },
    [updatePlanning],
  );

  const resetPlanning = useCallback(() => {
    if (!activeProfile) return;
    updatePlanning(() => ({
      name: activeProfile,
      semesters: [],
      creditEntries: [],
      course: null,
      ingressYear: null,
      ingressYearSemester: null,
      customOffer: { 1: null, 2: null },
    }));
  }, [activeProfile, updatePlanning]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  const profileNames = Object.keys(profilesMap).sort();

  return {
    profiles: profileNames,
    activeProfile,
    planning,
    selectProfile,
    createNewProfile,
    cloneNamedProfile,
    deleteProfile: removeProfile,
    exportProfile,
    importProfileFromFile,
    renameProfile,
    logout,
    updatePlanning,
    setCustomOffer,
    resetPlanning,
  };
}