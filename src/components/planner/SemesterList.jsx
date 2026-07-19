// Sidebar list of Planned Semesters (UC-09, UC-10): each entry carries its
// status, and the semester matching the real-world current date is marked.

import { STATUS_LABELS } from '../../domain/format.js';

const STATUS_DOT = {
  clean: 'bg-emerald-500',
  warnings: 'bg-amber-500',
  errors: 'bg-red-500',
};

/**
 * @param {{
 *   semesters: Array, // evaluated semesters (see domain/evaluation.js)
 *   selectedIndex: number,
 *   currentIndex: number|null,
 *   onSelect: (index: number) => void,
 * }} props
 */
export default function SemesterList({ semesters, selectedIndex, currentIndex, onSelect }) {
  return (
    <ul className="space-y-1">
      {semesters.map((semester) => (
        <li key={semester.index}>
          <button
            type="button"
            onClick={() => onSelect(semester.index)}
            aria-current={selectedIndex === semester.index ? 'true' : undefined}
            title={STATUS_LABELS[semester.status]}
            className={`flex w-full items-center gap-2 rounded px-3 py-2 text-left text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400 ${
              selectedIndex === semester.index ? 'bg-slate-900 text-white' : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            <span className={`size-2 shrink-0 rounded-full ${STATUS_DOT[semester.status]}`} aria-hidden="true" />
            <span className="flex-1 truncate">
              {semester.index + 1}º período · {semester.year}/{semester.yearSemester}
            </span>
            {currentIndex === semester.index && (
              <span className={`text-xs ${selectedIndex === semester.index ? 'text-slate-300' : 'text-slate-400'}`}>atual</span>
            )}
          </button>
        </li>
      ))}
    </ul>
  );
}
