// Single name-field dialog shared by profile cloning (UC-04) and renaming
// (UC-08, see docs/USE_CASES.md). Uses the native <dialog> element per
// docs/ARCHITECTURE.md ("src/components").

import { useEffect, useRef, useState } from 'react';

const ERROR_MESSAGES = {
  empty: 'O nome não pode ser vazio.',
  duplicate: 'Já existe um perfil com esse nome.',
};

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   title: string,
 *   confirmLabel: string,
 *   initialName?: string,
 *   onSubmit: (name: string) => { ok: true }|{ ok: false, error: 'empty'|'duplicate' },
 *   onClose: () => void,
 * }} props
 */
export default function ProfileNameDialog({
  open,
  title,
  confirmLabel,
  initialName = '',
  onSubmit,
  onClose,
}) {
  const ref = useRef(null);
  const nameInputRef = useRef(null);
  const [name, setName] = useState(initialName);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setName(initialName);
      setError(null);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
  }, [open, initialName]);

  function handleSubmit(event) {
    event.preventDefault();
    const result = onSubmit(name);
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.error]);
      nameInputRef.current?.focus();
      return;
    }
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain rounded-lg p-0 backdrop:bg-slate-900/40"
    >
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Nome
          <input
            ref={nameInputRef}
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            aria-invalid={error != null}
            aria-describedby={error ? 'profile-name-dialog-error' : undefined}
            autoFocus
          />
        </label>

        {error && (
          <p
            id="profile-name-dialog-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className={`rounded px-3 py-1 text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={`rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
          >
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
