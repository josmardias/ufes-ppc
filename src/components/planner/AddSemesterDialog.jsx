// Add a New Planned Semester (UC-11, see docs/USE_CASES.md). If the profile
// has no Course Curriculum (PPC) yet, presents a flat list to pick one
// first. Then presents a review screen listing every eligible Subject for
// the new semester, all Sections pre-selected — the user prunes before
// confirming, with live Duplicate Subject / Schedule Conflict indicators.

import { useEffect, useMemo, useRef, useState } from 'react';
import { ppcs, getOfferings } from '../../data/index.js';
import { evaluatePlan } from '../../domain/evaluation.js';
import { buildCandidateSubjects, candidateSectionKey } from '../../domain/eligibility.js';
import { effectiveShiftFilter, sectionsOverlap } from '../../domain/schedule.js';
import { createPlannedSection, formatYearSemesterLabel, semesterPosition } from '../../domain/semester.js';
import { SHIFT_FILTER_OPTIONS } from '../../domain/format.js';
import WeeklyGrid from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

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
export default function AddSemesterDialog({ open, profile, lastSemesterHasSignals, onShiftFilterChange, onConfirm, onClose }) {
  const ref = useRef(null);
  const [selectedPpcId, setSelectedPpcId] = useState(profile.ppcId);
  const [shiftFilter, setShiftFilter] = useState(effectiveShiftFilter(profile));
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const seenKeysRef = useRef(new Set());

  useEffect(() => {
    if (open) {
      setSelectedPpcId(profile.ppcId);
      setShiftFilter(effectiveShiftFilter(profile));
      setSelectedKeys(new Set());
      seenKeysRef.current = new Set();
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open, profile]);

  const ppc = selectedPpcId ? ppcs[selectedPpcId] : null;
  const newIndex = profile.semesters.length;
  const position = ppc ? semesterPosition(profile.ingressYear, profile.ingressYearSemester, newIndex) : null;
  const offerings = position ? getOfferings(ppc.id, position.yearSemester) : undefined;

  const fulfillmentBefore = useMemo(() => {
    if (!ppc) return null;
    return evaluatePlan(profile, ppc, { 1: getOfferings(ppc.id, 1), 2: getOfferings(ppc.id, 2) }).fulfillmentAfter;
  }, [ppc, profile]);

  const candidates = useMemo(() => {
    if (!ppc || !position) return [];
    return buildCandidateSubjects({
      ppc,
      offerings,
      yearSemester: position.yearSemester,
      fulfillmentBefore,
      sameSemesterCodes: new Set(),
      customSections: profile.customSections,
      shiftFilter,
      checkCorequisites: false,
    });
  }, [ppc, offerings, position, fulfillmentBefore, profile.customSections, shiftFilter]);

  // Every newly-visible Section is pre-selected (UC-11 step 5); manual
  // (de)selections are preserved for Sections that remain visible across
  // Shift filter changes (see UC-11, "Filter and selection rules").
  useEffect(() => {
    setSelectedKeys((prev) => {
      const next = new Set(prev);
      for (const candidate of candidates) {
        for (const section of candidate.sections) {
          const key = candidateSectionKey(section);
          if (!seenKeysRef.current.has(key)) {
            seenKeysRef.current.add(key);
            next.add(key);
          }
        }
      }
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
      .filter((c) => c.subjectCode && c.sections.filter((s) => selectedKeys.has(candidateSectionKey(s))).length > 1)
      .map((c) => c.subjectCode),
  );
  const conflictingKeys = new Set();
  for (let i = 0; i < chosen.length; i++) {
    for (let j = i + 1; j < chosen.length; j++) {
      if (sectionsOverlap(chosen[i].section.sessions, chosen[j].section.sessions)) {
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

  function handleConfirm() {
    const sections = chosen.map(({ section }) => createPlannedSection(section));
    onConfirm(selectedPpcId, sections);
  }

  return (
    <dialog ref={ref} onClose={onClose} className="overscroll-contain w-[min(64rem,95vw)] rounded-lg p-0 backdrop:bg-slate-900/40">
      <div className="flex max-h-[85vh] flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Adicionar período</h2>

        {lastSemesterHasSignals && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            O último período tem pendências. A elegibilidade do novo período será calculada considerando as turmas
            atuais como estão.
          </p>
        )}

        {!ppc ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-sm font-medium text-slate-700">Escolha o Projeto Pedagógico de Curso (PPC)</legend>
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
            <div className="flex items-center justify-between gap-4">
              <p className="text-sm text-slate-600">{position && formatYearSemesterLabel(position)}</p>
              <fieldset className="flex items-center gap-2 text-sm text-slate-600">
                <legend className="sr-only">Turno</legend>
                {SHIFT_FILTER_OPTIONS.map((option) => (
                  <label key={option.value} className="flex items-center gap-1">
                    <input
                      type="radio"
                      name="add-semester-shift"
                      checked={shiftFilter === option.value}
                      onChange={() => handleShiftFilterChange(option.value)}
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
                  <p className="text-sm text-slate-500">Nenhuma disciplina elegível encontrada para este período.</p>
                ) : (
                  <ul className="space-y-3">
                    {candidates.map((candidate) => {
                      const isDuplicate = duplicateSubjectCodes.has(candidate.subjectCode);
                      return (
                        <li key={candidate.subjectCode ?? candidate.subjectName}>
                          <p className={`text-sm font-semibold ${isDuplicate ? 'text-amber-700' : 'text-slate-800'}`}>
                            {candidate.subjectName}
                            {isDuplicate && ' — disciplina duplicada'}
                          </p>
                          <ul className="mt-1 space-y-1">
                            {candidate.sections.map((section) => {
                              const key = candidateSectionKey(section);
                              return (
                                <li key={key}>
                                  <label
                                    className={`flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 ${conflictingKeys.has(key) ? 'text-red-700' : 'text-slate-700'}`}
                                  >
                                    <input
                                      type="checkbox"
                                      checked={selectedKeys.has(key)}
                                      onChange={() => toggleSection(key)}
                                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                                    />
                                    {section.kind === 'offering' ? `Turma ${section.turma} — ${section.professor}` : section.custom.name}
                                    {conflictingKeys.has(key) && ' (conflito de horário)'}
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

              <div className="overflow-y-auto border-t border-slate-100 pt-3 md:border-t-0 md:border-l md:pt-0 md:pl-4">
                <WeeklyGrid ppc={ppc} sections={previewSections} onSelect={() => {}} />
              </div>
            </div>
          </>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
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
