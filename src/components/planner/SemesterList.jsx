// Sidebar list of Planned Semesters (UC-09, UC-10): each entry carries its
// status, and the semester matching the real-world current date is marked.
// Above them, always, sits the fixed Completed (Concluídos) entry — the
// pre-semester holding the Credit Entries (see docs/DOMAIN.md, Credit
// Entry) — with no Year Semester label and no status chip.

import { STATUS_LABELS } from '../../domain/format.js';
import { semesterOrdinal } from '../../domain/semester.js';

const STATUS_DOT = {
  clean: 'bg-emerald-500',
  warnings: 'bg-amber-500',
  errors: 'bg-red-500',
};

const ITEM_FOCUS_CLASS =
  'flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400';

/**
 * @param {{
 *   semesters: Array, // evaluated semesters (see domain/evaluation.js)
 *   selectedIndex: number,
 *   currentIndex: number|null,
 *   completedSemesters: number,
 *   viewingCompleted: boolean,
 *   onSelect: (index: number) => void,
 *   onSelectCompleted: () => void,
 * }} props
 */
export default function SemesterList({
  semesters,
  selectedIndex,
  currentIndex,
  completedSemesters,
  viewingCompleted,
  onSelect,
  onSelectCompleted,
}) {
  return (
    <ul className="space-y-1">
      <li>
        <button
          type="button"
          onClick={onSelectCompleted}
          aria-current={viewingCompleted ? 'true' : undefined}
          className={`${ITEM_FOCUS_CLASS} ${
            viewingCompleted
              ? 'bg-slate-900 text-white'
              : 'text-slate-700 hover:bg-slate-100'
          }`}
        >
          <span className="flex-1 truncate">Concluídos</span>
        </button>
      </li>
      {semesters.map((semester) => {
        const isSelected =
          !viewingCompleted && selectedIndex === semester.index;
        return (
          <li key={semester.index}>
            <button
              type="button"
              onClick={() => onSelect(semester.index)}
              aria-current={isSelected ? 'true' : undefined}
              title={STATUS_LABELS[semester.status]}
              className={`${ITEM_FOCUS_CLASS} ${
                isSelected
                  ? 'bg-slate-900 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <span
                className={`size-2 shrink-0 rounded-full ${STATUS_DOT[semester.status]}`}
                aria-hidden="true"
              />
              <span className="flex-1 truncate">
                {semesterOrdinal(semester.index, completedSemesters)}º período ·{' '}
                {semester.year}/{semester.yearSemester}
              </span>
              {currentIndex === semester.index && (
                <span
                  className={`text-xs ${isSelected ? 'text-slate-300' : 'text-slate-400'}`}
                >
                  atual
                </span>
              )}
            </button>
          </li>
        );
      })}
    </ul>
  );
}
