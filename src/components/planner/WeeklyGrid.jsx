// The weekly day × time schedule grid for a Planned Semester (UC-09). Shows
// Monday–Friday, adding Saturday only when some Section holds a Saturday
// session; the time range covers every session in the semester. Sections
// without sessions (e.g. Estágio) are not placed here — the caller renders
// them in a separate "no schedule" strip (see PlannerPage.jsx).

import { useState } from 'react';
import { WEEKDAY_LABELS, WEEKDAY_ORDER } from '../../domain/format.js';
import { timeToMinutes } from '../../domain/schedule.js';
import { IconAlertCircle, IconAlertTriangle } from '../icons.jsx';

const PIXELS_PER_MINUTE = 1;
const DEFAULT_START_HOUR = 7;
const DEFAULT_END_HOUR = 13;

export function severityClass(section) {
  if (section.signals?.unmetRequisite) return 'border-red-400 bg-red-50 text-red-800 hover:bg-red-100';
  if (section.signals?.scheduleConflict || section.signals?.duplicateSubject || section.signals?.redundantEnrollment) {
    return 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100';
  }
  return 'border-slate-300 bg-white text-slate-700 hover:bg-slate-50';
}

/**
 * The severity icon paired with `severityClass`'s color (see docs/DOMAIN.md,
 * Planned Semester) so a signal stays legible without relying on color
 * alone. Returns `null` for a clean Section.
 */
export function severityIcon(section) {
  if (section.signals?.unmetRequisite) return IconAlertCircle;
  if (section.signals?.scheduleConflict || section.signals?.duplicateSubject || section.signals?.redundantEnrollment) {
    return IconAlertTriangle;
  }
  return null;
}

/** A short, stable label for a Section: its resolved Subject code (or Custom Section name). */
export function sectionShortLabel(section, ppc) {
  if (section.kind === 'custom') return section.custom.name;
  const subject = ppc.subjects.find((s) => s.code === section.resolvedSubjectCode);
  return subject?.code ?? section.subjectCode ?? '?';
}

/** A full, accessible label for a Section, used as the button's accessible name. */
export function sectionAccessibleLabel(section, ppc, session) {
  const subject = section.kind === 'custom' ? null : ppc.subjects.find((s) => s.code === section.resolvedSubjectCode);
  const name = section.kind === 'custom' ? section.custom.name : (subject?.name ?? section.subjectCode);
  const turma = section.kind === 'offering' ? ` turma ${section.turma}` : '';
  const time = session ? `, ${WEEKDAY_LABELS[session.day] ?? session.day} ${session.startTime}–${session.endTime}` : '';
  const severity = section.signals?.unmetRequisite
    ? ', requisito não atendido'
    : section.signals?.scheduleConflict
      ? ', conflito de horário'
      : section.signals?.duplicateSubject
        ? ', disciplina duplicada'
        : section.signals?.redundantEnrollment
          ? ', matrícula redundante'
          : '';
  return `${name}${turma}${time}${section.failed ? ', reprovado' : ''}${section.audit ? ', ouvinte' : ''}${severity}`;
}

/**
 * @param {{
 *   ppc: {subjects: Array},
 *   sections: Array, // evaluated sections carrying non-empty `sessions` (see domain/evaluation.js)
 *   onSelect: (section: object) => void,
 *   previewSessions?: import('../../domain/schedule.js').Session[],
 * }} props
 */
