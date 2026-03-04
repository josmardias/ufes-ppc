/**
 * WeekCalendar.jsx
 *
 * Hybrid structure:
 * - <table> for the background grid (hour rows + day columns)
 * - Inside each day <td>: relative div with full column height
 * - Cards with position:absolute calculated by minute
 * - Cards in the same slot sit side by side (conflict columns)
 *
 * Props:
 *   rows               — PlanningRow[] for the period
 *   onConflictClick    — optional: (dia, horaInicio) => void
 *   onMultiSectionClick — optional: (courseCode) => void
 *   onRemoverClick      — optional: (courseCode, sectionCode) => void
 *   focusedSections     — optional: Set<"courseCode::sectionCode"> — highlighted course sections
 *   (turno removed — calendar always shows all shifts)
 */

import {
  HOUR_START,
  HOUR_END,
  rowsToCourseSections,
  courseSectionSlots,
  courseSectionHasConflictOnDay,
} from "../domain/calendar.js";

// ---------------------------------------------------------------------------
// Color palette — identical to the original imprimir-periodo.mjs script
// ---------------------------------------------------------------------------

const FIXED_COLORS = [
  { bg: "#e8f1fb", border: "#4e79a7" },
  { bg: "#fdebd7", border: "#f28e2b" },
  { bg: "#e6f4ea", border: "#59a14f" },
  { bg: "#f3e9f4", border: "#b07aa1" },
  { bg: "#e7f6f4", border: "#76b7b2" },
  { bg: "#f2ebe6", border: "#9c755f" },
  { bg: "#f2f2f2", border: "#7f7f7f" },
  { bg: "#e9ecf7", border: "#2f4b7c" },
  { bg: "#e6f6ee", border: "#1b9e77" },
  { bg: "#fde7f3", border: "#e377c2" },
  { bg: "#eef4dc", border: "#8daa37" },
  { bg: "#ecebfb", border: "#7f7fce" },
];

