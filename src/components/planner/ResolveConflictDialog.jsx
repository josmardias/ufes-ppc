// UC-25 — Resolve Conflicting Sections. Presents the resolution set for an
// anchor derived at click time — a clicked session's time window (Schedule
// Conflict pass) or the clicked Section's Subject (Duplicate Subject pass)
// — and re-derives live from that anchor on every render, so pruning the
// entry-point Section (or any other member) is a non-event: the flow stays
// open for as long as the anchor still holds a conflict (see PlannerPage.jsx).
//
// Two independent actions are offered:
// - Per-row prune: immediate, UC-13 semantics, persisted at once.
// - Keeper election: staged in this component's own state, changeable
//   freely, nothing persisted until Confirm. On Confirm, the members that
//   conflict with the keeper *within the anchor* are removed — window-scoped
//   for a Schedule Conflict pass, all other members for a Duplicate Subject
//   pass.
// Kept separate from SectionDetailDialog so this focused flow isn't
// cluttered by unrelated actions like Audit/Failed marking.

import { useEffect, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../domain/format.js';
import { keeperRemovalIds } from '../../domain/schedule.js';
import { IconTrash } from '../icons.jsx';
import { sectionShortLabel } from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const PRIMARY_BUTTON_CLASS = `rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`;
const PRUNE_BUTTON_CLASS = `rounded p-1.5 text-red-600 hover:bg-red-50 hover:text-red-700 ${BUTTON_FOCUS_CLASS} focus-visible:ring-red-400`;

function pruneButtonLabel(section, ppc) {
  const turma = section.kind === 'offering' ? ` turma ${section.turma}` : '';
  return `Remover turma ${sectionShortLabel(section, ppc)}${turma}`;
}

/**
 * @param {{
 *   open: boolean,
 *   entrySectionId: string|null, // id of the Section the user clicked to start the flow — may no longer be a member
 *   resolutionSet: Array, // every Section belonging to the anchor (window or Subject), live-derived by the caller
 *   signalType: "conflict"|"duplicate"|null,
 *   window: {day: string, startTime: string, endTime: string}|null, // the anchor for a Schedule Conflict pass; unused otherwise
 *   ppc: {subjects: Array},
 *   profileCourseId: string|null, // the Student's own course id (see docs/DOMAIN.md, Section) — rows targeted at a different course are labeled
 *   onClose: () => void,
 *   onPrune: (sectionId: string) => void, // immediate per-row removal (UC-13 semantics)
 *   onConfirm: (keeperId: string, removedIds: string[]) => void,
 * }} props
 */
export default function ResolveConflictDialog({
  open,
  entrySectionId,
  resolutionSet,
  signalType,
  window: conflictWindow,
  ppc,
  profileCourseId,
  onClose,
  onPrune,
  onConfirm,
}) {
  const ref = useRef(null);
  const [keeperId, setKeeperId] = useState(null);

  useEffect(() => {
    if (open) {
      setKeeperId(entrySectionId);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open, entrySectionId]);

  if (!signalType) return null;

  // The keeper row may have been pruned since it was elected (or since the
  // entry point was set as the default) — fall back to the first remaining
  // member rather than to the (possibly also gone) entry-point Section.
  const keeper =
    resolutionSet.find((s) => s.id === keeperId) ?? resolutionSet[0] ?? null;
  const removedIds = keeper
    ? keeperRemovalIds(resolutionSet, keeper.id, signalType, conflictWindow)
    : [];
  const removedIdSet = new Set(removedIds);

  function handleConfirm() {
    if (keeper) onConfirm(keeper.id, removedIds);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <div className="flex w-96 flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {signalType === 'conflict'
              ? 'Conflito de horário'
              : 'Disciplina duplicada'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">
            Remova turmas individualmente, ou escolha qual manter — as demais em
            conflito com ela serão removidas ao confirmar.
          </p>
        </div>

        <ul className="space-y-2">
          {resolutionSet.map((section) => {
            const isKeeper = keeper?.id === section.id;
            const willBeRemoved = removedIdSet.has(section.id);
            return (
              <li key={section.id} className="flex items-start gap-2">
                <label
                  className={`flex flex-1 items-start gap-2 rounded border px-3 py-2 text-sm ${isKeeper ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}
                >
                  <input
                    type="radio"
                    name="resolve-conflict-keeper"
                    checked={isKeeper}
                    onChange={() => setKeeperId(section.id)}
                    className="mt-0.5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-slate-800">
                      {sectionShortLabel(section, ppc)}
                      {section.kind === 'offering' &&
                        ` · Turma ${section.turma}`}
                      {section.kind === 'offering' &&
                        profileCourseId != null &&
                        section.targetCourseId != null &&
                        section.targetCourseId !== profileCourseId &&
                        section.targetCourseName &&
                        ` (${section.targetCourseName})`}
                      {section.id === entrySectionId && (
                        <span className="ml-1 font-normal text-slate-400">
                          (selecionada)
                        </span>
                      )}
                    </span>
                    {section.sessions.length > 0 && (
                      <span className="block text-xs text-slate-500">
                        {section.sessions
                          .map(
                            (session) =>
                              `${WEEKDAY_LABELS[session.day] ?? session.day} ${session.startTime}–${session.endTime}`,
                          )
                          .join(', ')}
                      </span>
                    )}
                    {willBeRemoved && (
                      <span className="mt-1 block text-xs font-medium text-red-700">
                        Será removida
                      </span>
                    )}
                  </span>
                </label>
                <button
                  type="button"
                  onClick={() => onPrune(section.id)}
                  aria-label={pruneButtonLabel(section, ppc)}
                  className={PRUNE_BUTTON_CLASS}
                >
                  <IconTrash className="size-4" aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Cancelar
          </button>
          <button
            type="button"
            onClick={handleConfirm}
            className={PRIMARY_BUTTON_CLASS}
          >
            Confirmar
          </button>
        </div>
      </div>
    </dialog>
  );
}
