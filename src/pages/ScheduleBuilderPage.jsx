import { useState, useMemo, useEffect, useCallback } from "react";
import {
  generateSemester,
  addSemester,
  removeSemester,
  replaceSemester,
  addClass,
  removeClass,
  calcAvailableToAdd,
  mergeOffers,
  inferNextSemester,
} from "../domain/planning.js";
import {
  blockingReasons,
  semesterHasScheduleConflict,
  allScheduleConflicts,
  conflictCandidatesForBlock,
  resolveWinningSection,
  semesterToCourseSections,
  courseSectionSlots,
  courseSectionHasConflictOnDay,
} from "../domain/calendar.js";
import { usePlanningContext } from "../App.jsx";
import AddSectionModal from "../components/AddSectionModal.jsx";
import { upsertCustomSection } from "./CustomOfferPage.jsx";
import ppcJson from "../data/ppc-2022.json";
import offer1Json from "../data/oferta-semestre-1.json";
import offer2Json from "../data/oferta-semestre-2.json";
import equivalenciasJson from "../data/equivalencias.json";
import Badge from "../components/Badge.jsx";
import CollapsibleBanner from "../components/CollapsibleBanner.jsx";
import ModalPrimeiroperiodo from "../components/ModalPrimeiroperiodo.jsx";
import ModalAdicionarDisciplinas from "../components/ModalAdicionarDisciplinas.jsx";
import ModalRemoverDisciplina from "../components/ModalRemoverDisciplina.jsx";
import ModalConfirmarPeriodo from "../components/ModalConfirmarPeriodo.jsx";
import ModalResolverConflito from "../components/ModalResolverConflito.jsx";
import SemestreView from "../components/SemestreView.jsx";

// ---------------------------------------------------------------------------
// useActiveOffer — returns system offer merged with the profile's custom offer.
// ---------------------------------------------------------------------------

function useActiveOffer(planning) {
  const customOffer = planning?.customOffer ?? { 1: null, 2: null };
  const merged1 = useMemo(
    () => mergeOffers(offer1Json, customOffer[1] ?? null),
    [customOffer[1]],
  );
  const merged2 = useMemo(
    () => mergeOffers(offer2Json, customOffer[2] ?? null),
    [customOffer[2]],
  );
  return [merged1, merged2];
}

// Base year and semester used when no ingress information is recorded.
const BASE_YEAR = 2024;
const BASE_OFFER_SEMESTER = 1;

// ---------------------------------------------------------------------------
// ScheduleBuilderPage
// ---------------------------------------------------------------------------