function hashStringToInt(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

function buildColorMap(rows) {
  // Assigns colors by order of course appearance — no collisions guaranteed up to 12 courses.
  const map = new Map(); // courseCode -> FIXED_COLORS entry
  let idx = 0;
  for (const row of Array.isArray(rows) ? rows : []) {
    const codigo = String(row?.codigo ?? "").trim();
    if (!codigo || map.has(codigo)) continue;
    map.set(codigo, FIXED_COLORS[idx % FIXED_COLORS.length]);
    idx++;
  }
  return map;
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
const DAY_LABELS = {
  Seg: "Segunda",
  Ter: "Terça",
  Qua: "Quarta",
  Qui: "Quinta",
  Sex: "Sexta",
  Sab: "Sábado",
};

const ROW_HEIGHT = 54; // px per hour

/**
 * Returns all hours from HOUR_START to HOUR_END, always visible.
 */
function calcVisibleHours() {
  return Array.from(
    { length: HOUR_END - HOUR_START },
    (_, i) => HOUR_START + i,
  );
}

function minToY(min, hourStart) {
  return ((min - hourStart * 60) / 60) * ROW_HEIGHT;
}

// ---------------------------------------------------------------------------
// buildDayEvents
//
// For each day, returns a list of events with calculated position and column.
// Overlapping events are placed side by side in columns.
// ---------------------------------------------------------------------------

function buildDayEvents(allCourseSections, dia) {
  // Collect blocks: a section may have multiple schedules on the same day —
  // group them into a single contiguous block (startMin → endMin).
  const blocks = [];

  for (const section of allCourseSections) {
    let startMin = null;
    let endMin = null;

    // Collect slots for the day and group into contiguous blocks
    // (adjacent or overlapping slots merge into one block)
    const daySlots = courseSectionSlots(section)
      .filter((s) => s.dia === dia)
      .sort((a, b) => a.startMin - b.startMin);

    if (daySlots.length === 0) continue;

    // Group contiguous slots (end of one == start of next)
    const groups = [];
    let groupStart = daySlots[0].startMin;
    let groupEnd = daySlots[0].endMin;
    for (let i = 1; i < daySlots.length; i++) {
      const s = daySlots[i];
      if (s.startMin <= groupEnd) {
        // contiguous or overlapping — extend the group
        groupEnd = Math.max(groupEnd, s.endMin);
      } else {
        // gap — close the current group and open a new one
        groups.push({ startMin: groupStart, endMin: groupEnd });
        groupStart = s.startMin;
        groupEnd = s.endMin;
      }
    }
    groups.push({ startMin: groupStart, endMin: groupEnd });

    for (const g of groups) {
      startMin = Math.max(g.startMin, HOUR_START * 60);
      endMin = Math.min(g.endMin, HOUR_END * 60);
      if (endMin <= startMin) continue;
      blocks.push({ turma: section, startMin, endMin });
    }
  }

  // Sort by start time
  blocks.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Assign blocks to columns (greedy) — overlapping blocks go into different columns
  // columns[i] = endMin of the last block in column i
  const columns = [];
  const laid = blocks.map((bloco) => {
    let col = columns.findIndex((endMin) => endMin <= bloco.startMin);
    if (col === -1) {
      col = columns.length;
      columns.push(bloco.endMin);
    } else {
      columns[col] = bloco.endMin;
    }
    return { ...bloco, col };
  });

  // For each block, compute how many columns exist within its time interval
  const laidWithCols = laid.map((bloco) => {
    const concurrent = laid.filter(
      (other) => other.startMin < bloco.endMin && other.endMin > bloco.startMin,
    );
    const totalCols = Math.max(...concurrent.map((b) => b.col)) + 1;
    return { ...bloco, totalCols };
  });

  return laidWithCols;
}

// ---------------------------------------------------------------------------
// CourseSectionCard
// ---------------------------------------------------------------------------

function CourseSectionCard({
  turma,
  top,
  height,
  col,
  totalCols,
  hasConflict,
  hasMultiTurma,
  color,
  isFocused,
  onConflictClick,
  onMultiTurmaClick,
  onRemoverClick,
}) {
  // Schedule conflict (red) takes precedence over multiple sections (yellow)
  const bgColor = hasConflict
    ? "#fee2e2"
    : hasMultiTurma
      ? "#fefce8"
      : color.bg;
  const borderColor = hasConflict
    ? "#ef4444"
    : hasMultiTurma
      ? "#eab308"
      : color.border;
  const textColor = hasConflict
    ? "#991b1b"
    : hasMultiTurma
      ? "#854d0e"
      : color.border;
  const focusRing = isFocused ? "ring-2 ring-offset-1 ring-blue-500 z-10" : "";

  const widthPct = 100 / totalCols;
  const leftPct = col * widthPct;

  const slots = courseSectionSlots(turma);
  const fmt = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Get the slot for this day to build the time label
  const daySlots = slots.filter((s) => s.dia === turma._dia);
  let timeLabel = "";
  if (daySlots.length > 0) {
    const rawStart = Math.min(...daySlots.map((s) => s.rawStart));
    const rawEnd = Math.max(...daySlots.map((s) => s.rawEnd));
    timeLabel = `${fmt(rawStart)}–${fmt(rawEnd)}`;
  }

  const isClickable =
    (hasConflict && onConflictClick) ||
    (hasMultiTurma && onMultiTurmaClick) ||
    !!onRemoverClick;
  const tooltipPrefix = hasConflict
    ? "Clique para resolver conflito de horário — "
    : hasMultiTurma
      ? "Clique para escolher turma — "
      : onRemoverClick
        ? "Clique para remover — "
        : "";
  const tooltip = `${tooltipPrefix}${turma.courseName}${turma.codigo ? ` (${turma.codigo})` : ""} — ${timeLabel}`;

  function handleClick() {
    // Schedule conflict takes precedence
    if (hasConflict && onConflictClick) {
      // Pass the card's exact block bounds so handleConflictClick can collect
      // only the sections that overlap THIS card's rendered interval, not the
      // full section interval across the whole day.
      const blockStart = turma._startMin ?? 0;
      const blockEnd = turma._endMin ?? blockStart + 60;
      onConflictClick(
        turma._dia,
        blockStart,
        blockEnd,
        turma.courseCode,
        turma.codigo,
      );
      return;
    }
    if (hasMultiTurma && onMultiTurmaClick) {
      onMultiTurmaClick(turma.courseCode, turma.codigo);
      return;
    }
    if (onRemoverClick) {
      onRemoverClick(turma.courseCode, turma.codigo);
    }
  }

  return (
    <div
      title={tooltip}
      onClick={handleClick}
      style={{
        position: "absolute",
        top,
        height,
        left: `${leftPct}%`,
        width: `${widthPct}%`,
        backgroundColor: bgColor,
        borderLeftColor: borderColor,
        boxSizing: "border-box",
      }}
      className={[
        "border-l-4 px-2 py-1 overflow-hidden flex flex-col",
        isClickable ? "cursor-pointer hover:brightness-95" : "cursor-default",
        focusRing,
      ].join(" ")}
    >
      <p
        style={{ color: textColor }}
        className="text-xs font-bold leading-snug truncate"
      >
        {turma.courseCode}
      </p>
      <p
        style={{ color: textColor }}
        className="text-xs leading-snug truncate opacity-80 mt-0.5"
      >
        {turma.courseName !== turma.courseCode
          ? turma.courseName
          : turma.codigo}
      </p>
      {turma.codigo && turma.courseName !== turma.courseCode && (
        <p
          style={{ color: textColor }}
          className="text-xs leading-snug truncate opacity-60 mt-0.5"
        >
          {turma.codigo}
        </p>
      )}
      <p
        style={{ color: textColor }}
        className="text-xs opacity-40 mt-auto pt-1"
      >
        {timeLabel}
      </p>
    </div>
  );
}

// ---------------------------------------------------------------------------
// WeekCalendar
// ---------------------------------------------------------------------------

export default function WeekCalendar({
  rows,
  onConflictClick,
  onMultiSectionClick,
  onRemoverClick,
  focusedSections,
}) {
  const colorMap = buildColorMap(rows);
  const allCourseSections = rowsToCourseSections(rows);
  const hasEvents = allCourseSections.some(
    (t) => courseSectionSlots(t).length > 0,
  );

  // Pre-compute events per day
  const eventsByDay = Object.fromEntries(
    DAYS.map((dia) => [dia, buildDayEvents(allCourseSections, dia)]),
  );

  // Courses with multiple sections
  const multiSectionSet = new Set(
    rows.filter((r) => (r.turmas?.length ?? 0) > 1).map((r) => r.codigo),
  );

  const visibleHours = calcVisibleHours();
  const hourStart = visibleHours[0] ?? HOUR_START;
  const totalHeight = ROW_HEIGHT * visibleHours.length;

  return (
    <div className="rounded-xl border border-gray-200 bg-white overflow-hidden">
      <div className="overflow-x-auto">
        {!hasEvents || visibleHours.length === 0 ? (
          <div className="text-center py-12 text-gray-400 text-sm">
            Sem horários cadastrados neste período.
          </div>
        ) : (
          <table className="w-full border-collapse table-fixed">
            <colgroup>
              <col style={{ width: "3.5rem" }} />
              {DAYS.map((d) => (
                <col key={d} />
              ))}
            </colgroup>

            {/* Fixed header */}
            <thead className="sticky top-0 z-20">
              <tr>
                <th className="bg-gray-50 border-b border-r border-gray-200" />
                {DAYS.map((day) => (
                  <th
                    key={day}
                    className={`bg-gray-50 border-b border-gray-200 py-2 text-center ${
                      day === DAYS[DAYS.length - 1] ? "" : "border-r"
                    }`}
                  >
                    <span className="text-sm font-semibold text-gray-700">
                      {DAY_LABELS[day]}
                    </span>
                  </th>
                ))}
              </tr>
            </thead>

            <tbody>
              {/* Uma linha por hora — apenas para o grid de fundo */}
              {visibleHours.map((h, hi) => {
                const is13h = h === 13 || h === 19;
                const borderTop = is13h
                  ? "3px solid #3b82f6"
                  : hi % 2 === 0
                    ? "1px solid #d1d5db"
                    : "1px solid #e5e7eb";
                return (
                  <tr key={h} style={{ height: ROW_HEIGHT }}>
                    {/* Calha de hora */}
                    <td
                      className="bg-gray-50 border-r border-gray-200 pr-2 pt-1 align-top text-right"
                      style={{ borderTop }}
                    >
                      <span
                        className={`text-xs font-mono ${is13h || h === 19 ? "text-blue-500 font-bold" : "text-gray-500"}`}
                      >
                        {String(h).padStart(2, "0")}:00
                      </span>
                    </td>

                    {/* Day cells — only on the first row, with full rowspan */}
                    {hi === 0
                      ? DAYS.map((dia) => (
                          <td
                            key={dia}
                            rowSpan={visibleHours.length}
                            className={`p-0 align-top ${
                              dia === DAYS[DAYS.length - 1]
                                ? ""
                                : "border-r border-gray-300"
                            }`}
                            style={{
                              position: "relative",
                              height: totalHeight,
                            }}
                          >
                            {/* Linhas de hora sobrepostas */}
                            {visibleHours.map((hh, hhi) => (
                              <div
                                key={hh}
                                style={{
                                  position: "absolute",
                                  top: hhi * ROW_HEIGHT,
                                  left: 0,
                                  right: 0,
                                  borderTop:
                                    hh === 13 || hh === 19
                                      ? "3px solid #3b82f6"
                                      : hhi % 2 === 0
                                        ? "1px solid #d1d5db"
                                        : "1px solid #e5e7eb",
                                }}
                              />
                            ))}

                            {/* Cards posicionados absolutamente */}
                            {eventsByDay[dia].map((ev, i) => {
                              const top = minToY(ev.startMin, hourStart);
                              const height = minToY(ev.endMin, hourStart) - top;
                              // Inject _dia and _startMin into the section for use in CourseSectionCard
                              const sectionWithDay = {
                                ...ev.turma,
                                _dia: dia,
                                _startMin: ev.startMin,
                                _endMin: ev.endMin,
                                _allCourseSections: allCourseSections,
                              };
                              return (
                                <CourseSectionCard
                                  key={`${ev.turma.courseCode}-${ev.turma.codigo}-${i}`}
                                  turma={sectionWithDay}
                                  top={top}
                                  height={height}
                                  col={ev.col}
                                  totalCols={ev.totalCols}
                                  hasMultiTurma={multiSectionSet.has(
                                    ev.turma.courseCode,
                                  )}
                                  color={
                                    colorMap.get(ev.turma.courseCode) ??
                                    FIXED_COLORS[0]
                                  }
                                  isFocused={
                                    focusedSections?.has(
                                      `${ev.turma.courseCode}::${ev.turma.codigo}`,
                                    ) ?? false
                                  }
                                  hasConflict={courseSectionHasConflictOnDay(
                                    ev.turma,
                                    allCourseSections,
                                    dia,
                                  )}
                                  onConflictClick={onConflictClick}
                                  onMultiTurmaClick={onMultiSectionClick}
                                  onRemoverClick={onRemoverClick}
                                />
                              );
                            })}
                          </td>
                        ))
                      : null}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
