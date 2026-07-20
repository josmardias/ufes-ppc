// The Schedule Planner for the active profile (UC-09 through UC-14, UC-20
// through UC-23, UC-25, UC-26 — see docs/USE_CASES.md). Composes the
// semester list, the weekly grid, and the dialogs that drive every edit.

import { useEffect, useMemo, useState } from 'react';
import { useActiveProfile } from '../hooks/useActiveProfile.js';
import { useStore } from '../store/index.js';
import { getOfferings, getPpc } from '../data/index.js';
import { SHIFT_LABELS, formatIngress } from '../domain/format.js';
import { evaluatePlan } from '../domain/evaluation.js';
import {
  createPlannedSection,
  currentSemesterIndex,
} from '../domain/semester.js';
import {
  effectiveShiftFilter,
  sectionOverlapsWindow,
  stillConflicted,
} from '../domain/schedule.js';
import SemesterList from '../components/planner/SemesterList.jsx';
import WeeklyGrid from '../components/planner/WeeklyGrid.jsx';
import NoScheduleStrip from '../components/planner/NoScheduleStrip.jsx';
import SectionDetailDialog from '../components/planner/SectionDetailDialog.jsx';
import ResolveConflictDialog from '../components/planner/ResolveConflictDialog.jsx';
import AddSectionDialog from '../components/planner/AddSectionDialog.jsx';
import AddSemesterDialog from '../components/planner/AddSemesterDialog.jsx';
import ConfirmDialog from '../components/ConfirmDialog.jsx';
import { IconPlus, IconTrash } from '../components/icons.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const PRIMARY_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`;
const SECONDARY_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`;
const DANGER_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded px-2 py-1 text-sm text-red-600 hover:bg-red-50 hover:text-red-700 ${BUTTON_FOCUS_CLASS} focus-visible:ring-red-400`;

