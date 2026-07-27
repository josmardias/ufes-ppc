// Add an Optional Section to a Planned Semester (UC-27, see
// docs/USE_CASES.md), and hide/restore an Optional Subject from this
// listing (UC-28). Same eligibility, shared co-requisite rule, two-tier
// presentation, and shift filter as AddSectionDialog (UC-12), restricted to
// Optional Subjects, with no Custom Sections and hidden Subjects excluded by
// default.

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/index.js';
import {
  buildCombinedCandidatePool,
  candidateSectionKey,
  excludeAlreadyPlannedSections,
} from '../../domain/eligibility.js';
import {
  HIDE_SUBJECT_LABEL,
  RESTORE_SUBJECT_LABEL,
  SHIFT_FILTER_OPTIONS,
  SHOW_HIDDEN_SUBJECTS_LABEL,
} from '../../domain/format.js';
import CandidateGroupList from './CandidateGroupList.jsx';
import FilterToggle from './FilterToggle.jsx';
import WeeklyGrid from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   profile: import('../../domain/types.js').ProfileRecord,
 *   ppc: {id: string, subjects: Array},
 *   offerings: {subjects: Array}|undefined,
 *   yearSemester: 1|2,
 *   fulfillmentBefore: Map,
 *   sameSemesterCodes: Set<string>,
 *   currentSections: Array, // already-planned, evaluated sections of the target semester
 *   shiftFilter: "morning"|"afternoon"|"day",
 *   semesterNumber: number,
 *   onShiftFilterChange: (value: string) => void,
 *   onConfirm: (sectionTemplate: object) => void,
 *   onClose: () => void,
 * }} props
 */
export default function AddOptionalDialog({
  open,
  profile,
  ppc,
  offerings,
  yearSemester,
  fulfillmentBefore,
  sameSemesterCodes,
  currentSections,
  shiftFilter,
  semesterNumber,
  onShiftFilterChange,
  onConfirm,
  onClose,
}) {
  const hideSubject = useStore((state) => state.hideSubject);
  const restoreSubject = useStore((state) => state.restoreSubject);
  const ref = useRef(null);
  const [chosenKey, setChosenKey] = useState(null);
  const [showHidden, setShowHidden] = useState(false);

  useEffect(() => {
    if (open) {
      setChosenKey(null);
      setShowHidden(false);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open]);

  const candidates = useMemo(() => {
    const built = buildCombinedCandidatePool({
      ppc,
      offerings,
      yearSemester,
      fulfillmentBefore,
      sameSemesterCodes,
      customSections: [],
      shiftFilter,
      semesterNumber,
      hiddenSubjects: profile.hiddenSubjects,
    }).optional;
    return excludeAlreadyPlannedSections(built, currentSections);
  }, [
    ppc,
    offerings,
    yearSemester,
    fulfillmentBefore,
    sameSemesterCodes,
    currentSections,
    shiftFilter,
    semesterNumber,
    profile.hiddenSubjects,
  ]);

  // Sourced separately, without hidden-Subject filtering, purely to power
  // the "Mostrar ocultas" reveal (UC-28) — kept apart from `candidates` so
  // the primary listing's co-requisite look-ahead stays computed against
  // the hidden-excluding pool used everywhere else.
  const hiddenCandidates = useMemo(() => {
    if (!showHidden) return [];
    const built = buildCombinedCandidatePool({
      ppc,
      offerings,
      yearSemester,
      fulfillmentBefore,
      sameSemesterCodes,
      customSections: [],
      shiftFilter,
      semesterNumber,
      hiddenSubjects: [],
    }).optional;
    return excludeAlreadyPlannedSections(built, currentSections)
      .filter((c) => profile.hiddenSubjects.includes(c.subjectCode))
      .map((c) => ({ ...c, stale: true }));
  }, [
    showHidden,
    ppc,
    offerings,
    yearSemester,
    fulfillmentBefore,
    sameSemesterCodes,
    currentSections,
    shiftFilter,
    semesterNumber,
    profile.hiddenSubjects,
  ]);

  const listedCandidates = [...candidates, ...hiddenCandidates];

  const chosen =
    candidates
      .flatMap((c) => c.sections)
      .find((s) => candidateSectionKey(s) === chosenKey) ?? null;

  function handleConfirm() {
    if (!chosen) return;
    onConfirm(chosen);
    setChosenKey(null);
  }

  function isHiddenCandidate(candidate) {
    return profile.hiddenSubjects.includes(candidate.subjectCode);
  }

  function renderSection(section, candidate) {
    const key = candidateSectionKey(section);
    if (isHiddenCandidate(candidate)) {
      return (
        <span className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-400">
          {section.kind === 'offering'
            ? `Turma ${section.turma}`
            : section.custom.name}
        </span>
      );
    }
    return (
      <label className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
        <input
          type="radio"
          name="add-optional-choice"
          checked={chosenKey === key}
          onChange={() => setChosenKey(key)}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        {section.kind === 'offering'
          ? `Turma ${section.turma}`
          : section.custom.name}
        {section.kind === 'offering' &&
          section.targetCourseId !== profile.courseId &&
          section.targetCourseName &&
          ` (${section.targetCourseName})`}
      </label>
    );
  }

  function groupExtra(candidate) {
    if (isHiddenCandidate(candidate)) {
      return (
        <button
          type="button"
          onClick={() => restoreSubject(profile.id, candidate.subjectCode)}
          className={`shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
        >
          {RESTORE_SUBJECT_LABEL}
        </button>
      );
    }
    return (
      <button
        type="button"
        onClick={() => hideSubject(profile.id, candidate.subjectCode)}
        className={`shrink-0 rounded px-2 py-1 text-xs font-medium text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
      >
        {HIDE_SUBJECT_LABEL}
      </button>
    );
  }

  return (
    <dialog
      ref={ref}
      className="overscroll-contain w-[min(80rem,96vw)] rounded-lg p-0 backdrop:bg-slate-900/40"
      onClose={onClose}
    >
      <div className="flex max-h-[92vh] flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Adicionar optativa
        </h2>

        <div className="flex flex-wrap items-center justify-end gap-4">
          <label className="flex items-center gap-2 text-sm text-slate-700">
            <input
              type="checkbox"
              checked={showHidden}
              onChange={(event) => setShowHidden(event.target.checked)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            />
            {SHOW_HIDDEN_SUBJECTS_LABEL}
          </label>
          <FilterToggle
            legend="Turno"
            name="add-optional-shift"
            options={SHIFT_FILTER_OPTIONS}
            value={shiftFilter}
            onChange={onShiftFilterChange}
          />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[20rem_1fr]">
          <div className="overflow-y-auto pr-2">
            <CandidateGroupList
              candidates={listedCandidates}
              selectedKeys={chosenKey ? new Set([chosenKey]) : new Set()}
              renderSection={renderSection}
              groupExtra={groupExtra}
              emptyMessage="Nenhuma optativa disponível para este período com o turno selecionado."
              resetKey={open}
            />
          </div>

          <div className="overflow-y-auto border-t border-slate-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
            <WeeklyGrid
              ppc={ppc}
              sections={currentSections}
              onSelect={() => {}}
              previewSessions={chosen?.sessions ?? []}
            />
          </div>
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className={`rounded px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!chosen}
            onClick={handleConfirm}
            className={`rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 disabled:cursor-not-allowed disabled:opacity-40 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
          >
            Adicionar
          </button>
        </div>
      </div>
    </dialog>
  );
}
