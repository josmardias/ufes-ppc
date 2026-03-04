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
 *   onMultiTurmaClick  — optional: (disciplinaCodigo) => void
 *   onRemoverClick     — optional: (disciplinaCodigo, turmaCodigo) => void
 *   focusedTurmas      — optional: Set<"disciplinaCodigo::turmaCodigo"> — highlighted turmas
 *   (turno removed — calendar always shows all shifts)
 */

import {
  HOUR_START,
  HOUR_END,
  rowsToTurmas,
  turmaSlots,
  turmaTemConflito,
  primeiroSlotConflitante,
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
  // Atribui cores por ordem de aparição da disciplina — sem colisões garantidas.
  const map = new Map(); // disciplinaCodigo -> FIXED_COLORS entry
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
// Constantes
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

const ROW_HEIGHT = 54; // px por hora

/**
 * Retorna todas as horas de HOUR_START a HOUR_END sempre visíveis.
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
// Para cada dia, retorna lista de eventos com posição e coluna calculadas.
// Eventos que se sobrepõem ficam em colunas lado a lado.
// ---------------------------------------------------------------------------

function buildDayEvents(todasTurmas, dia) {
  // Coleta blocos: uma turma pode ter múltiplos horários no mesmo dia —
  // agrupamos em um bloco contíguo (startMin → endMin).
  const blocos = [];

  for (const turma of todasTurmas) {
    let startMin = null;
    let endMin = null;

    // Coleta slots do dia e agrupa em blocos contíguos
    // (slots adjacentes ou sobrepostos viram um único bloco)
    const diaSlots = turmaSlots(turma)
      .filter((s) => s.dia === dia)
      .sort((a, b) => a.startMin - b.startMin);

    if (diaSlots.length === 0) continue;

    // Agrupa slots contíguos (fim de um == início do próximo)
    const grupos = [];
    let grupoStart = diaSlots[0].startMin;
    let grupoEnd = diaSlots[0].endMin;
    for (let i = 1; i < diaSlots.length; i++) {
      const s = diaSlots[i];
      if (s.startMin <= grupoEnd) {
        // contíguo ou sobreposto — estende o grupo
        grupoEnd = Math.max(grupoEnd, s.endMin);
      } else {
        // buraco — fecha o grupo atual e abre um novo
        grupos.push({ startMin: grupoStart, endMin: grupoEnd });
        grupoStart = s.startMin;
        grupoEnd = s.endMin;
      }
    }
    grupos.push({ startMin: grupoStart, endMin: grupoEnd });

    for (const g of grupos) {
      startMin = Math.max(g.startMin, HOUR_START * 60);
      endMin = Math.min(g.endMin, HOUR_END * 60);
      if (endMin <= startMin) continue;
      blocos.push({ turma, startMin, endMin });
    }
  }

  // Ordena por início
  blocos.sort((a, b) => a.startMin - b.startMin || a.endMin - b.endMin);

  // Agrupa blocos em colunas (greedy) — blocos sobrepostos ficam em colunas diferentes
  // columns[i] = endMin do último bloco na coluna i
  const columns = [];
  const laid = blocos.map((bloco) => {
    let col = columns.findIndex((endMin) => endMin <= bloco.startMin);
    if (col === -1) {
      col = columns.length;
      columns.push(bloco.endMin);
    } else {
      columns[col] = bloco.endMin;
    }
    return { ...bloco, col };
  });

  // Para cada bloco, calcula quantas colunas existem no SEU intervalo de tempo
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
// TurmaCard
// ---------------------------------------------------------------------------

function TurmaCard({
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
  // Conflito de horário (vermelho) tem precedência sobre múltiplas turmas (amarelo)
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

  const slots = turmaSlots(turma);
  const fmt = (mins) =>
    `${String(Math.floor(mins / 60)).padStart(2, "0")}:${String(mins % 60).padStart(2, "0")}`;

  // Pega o slot deste dia para o label de tempo
  const diaSlots = slots.filter((s) => s.dia === turma._dia);
  let timeLabel = "";
  if (diaSlots.length > 0) {
    const rawStart = Math.min(...diaSlots.map((s) => s.rawStart));
    const rawEnd = Math.max(...diaSlots.map((s) => s.rawEnd));
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
  const tooltip = `${tooltipPrefix}${turma.disciplinaNome}${turma.codigo ? ` (${turma.codigo})` : ""} — ${timeLabel}`;

  function handleClick() {
    // Conflito de horário tem precedência
    if (hasConflict && onConflictClick) {
      const slot = primeiroSlotConflitante(turma, turma._todasTurmas ?? []);
      if (slot !== null) {
        onConflictClick(turma._dia, slot, turma.disciplinaCodigo, turma.codigo);
        return;
      }
    }
    if (hasMultiTurma && onMultiTurmaClick) {
      onMultiTurmaClick(turma.disciplinaCodigo, turma.codigo);
      return;
    }
    if (onRemoverClick) {
      onRemoverClick(turma.disciplinaCodigo, turma.codigo);
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
        {turma.disciplinaCodigo}
      </p>
      <p
        style={{ color: textColor }}
        className="text-xs leading-snug truncate opacity-80 mt-0.5"
      >
        {turma.disciplinaNome !== turma.disciplinaCodigo
          ? turma.disciplinaNome
          : turma.codigo}
      </p>
      {turma.codigo && turma.disciplinaNome !== turma.disciplinaCodigo && (
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
  onMultiTurmaClick,
  onRemoverClick,
  focusedTurmas,
}) {
  const colorMap = buildColorMap(rows);
  const todasTurmas = rowsToTurmas(rows);
  const hasEvents = todasTurmas.some((t) => turmaSlots(t).length > 0);

  // Pré-calcula eventos por dia
  const eventsByDay = Object.fromEntries(
    DAYS.map((dia) => [dia, buildDayEvents(todasTurmas, dia)]),
  );

  // Disciplinas com múltiplas turmas
  const multiTurmaSet = new Set(
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

            {/* Cabeçalho fixo */}
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

                    {/* Células de dia — apenas na primeira linha, com rowspan total */}
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
                              // Injeta _dia e _startMin na turma para uso no TurmaCard
                              const turmaComDia = {
                                ...ev.turma,
                                _dia: dia,
                                _startMin: ev.startMin,
                                _todasTurmas: todasTurmas,
                              };
                              return (
                                <TurmaCard
                                  key={`${ev.turma.disciplinaCodigo}-${ev.turma.codigo}-${i}`}
                                  turma={turmaComDia}
                                  top={top}
                                  height={height}
                                  col={ev.col}
                                  totalCols={ev.totalCols}
                                  hasMultiTurma={multiTurmaSet.has(
                                    ev.turma.disciplinaCodigo,
                                  )}
                                  color={
                                    colorMap.get(ev.turma.disciplinaCodigo) ??
                                    FIXED_COLORS[0]
                                  }
                                  isFocused={
                                    focusedTurmas?.has(
                                      `${ev.turma.disciplinaCodigo}::${ev.turma.codigo}`,
                                    ) ?? false
                                  }
                                  hasConflict={turmaTemConflito(
                                    ev.turma,
                                    todasTurmas,
                                  )}
                                  onConflictClick={onConflictClick}
                                  onMultiTurmaClick={onMultiTurmaClick}
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
