// Add a Credit Entry to the Completed (Concluídos) entry (UC-15, see
// docs/USE_CASES.md). Lists every Subject from the Student's Course
// Curriculum that does not already have a Credit Entry — no sections, no
// schedule, just a Subject picker.

import { useEffect, useRef, useState } from 'react';

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   profile: import('../../domain/types.js').ProfileRecord,
 *   ppc: {subjects: Array},
 *   onConfirm: (subjectCode: string) => void,
 *   onClose: () => void,
 * }} props
 */
export default function AddCreditEntryDialog({
  open,
  profile,
  ppc,
  onConfirm,
  onClose,
}) {
  const ref = useRef(null);
  const [chosenCode, setChosenCode] = useState(null);

  useEffect(() => {
    if (open) {
      setChosenCode(null);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open]);

  const available = ppc.subjects
    .filter(
      (subject) =>
        !profile.creditEntries.some(
          (entry) => entry.subjectCode === subject.code,
        ),
    )
    .sort((a, b) => {
      const aOrder = a.suggestedSemester ?? Infinity;
      const bOrder = b.suggestedSemester ?? Infinity;
      return aOrder - bOrder || a.name.localeCompare(b.name);
    });

  function handleConfirm() {
    if (!chosenCode) return;
    onConfirm(chosenCode);
    setChosenCode(null);
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-slate-900/40 sm:m-auto sm:h-auto sm:max-h-[80vh] sm:w-96 sm:max-w-[92vw] sm:rounded-lg"
    >
      <div className="flex h-full max-h-none flex-col gap-4 p-4 sm:h-auto sm:max-h-[80vh] sm:p-6">
        <h2 className="text-lg font-semibold text-slate-900">
          Adicionar aproveitamento
        </h2>

        <div className="min-h-0 flex-1 overflow-y-auto">
          {available.length === 0 ? (
            <p className="text-sm text-pretty text-slate-500">
              Todas as disciplinas do currículo já possuem aproveitamento.
            </p>
          ) : (
            <ul className="space-y-1">
              {available.map((subject) => (
                <li key={subject.code}>
                  <label className="flex items-center gap-2 rounded px-2 py-2 text-sm text-slate-700 hover:bg-slate-50">
                    <input
                      type="radio"
                      name="add-credit-entry-choice"
                      checked={chosenCode === subject.code}
                      onChange={() => setChosenCode(subject.code)}
                      className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
                    />
                    <span className="flex-1">{subject.name}</span>
                    <span className="shrink-0 text-xs text-slate-400">
                      {subject.code}
                    </span>
                  </label>
                </li>
              ))}
            </ul>
          )}
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
            disabled={!chosenCode}
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
