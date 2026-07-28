// The Completed (Concluídos) entry's content (UC-09 step 6, UC-15, UC-16,
// UC-20, UC-21 — see docs/USE_CASES.md): the credited history as a list —
// Subject code + name, Audit Mark indicated — with actions to add/remove
// Credit Entries and toggle their Audit Marks. No weekly grid — Credit
// Entries have no sessions (see docs/DOMAIN.md, Credit Entry).

import { useState } from 'react';
import { useStore } from '../../store/index.js';
import ConfirmDialog from '../ConfirmDialog.jsx';
import AddCreditEntryDialog from './AddCreditEntryDialog.jsx';
import { IconPlus } from '../icons.jsx';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';
const SECONDARY_BUTTON_CLASS = `inline-flex items-center gap-1.5 rounded border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`;
const ACTION_BUTTON_CLASS = `rounded border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`;
const DANGER_BUTTON_CLASS = `rounded border border-red-300 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-red-400`;

/**
 * @param {{
 *   profile: import('../../domain/types.js').ProfileRecord,
 *   ppc: {subjects: Array},
 * }} props
 */
export default function CompletedEntryView({ profile, ppc }) {
  const addCreditEntry = useStore((state) => state.addCreditEntry);
  const removeCreditEntry = useStore((state) => state.removeCreditEntry);
  const toggleCreditEntryAudit = useStore(
    (state) => state.toggleCreditEntryAudit,
  );

  const [addOpen, setAddOpen] = useState(false);
  const [removeTarget, setRemoveTarget] = useState(null);

  const entries = profile.creditEntries
    .map((entry) => ({
      ...entry,
      subject: ppc.subjects.find((s) => s.code === entry.subjectCode) ?? null,
    }))
    .sort((a, b) =>
      (a.subject?.name ?? a.subjectCode).localeCompare(
        b.subject?.name ?? b.subjectCode,
      ),
    );

  function handleConfirmAdd(subjectCode) {
    addCreditEntry(profile.id, subjectCode);
    setAddOpen(false);
  }

  function handleConfirmRemove() {
    if (removeTarget) removeCreditEntry(profile.id, removeTarget);
    setRemoveTarget(null);
  }

  return (
    <section>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-lg font-semibold text-slate-900">Concluídos</h2>
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className={SECONDARY_BUTTON_CLASS}
        >
          <IconPlus className="size-4" />
          Adicionar aproveitamento
        </button>
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {entries.length === 0 ? (
          <p className="text-sm text-slate-500">
            Nenhum aproveitamento registrado.
          </p>
        ) : (
          <ul className="divide-y divide-slate-100">
            {entries.map((entry) => (
              <li
                key={entry.subjectCode}
                className="flex flex-wrap items-center justify-between gap-3 py-2"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-medium text-slate-800">
                    {entry.subject?.name ?? entry.subjectCode}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.subjectCode}
                    {entry.audit ? ' · Ouvinte' : ''}
                  </p>
                </div>
                <div className="flex shrink-0 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      toggleCreditEntryAudit(profile.id, entry.subjectCode)
                    }
                    className={ACTION_BUTTON_CLASS}
                  >
                    {entry.audit ? 'Remover ouvinte' : 'Marcar ouvinte'}
                  </button>
                  <button
                    type="button"
                    onClick={() => setRemoveTarget(entry.subjectCode)}
                    className={DANGER_BUTTON_CLASS}
                  >
                    Remover
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <AddCreditEntryDialog
        open={addOpen}
        profile={profile}
        ppc={ppc}
        onConfirm={handleConfirmAdd}
        onClose={() => setAddOpen(false)}
      />

      <ConfirmDialog
        open={removeTarget != null}
        title="Remover aproveitamento"
        message="Tem certeza que deseja remover este aproveitamento? Isso pode gerar Requisitos não atendidos em períodos que dependiam dele."
        confirmLabel="Remover"
        danger
        onConfirm={handleConfirmRemove}
        onCancel={() => setRemoveTarget(null)}
      />
    </section>
  );
}
