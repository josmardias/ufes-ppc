// Single name-field dialog shared by profile cloning (UC-04) and renaming
// (UC-08, see docs/USE_CASES.md). Uses the native <dialog> element per
// docs/ARCHITECTURE.md ("src/components").

import { useEffect, useRef, useState } from 'react';

const ERROR_MESSAGES = {
  empty: 'O nome não pode ser vazio.',
  duplicate: 'Já existe um perfil com esse nome.',
};

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
export default function ProfileNameDialog({ open, title, confirmLabel, initialName = '', onSubmit, onClose }) {
  const ref = useRef(null);
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
      return;
    }
    onClose();
  }

  return (
    <dialog ref={ref} onClose={onClose} className="rounded-lg p-0 backdrop:bg-slate-900/40">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">{title}</h2>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Nome
          <input
            type="text"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className="rounded border border-slate-300 px-2 py-1"
            autoFocus
          />
        </label>

        {error && <p className="text-sm text-red-600">{error}</p>}

        <div className="flex justify-end gap-2">
          <button type="button" onClick={onClose} className="rounded px-3 py-1 text-slate-600">
            Cancelar
          </button>
          <button type="submit" className="rounded bg-slate-900 px-3 py-1 text-white">
            {confirmLabel}
          </button>
        </div>
      </form>
    </dialog>
  );
}
