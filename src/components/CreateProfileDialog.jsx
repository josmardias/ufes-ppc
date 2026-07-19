// Dialog for creating a new Student profile (UC-02, see docs/USE_CASES.md).
// Uses the native <dialog> element per docs/ARCHITECTURE.md ("src/components").

import { useRef, useState } from 'react';
import { useStore } from '../store/index.js';

const ERROR_MESSAGES = {
  empty: 'O nome não pode ser vazio.',
  duplicate: 'Já existe um perfil com esse nome.',
};

const CURRENT_YEAR = new Date().getFullYear();

const FIELD_CLASS =
  'rounded border border-slate-300 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500';
const BUTTON_FOCUS_CLASS = 'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** @param {{ ref: import('react').Ref<HTMLDialogElement>, onCreated?: () => void }} props */
export default function CreateProfileDialog({ ref, onCreated }) {
  const createProfile = useStore((state) => state.createProfile);
  const nameInputRef = useRef(null);
  const [name, setName] = useState('');
  const [ingressYear, setIngressYear] = useState(CURRENT_YEAR);
  const [ingressYearSemester, setIngressYearSemester] = useState(1);
  const [shift, setShift] = useState('day');
  const [error, setError] = useState(null);

  function reset() {
    setName('');
    setIngressYear(CURRENT_YEAR);
    setIngressYearSemester(1);
    setShift('day');
    setError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();
    const result = createProfile({ name, ingressYear: Number(ingressYear), ingressYearSemester, shift });
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.error]);
      nameInputRef.current?.focus();
      return;
    }
    reset();
    ref.current?.close();
    onCreated?.();
  }

  function handleCancel() {
    reset();
    ref.current?.close();
  }

  return (
    <dialog ref={ref} onClose={reset} className="rounded-lg p-0 backdrop:bg-slate-900/40">
      <form onSubmit={handleSubmit} className="flex w-80 flex-col gap-4 p-6">
        <h2 className="text-lg font-semibold text-slate-900">Criar perfil</h2>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Nome
          <input
            ref={nameInputRef}
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(event) => setName(event.target.value)}
            className={FIELD_CLASS}
            aria-invalid={error != null}
            aria-describedby={error ? 'create-profile-name-error' : undefined}
            autoFocus
          />
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Ano de ingresso
          <input
            type="number"
            name="ingressYear"
            inputMode="numeric"
            autoComplete="off"
            value={ingressYear}
            onChange={(event) => setIngressYear(event.target.value)}
            className={FIELD_CLASS}
          />
        </label>

        <fieldset className="flex flex-col gap-1 text-sm text-slate-700">
          <legend>Semestre de ingresso</legend>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ingressYearSemester"
              checked={ingressYearSemester === 1}
              onChange={() => setIngressYearSemester(1)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            />
            1º semestre
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="ingressYearSemester"
              checked={ingressYearSemester === 2}
              onChange={() => setIngressYearSemester(2)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            />
            2º semestre
          </label>
        </fieldset>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Turno
          <select
            name="shift"
            autoComplete="off"
            value={shift}
            onChange={(event) => setShift(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="day">Integral</option>
            <option value="morning">Manhã</option>
            <option value="afternoon">Tarde</option>
          </select>
        </label>

        {error && (
          <p id="create-profile-name-error" role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={handleCancel}
            className={`rounded px-3 py-1 text-slate-600 hover:bg-slate-100 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
          >
            Cancelar
          </button>
          <button
            type="submit"
            className={`rounded bg-slate-900 px-3 py-1 text-white hover:bg-slate-800 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-500`}
          >
            Criar
          </button>
        </div>
      </form>
    </dialog>
  );
}
