// The "no schedule" strip alongside the weekly grid (UC-09): Sections with
// no weekly sessions (e.g. Estágio, TCC) appear here as chips instead.

import { sectionAccessibleLabel, sectionShortLabel, severityClass, severityIcon } from './WeeklyGrid.jsx';

/**
 * @param {{ppc: {subjects: Array}, sections: Array, onSelect: (section: object) => void}} props
 */
export default function NoScheduleStrip({ ppc, sections, onSelect }) {
  if (sections.length === 0) return null;

  return (
    <div className="mt-4 border-t border-slate-100 pt-3">
      <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">Sem horário fixo</h3>
      <ul className="mt-2 flex flex-wrap gap-2">
        {sections.map((section) => {
          const Icon = severityIcon(section);
          return (
            <li key={section.id}>
              <button
                type="button"
                onClick={() => onSelect(section)}
                aria-label={sectionAccessibleLabel(section, ppc)}
                title={sectionShortLabel(section, ppc)}
                className={`flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${severityClass(section)} ${section.failed ? 'line-through opacity-70' : ''}`}
              >
                {Icon && <Icon className="size-3 shrink-0" />}
                {sectionShortLabel(section, ppc)}
              </button>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
