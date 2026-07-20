// UC-25 — Resolve Conflicting Sections. Presents the full resolution set (the
// clicked Section plus every Section it conflicts with — by time overlap for
// a Schedule Conflict, or by shared Subject for a Duplicate Subject) and lets
// the user freely choose which one to keep; nothing changes until confirmed.
// On confirm, only the Sections that conflict with the kept one are removed
// — "keeper-relative" removal (see docs/USE_CASES.md, UC-25). Kept separate
// from SectionDetailDialog so this focused flow isn't cluttered by unrelated
// actions like Audit/Failed marking.

import { useEffect, useRef, useState } from 'react';
import { WEEKDAY_LABELS } from '../../domain/format.js';
import { sectionsOverlap } from '../../domain/schedule.js';
import { sectionShortLabel } from './WeeklyGrid.jsx';

const BUTTON_FOCUS_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const PRIMARY_BUTTON_CLASS = `rounded bg-slate-900 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`;

function sectionsConflict(a, b, signalType) {
  if (signalType === 'duplicate') return a.resolvedSubjectCode != null && a.resolvedSubjectCode === b.resolvedSubjectCode;
  return sectionsOverlap(a.sessions, b.sessions);
}

/**
 * @param {{
 *   open: boolean,
 *   referenceSection: object|null, // the Section the user clicked to start the flow
 *   resolutionSet: Array, // referenceSection plus every Section it conflicts with
 *   signalType: "conflict"|"duplicate"|null,
 *   ppc: {subjects: Array},
 *   onClose: () => void,
 *   onConfirm: (keeperId: string, removedIds: string[]) => void,
 * }} props
 */
export default function ResolveConflictDialog({ open, referenceSection, resolutionSet, signalType, ppc, onClose, onConfirm }) {
  const ref = useRef(null);
  const [keeperId, setKeeperId] = useState(null);

  useEffect(() => {
    if (open) {
      setKeeperId(referenceSection?.id ?? null);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open, referenceSection]);

  if (!referenceSection || !signalType) return null;

  const keeper = resolutionSet.find((s) => s.id === keeperId) ?? referenceSection;
  const removedIds = resolutionSet.filter((s) => s.id !== keeper.id && sectionsConflict(s, keeper, signalType)).map((s) => s.id);
  const removedIdSet = new Set(removedIds);

  function handleConfirm() {
    onConfirm(keeper.id, removedIds);
  }

  return (
    <dialog ref={ref} onClose={onClose} className="overscroll-contain rounded-lg p-0 backdrop:bg-slate-900/40">
      <div className="flex w-96 flex-col gap-4 p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {signalType === 'conflict' ? 'Conflito de horário' : 'Disciplina duplicada'}
          </h2>
          <p className="mt-1 text-sm text-slate-600">Escolha qual turma manter; as demais em conflito com ela serão removidas.</p>
        </div>

        <ul className="space-y-2">
          {resolutionSet.map((section) => {
            const isKeeper = keeper.id === section.id;
            const willBeRemoved = removedIdSet.has(section.id);
            return (
              <li key={section.id}>
                <label
                  className={`flex items-start gap-2 rounded border px-3 py-2 text-sm ${isKeeper ? 'border-slate-400 bg-slate-50' : 'border-slate-200'}`}
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
                      {section.kind === 'offering' && ` · Turma ${section.turma}`}
                      {section.id === referenceSection.id && <span className="ml-1 font-normal text-slate-400">(selecionada)</span>}
                    </span>
                    {section.sessions.length > 0 && (
                      <span className="block text-xs text-slate-500">
                        {section.sessions
                          .map((session) => `${WEEKDAY_LABELS[session.day] ?? session.day} ${session.startTime}–${session.endTime}`)
                          .join(', ')}
                      </span>
                    )}
                    {willBeRemoved && <span className="mt-1 block text-xs font-medium text-red-700">Será removida</span>}
                  </span>
                </label>
              </li>
            );
          })}
        </ul>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button type="button" onClick={onClose} className={`px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}>
            Cancelar
          </button>
          <button type="button" onClick={handleConfirm} className={PRIMARY_BUTTON_CLASS}>
            Confirmar
          </button>
        </div>
      </div>
    </dialog>
  );
}
