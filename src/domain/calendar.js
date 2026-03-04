/**
 * src/domain/calendar.js
 *
 * Weekly calendar domain logic.
 * Pure functions — answer questions about the domain, no side effects.
 *
 * Domain model:
 *   Disciplina  -> has turmas (class sections)
 *   Turma       -> has horarios (time slots {dia, inicio, fim})
 *   Horario     -> a time slot on a weekday
 *
 * Exports:
 *   HOUR_START / HOUR_END           — relevant academic day range (7–22)
 *   rowsToTurmas(rows)              -> Turma[]   — extract all turmas from planning rows
 *   turmaSlots(turma)               -> Slot[]    — valid time intervals for a turma
 *   turmasConflitam(a, b)           -> boolean   — do two turmas share a 1h slot?
 *   turmaTemConflito(turma, all)    -> boolean   — does this turma conflict with any other?
 *   periodoEstaResolvido(rows)      -> boolean   — period has no conflicts and 1 turma per discipline?
 *   periodoTemConflitoDeHorario(rows) -> boolean — period has any schedule conflict?
 *   motivosBloqueio(rows)           -> string[]  — blocking issues preventing next period generation
 *   todosConflitosDeHorario(rows)   -> { dia, horaInicio }[]  — all unique conflicting slots
 *   conflitosDoSlot(dia, hora, rows) -> { disciplinaCodigo, turmaCodigo }[]  — turmas in a slot
 *   resolverConflitoSlot(...)       -> PlanningRow[]  — resolve a slot conflict
 *   resolverTurmaVencedora(...)     -> PlanningRow[]  — elect winner turma, remove conflicting ones
 *   periodoTemTurno(rows, turno)    -> boolean   — period has any schedule in the given shift?
 *
 * Informal types:
 *
 *   PlanningRow {
 *     codigo, nome, semestre_curso,
 *     turmas: Turma[]
 *   }
 *
 *   Turma {
 *     codigo:   string
 *     docente:  string
 *     horarios: Horario[]
 *     // enriched by rowsToTurmas:
 *     disciplinaCodigo: string
 *     disciplinaNome:   string
 *   }
 *
 *   Horario {
 *     dia:    string   // "Seg" | "Ter" | "Qua" | "Qui" | "Sex" | "Sab" | "Dom"
 *     inicio: string   // "HH:MM"
 *     fim:    string   // "HH:MM"
 *   }
 *
 *   Slot {
 *     dia:      string
 *     startMin: number  // minutes since 00:00, clamped to [HOUR_START*60, HOUR_END*60]
 *     endMin:   number
 *     rawStart: number  // original value
 *     rawEnd:   number
 *   }
 */

import { hhmmToMinutes } from "../lib/time.js";

// ---------------------------------------------------------------------------
// Domain constants
// ---------------------------------------------------------------------------

export const HOUR_START = 7; // 07:00 — start of the academic day
export const HOUR_END = 22; // 22:00 — end of the academic day

// ---------------------------------------------------------------------------
// rowsToTurmas
// ---------------------------------------------------------------------------

/**
 * Extracts all turmas from planning rows, enriching each with
 * disciplinaCodigo and disciplinaNome for traceability.
 *
 * Waiver rows (semestre_curso === "_") are ignored.
 *
 * @param {PlanningRow[]} rows
 * @returns {Turma[]}
 */
