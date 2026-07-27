// Add a New Planned Semester (UC-11, see docs/USE_CASES.md). Presents a
// review screen listing every eligible Required Section for the new
// semester, grouped by Subject in two tiers, with nothing pre-selected — the
// user builds the selection from scratch, with live Duplicate Subject /
// Schedule Conflict indicators, before confirming. The Course Curriculum
// (PPC) is fixed at profile creation (UC-02) / editing (UC-24) and is never
// chosen here.

import { useEffect, useMemo, useRef, useState } from 'react';
import { getOfferings, getPpc } from '../../data/index.js';
import { evaluatePlan } from '../../domain/evaluation.js';
import {
  buildCombinedCandidatePool,
  candidateSectionKey,
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
import { SHIFT_FILTER_OPTIONS } from '../../domain/format.js';
import CandidateGroupList from './CandidateGroupList.jsx';
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
 *   onConfirm: (sections: Array) => void,
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
  const [shiftFilter, setShiftFilter] = useState(effectiveShiftFilter(profile));
  // Selection memory (UC-11, "Filter and selection rules"): every key the
  // user has explicitly toggled, remembered across shift-filter changes for
  // the life of this dialog session. Nothing is ever pre-selected — reset to
  // empty only when the dialog opens.
  const [selectedKeys, setSelectedKeys] = useState(new Set());
  const [highlightedKey, setHighlightedKey] = useState(null);

  // Resets only when the dialog transitions to open — not on every `profile`
  // reference change, which also happens mid-session whenever the shift
  // filter below is changed (it's persisted onto the profile immediately).
  // Depending on the whole `profile` object here would wipe the selection
  // memory on every filter toggle, defeating it entirely.
  useEffect(() => {
    if (open) {
      setShiftFilter(effectiveShiftFilter(profile));
      setSelectedKeys(new Set());
      setHighlightedKey(null);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile.id]);

  const ppc = getPpc(profile.ppcId);
  const newIndex = profile.semesters.length;
  const semesterNumber = profile.completedSemesters + newIndex + 1;
  // Memoized so its object identity stays stable across renders (unlike a
  // plain call to semesterPosition, which returns a fresh object every
  // time) — it's a dependency of the `candidates` memo below.
  const position = useMemo(
    () =>
      semesterPosition(
        profile.ingressYear,
        profile.ingressYearSemester,
        newIndex,
        profile.completedSemesters,
      ),
    [
      profile.ingressYear,
      profile.ingressYearSemester,
      newIndex,
      profile.completedSemesters,
    ],
  );
  const offerings = getOfferings(ppc.id, position.yearSemester);

  const fulfillmentBefore = useMemo(
    () =>
      evaluatePlan(profile, ppc, {
        1: getOfferings(ppc.id, 1),
        2: getOfferings(ppc.id, 2),
      }).fulfillmentAfter,
    [ppc, profile],
  );

  const candidates = useMemo(
    () =>
      buildCombinedCandidatePool({
        ppc,
        offerings,
        yearSemester: position.yearSemester,
        fulfillmentBefore,
        sameSemesterCodes: new Set(),
        customSections: profile.customSections,
        shiftFilter,
        semesterNumber,
        hiddenSubjects: profile.hiddenSubjects,
      }).required,
    [
      ppc,
      offerings,
      position,
      fulfillmentBefore,
      profile.customSections,
      profile.hiddenSubjects,
      shiftFilter,
      semesterNumber,
    ],
  );

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

  // The effective selection is always selected ∩ currently visible — keys
  // for Sections hidden by the current filter simply have no matching
  // candidate to flatMap from here.
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
    onConfirm(sections);
  }

  function renderSection(section) {
    const key = candidateSectionKey(section);
    return (
      <label
        onMouseEnter={() => setHighlightedKey(key)}
        onMouseLeave={() =>
          setHighlightedKey((current) => (current === key ? null : current))
        }
        className={`flex items-center gap-2 rounded px-2 py-1 text-sm hover:bg-slate-50 ${conflictingKeys.has(key) ? 'text-red-700' : 'text-slate-700'} ${highlightedKey === key ? 'ring-2 ring-slate-500' : ''}`}
      >
        <input
          type="checkbox"
          checked={selectedKeys.has(key)}
          onChange={() => toggleSection(key)}
          onFocus={() => setHighlightedKey(key)}
          onBlur={() =>
            setHighlightedKey((current) => (current === key ? null : current))
          }
          className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
        />
        {section.kind === 'offering'
          ? `Turma ${section.turma}`
          : section.custom.name}
        {section.kind === 'offering' &&
          section.targetCourseId !== profile.courseId &&
          section.targetCourseName &&
          ` (${section.targetCourseName})`}
        {conflictingKeys.has(key) && ' (conflito de horário)'}
      </label>
    );
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

        <div className="flex flex-wrap items-center justify-between gap-4">
          <p className="text-sm text-slate-600">
            {formatYearSemesterLabel(position)}
          </p>
          <FilterToggle
            legend="Turno"
            name="add-semester-shift"
            options={SHIFT_FILTER_OPTIONS}
            value={shiftFilter}
            onChange={handleShiftFilterChange}
          />
        </div>

        <div className="grid flex-1 grid-cols-1 gap-4 overflow-hidden md:grid-cols-[20rem_1fr]">
          <div className="min-h-0 flex-1 overflow-y-auto pr-2">
            <CandidateGroupList
              candidates={candidates}
              selectedKeys={selectedKeys}
              renderSection={renderSection}
              isGroupFlagged={(candidate) =>
                duplicateSubjectCodes.has(candidate.subjectCode)
              }
              emptyMessage="Nenhuma disciplina elegível encontrada para este período."
              resetKey={open}
            />
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

        <div className="flex items-center justify-end gap-3 border-t border-slate-100 pt-3">
          {issueCount > 0 && (
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
          <button
            type="button"
            onClick={handleConfirm}
            className={`rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
          >
            Confirmar
          </button>
        </div>
      </div>
    </dialog>
  );
}
