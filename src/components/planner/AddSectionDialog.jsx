// Add a Section to a Planned Semester (UC-12, see docs/USE_CASES.md). Lists
// Sections whose Subject is not yet fulfilled (or carries an open Audit
// Mark) and whose prerequisites/co-requisites are satisfied, filtered by the
// effective Shift filter; previews the chosen candidate on the weekly grid
// before adding it.

import { useEffect, useMemo, useRef, useState } from 'react';
import { buildCandidateSubjects, candidateSectionKey } from '../../domain/eligibility.js';
import { SHIFT_FILTER_OPTIONS } from '../../domain/format.js';
import WeeklyGrid from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

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

  const candidates = useMemo(
    () =>
      buildCandidateSubjects({
        ppc,
        offerings,
        yearSemester,
        fulfillmentBefore,
        sameSemesterCodes,
        customSections,
        shiftFilter,
        checkCorequisites: true,
      }),
    [ppc, offerings, yearSemester, fulfillmentBefore, sameSemesterCodes, customSections, shiftFilter],
  );

  const chosen = candidates.flatMap((c) => c.sections).find((s) => candidateSectionKey(s) === chosenKey) ?? null;

  function handleConfirm() {
    if (!chosen) return;
    onConfirm(chosen);
    setChosenKey(null);
  }

  return (
    <dialog ref={ref} className="overscroll-contain w-[min(64rem,95vw)] rounded-lg p-0 backdrop:bg-slate-900/40" onClose={onClose}>
      <div className="flex max-h-[85vh] flex-col gap-4 p-6">
        <div className="flex items-start justify-between gap-4">
          <h2 className="text-lg font-semibold text-slate-900">Adicionar turma</h2>
          <fieldset className="flex items-center gap-2 text-sm text-slate-600">
            <legend className="sr-only">Turno</legend>
            {SHIFT_FILTER_OPTIONS.map((option) => (
              <label key={option.value} className="flex items-center gap-1">
                <input
                  type="radio"
                  name="add-section-shift"
                  checked={shiftFilter === option.value}
                  onChange={() => onShiftFilterChange(option.value)}
                  className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                />
                {option.label}
              </label>
            ))}
          </fieldset>
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-2">
          <div className="overflow-y-auto pr-2">
            {candidates.length === 0 ? (
              <p className="text-sm text-slate-500">Nenhuma turma disponível para este período com o turno selecionado.</p>
            ) : (
              <ul className="space-y-3">
                {candidates.map((candidate) => (
                  <li key={candidate.subjectCode ?? candidate.subjectName}>
                    <p className={`text-sm font-semibold ${candidate.stale ? 'text-slate-400 italic' : 'text-slate-800'}`}>
                      {candidate.subjectName}
                    </p>
                    <ul className="mt-1 space-y-1">
                      {candidate.sections.map((section) => {
                        const key = candidateSectionKey(section);
                        return (
                          <li key={key}>
                            <label className="flex items-center gap-2 rounded px-2 py-1 text-sm text-slate-700 hover:bg-slate-50">
                              <input
                                type="radio"
                                name="add-section-choice"
                                checked={chosenKey === key}
                                onChange={() => setChosenKey(key)}
                                className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                              />
                              {section.kind === 'offering' ? `Turma ${section.turma} — ${section.professor}` : section.custom.name}
                            </label>
                          </li>
                        );
                      })}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="overflow-y-auto border-t border-slate-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
            <WeeklyGrid ppc={ppc} sections={currentSections} onSelect={() => {}} previewSessions={chosen?.sessions ?? []} />
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
