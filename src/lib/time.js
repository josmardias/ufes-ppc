/**
 * src/lib/time.js
 *
 * Generic time utilities — no domain knowledge.
 * Ported from scripts/lib/time.mjs for browser use (ESM, no Node).
 *
 * Conventions:
 * - Time strings: "HH:MM" (24h)
 * - Minutes: integer 0..1439
 * - Intervals: half-open [startMin, endMin)
 */

/**
 * Converts "HH:MM" to minutes since 00:00.
 * Returns null if invalid.
 *
 * @param {string} hhmm
 * @returns {number|null}
 */
export function hhmmToMinutes(hhmm) {
  const m = String(hhmm ?? "")
    .trim()
    .match(/^(\d{1,2}):(\d{2})$/);
  if (!m) return null;

  const hh = Number(m[1]);
  const mm = Number(m[2]);
  if (!Number.isFinite(hh) || !Number.isFinite(mm)) return null;
  if (hh < 0 || hh > 23 || mm < 0 || mm > 59) return null;

  return hh * 60 + mm;
}

/**
 * Converts minutes since 00:00 to "HH:00" (full hour slot).
 *
 * @param {number} mins
 * @returns {string}
 */
export function minutesToHH00(mins) {
  const n = Number(mins);
  const hh = Number.isFinite(n) ? Math.floor(n / 60) : 0;
  return String(hh).padStart(2, "0") + ":00";
}

/**
 * Returns true if half-open intervals [aStart, aEnd) and [bStart, bEnd) overlap.
 *
 * @param {number} aStart
 * @param {number} aEnd
 * @param {number} bStart
 * @param {number} bEnd
 * @returns {boolean}
 */
export function overlaps(aStart, aEnd, bStart, bEnd) {
  return aStart < bEnd && bStart < aEnd;
}

/**
 * Normalizes a weekday name (pt-BR) to the canonical abbreviation.
 *
 * @param {string} raw
 * @returns {"Seg"|"Ter"|"Qua"|"Qui"|"Sex"|"Sab"|"Dom"|string}
 */
export function normalizeDia(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (t === "seg" || t === "segunda" || t === "segunda-feira") return "Seg";
  if (
    t === "ter" ||
    t === "terça" ||
    t === "terca" ||
    t === "terça-feira" ||
    t === "terca-feira"
  )
    return "Ter";
  if (t === "qua" || t === "quarta" || t === "quarta-feira") return "Qua";
  if (t === "qui" || t === "quinta" || t === "quinta-feira") return "Qui";
  if (t === "sex" || t === "sexta" || t === "sexta-feira") return "Sex";
  if (t === "sáb" || t === "sab" || t === "sábado" || t === "sabado")
    return "Sab";
  if (t === "dom" || t === "domingo") return "Dom";

  if (!t) return "";
  return t.slice(0, 1).toUpperCase() + t.slice(1);
}

/**
 * Converts a slot {dia, inicio, fim} to a validated minute interval.
 * Returns null if invalid.
 *
 * @param {{dia:string, inicio:string, fim:string}} slot
 * @returns {{dia:string, startMin:number, endMin:number, inicio:string, fim:string}|null}
 */
export function slotToInterval(slot) {
  const dia = normalizeDia(slot?.dia);
  const inicio = String(slot?.inicio ?? "").trim();
  const fim = String(slot?.fim ?? "").trim();

  const startMin = hhmmToMinutes(inicio);
  const endMin = hhmmToMinutes(fim);

  if (!dia || startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;

  return { dia, startMin, endMin, inicio, fim };
}

/**
 * Expands an interval into 1h slots (HH:00).
 * e.g. [09:00, 11:00) -> ["09:00", "10:00"]
 *
 * @param {number} startMin
 * @param {number} endMin
 * @returns {string[]}
 */
export function expandIntervalToHourSlots(startMin, endMin) {
  const a = Number(startMin);
  const b = Number(endMin);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return [];
  if (b <= a) return [];

  const out = [];
  for (let t = a; t < b; t += 60) out.push(minutesToHH00(t));
  return out;
}
