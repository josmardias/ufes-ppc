// Dialog for creating a new Student profile (UC-02, see docs/USE_CASES.md).
// Uses the native <dialog> element per docs/ARCHITECTURE.md ("src/components").

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/index.js';
import { SHIFT_LABELS } from '../domain/format.js';
import { elapsedSemesters } from '../domain/semester.js';
import { useCourseCascade } from '../hooks/useCourseCascade.js';

const ERROR_MESSAGES = {
  empty: 'O nome não pode ser vazio.',
  duplicate: 'Já existe um perfil com esse nome.',
  'unknown-ppc':
    'O Projeto Pedagógico de Curso (PPC) selecionado não foi encontrado.',
};

const CURRENT_YEAR = new Date().getFullYear();

const FIELD_CLASS =
  'rounded border border-slate-300 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500';
const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** @param {{ ref: import('react').Ref<HTMLDialogElement>, onCreated?: () => void }} props */
export default function CreateProfileDialog({ ref, onCreated }) {
  const createProfile = useStore((state) => state.createProfile);
  const nameInputRef = useRef(null);
  const [name, setName] = useState('');
  const [ingressYear, setIngressYear] = useState(CURRENT_YEAR);
  const [ingressYearSemester, setIngressYearSemester] = useState(1);
  const [shift, setShift] = useState('day');
  const cascade = useCourseCascade();
  const cap = elapsedSemesters(Number(ingressYear) || CURRENT_YEAR, ingressYearSemester);
  const [completedSemesters, setCompletedSemesters] = useState(cap);
  const [error, setError] = useState(null);

  // Recomputes the completed-semester default/cap whenever ingress
  // information changes (UC-02): it defaults to, and is capped at, the
  // number of semesters fully elapsed since ingress.
  useEffect(() => {
    setCompletedSemesters(cap);
    // Only re-run when the inputs that determine `cap` change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [ingressYear, ingressYearSemester]);

  function reset() {
    setName('');
    setIngressYear(CURRENT_YEAR);
    setIngressYearSemester(1);
    setShift('day');
    cascade.reset();
    setError(null);
  }

  function handleSubmit(event) {
    event.preventDefault();

    if (!cascade.courseId || !cascade.ppcId) {
      setError('Selecione o curso e o Projeto Pedagógico de Curso (PPC).');
      return;
    }

    const completed = cap > 0 ? Number(completedSemesters) : 0;
    if (cap > 0 && (!Number.isInteger(completed) || completed < 0 || completed > cap)) {
      setError(
        `O último período concluído deve ser um número inteiro entre 0 e ${cap}.`,
      );
      return;
    }

    const result = createProfile({
      name,
      ingressYear: Number(ingressYear),
      ingressYearSemester,
      shift,
      ppcId: cascade.ppcId,
      completedSemesters: completed,
    });
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
    <dialog
      ref={ref}
      onClose={reset}
      className="overscroll-contain m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-slate-900/40 sm:m-auto sm:h-auto sm:w-80 sm:max-w-[92vw] sm:rounded-lg"
    >
      <form
        onSubmit={handleSubmit}
        className="flex h-full max-h-none flex-col gap-4 p-4 sm:h-auto sm:max-h-[92vh] sm:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">Criar perfil</h2>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
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
            {Object.entries(SHIFT_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Curso
          <select
            name="courseId"
            required
            value={cascade.courseId}
            onChange={(event) => cascade.selectCourse(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {cascade.courses.map((course) => (
              <option key={course.courseId} value={course.courseId}>
                {course.courseName}
              </option>
            ))}
          </select>
        </label>

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Projeto Pedagógico de Curso (PPC)
          <select
            name="ppcId"
            required
            disabled={!cascade.courseId}
            value={cascade.ppcId}
            onChange={(event) => cascade.selectPpc(event.target.value)}
            className={FIELD_CLASS}
          >
            <option value="" disabled>
              Selecione…
            </option>
            {cascade.ppcOptions.map((ppc) => (
              <option key={ppc.id} value={ppc.id}>
                {ppc.name}
              </option>
            ))}
          </select>
        </label>

        {cap > 0 && (
          <label className="flex flex-col gap-1 text-sm text-slate-700">
            Último período concluído?
            <input
              type="number"
              name="completedSemesters"
              inputMode="numeric"
              min={0}
              max={cap}
              step={1}
              value={completedSemesters}
              onChange={(event) => setCompletedSemesters(event.target.value)}
              className={FIELD_CLASS}
            />
            <span className="text-xs text-pretty text-slate-500">
              As disciplinas obrigatórias sugeridas até esse período serão
              registradas como Aproveitamentos.
            </span>
          </label>
        )}
        </div>

        {error && (
          <p
            id="create-profile-name-error"
            role="alert"
            aria-live="polite"
            className="text-sm text-red-600"
          >
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
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