export default function WeeklyGrid({ ppc, sections, onSelect, previewSessions = [] }) {
  // Hover/focus highlights every sibling session of the same Section (UC-09,
  // step 5), not just the one under the pointer.
  const [hoveredSectionId, setHoveredSectionId] = useState(null);

  const scheduled = sections.filter((section) => section.sessions.length > 0);
  const allSessions = scheduled.flatMap((section) => section.sessions.map((session) => ({ section, session })));
  const usesSaturday = allSessions.some(({ session }) => session.day === 'Sáb' || session.day === 'Sab');
  const days = usesSaturday ? WEEKDAY_ORDER : WEEKDAY_ORDER.slice(0, 5);

  const times = [...allSessions.map((s) => s.session), ...previewSessions].flatMap((s) => [
    timeToMinutes(s.startTime),
    timeToMinutes(s.endTime),
  ]);
  const startHour = times.length > 0 ? Math.min(DEFAULT_START_HOUR, Math.floor(Math.min(...times) / 60)) : DEFAULT_START_HOUR;
  const endHour = times.length > 0 ? Math.max(DEFAULT_END_HOUR, Math.ceil(Math.max(...times) / 60)) : DEFAULT_END_HOUR;
  const startMinutes = startHour * 60;
  const height = (endHour - startHour) * 60 * PIXELS_PER_MINUTE;
  const hours = Array.from({ length: endHour - startHour + 1 }, (_, i) => startHour + i);

  function sessionsForDay(day) {
    return allSessions.filter(({ session }) => session.day === day || (day === 'Sáb' && session.day === 'Sab'));
  }

  /**
   * Lays out same-day sessions side by side when their times overlap (a
   * Schedule Conflict, see docs/DOMAIN.md), so every conflicting Section
   * stays individually visible and clickable instead of fully stacking.
   * Groups sessions into overlap clusters (connected components), then
   * assigns each a column via greedy interval scheduling within its cluster.
   */
  function layoutSessionsForDay(items) {
    const n = items.length;
    const adjacency = Array.from({ length: n }, () => []);
    for (let i = 0; i < n; i++) {
      for (let j = i + 1; j < n; j++) {
        const a = items[i].session;
        const b = items[j].session;
        if (a.startTime < b.endTime && b.startTime < a.endTime) {
          adjacency[i].push(j);
          adjacency[j].push(i);
        }
      }
    }

    const clusterOf = new Array(n).fill(-1);
    let clusterCount = 0;
    for (let i = 0; i < n; i++) {
      if (clusterOf[i] !== -1) continue;
      const stack = [i];
      clusterOf[i] = clusterCount;
      while (stack.length > 0) {
        const current = stack.pop();
        for (const neighbor of adjacency[current]) {
          if (clusterOf[neighbor] === -1) {
            clusterOf[neighbor] = clusterCount;
            stack.push(neighbor);
          }
        }
      }
      clusterCount++;
    }

    const result = new Array(n);
    for (let cluster = 0; cluster < clusterCount; cluster++) {
      const memberIndices = items.map((_, i) => i).filter((i) => clusterOf[i] === cluster);
      const sorted = [...memberIndices].sort((i, j) => items[i].session.startTime.localeCompare(items[j].session.startTime));
      const columnEnds = [];
      const colIndexByIndex = new Map();
      for (const i of sorted) {
        const { startTime, endTime } = items[i].session;
        let col = columnEnds.findIndex((end) => end <= startTime);
        if (col === -1) {
          col = columnEnds.length;
          columnEnds.push(endTime);
        } else {
          columnEnds[col] = endTime;
        }
        colIndexByIndex.set(i, col);
      }
      const totalColumns = columnEnds.length;
      for (const i of memberIndices) result[i] = { ...items[i], colIndex: colIndexByIndex.get(i), totalColumns };
    }
    return result;
  }

  return (
    <div className="overflow-x-auto">
      <div className="grid min-w-xl" style={{ gridTemplateColumns: `3rem repeat(${days.length}, minmax(6rem, 1fr))` }}>
        <div />
        {days.map((day) => (
          <div key={day} className="pb-2 text-center text-xs font-semibold text-slate-500">
            {WEEKDAY_LABELS[day]}
          </div>
        ))}

        <div className="relative text-right text-[11px] text-slate-400" style={{ height }}>
          {hours.map((hour) => (
            <div key={hour} className="absolute right-1 -translate-y-1/2" style={{ top: (hour * 60 - startMinutes) * PIXELS_PER_MINUTE }}>
              {String(hour).padStart(2, '0')}h
            </div>
          ))}
        </div>

        {days.map((day) => (
          <div key={day} className="relative border-l border-slate-100" style={{ height }}>
            {hours.map((hour) => (
              <div
                key={hour}
                className="absolute inset-x-0 border-t border-slate-100"
                style={{ top: (hour * 60 - startMinutes) * PIXELS_PER_MINUTE }}
              />
            ))}

            {previewSessions
              .filter((session) => session.day === day || (day === 'Sáb' && session.day === 'Sab'))
              .map((session, i) => (
                <div
                  key={`preview-${i}`}
                  aria-hidden="true"
                  className="absolute inset-x-0.5 rounded border-2 border-dashed border-sky-400 bg-sky-50/60"
                  style={{
                    top: (timeToMinutes(session.startTime) - startMinutes) * PIXELS_PER_MINUTE,
                    height: Math.max((timeToMinutes(session.endTime) - timeToMinutes(session.startTime)) * PIXELS_PER_MINUTE, 20),
                  }}
                />
              ))}

            {layoutSessionsForDay(sessionsForDay(day)).map(({ section, session, colIndex, totalColumns }, i) => {
              const Icon = severityIcon(section);
              return (
                <button
                  key={`${section.id}-${i}`}
                  type="button"
                  onClick={() => onSelect(section)}
                  onMouseEnter={() => setHoveredSectionId(section.id)}
                  onMouseLeave={() => setHoveredSectionId((current) => (current === section.id ? null : current))}
                  onFocus={() => setHoveredSectionId(section.id)}
                  onBlur={() => setHoveredSectionId((current) => (current === section.id ? null : current))}
                  aria-label={sectionAccessibleLabel(section, ppc, session)}
                  className={`absolute overflow-hidden rounded border px-1 py-0.5 text-left text-[11px] leading-tight focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-500 ${severityClass(section)} ${section.failed ? 'opacity-70' : ''} ${hoveredSectionId === section.id ? 'ring-2 ring-slate-500' : ''}`}
                  style={{
                    top: (timeToMinutes(session.startTime) - startMinutes) * PIXELS_PER_MINUTE,
                    height: Math.max((timeToMinutes(session.endTime) - timeToMinutes(session.startTime)) * PIXELS_PER_MINUTE, 20),
                    left: `calc(${(colIndex / totalColumns) * 100}% + 1px)`,
                    width: `calc(${100 / totalColumns}% - 2px)`,
                  }}
                >
                  <span className={`flex items-center gap-0.5 font-medium ${section.failed ? 'line-through' : ''}`}>
                    {Icon && <Icon className="size-2.5 shrink-0" />}
                    {sectionShortLabel(section, ppc)}
                  </span>
                  <span className="block text-[10px] opacity-80">
                    {session.startTime}–{session.endTime}
                  </span>
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}
