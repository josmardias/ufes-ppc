// Add a Section to a Planned Semester (UC-12, see docs/USE_CASES.md). Lists
// Sections of Required Subjects whose Subject is not yet fulfilled (or
// carries an open Audit Mark) and whose prerequisites/co-requisites are
// satisfied, filtered by the effective Shift filter; previews the chosen
// candidate on the weekly grid before adding it.

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  buildCombinedCandidatePool,
  candidateSectionKey,
  excludeAlreadyPlannedSections,
} from '../../domain/eligibility.js';
import { SHIFT_FILTER_OPTIONS } from '../../domain/format.js';
import CandidateGroupList from './CandidateGroupList.jsx';
import FilterToggle from './FilterToggle.jsx';
import WeeklyGrid from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   ppc: {id: string, subjects: Array},
 *   offerings: {subjects: Array}|undefined,
 *   yearSemester: 1|2,
 *   fulfillmentBefore: Map,
 *   sameSemesterCodes: Set<string>,
 *   customSections: Array,
 *   currentSections: Array, // already-planned, evaluated sections of the target semester
 *   shiftFilter: "morning"|"afternoon"|"day",
 *   profileCourseId: string|null,
 *   hiddenSubjects: string[],
 *   semesterNumber: number, // 1-based ordinal of the semester being planned, matched against a Subject's Suggested Semester
 *   onShiftFilterChange: (value: string) => void,
 *   onConfirm: (sectionTemplate: object) => void,
 *   onClose: () => void,
 * }} props
 */
export default function AddSectionDialog({
  open,
  ppc,
  offerings,
  yearSemester,
  fulfillmentBefore,
  sameSemesterCodes,
  customSections,
  currentSections,
  shiftFilter,
  profileCourseId,
  hiddenSubjects,
  semesterNumber,
  onShiftFilterChange,
  onConfirm,
  onClose,
}) {
  const ref = useRef(null);
  const [chosenKey, setChosenKey] = useState(null);

  useEffect(() => {
    if (open) {
      setChosenKey(null);
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
      customSections,
      shiftFilter,
      semesterNumber,
      hiddenSubjects,
    }).required;
    return excludeAlreadyPlannedSections(built, currentSections);
  }, [
    ppc,
    offerings,
    yearSemester,
    fulfillmentBefore,
    sameSemesterCodes,
    customSections,
    currentSections,
    shiftFilter,
    semesterNumber,
    hiddenSubjects,
  ]);

  const chosen =
    candidates
      .flatMap((c) => c.sections)
      .find((s) => candidateSectionKey(s) === chosenKey) ?? null;

  function handleConfirm() {
    if (!chosen) return;
    onConfirm(chosen);
    setChosenKey(null);
  }

  function renderSection(section) {
    const key = candidateSectionKey(section);
    return (
      <label className="flex items-center gap-2 rounded px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
        <input
          type="radio"
          name="add-section-choice"
          checked={chosenKey === key}
          onChange={() => setChosenKey(key)}
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        {section.kind === 'offering'
          ? `Turma ${section.turma}`
          : section.custom.name}
        {section.kind === 'offering' &&
          section.targetCourseId !== profileCourseId &&
          section.targetCourseName &&
          ` (${section.targetCourseName})`}
      </label>
    );
  }

  return (
    <dialog
      ref={ref}
      className="overscroll-contain m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-slate-900/40 sm:m-auto sm:h-auto sm:max-h-[92vh] sm:w-[min(80rem,96vw)] sm:rounded-lg"
      onClose={onClose}
    >
      <div className="flex h-full max-h-none flex-col gap-4 p-4 sm:h-auto sm:max-h-[92vh] sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Adicionar turma
        </h2>

        <div className="flex flex-wrap items-center justify-end gap-4">
          <FilterToggle
            legend="Turno"
            name="add-section-shift"
            options={SHIFT_FILTER_OPTIONS}
            value={shiftFilter}
            onChange={onShiftFilterChange}
          />
        </div>

        <div className="grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(8rem,1fr)_minmax(6rem,10rem)] gap-4 overflow-hidden md:grid-rows-1 md:grid-cols-[20rem_1fr]">
          <div className="min-h-0 overflow-y-auto pr-2">
            <CandidateGroupList
              candidates={candidates}
              selectedKeys={chosenKey ? new Set([chosenKey]) : new Set()}
              renderSection={renderSection}
              emptyMessage="Nenhuma turma disponível para este período com o turno selecionado."
              resetKey={open}
            />
          </div>

          <div className="min-h-0 overflow-y-auto border-t border-slate-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
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