export default function ScheduleBuilderPage() {
  const { planning, updatePlanning, setCustomOffer } = usePlanningContext();

  const [mergedOffer1, mergedOffer2] = useActiveOffer(planning);

  // All course suggestions from PPC + both system offers, deduplicated.
  const courseSuggestions = useMemo(() => {
    const map = new Map();
    for (const [key, v] of Object.entries(ppcJson?.courses ?? {})) {
      const codigo = String(v?.code ?? key).trim();
      if (!codigo || codigo.startsWith("Carga")) continue;
      map.set(codigo, String(v?.name ?? "").trim());
    }
    for (const offerJson of [offer1Json, offer2Json]) {
      for (const d of offerJson?.disciplinas ?? []) {
        const codigo = String(d?.codigo ?? "").trim();
        if (!codigo) continue;
        if (!map.has(codigo)) map.set(codigo, String(d?.nome ?? "").trim());
      }
    }
    return Array.from(map.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, []);

  const semesters = planning?.semesters ?? [];
  const ingressYearSemester = planning?.ingressYearSemester ?? null;
  const ingressYear = planning?.ingressYear ?? null;

  // Default shift based on ingress semester
  const defaultShift =
    ingressYearSemester === 1
      ? "manha"
      : ingressYearSemester === 2
        ? "tarde"
        : "dia";

  // Persisted shift preference (stored on planning for convenience)
  const turno = planning?.turno ?? defaultShift;

  const [activeTabIndex, setActiveTabIndex] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(null);
  const [pendingTerm, setPendingTerm] = useState(null);
  const [addingCourses, setAddingCourses] = useState(false);
  const [removingCourse, setRemovingCourse] = useState(null);
  const [editingIndex, setEditingIndex] = useState(null);
  const [addingCustomSection, setAddingCustomSection] = useState(null);
  const [askingEntryTerm, setAskingEntryTerm] = useState(false);

  const isFirstGeneration = semesters.length === 0;

  const next = inferNextSemester(
    semesters,
    ingressYear,
    ingressYearSemester,
    BASE_YEAR,
    BASE_OFFER_SEMESTER,
  );

  const lastIndex = semesters.length > 0 ? semesters.length - 1 : null;
  const lastSemester = lastIndex !== null ? semesters[lastIndex] : null;

  const termBlockingReasons = useMemo(
    () => (lastSemester ? blockingReasons(lastSemester) : []),
    [lastSemester],
  );
  const generateBlocked = termBlockingReasons.length > 0;

  const isEditable = (idx) => idx === lastIndex || idx === editingIndex;

  // Codes accessible in the active tab (prereqs satisfied)
  const accessibleCodes = useMemo(() => {
    if (activeTabIndex === null) return new Set();
    const semestersBeforeActive = semesters.filter((_, i) => i !== activeTabIndex);
    const activeSemester = semesters[activeTabIndex];
    const offerJson =
      activeSemester?.offerSemester === 1 ? mergedOffer1 : mergedOffer2;
    const available = calcAvailableToAdd({
      semesters: semestersBeforeActive,
      creditEntries: planning?.creditEntries ?? [],
      ppcJson,
      offerJson,
      turno: "dia",
      semesterIndex: activeTabIndex,
      equivalenciasJson,
    });
    return new Set(available.map((r) => r.subjectCode));
  }, [activeTabIndex, semesters, mergedOffer1, mergedOffer2, planning?.creditEntries]);

  // Auto-select tab when a new semester is generated
  useEffect(() => {
    if (lastResult !== null) {
      setActiveTabIndex(lastResult.semesterIndex);
    }
  }, [lastResult]);

  // If the active tab no longer exists (e.g. after delete), fall back to last
  useEffect(() => {
    if (activeTabIndex !== null && activeTabIndex >= semesters.length) {
      setActiveTabIndex(semesters.length > 0 ? semesters.length - 1 : null);
    }
    if (activeTabIndex === null && semesters.length > 0) {
      setActiveTabIndex(semesters.length - 1);
    }
    setConfirmDelete(false);
  }, [semesters.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exit edit mode when switching away
  useEffect(() => {
    if (editingIndex !== null && activeTabIndex !== editingIndex) {
      setEditingIndex(null);
    }
  }, [activeTabIndex, editingIndex]);

  function doGenerate(ingressYearSemesterVal, shiftVal = turno, isFirst = false) {
    setError(null);
    try {
      const offerSemester = next.offerSemester;
      const offerJson = offerSemester === 1 ? mergedOffer1 : mergedOffer2;

      const { newSemester, semesterIndex, offerSemester: resolvedOfferSemester } =
        generateSemester({
          semesters,
          creditEntries: planning?.creditEntries ?? [],
          ppcJson,
          offerJson,
          turno: "dia", // include all sections; the modal handles shift filtering
          ingressYear,
          ingressYearSemester: ingressYearSemesterVal,
          baseYear: BASE_YEAR,
          baseOfferSemester: BASE_OFFER_SEMESTER,
          equivalenciasJson,
        });

      if (newSemester.classes.length === 0) {
        setError("Nenhuma disciplina disponível para este período.");
        return;
      }

      setPendingTerm({
        newSemester,
        semesterIndex,
        offerSemester: resolvedOfferSemester,
        isFirst,
        shiftVal,
        ingressYearSemesterVal,
      });
    } catch (e) {
      setError(String(e?.message ?? e));
    }
  }

  const handleConfirmTerm = useCallback(
    (selectedClasses, turnoEscolhido) => {
      if (!pendingTerm) return;
      const { newSemester, semesterIndex, offerSemester, isFirst, ingressYearSemesterVal } =
        pendingTerm;
      const shiftVal = turnoEscolhido ?? pendingTerm.shiftVal;

      // Classes from generateSemester are already flat (one Class per turma),
      // no further enrichment needed.
      const confirmedSemester = { ...newSemester, classes: selectedClasses };

      updatePlanning((record) => {
        const updatedSemesters = addSemester(record.semesters ?? [], confirmedSemester);
        return {
          ...record,
          semesters: updatedSemesters,
          turno: shiftVal,
          ...(isFirst
            ? {
                ingressYearSemester: ingressYearSemesterVal,
                // Derive ingressYear from BASE_YEAR if not yet set
                ingressYear: record.ingressYear ?? BASE_YEAR,
              }
            : {}),
        };
      });

      setLastResult({ semesterIndex, count: selectedClasses.length });
      setPendingTerm(null);
    },
    [pendingTerm, updatePlanning],
  );

  function handleGenerate() {
    if (generateBlocked) return;
    if (isFirstGeneration) {
      setAskingEntryTerm(true);
      return;
    }
    doGenerate(ingressYearSemester ?? BASE_OFFER_SEMESTER);
  }

  function handleConfirmFirstTerm(so) {
    setAskingEntryTerm(false);
    const defaultShift = so === 1 ? "manha" : "tarde";
    doGenerate(so, defaultShift, true);
  }

  function handleEmptyClick(dia, startMin, endMin) {
    const activeSemester = activeTabIndex !== null ? semesters[activeTabIndex] : null;
    const semestre = activeSemester?.offerSemester ?? 1;
    const toHHMM = (mins) =>
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:00`;

    setAddingCustomSection({
      semestre,
      initialSchedules: [{ dia, inicio: toHHMM(startMin), fim: toHHMM(endMin) }],
      accessibleCodes,
    });
  }

  function handleDeleteTerm() {
    if (activeTabIndex === null) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    updatePlanning((record) => {
      const updatedSemesters = removeSemester(record.semesters ?? [], activeTabIndex);
      const result = { ...record, semesters: updatedSemesters };
      // If the first semester was deleted, clear ingress info
      if (activeTabIndex === 0) {
        result.ingressYearSemester = null;
        result.ingressYear = null;
      }
      return result;
    });
    setLastResult(null);
    setConfirmDelete(false);
  }

  const tabLabel = (idx) => {
    const sem = semesters[idx];
    if (sem?.label) return `${idx + 1}º per`;
    return `${idx + 1}º per`;
  };

  const activeSemester =
    activeTabIndex !== null ? (semesters[activeTabIndex] ?? null) : null;

  function handleConflictClick(dia, blockStart, blockEnd, clickedDisciplina, clickedTurma) {
    if (!activeSemester) return;

    const candidates = conflictCandidatesForBlock(
      dia,
      blockStart,
      blockEnd,
      activeSemester,
    );

    if (candidates.length < 2) return;

    // Find by (subjectCode, name).
    const candidatesWithSchedules = candidates.map((c) => {
      const cls = activeSemester.classes.find(
        (r) =>
          r.subjectCode === c.courseCode &&
          String(r.name ?? "").trim() === c.sectionCode,
      );
      const horarios = Array.isArray(cls?.slots) ? cls.slots : [];
      return { ...c, courseName: cls?.nome ?? "", horarios };
    });

    setConflict({
      dia,
      horaInicio: blockStart,
      candidates: candidatesWithSchedules,
      initialPending:
        clickedDisciplina && clickedTurma
          ? { courseCode: clickedDisciplina, sectionCode: clickedTurma }
          : null,
    });
  }

  function handlePickWinner(courseCode, sectionCode) {
    if (!conflict || activeTabIndex === null) return;
    updatePlanning((record) => {
      const sem = (record.semesters ?? [])[activeTabIndex];
      if (!sem) return record;
      const resolved = resolveWinningSection(courseCode, sectionCode, sem);
      return {
        ...record,
        semesters: replaceSemester(record.semesters, activeTabIndex, resolved),
      };
    });
    setConflict(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {askingEntryTerm && (
        <ModalPrimeiroperiodo onConfirm={handleConfirmFirstTerm} />
      )}
      {pendingTerm && (
        <ModalConfirmarPeriodo
          newClasses={pendingTerm.newSemester.classes}
          semesterIndex={pendingTerm.semesterIndex}
          onConfirm={handleConfirmTerm}
          onCancel={() => setPendingTerm(null)}
        />
      )}
      {addingCourses && activeTabIndex !== null && (
        <ModalAdicionarDisciplinas
          semesterIndex={activeTabIndex}
          existingSubjectCodes={
            new Set(
              (activeSemester?.classes ?? []).map((cls) => cls.subjectCode).filter(Boolean),
            )
          }
          allCourses={calcAvailableToAdd({
            semesters: [],
            creditEntries: [],
            ppcJson,
            offerJson: activeSemester?.offerSemester === 1 ? mergedOffer1 : mergedOffer2,
            turno: "dia",
            semesterIndex: 0,
            equivalenciasJson,
          })}
          available={calcAvailableToAdd({
            semesters: semesters.filter((_, i) => i !== activeTabIndex),
            creditEntries: planning?.creditEntries ?? [],
            ppcJson,
            offerJson: activeSemester?.offerSemester === 1 ? mergedOffer1 : mergedOffer2,
            turno: "dia",
            semesterIndex: activeTabIndex,
            equivalenciasJson,
          })}
          onConfirm={(classesToAdd) => {
            if (classesToAdd.length === 0) {
              setAddingCourses(false);
              return;
            }

            updatePlanning((record) => {
              const sem = (record.semesters ?? [])[activeTabIndex];
              if (!sem) return record;

              // Add each class directly.
              let updatedSem = sem;
              for (const newCls of classesToAdd) {
                updatedSem = addClass(updatedSem, newCls);
              }

              return {
                ...record,
                semesters: replaceSemester(record.semesters, activeTabIndex, updatedSem),
              };
            });
            setAddingCourses(false);
          }}
          onCancel={() => setAddingCourses(false)}
        />
      )}
      {removingCourse && (
        <ModalRemoverDisciplina
          courseCode={removingCourse.subjectCode}
          courseName={removingCourse.name}
          onConfirm={() => {
            updatePlanning((record) => {
              const sem = (record.semesters ?? [])[activeTabIndex];
              if (!sem) return record;
              const updatedSem = removeClass(sem, removingCourse.subjectCode);
              return {
                ...record,
                semesters: replaceSemester(record.semesters, activeTabIndex, updatedSem),
              };
            });
            setRemovingCourse(null);
          }}
          onFechar={() => setRemovingCourse(null)}
        />
      )}

      {addingCustomSection && activeTabIndex !== null && (
        <AddSectionModal
          semestre={addingCustomSection.semestre}
          courseSuggestions={courseSuggestions}
          initialSchedules={addingCustomSection.initialSchedules}
          accessibleCodes={addingCustomSection.accessibleCodes ?? null}
          onConfirm={({ semestre, courseCode, section }) => {
            setAddingCustomSection(null);

            // 1) Persist to customOffer
            const currentOffer = (planning?.customOffer ?? {})[semestre] ?? null;
            const ppcCourse = ppcJson?.courses?.[courseCode] ?? {};
            const suggestedName =
              courseSuggestions.find((s) => s.codigo === courseCode)?.nome ?? "";
            const courseName =
              String(ppcCourse?.name ?? "").trim() || suggestedName || courseCode;

            setCustomOffer(
              semestre,
              upsertCustomSection(
                currentOffer,
                semestre,
                courseCode,
                section,
                courseName,
              ),
            );

            // 2) Inject the new Class into the active semester.
            const newCls = {
              name: section.turma,
              subjectCode: courseCode,
              slots: section.horarios ?? [],
              // Keep nome for DisciplinaCard display
              nome: courseName,
            };

            updatePlanning((record) => {
              const sem = (record.semesters ?? [])[activeTabIndex];
              if (!sem) return record;

              // addClass deduplicates by (subjectCode, name) — safe to call unconditionally.
              const updatedSem = addClass(sem, newCls);

              return {
                ...record,
                semesters: replaceSemester(record.semesters, activeTabIndex, updatedSem),
              };
            });
          }}
          onCancel={() => setAddingCustomSection(null)}
        />
      )}
      {conflict && (
        <ModalResolverConflito
          dia={conflict.dia}
          horaInicio={conflict.horaInicio}
          candidates={conflict.candidates}
          initialPending={conflict.initialPending}
          onEscolher={handlePickWinner}
          onRemoverTurma={(courseCode, sectionCode) => {
            updatePlanning((record) => {
              const sem = (record.semesters ?? [])[activeTabIndex];
              if (!sem) return record;
              // Remove the class whose (subjectCode, name) matches.
              const updatedSem = {
                ...sem,
                classes: sem.classes.filter(
                  (cls) =>
                    !(
                      cls.subjectCode === courseCode &&
                      String(cls.name ?? "").trim() === sectionCode
                    ),
                ),
              };
              return {
                ...record,
                semesters: replaceSemester(record.semesters, activeTabIndex, updatedSem),
              };
            });
            setConflict(null);
          }}
          onFechar={() => setConflict(null)}
        />
      )}

      {/* Conflict banners */}
      {generateBlocked && semesterHasScheduleConflict(lastSemester) && (
        <CollapsibleBanner
          color="red"
          title={`Conflitos de horário no ${semesters.length}º período`}
        >
          <ul className="list-disc list-inside space-y-0.5">
            {allScheduleConflicts(lastSemester).map(({ dia, horaInicio, codigos }) => {
              const hora = `${String(Math.floor(horaInicio / 60)).padStart(2, "0")}:00`;
              return (
                <li key={`${dia}-${horaInicio}`}>
                  {dia} {hora} — {codigos.join(" × ")}
                </li>
              );
            })}
          </ul>
        </CollapsibleBanner>
      )}



      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          ✓ {lastResult.semesterIndex + 1}º período gerado — {lastResult.count}{" "}
          disciplina{lastResult.count !== 1 ? "s" : ""} selecionada
          {lastResult.count !== 1 ? "s" : ""}
        </div>
      )}

      {isFirstGeneration ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-gray-400 text-sm">
            Nenhuma disciplina planejada ainda.
          </p>
          <button
            onClick={handleGenerate}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow"
          >
            Gerar 1º período
          </button>
        </div>
      ) : (
        <div>
          {/* Tab bar */}
          <div className="flex items-stretch gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
            {semesters.map((sem, idx) => {
              const isActive = idx === activeTabIndex;
              const isLast = idx === lastIndex;
              return (
                <button
                  key={idx}
                  onClick={() => setActiveTabIndex(idx)}
                  className={[
                    "flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap",
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                  ].join(" ")}
                >
                  {tabLabel(idx)}
                  {sem.label && (
                    <span className="ml-1 text-xs text-gray-400 font-normal">
                      {sem.label}
                    </span>
                  )}
                  {isLast && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" />
                  )}
                </button>
              );
            })}
            {/* Generate button styled as a tab */}
            <button
              onClick={handleGenerate}
              disabled={generateBlocked}
              title={
                generateBlocked ? termBlockingReasons.join("\n") : undefined
              }
              className="flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap border-l border-l-gray-200"
            >
              + {next.semesterIndex + 1}º per
            </button>
          </div>

          {/* Active tab header */}
          {activeTabIndex !== null && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {activeTabIndex + 1}º período
                  {activeSemester?.label && (
                    <span className="ml-2 text-xs font-normal text-gray-400">
                      {activeSemester.label}
                    </span>
                  )}
                  {editingIndex === activeTabIndex && (
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      editando
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeSemester?.classes?.length ?? 0} disciplina
                  {(activeSemester?.classes?.length ?? 0) !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {activeTabIndex === lastIndex ? (
                  <>
                    <button
                      onClick={() => setAddingCourses(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      + Disciplinas
                    </button>
                    <button
                      onClick={handleDeleteTerm}
                      onBlur={() => setConfirmDelete(false)}
                      className={[
                        "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                        confirmDelete
                          ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                          : "bg-white text-red-500 border-red-300 hover:border-red-500",
                      ].join(" ")}
                    >
                      {confirmDelete
                        ? `Confirmar exclusão do ${activeTabIndex + 1}º período`
                        : `Deletar ${activeTabIndex + 1}º período`}
                    </button>
                  </>
                ) : editingIndex !== activeTabIndex ? (
                  <button
                    onClick={() => setEditingIndex(activeTabIndex)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    ✏️ Editar
                  </button>
                ) : (
                  <>
                    <button
                      onClick={() => setAddingCourses(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      + Disciplinas
                    </button>
                    <button
                      onClick={() => {
                        setEditingIndex(null);
                        setConflict(null);
                        setRemovingCourse(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      ✓ Encerrar edição
                    </button>
                  </>
                )}
              </div>
            </div>
          )}

          {/* Semester content */}
          {activeTabIndex !== null && activeSemester && (
            <SemestreView
              key={activeTabIndex}
              semester={activeSemester}
              focusedSections={(() => {
                if (conflict) {
                  return new Set(
                    conflict.candidates.map(
                      (c) => `${c.courseCode}::${c.sectionCode}`,
                    ),
                  );
                }
                return null;
              })()}
              onEmptyClick={
                isEditable(activeTabIndex) ? handleEmptyClick : undefined
              }
              onResolverConflito={
                isEditable(activeTabIndex) ? handleConflictClick : undefined
              }
              onEscolherTurma={
                isEditable(activeTabIndex)
                  ? (courseCode, sectionCode) => {
                      // Choosing a turma means resolving the winning section —
                      // reuse handlePickWinner directly.
                      updatePlanning((record) => {
                        const sem = (record.semesters ?? [])[activeTabIndex];
                        if (!sem) return record;
                        const resolved = resolveWinningSection(
                          courseCode,
                          sectionCode,
                          sem,
                        );
                        return {
                          ...record,
                          semesters: replaceSemester(
                            record.semesters,
                            activeTabIndex,
                            resolved,
                          ),
                        };
                      });
                    }
                  : undefined
              }
              onRemoverDisciplina={
                isEditable(activeTabIndex)
                  ? (courseCode, sectionCode) => {
                      // Find the class by (subjectCode, name).
                      const cls = activeSemester.classes.find(
                        (c) =>
                          c.subjectCode === courseCode &&
                          String(c.name ?? "").trim() === sectionCode,
                      );
                      if (cls) setRemovingCourse(cls);
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}