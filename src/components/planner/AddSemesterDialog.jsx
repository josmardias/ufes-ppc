// Add a New Planned Semester (UC-11, see docs/USE_CASES.md). If the profile
// has no Course Curriculum (PPC) yet, presents a flat list to pick one
// first. Then presents a review screen listing every eligible Subject for
// the new semester, all Sections pre-selected — the user prunes before
// confirming, with live Duplicate Subject / Schedule Conflict indicators.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ppcs, getOfferings } from '../../data/index.js';
import { evaluatePlan } from '../../domain/evaluation.js';
import {
  buildCandidateSubjects,
  candidateSectionKey,
  pruneCorequisiteLookahead,
} from '../../domain/eligibility.js';
import {
  effectiveShiftFilter,
  sectionsOverlap,
} from '../../domain/schedule.js';
import {
  createPlannedSection,
  formatYearSemesterLabel,
  semesterPosition,
} from '../../domain/semester.js';
import {
  CLASSIFICATION_FILTER_LABEL,
  COURSE_FILTER_LABEL,
  SEMESTER_FILTER_LABEL,
  SHIFT_FILTER_OPTIONS,
} from '../../domain/format.js';
import FilterCheckbox from './FilterCheckbox.jsx';
import FilterToggle from './FilterToggle.jsx';
import WeeklyGrid from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   profile: import('../../domain/types.js').ProfileRecord,
 *   lastSemesterHasSignals: boolean,
 *   onShiftFilterChange: (value: string) => void,
 *   onConfirm: (ppcId: string, sections: Array) => void,
 *   onClose: () => void,
 * }} props
 */
