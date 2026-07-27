// Dialog for editing Student profile data (UC-24, see docs/USE_CASES.md):
// ingress information, shift, Course Curriculum (PPC), and completed
// semester count. Only reachable while the profile has no Planned
// Semesters (enforced by the caller not rendering the trigger otherwise).

import { useEffect, useRef, useState } from 'react';
import { useStore } from '../store/index.js';
import { SHIFT_LABELS } from '../domain/format.js';
import { elapsedSemesters } from '../domain/semester.js';
import { useCourseCascade } from '../hooks/useCourseCascade.js';

const ERROR_MESSAGES = {
  'not-found': 'Perfil não encontrado.',
  'has-semesters':
    'Não é possível editar os dados do perfil enquanto houver períodos planejados.',
  'has-credit-entries':
    'Remova os Aproveitamentos antes de trocar o Projeto Pedagógico de Curso (PPC).',
  'unknown-ppc':
    'O Projeto Pedagógico de Curso (PPC) selecionado não foi encontrado.',
};

const FIELD_CLASS =
  'rounded border border-slate-300 px-2 py-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500';
const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/**
 * @param {{
 *   open: boolean,
 *   profile: import('../domain/types.js').ProfileRecord,
 *   onClose: () => void,
 * }} props
 */
export default function EditProfileDialog({ open, profile, onClose }) {
  const updateProfileData = useStore((state) => state.updateProfileData);
  const ref = useRef(null);
  const [ingressYear, setIngressYear] = useState(profile.ingressYear);
  const [ingressYearSemester, setIngressYearSemester] = useState(
    profile.ingressYearSemester,
  );
  const [shift, setShift] = useState(profile.shift);
  const cascade = useCourseCascade(profile.ppcId);
  const cap = elapsedSemesters(
    Number(ingressYear) || profile.ingressYear,
    ingressYearSemester,
  );
  const [completedSemesters, setCompletedSemesters] = useState(
    profile.completedSemesters,
  );
  const [error, setError] = useState(null);

  useEffect(() => {
    if (open) {
      setIngressYear(profile.ingressYear);
      setIngressYearSemester(profile.ingressYearSemester);
      setShift(profile.shift);
      cascade.reset(profile.ppcId);
      setCompletedSemesters(profile.completedSemesters);
      setError(null);
      ref.current?.showModal();
    } else if (ref.current?.open) {
      ref.current.close();
    }
    // cascade.reset is stable across renders (from useState setters); only
    // re-run this when the dialog opens for a (possibly different) profile.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, profile]);

  function handleSubmit(event) {
    event.preventDefault();

    if (!cascade.courseId || !cascade.ppcId) {
      setError('Selecione o curso e o Projeto Pedagógico de Curso (PPC).');
      return;
    }

    const completed = Number(completedSemesters);
    if (!Number.isInteger(completed) || completed < 0 || completed > cap) {
      setError(
        `O último período concluído deve ser um número inteiro entre 0 e ${cap}.`,
      );
      return;
    }

    const result = updateProfileData(profile.id, {
      ingressYear: Number(ingressYear),
      ingressYearSemester,
      shift,
      ppcId: cascade.ppcId,
      completedSemesters: completed,
    });
    if (!result.ok) {
      setError(ERROR_MESSAGES[result.error]);
      return;
    }
    onClose();
  }

  return (
    <dialog
      ref={ref}
      onClose={onClose}
      className="overscroll-contain m-0 h-dvh max-h-none w-screen max-w-none rounded-none p-0 backdrop:bg-slate-900/40 sm:m-auto sm:h-auto sm:w-80 sm:max-w-[92vw] sm:rounded-lg"
    >
      <form
        onSubmit={handleSubmit}
        className="flex h-full max-h-none flex-col gap-4 p-4 sm:h-auto sm:max-h-[92vh] sm:p-6"
      >
        <h2 className="text-lg font-semibold text-slate-900">
          Editar dados do perfil
        </h2>

        <div className="min-h-0 flex-1 space-y-4 overflow-y-auto pr-1">
        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Ano de ingresso
          <input
            type="number"
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
              name="edit-ingressYearSemester"
              checked={ingressYearSemester === 1}
              onChange={() => setIngressYearSemester(1)}
              className="focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500"
            />
            1º semestre
          </label>
          <label className="flex items-center gap-2">
            <input
              type="radio"
              name="edit-ingressYearSemester"
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

        <label className="flex flex-col gap-1 text-sm text-slate-700">
          Último período concluído?
          <input
            type="number"
            inputMode="numeric"
            min={0}
            max={cap}
            step={1}
            value={completedSemesters}
            onChange={(event) => setCompletedSemesters(event.target.value)}
            className={FIELD_CLASS}
          />
          <span className="text-xs text-pretty text-slate-500">
            Não altera os Aproveitamentos já registrados.
          </span>
        </label>
        </div>

        {error && (
          <p role="alert" aria-live="polite" className="text-sm text-red-600">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-3">
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
            Salvar
          </button>
        </div>
      </form>
    </dialog>
  );
}
