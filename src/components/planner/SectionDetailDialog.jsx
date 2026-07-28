// Section detail dialog (UC-09 step 5, UC-13, UC-20/21, UC-22/23, UC-26).
// Shows a Planned Section's data and actions. Opened whenever the clicked
// session's window has no collision and the Section isn't flagged as a
// Duplicate Subject — those two cases go through the dedicated
// ResolveConflictDialog (UC-25) instead. A Section can still be flagged
// (e.g. a Schedule Conflict at a *different* session) and reach this dialog
// by design — resolution is never mandatory, so its Failed/Audit actions
// stay reachable without resolving; the resolution flow is one click away,
// on the colliding session.

import { useEffect, useRef } from 'react';
import { WEEKDAY_LABELS } from '../../domain/format.js';
import { plannedSectionOffering } from '../../domain/schedule.js';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const ACTION_BUTTON_CLASS = `rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`;
const DANGER_BUTTON_CLASS = `rounded border border-red-300 px-3 py-1.5 text-sm font-medium text-red-700 hover:bg-red-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-red-400`;

function subjectName(section, ppc) {
  if (section.kind === 'custom') return section.custom.name;
  return (
    ppc.subjects.find((s) => s.code === section.resolvedSubjectCode)?.name ??
    section.subjectCode
  );
}

/**
 * @param {{
 *   open: boolean,
 *   section: object|null,
 *   ppc: {subjects: Array},
 *   offerings: {subjects: Array}|undefined - the current Offerings snapshot for
 *     the Section's semester, used only for the professor's live lookup (see
 *     docs/DOMAIN.md, Planned Semester — the professor is never persisted)
 *   redundantSource: {label: string, kind: "credit"|"section"}|null,
 *   onClose: () => void,
 *   onRemove: () => void,
 *   onToggleFailed: () => void,
 *   onToggleAudit: () => void,
 *   onMarkSourceAudit: () => void,
 * }} props
 */
export default function SectionDetailDialog({
  open,
  section,
  ppc,
  offerings,
  redundantSource,
  onClose,
  onRemove,
  onToggleFailed,
  onToggleAudit,
  onMarkSourceAudit,
}) {
  const ref = useRef(null);

  useEffect(() => {
    if (open) ref.current?.showModal();
    else if (ref.current?.open) ref.current.close();
  }, [open]);

  if (!section) return null;
  const signals = section.signals ?? {};
  const hasLinkedSubject = section.resolvedSubjectCode != null;
  // The professor is never part of the embedded planning copy — it is looked
  // up live from the snapshot, and only while the Section still matches it
  // (see docs/DOMAIN.md, Planned Semester); a mismatched Section shows no
  // professor rather than a possibly-stale one.
  const professor =
    section.kind === 'offering' && !signals.offeringMismatch
      ? (plannedSectionOffering(section, offerings)?.professor ?? null)
      : null;

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-slate-900/40 sm:m-auto sm:h-auto sm:w-96 sm:max-w-[92vw] sm:rounded-lg"
    >
      <div className="flex h-full max-h-none flex-col gap-4 p-4 sm:h-auto sm:max-h-[92vh] sm:p-6">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">
            {subjectName(section, ppc)}
          </h2>
          {section.kind === 'offering' && (
            <p className="text-sm text-slate-500">
              Turma {section.turma}
              {professor ? ` · ${professor}` : ''}
            </p>
          )}
        </div>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto">
        {section.sessions.length > 0 && (
          <ul className="space-y-1 text-sm text-slate-600">
            {section.sessions.map((session, i) => (
              <li key={i}>
                {WEEKDAY_LABELS[session.day] ?? session.day} {session.startTime}
                –{session.endTime}
              </li>
            ))}
          </ul>
        )}

        {signals.unmetRequisite && (
          <p
            role="alert"
            className="rounded bg-red-50 px-3 py-2 text-sm text-red-800"
          >
            Requisito não atendido: os pré ou co-requisitos desta disciplina não
            estão satisfeitos neste ponto do planejamento.
          </p>
        )}

        {signals.offeringMismatch && (
          <p className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            Divergência da oferta: esta turma não corresponde mais à oferta
            atual (foi removida, renomeada ou mudou de horário). O planejamento
            mantém a turma como estava quando adicionada; você pode mantê-la
            assim ou removê-la e adicionar a disciplina novamente a partir da
            listagem atual.
          </p>
        )}

        {signals.redundantEnrollment && redundantSource && (
          <div className="rounded bg-amber-50 px-3 py-2 text-sm text-amber-900">
            <p className="font-medium">Matrícula redundante</p>
            <p className="mt-1">
              Já cursada em {redundantSource.label}. Remova esta turma ou marque
              a origem como ouvinte.
            </p>
            {redundantSource.kind === 'section' && (
              <button
                type="button"
                onClick={onMarkSourceAudit}
                className="mt-2 text-xs font-medium text-amber-900 hover:underline"
              >
                Marcar origem como ouvinte
              </button>
            )}
          </div>
        )}

        {hasLinkedSubject && (
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={onToggleFailed}
              className={ACTION_BUTTON_CLASS}
            >
              {section.failed ? 'Remover reprovação' : 'Marcar como reprovado'}
            </button>
            <button
              type="button"
              onClick={onToggleAudit}
              className={ACTION_BUTTON_CLASS}
            >
              {section.audit
                ? 'Remover marca de ouvinte'
                : 'Marcar como ouvinte'}
            </button>
          </div>
        )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
          <button
            type="button"
            onClick={onClose}
            className={`px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 rounded ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Fechar
          </button>
          <button
            type="button"
            onClick={onRemove}
            className={DANGER_BUTTON_CLASS}
          >
            Remover turma
          </button>
        </div>
      </div>
    </dialog>
  );
}