export default function AddSemesterDialog({
  open,
  profile,
  lastSemesterHasSignals,
  onShiftFilterChange,
  onConfirm,
  onClose,
}) {
  const ref = useRef(null);
  const [selectedPpcId, setSelectedPpcId] = useState(profile.ppcId);
  const [shiftFilter, setShiftFilter] = useState(effectiveShiftFilter(profile));
  const [courseFilter, setCourseFilter] = useState('own');
  const [semesterFilter, setSemesterFilter] = useState('suggested');
  const [classificationFilter, setClassificationFilter] = useState('required');
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [highlightedKey, setHighlightedKey] = useState(null);
  const seenKeysRef = useRef(new Set());

  useEffect(() => {
    if (open) {
      setSelectedPpcId(profile.ppcId);
      setShiftFilter(effectiveShiftFilter(profile));
      setCourseFilter('own');
      setSemesterFilter('suggested');
      setClassificationFilter('required');
      setSelectedKeys(new Set());
      setHighlightedKey(null);
      seenKeysRef.current = new Set();
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open, profile]);

  const ppc = selectedPpcId ? ppcs[selectedPpcId] : null;
  const newIndex = profile.semesters.length;
  // Memoized so its object identity stays stable across renders (unlike a
  // plain call to semesterPosition, which returns a fresh object every
  // time) — it's a dependency of the `candidates` memo below, and an
  // unstable reference there defeats that memoization and causes an
  // infinite render loop via the pre-selection effect.
  const position = useMemo(
    () =>
      ppc
        ? semesterPosition(
            profile.ingressYear,
            profile.ingressYearSemester,
            newIndex,
          )
        : null,
    [ppc, profile.ingressYear, profile.ingressYearSemester, newIndex],
  );
  const offerings = position
    ? getOfferings(ppc.id, position.yearSemester)
    : undefined;

  const fulfillmentBefore = useMemo(() => {
    if (!ppc) return null;
    return evaluatePlan(profile, ppc, {
      1: getOfferings(ppc.id, 1),
      2: getOfferings(ppc.id, 2),
    }).fulfillmentAfter;
  }, [ppc, profile]);

  const candidates = useMemo(() => {
    if (!ppc || !position) return [];
    const built = buildCandidateSubjects({
      ppc,
      offerings,
      yearSemester: position.yearSemester,
      fulfillmentBefore,
      sameSemesterCodes: new Set(),
      customSections: profile.customSections,
      shiftFilter,
      checkCorequisites: false,
      courseFilter,
      // Not `profile.courseId`: while the PPC is being chosen for the first
      // time (UC-11 step 3), it isn't persisted yet — the PPC under review
      // is always the source of truth for its own course id.
      profileCourseId: ppc?.courseId ?? null,
      semesterFilter,
      semesterNumber: newIndex + 1,
      classificationFilter,
    });
    return pruneCorequisiteLookahead(built, ppc, fulfillmentBefore);
  }, [
    ppc,
    offerings,
    position,
    fulfillmentBefore,
    profile.customSections,
    shiftFilter,
    courseFilter,
    semesterFilter,
    newIndex,
    classificationFilter,
  ]);

  // Every newly-visible Section is pre-selected (UC-11 step 5); manual
  // (de)selections are preserved for Sections that remain visible across
  // Shift filter changes (see UC-11, "Filter and selection rules").
  useEffect(() => {
    // Mutate seenKeysRef here, in the effect body, rather than inside the
    // setSelectedKeys updater below: React may invoke a state updater more
    // than once for the same previous state (notably under StrictMode), and
    // an updater that mutates a ref as a side effect is not idempotent —
    // the second invocation would see the ref already updated, compute zero
    // new keys, and that (wrong, empty) result is what gets committed.
    const newKeys = [];
    for (const candidate of candidates) {
      for (const section of candidate.sections) {
        const key = candidateSectionKey(section);
        if (!seenKeysRef.current.has(key)) {
          seenKeysRef.current.add(key);
          newKeys.push(key);
        }
      }
    }
    if (newKeys.length === 0) return;
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const key of newKeys) next.add(key);
      return next;
    });
  }, [candidates]);

  function toggleSection(key) {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function selectAllVisible() {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const candidate of candidates) {
        for (const section of candidate.sections) {
          next.add(candidateSectionKey(section));
        }
      }
      return next;
    });
  }

  function handleShiftFilterChange(value) {
    setShiftFilter(value);
    onShiftFilterChange(value);
  }

  const chosen = candidates.flatMap((candidate) =>
    candidate.sections
      .filter((section) => selectedKeys.has(candidateSectionKey(section)))
      .map((section) => ({ candidate, section })),
  );

  const duplicateSubjectCodes = new Set(
    candidates
      .filter(
        (c) =>
          c.subjectCode &&
          c.sections.filter((s) => selectedKeys.has(candidateSectionKey(s)))
            .length > 1,
      )
      .map((c) => c.subjectCode),
  );
  const conflictingKeys = new Set();
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      if (
        sectionsOverlap(chosen[i].section.sessions, chosen[j].section.sessions)
      ) {
        conflictingKeys.add(candidateSectionKey(chosen[i].section));
        conflictingKeys.add(candidateSectionKey(chosen[j].section));
      }
    }
  }

  const previewSections = chosen.map(({ candidate, section }) => {
    const key = candidateSectionKey(section);
    return {
      id: key,
      kind: section.kind,
      subjectCode: section.subjectCode,
      resolvedSubjectCode: candidate.subjectCode,
      turma: section.turma,
      custom: section.custom,
      sessions: section.sessions,
      failed: false,
      audit: false,
      signals: {
        unmetRequisite: false,
        scheduleConflict: conflictingKeys.has(key),
        duplicateSubject: duplicateSubjectCodes.has(candidate.subjectCode),
        redundantEnrollment: false,
      },
    };
  });

  const issueCount = previewSections.filter(
    (s) => s.signals.scheduleConflict || s.signals.duplicateSubject,
  ).length;

  function handleConfirm() {
    const sections = chosen.map(({ section }) => createPlannedSection(section));
    onConfirm(selectedPpcId, sections);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain w-[min(80rem,96vw)] rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex max-h-[92vh] flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Adicionar período
        </h2>

        {lastSemesterHasSignals && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O último período tem pendências. A elegibilidade do novo período
            será calculada considerando as turmas atuais como estão.
          </p>
        )}

        {!ppc ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-slate-700">
              Escolha o Projeto Pedagógico de Curso (PPC)
            </legend>
            <ul className="mt-1 space-y-1">
              {Object.values(ppcs).map((option) => (
                <li key={option.id}>
                  <button
                    type="button"
                    onClick={() => setSelectedPpcId(option.id)}
                    className={`w-full rounded border border-slate-300 px-3 py-2 text-left text-sm hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
                  >
                    {option.name}
                  </button>
                </li>
              ))}
            </ul>
          </fieldset>
        ) : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-4">
              <p className="text-sm text-slate-600">
                {position && formatYearSemesterLabel(position)}
              </p>
              <div className="flex flex-wrap items-center gap-4">
                <FilterCheckbox
                  label={COURSE_FILTER_LABEL}
                  checked={courseFilter === 'own'}
                  onChange={(checked) =>
                    setCourseFilter(checked ? 'own' : 'all')
                  }
                />
                <FilterCheckbox
                  label={SEMESTER_FILTER_LABEL}
                  checked={semesterFilter === 'advance'}
                  onChange={(checked) =>
                    setSemesterFilter(checked ? 'advance' : 'suggested')
                  }
                />
                <FilterCheckbox
                  label={CLASSIFICATION_FILTER_LABEL}
                  checked={classificationFilter === 'all'}
                  onChange={(checked) =>
                    setClassificationFilter(checked ? 'all' : 'required')
                  }
                />
                <FilterToggle
                  legend="Turno"
                  name="add-semester-shift"
                  options={SHIFT_FILTER_OPTIONS}
                  value={shiftFilter}
                  onChange={handleShiftFilterChange}
                />
              </div>
            </div>

            <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[20rem_1fr]">
              <div className="flex min-h-0 flex-col">
                {candidates.length > 0 && (
                  <div className="flex justify-start pb-2">
                    <button
                      type="button"
                      onClick={selectAllVisible}
                      className={`text-xs font-medium text-slate-600 hover:underline rounded ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
                    >
                      Selecionar todas
                    </button>
                  </div>
                )}
                <div className="min-h-0 flex-1 overflow-y-auto pr-2">
                  {candidates.length === 0 ? (
                    <p className="text-sm text-slate-500">
                      Nenhuma disciplina elegível encontrada para este período.
                    </p>
                  ) : (
                    <ul className="space-y-3">
                      {candidates.map((candidate) => {
                        const isDuplicate = duplicateSubjectCodes.has(
                          candidate.subjectCode,
                        );
                        return (
                          <li
                            key={candidate.subjectCode ?? candidate.subjectName}
                          >
                            <p
                              className={`text-sm font-semibold ${isDuplicate ? 'text-amber-700' : 'text-slate-800'}`}
                            >
                              {candidate.subjectName}
                              {isDuplicate && ' — disciplina duplicada'}
                            </p>
                            <ul className="mt-1 space-y-1">
                              {candidate.sections.map((section) => {
                                const key = candidateSectionKey(section);
                                return (
                                  <li key={key}>
                                    <label
                                      onMouseEnter={() =>
                                        setHighlightedKey(key)
                                      }
                                      onMouseLeave={() =>
                                        setHighlightedKey((current) =>
                                          current === key ? null : current,
                                        )
                                      }
                                      className={`flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 ${conflictingKeys.has(key) ? 'text-red-700' : 'text-slate-700'} ${highlightedKey === key ? 'ring-2 ring-slate-500' : ''}`}
                                    >
                                      <input
                                        type="checkbox"
                                        checked={selectedKeys.has(key)}
                                        onChange={() => toggleSection(key)}
                                        onFocus={() => setHighlightedKey(key)}
                                        onBlur={() =>
                                          setHighlightedKey((current) =>
                                            current === key ? null : current,
                                          )
                                        }
                                        className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                      />
                                      {section.kind === 'offering'
                                        ? `Turma ${section.turma}`
                                        : section.custom.name}
                                      {section.kind === 'offering' &&
                                        courseFilter === 'all' &&
                                        section.targetCourseId !==
                                          (ppc?.courseId ?? null) &&
                                        section.targetCourseName &&
                                        ` (${section.targetCourseName})`}
                                      {conflictingKeys.has(key) &&
                                        ' (conflito de horário)'}
                                    </label>
                                  </li>
                                );
                              })}
                            </ul>
                          </li>
                        );
                      })}
                    </ul>
                  )}
                </div>
              </div>

              <div className="overflow-y-auto border-t border-slate-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
                <WeeklyGrid
                  ppc={ppc}
                  sections={previewSections}
                  onSelect={() => {}}
                  highlightedSectionId={highlightedKey}
                  onHoverSection={setHighlightedKey}
                />
              </div>
            </div>
          </>
        )}

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          {ppc && issueCount > 0 && (
            <p className="text-sm text-amber-700">
              {issueCount}{' '}
              {issueCount === 1
                ? 'pendência na seleção'
                : 'pendências na seleção'}
            </p>
          )}
          <button
            type="button"
            onClick={onClose}
            className={`rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Cancelar
          </button>
          {ppc && (
            <button
              type="button"
              onClick={handleConfirm}
              className={`rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
            >
              Confirmar
            </button>
          )}
        </div>
      </div>
    </dialog>
  );
}