export default function PlannerPage() {
  const profile = useActiveProfile();
  const setProfilePpc = useStore((state) => state.setProfilePpc);
  const addPlannedSemester = useStore((state) => state.addPlannedSemester);
  const deleteLastSemester = useStore((state) => state.deleteLastSemester);
  const addSectionToSemester = useStore((state) => state.addSectionToSemester);
  const removeSectionFromSemester = useStore(
    (state) => state.removeSectionFromSemester,
  );
  const toggleFailedMark = useStore((state) => state.toggleFailedMark);
  const toggleAuditMark = useStore((state) => state.toggleAuditMark);
  const setShiftFilter = useStore((state) => state.setShiftFilter);

  const ppc = profile?.ppcId ? getPpc(profile.ppcId) : null;

  const evaluation = useMemo(() => {
    if (!profile || !ppc) return null;
    return evaluatePlan(profile, ppc, {
      1: getOfferings(ppc.id, 1),
      2: getOfferings(ppc.id, 2),
    });
  }, [profile, ppc]);

  const defaultIndex =
    profile && evaluation
      ? (currentSemesterIndex(profile) ?? evaluation.semesters.length - 1)
      : 0;
  const [selectedIndex, setSelectedIndex] = useState(defaultIndex);
  // The UC-25 anchor is a value snapshot taken at click time, not a
  // reference into the Section — the Section (and the clicked session's
  // originating window) may be pruned while the flow stays open.
  // { semesterIndex, sectionId, signalType: "conflict"|"duplicate"|null, window: {day,startTime,endTime}|null, subjectCode: string|null }
  const [selection, setSelection] = useState(null);
  const [addSemesterOpen, setAddSemesterOpen] = useState(false);
  const [addSectionOpen, setAddSectionOpen] = useState(false);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const semesters = evaluation?.semesters ?? [];
  const clampedIndex = Math.min(
    selectedIndex,
    Math.max(semesters.length - 1, 0),
  );
  const semester = semesters[clampedIndex] ?? null;
  const isLastSemester = clampedIndex === semesters.length - 1;
  const currentIndex = profile ? currentSemesterIndex(profile) : null;

  // Derived data for the Section detail/resolution dialogs (UC-09 step 5,
  // UC-25, UC-26). Re-derived from the freshly evaluated semester every
  // render, against the anchor snapshotted at click time — never from a
  // reference into the (possibly pruned) Section itself.
  const selectedSemester = selection
    ? semesters[selection.semesterIndex]
    : null;
  const selectedSection = selectedSemester
    ? (selectedSemester.sections.find((s) => s.id === selection.sectionId) ??
      null)
    : null;
  const resolutionSet =
    selectedSemester && selection?.signalType === 'conflict'
      ? selectedSemester.sections.filter((s) =>
          sectionOverlapsWindow(s.sessions, selection.window),
        )
      : selectedSemester && selection?.signalType === 'duplicate'
        ? selectedSemester.sections.filter(
            (s) => s.resolvedSubjectCode === selection.subjectCode,
          )
        : [];
  const anchorStillConflicted = selection?.signalType
    ? stillConflicted(resolutionSet, selection.signalType, selection.window)
    : false;

  // Auto-close (UC-25): once the anchor no longer holds a conflict — after
  // a keeper confirmation, or once pruning leaves no overlapping pair (or a
  // single Section of the Subject) — the flow ends on its own.
  useEffect(() => {
    if (selection?.signalType && !anchorStillConflicted) setSelection(null);
  }, [selection, anchorStillConflicted]);

  let redundantSource = null;
  if (
    selectedSection?.signals.redundantEnrollment &&
    selectedSection.resolvedSubjectCode &&
    selectedSemester
  ) {
    const entry = selectedSemester.fulfillmentBefore.get(
      selectedSection.resolvedSubjectCode,
    );
    if (entry?.source.kind === 'credit') {
      redundantSource = { label: 'um Aproveitamento', kind: 'credit' };
    } else if (entry?.source.kind === 'section') {
      const sourceSemester = semesters[entry.source.semesterIndex];
      redundantSource = {
        label: `${entry.source.semesterIndex + 1}º período (${sourceSemester.year}/${sourceSemester.yearSemester})`,
        kind: 'section',
        semesterIndex: entry.source.semesterIndex,
        sectionId: entry.source.sectionId,
      };
    }
  }

  if (!profile) return null;

  function handleAddSemesterConfirm(ppcId, sections) {
    if (profile.ppcId !== ppcId) setProfilePpc(profile.id, ppcId);
    const newIndex = profile.semesters.length;
    addPlannedSemester(profile.id, sections);
    setAddSemesterOpen(false);
    setSelectedIndex(newIndex);
  }

  function handleAddSection(sectionTemplate) {
    addSectionToSemester(
      profile.id,
      clampedIndex,
      createPlannedSection(sectionTemplate),
    );
    setAddSectionOpen(false);
  }

  function handleDeleteLastSemester() {
    deleteLastSemester(profile.id);
    setDeleteConfirmOpen(false);
    setSelectedIndex((index) => Math.max(index - 1, 0));
  }

  function closeSelection() {
    setSelection(null);
  }

  // Selecting a session (UC-09 step 5, UC-25): the resolution pass is
  // determined once, at click time, from the current evaluation — and the
  // resulting anchor (window or Subject code) is then snapshotted for the
  // life of the flow. `session` is omitted for strip chips (session-less
  // Sections), which can only reach the Duplicate Subject pass or the plain
  // detail dialog.
  function handleSelectSection(semesterIndex, section, session) {
    const targetSemester = semesters[semesterIndex];
    let sessionWindow = null;
    let signalType = null;
    if (session) {
      sessionWindow = {
        day: session.day,
        startTime: session.startTime,
        endTime: session.endTime,
      };
      const members = targetSemester.sections.filter((s) =>
        sectionOverlapsWindow(s.sessions, sessionWindow),
      );
      if (stillConflicted(members, 'conflict', sessionWindow))
        signalType = 'conflict';
    }
    if (signalType == null && section.signals.duplicateSubject)
      signalType = 'duplicate';
    setSelection({
      semesterIndex,
      sectionId: section.id,
      signalType,
      window: sessionWindow,
      subjectCode: section.resolvedSubjectCode ?? null,
    });
  }

  // Plain flow (UC-13): removing the Section shown by SectionDetailDialog
  // closes it — there is nothing else that dialog could show afterward.
  function handleRemoveSection(semesterIndex, sectionId) {
    removeSectionFromSemester(profile.id, semesterIndex, sectionId);
    closeSelection();
  }

  // Per-row prune inside the resolution flow (UC-25): immediate, UC-13
  // semantics, but the flow itself stays open — the anchor (not the pruned
  // Section) governs the dialog's life, via the auto-close effect above.
  function handlePruneMember(semesterIndex, sectionId) {
    removeSectionFromSemester(profile.id, semesterIndex, sectionId);
  }

  function handleResolveConflict(semesterIndex, removedIds) {
    for (const sectionId of removedIds) {
      removeSectionFromSemester(profile.id, semesterIndex, sectionId);
    }
    closeSelection();
  }

  return (
    <main className="mx-auto max-w-5xl p-6">
      <h1 className="text-2xl font-semibold text-pretty wrap-break-word text-slate-900">
        {profile.name}
      </h1>
      <p className="mt-1 text-sm text-slate-600">
        Ingresso {formatIngress(profile)} · Turno {SHIFT_LABELS[profile.shift]}
        {ppc ? ` · ${ppc.name}` : ''}
      </p>

      {semesters.length === 0 ? (
        <div className="mt-8 flex flex-col items-center gap-3 rounded-lg border border-dashed border-slate-300 px-6 py-12 text-center">
          <p className="font-medium text-slate-700">
            Nenhum período planejado ainda
          </p>
          <p className="max-w-sm text-sm text-pretty text-slate-500">
            Adicione o primeiro período para começar a montar seu cronograma.
          </p>
          <button
            type="button"
            onClick={() => setAddSemesterOpen(true)}
            className={PRIMARY_BUTTON_CLASS}
          >
            <IconPlus className="size-4" />
            Adicionar período
          </button>
        </div>
      ) : (
        <div className="mt-6 grid grid-cols-1 gap-6 md:grid-cols-[16rem_1fr]">
          <aside>
            <SemesterList
              semesters={semesters}
              selectedIndex={clampedIndex}
              currentIndex={currentIndex}
              onSelect={setSelectedIndex}
            />
            <button
              type="button"
              onClick={() => setAddSemesterOpen(true)}
              className={`mt-3 w-full justify-center ${SECONDARY_BUTTON_CLASS}`}
            >
              <IconPlus className="size-4" />
              Adicionar período
            </button>
          </aside>

          <section>
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-lg font-semibold text-slate-900">
                {clampedIndex + 1}º período · {semester.year}/
                {semester.yearSemester}
              </h2>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => setAddSectionOpen(true)}
                  className={SECONDARY_BUTTON_CLASS}
                >
                  <IconPlus className="size-4" />
                  Adicionar turma
                </button>
                {isLastSemester && (
                  <button
                    type="button"
                    onClick={() => setDeleteConfirmOpen(true)}
                    className={DANGER_BUTTON_CLASS}
                  >
                    <IconTrash className="size-4" />
                    Excluir período
                  </button>
                )}
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <WeeklyGrid
                ppc={ppc}
                sections={semester.sections}
                onSelect={(section, session) =>
                  handleSelectSection(clampedIndex, section, session)
                }
              />
              <NoScheduleStrip
                ppc={ppc}
                sections={semester.sections.filter(
                  (s) => s.sessions.length === 0,
                )}
                onSelect={(section) =>
                  handleSelectSection(clampedIndex, section)
                }
              />
            </div>
          </section>
        </div>
      )}

      <AddSemesterDialog
        open={addSemesterOpen}
        profile={profile}
        lastSemesterHasSignals={
          semesters.length > 0 &&
          semesters[semesters.length - 1].status !== 'clean'
        }
        onShiftFilterChange={(value) => setShiftFilter(profile.id, value)}
        onConfirm={handleAddSemesterConfirm}
        onClose={() => setAddSemesterOpen(false)}
      />

      {semester && (
        <AddSectionDialog
          open={addSectionOpen}
          ppc={ppc}
          offerings={getOfferings(ppc.id, semester.yearSemester)}
          yearSemester={semester.yearSemester}
          fulfillmentBefore={semester.fulfillmentBefore}
          sameSemesterCodes={semester.sameSemesterCodes}
          customSections={profile.customSections}
          currentSections={semester.sections}
          shiftFilter={effectiveShiftFilter(profile)}
          profileCourseId={profile.courseId}
          semesterNumber={clampedIndex + 1}
          onShiftFilterChange={(value) => setShiftFilter(profile.id, value)}
          onConfirm={handleAddSection}
          onClose={() => setAddSectionOpen(false)}
        />
      )}

      <SectionDetailDialog
        open={selection != null && selection.signalType == null}
        section={selectedSection}
        ppc={ppc}
        redundantSource={redundantSource}
        onClose={closeSelection}
        onRemove={() =>
          selection &&
          handleRemoveSection(selection.semesterIndex, selection.sectionId)
        }
        onToggleFailed={() => {
          if (selection)
            toggleFailedMark(
              profile.id,
              selection.semesterIndex,
              selection.sectionId,
            );
        }}
        onToggleAudit={() => {
          if (selection)
            toggleAuditMark(
              profile.id,
              selection.semesterIndex,
              selection.sectionId,
            );
        }}
        onMarkSourceAudit={() => {
          if (redundantSource?.kind === 'section')
            toggleAuditMark(
              profile.id,
              redundantSource.semesterIndex,
              redundantSource.sectionId,
            );
        }}
      />

      <ResolveConflictDialog
        open={selection != null && selection.signalType != null}
        entrySectionId={selection?.sectionId ?? null}
        resolutionSet={resolutionSet}
        signalType={selection?.signalType ?? null}
        window={selection?.window ?? null}
        ppc={ppc}
        profileCourseId={profile.courseId}
        onClose={closeSelection}
        onPrune={(sectionId) =>
          selection && handlePruneMember(selection.semesterIndex, sectionId)
        }
        onConfirm={(_keeperId, removedIds) =>
          selection &&
          handleResolveConflict(selection.semesterIndex, removedIds)
        }
      />

      <ConfirmDialog
        open={deleteConfirmOpen}
        title="Excluir período"
        message="Tem certeza que deseja excluir este período e todo o seu conteúdo? Esta ação não pode ser desfeita."
        confirmLabel="Excluir"
        danger
        onConfirm={handleDeleteLastSemester}
        onCancel={() => setDeleteConfirmOpen(false)}
      />
    </main>
  );
}