export function rowsToTurmas(rows) {
  const result = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.semestre_curso ?? "").trim() === "_") continue;

    const disciplinaCodigo = String(row?.codigo ?? "").trim();
    const disciplinaNome = String(row?.nome ?? "").trim() || disciplinaCodigo;

    const turmas = Array.isArray(row.turmas) ? row.turmas : [];
    for (const turma of turmas) {
      result.push({
        codigo: String(turma?.codigo ?? "").trim(),
        docente: String(turma?.docente ?? "").trim(),
        horarios: Array.isArray(turma?.horarios) ? turma.horarios : [],
        disciplinaCodigo,
        disciplinaNome,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// turmaSlots
// ---------------------------------------------------------------------------

/**
 * Converts a turma's horarios into validated time slots clamped to
 * [HOUR_START, HOUR_END]. Invalid entries are discarded.
 *
 * @param {Turma} turma
 * @returns {Slot[]}
 */
export function turmaSlots(turma) {
  const horarios = Array.isArray(turma?.horarios) ? turma.horarios : [];
  const result = [];

  for (const h of horarios) {
    const rawStart = hhmmToMinutes(h?.inicio);
    const rawEnd = hhmmToMinutes(h?.fim);

    if (rawStart === null || rawEnd === null || rawEnd <= rawStart) continue;

    const startMin = Math.max(rawStart, HOUR_START * 60);
    const endMin = Math.min(rawEnd, HOUR_END * 60);

    if (endMin <= startMin) continue;

    result.push({
      dia: String(h?.dia ?? "").trim(),
      startMin,
      endMin,
      rawStart,
      rawEnd,
    });
  }

  return result;
}

// ---------------------------------------------------------------------------
// turmasConflitam
// ---------------------------------------------------------------------------

/**
 * Responde: "estas duas turmas conflitam?"
 *
 * Conflito é definido por sobreposição em ao menos um slot de 1h (HH:00–HH+1:00)
 * no mesmo dia — regra idêntica ao script imprimir-periodo.mjs.
 *
 * Regras:
 * - Mesma turma (mesmo codigo E mesma disciplina) → não conflita
 *   (são os vários dias da mesma aula, ex: Ter e Qui da turma 06.1 N)
 * - Turmas diferentes da mesma disciplina → conflitam
 *   (aluno não pode frequentar duas turmas da mesma disciplina)
 * - Turmas de disciplinas diferentes → conflitam se houver sobreposição de horário
 *
 * @param {Turma} a
 * @param {Turma} b
 * @returns {boolean}
 */
export function turmasConflitam(a, b) {
  // Mesma turma da mesma disciplina → não é conflito
  // (são os vários horários de uma mesma aula, ex: Ter e Qui da turma 06.1 N)
  if (
    a.disciplinaCodigo &&
    a.disciplinaCodigo === b.disciplinaCodigo &&
    a.codigo === b.codigo
  ) {
    return false;
  }

  const slotsA = turmaSlots(a);
  const slotsB = turmaSlots(b);

  for (const sa of slotsA) {
    for (const sb of slotsB) {
      if (sa.dia !== sb.dia) continue;
      if (_slotsConflitamPorHora(sa, sb)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// turmaTemConflito
// ---------------------------------------------------------------------------

/**
 * Returns true if this turma conflicts with any other in the list.
 *
 * @param {Turma} turma
 * @param {Turma[]} todasTurmas
 * @returns {boolean}
 */
export function turmaTemConflito(turma, todasTurmas) {
  return (Array.isArray(todasTurmas) ? todasTurmas : [])
    .filter((other) => other !== turma)
    .some((other) => turmasConflitam(turma, other));
}

// ---------------------------------------------------------------------------
// periodoEstaResolvido / motivosBloqueio
// ---------------------------------------------------------------------------

/**
 * Returns true if the period is resolved and the next one can be generated.
 *
 * A period is resolved when:
 * 1. Each discipline has exactly 1 turma.
 * 2. No turma conflicts with another.
 *
 * @param {PlanningRow[]} rows
 * @returns {boolean}
 */
export function periodoEstaResolvido(rows) {
  return motivosBloqueio(rows).length === 0;
}

/**
 * Responde: "o período tem algum conflito de horário entre turmas?"
 *
 * Ignora o problema de múltiplas turmas por disciplina — só verifica
 * se há sobreposição de horários entre turmas distintas.
 *
 * @param {PlanningRow[]} rows
 * @returns {boolean}
 */
export function periodoTemConflitoDeHorario(rows) {
  const rowsValidas = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );
  const turmas = rowsToTurmas(rowsValidas);
  for (let i = 0; i < turmas.length; i++) {
    for (let j = i + 1; j < turmas.length; j++) {
      if (turmasConflitam(turmas[i], turmas[j])) return true;
    }
  }
  return false;
}

/**
 * Returns all unique conflicting slots in the period.
 *
 * @param {PlanningRow[]} rows
 * @returns {{ dia: string, horaInicio: number, codigos: string[] }[]}
 */
export function todosConflitosDeHorario(rows) {
  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  const rowsValidas = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );
  const turmas = rowsToTurmas(rowsValidas);
  const slots = new Map(); // key "Dia|HH:00" -> Set<disciplinaCodigo>

  for (let i = 0; i < turmas.length; i++) {
    for (let j = i + 1; j < turmas.length; j++) {
      const a = turmas[i];
      const b = turmas[j];
      if (!turmasConflitam(a, b)) continue;

      // Encontra os slots de 1h onde conflitam
      for (const sa of turmaSlots(a)) {
        for (const sb of turmaSlots(b)) {
          if (sa.dia !== sb.dia) continue;
          for (
            let slot = Math.floor(sa.startMin / 60) * 60;
            slot < sa.endMin;
            slot += 60
          ) {
            const slotEnd = slot + 60;
            if (sb.startMin < slotEnd && sb.endMin > slot) {
              const key = `${sa.dia}|${slot}`;
              if (!slots.has(key)) slots.set(key, new Set());
              slots.get(key).add(a.disciplinaCodigo);
              slots.get(key).add(b.disciplinaCodigo);
            }
          }
        }
      }
    }
  }

  return [...slots.entries()]
    .map(([key, codigos]) => {
      const [dia, horaStr] = key.split("|");
      return { dia, horaInicio: Number(horaStr), codigos: [...codigos].sort() };
    })
    .sort((a, b) => {
      const dA = DIAS.indexOf(a.dia);
      const dB = DIAS.indexOf(b.dia);
      if (dA !== dB) return dA - dB;
      return a.horaInicio - b.horaInicio;
    });
}

/**
 * Returns blocking issues preventing next period generation.
 * Empty array means the period is resolved.
 *
 * @param {PlanningRow[]} rows
 * @returns {string[]}
 */
export function motivosBloqueio(rows) {
  const motivos = [];
  const rowsValidas = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );

  // 1) disciplinas com mais de 1 turma
  for (const row of rowsValidas) {
    const turmas = Array.isArray(row?.turmas) ? row.turmas : [];
    if (turmas.length > 1) {
      motivos.push(
        `${row.codigo} tem ${turmas.length} turmas — escolha apenas 1.`,
      );
    }
  }

  // 2) conflitos de horário entre turmas de disciplinas diferentes
  const turmas = rowsToTurmas(rowsValidas);
  const conflitantes = new Set();
  for (let i = 0; i < turmas.length; i++) {
    for (let j = i + 1; j < turmas.length; j++) {
      if (turmasConflitam(turmas[i], turmas[j])) {
        conflitantes.add(turmas[i].disciplinaCodigo);
        conflitantes.add(turmas[j].disciplinaCodigo);
      }
    }
  }
  if (conflitantes.size > 0) {
    motivos.push(
      `Conflito de horário entre: ${[...conflitantes].sort().join(", ")}.`,
    );
  }

  return motivos;
}

// ---------------------------------------------------------------------------
// periodoTemTurno
// ---------------------------------------------------------------------------

const CUTOFF = 13 * 60; // 13:00

/**
 * Responde: "o período tem alguma turma com horário no turno dado?"
 *
 * @param {PlanningRow[]} rows
 * @param {"manha"|"tarde"|"dia"} turno
 * @returns {boolean}
 */
export function periodoTemTurno(rows, turno) {
  if (turno === "dia") return true;
  const turmas = rowsToTurmas(Array.isArray(rows) ? rows : []);
  for (const turma of turmas) {
    for (const slot of turmaSlots(turma)) {
      const inicioMin = slot.startMin;
      if (turno === "manha" && inicioMin < CUTOFF) return true;
      if (turno === "tarde" && inicioMin >= CUTOFF) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// conflitosDoSlot / resolverConflitoSlot
// ---------------------------------------------------------------------------

/**
 * Returns the first 1h slot (in minutes since 00:00) where this turma
 * conflicts with another. Returns null if no conflict found.
 *
 * @param {Turma} turma
 * @param {Turma[]} todasTurmas
 * @returns {number|null}
 */
export function primeiroSlotConflitante(turma, todasTurmas) {
  const others = (Array.isArray(todasTurmas) ? todasTurmas : []).filter(
    (other) =>
      other !== turma &&
      !(
        other.disciplinaCodigo === turma.disciplinaCodigo &&
        other.codigo === turma.codigo
      ),
  );

  const meusSlotsOrdenados = turmaSlots(turma).sort(
    (a, b) => a.startMin - b.startMin,
  );

  for (const meuSlot of meusSlotsOrdenados) {
    for (
      let slot = Math.floor(meuSlot.startMin / 60) * 60;
      slot < meuSlot.endMin;
      slot += 60
    ) {
      const slotEnd = slot + 60;
      for (const other of others) {
        for (const outroSlot of turmaSlots(other)) {
          if (outroSlot.dia !== meuSlot.dia) continue;
          if (outroSlot.startMin < slotEnd && outroSlot.endMin > slot) {
            return slot;
          }
        }
      }
    }
  }

  return null;
}

/**
 * Returns all (discipline, turma) pairs occupying a given 1h slot.
 *
 * @param {string} dia        — e.g. "Ter"
 * @param {number} horaInicio — full hour in minutes, e.g. 9*60 for 09:00
 * @param {PlanningRow[]} rows
 * @returns {{ disciplinaCodigo: string, turmaCodigo: string }[]}
 */
export function conflitosDoSlot(dia, horaInicio, rows) {
  const slotStart = horaInicio;
  const slotEnd = horaInicio + 60;
  const result = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.semestre_curso ?? "").trim() === "_") continue;

    const turmas = Array.isArray(row?.turmas) ? row.turmas : [];
    for (const turma of turmas) {
      const slots = turmaSlots({
        ...turma,
        disciplinaCodigo: row.codigo,
        disciplinaNome: row.nome,
      });
      const ocupa = slots.some(
        (s) => s.dia === dia && s.startMin < slotEnd && s.endMin > slotStart,
      );
      if (ocupa) {
        result.push({
          disciplinaCodigo: String(row?.codigo ?? "").trim(),
          turmaCodigo: String(turma?.codigo ?? "").trim(),
        });
      }
    }
  }

  return result;
}

/**
 * Resolve um conflito de slot elegendo uma turma vencedora.
 *
 * Para cada disciplina que ocupa o slot:
 * - Se é a disciplina+turma vencedora → mantém apenas essa turma na row.
 * - Se é outra turma da MESMA disciplina que ocupa o slot → remove essa turma da row.
 * - Se é uma turma de OUTRA disciplina que ocupa o slot → remove essa turma da row.
 *
 * Rows sem turmas após a remoção são mantidas (sem horário não é motivo de exclusão).
 *
 * @param {string} dia
 * @param {number} horaInicio           — hora cheia em minutos
 * @param {string} vencedorDisciplinaCodigo
 * @param {string} vencedorTurmaCodigo
 * @param {PlanningRow[]} rows
 * @returns {PlanningRow[]}
 */
export function resolverConflitoSlot(
  dia,
  horaInicio,
  vencedorDisciplinaCodigo,
  vencedorTurmaCodigo,
  rows,
) {
  const slotStart = horaInicio;
  const slotEnd = horaInicio + 60;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (String(row?.semestre_curso ?? "").trim() === "_") return row;

    const turmas = Array.isArray(row?.turmas) ? row.turmas : [];
    const disciplinaCodigo = String(row?.codigo ?? "").trim();

    // Filtra turmas que ocupam o slot e não são a vencedora
    const turmasFiltradas = turmas.filter((turma) => {
      const turmaCodigo = String(turma?.codigo ?? "").trim();
      const slots = turmaSlots({
        ...turma,
        disciplinaCodigo,
        disciplinaNome: row.nome,
      });
      const ocupaSlot = slots.some(
        (s) => s.dia === dia && s.startMin < slotEnd && s.endMin > slotStart,
      );

      if (!ocupaSlot) return true; // não está no slot → mantém

      // está no slot: mantém só se for a vencedora
      return (
        disciplinaCodigo === vencedorDisciplinaCodigo &&
        turmaCodigo === vencedorTurmaCodigo
      );
    });

    if (turmasFiltradas.length === turmas.length) return row; // nada mudou
    return { ...row, turmas: turmasFiltradas };
  });
}

// ---------------------------------------------------------------------------
// resolverTurmaVencedora
// ---------------------------------------------------------------------------

/**
 * Elects a winner turma and applies the resolution across the entire period:
 *
 * 1. For the winner's discipline: keeps only the winner turma.
 * 2. For all other disciplines: removes any turma that conflicts with the winner.
 *
 * @param {string} vencedorDisciplinaCodigo
 * @param {string} vencedorTurmaCodigo
 * @param {PlanningRow[]} rows
 * @returns {PlanningRow[]}
 */
export function resolverTurmaVencedora(
  vencedorDisciplinaCodigo,
  vencedorTurmaCodigo,
  rows,
) {
  // Monta o objeto Turma da vencedora para comparar com turmasConflitam
  const rowVencedora = (Array.isArray(rows) ? rows : []).find(
    (r) => String(r?.codigo ?? "").trim() === vencedorDisciplinaCodigo,
  );
  const turmaVencedoraRaw = (rowVencedora?.turmas ?? []).find(
    (t) => String(t?.codigo ?? "").trim() === vencedorTurmaCodigo,
  );
  const turmaVencedora = turmaVencedoraRaw
    ? {
        ...turmaVencedoraRaw,
        disciplinaCodigo: vencedorDisciplinaCodigo,
        disciplinaNome: rowVencedora?.nome ?? "",
      }
    : null;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const disciplinaCodigo = String(row?.codigo ?? "").trim();
    const turmas = Array.isArray(row?.turmas) ? row.turmas : [];

    if (disciplinaCodigo === vencedorDisciplinaCodigo) {
      // Na disciplina vencedora: mantém só a turma vencedora
      const filtradas = turmas.filter(
        (t) => String(t?.codigo ?? "").trim() === vencedorTurmaCodigo,
      );
      if (filtradas.length === turmas.length) return row;
      return { ...row, turmas: filtradas };
    }

    if (!turmaVencedora) return row;

    // Em outras disciplinas: remove turmas que conflitam com a vencedora
    const filtradas = turmas.filter((t) => {
      const turmaObj = {
        ...t,
        disciplinaCodigo,
        disciplinaNome: row?.nome ?? "",
      };
      return !turmasConflitam(turmaVencedora, turmaObj);
    });

    if (filtradas.length === turmas.length) return row;

    // Se todas as turmas foram removidas, mantém a primeira sem horários.
    // turmas: [] seria re-enriquecido pela oferta; uma turma sem horários não é.
    if (filtradas.length === 0 && turmas.length > 0) {
      const placeholder = { ...turmas[0], horarios: [] };
      return { ...row, turmas: [placeholder] };
    }

    return { ...row, turmas: filtradas };
  });
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

/**
 * Two slots conflict if they both cover at least one 1h interval (HH:00–HH+1:00).
 *
 * @param {Slot} a
 * @param {Slot} b
 * @returns {boolean}
 */
function _slotsConflitamPorHora(a, b) {
  const slotInicio = Math.floor(a.startMin / 60) * 60;
  const slotFim = a.endMin;

  for (let slot = slotInicio; slot < slotFim; slot += 60) {
    const slotEnd = slot + 60;
    if (b.startMin < slotEnd && b.endMin > slot) return true;
  }

  return false;
}
