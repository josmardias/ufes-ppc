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
 * - Canonical weekday abbreviations: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
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
 * Normalizes any weekday name or abbreviation (English or pt-BR) to the
 * canonical English three-letter abbreviation.
 *
 * Accepts:
 *   English full names  — "monday", "tuesday", …
 *   English abbrevs     — "mon", "tue", "wed", "thu", "fri", "sat", "sun"
 *   pt-BR full names    — "segunda-feira", "terça-feira", …
 *   pt-BR abbrevs       — "seg", "ter", "qua", "qui", "sex", "sab", "dom"
 *
 * Returns one of: "Mon" | "Tue" | "Wed" | "Thu" | "Fri" | "Sat" | "Sun"
 * Returns "" for unrecognized input.
 *
 * @param {string} raw
 * @returns {"Mon"|"Tue"|"Wed"|"Thu"|"Fri"|"Sat"|"Sun"|""}
 */
export function normalizeDay(raw) {
  const t = String(raw ?? "")
    .trim()
    .toLowerCase();

  if (t === "mon" || t === "monday" || t === "seg" || t === "segunda" || t === "segunda-feira")
    return "Mon";
  if (
    t === "tue" ||
    t === "tuesday" ||
    t === "ter" ||
    t === "terça" ||
    t === "terca" ||
    t === "terça-feira" ||
    t === "terca-feira"
  )
    return "Tue";
  if (t === "wed" || t === "wednesday" || t === "qua" || t === "quarta" || t === "quarta-feira")
    return "Wed";
  if (t === "thu" || t === "thursday" || t === "qui" || t === "quinta" || t === "quinta-feira")
    return "Thu";
  if (t === "fri" || t === "friday" || t === "sex" || t === "sexta" || t === "sexta-feira")
    return "Fri";
  if (
    t === "sat" ||
    t === "saturday" ||
    t === "sáb" ||
    t === "sab" ||
    t === "sábado" ||
    t === "sabado"
  )
    return "Sat";
  if (t === "sun" || t === "sunday" || t === "dom" || t === "domingo") return "Sun";

  return "";
}

/**
 * Converts a slot {day, start, end} to a validated minute interval.
 * Returns null if invalid.
 *
 * @param {{day:string, start:string, end:string}} slot
 * @returns {{day:string, startMin:number, endMin:number, start:string, end:string}|null}
 */
export function slotToInterval(slot) {
  const day = normalizeDay(slot?.day);
  const start = String(slot?.start ?? "").trim();
  const end = String(slot?.end ?? "").trim();

  const startMin = hhmmToMinutes(start);
  const endMin = hhmmToMinutes(end);

  if (!day || startMin === null || endMin === null) return null;
  if (endMin <= startMin) return null;

  return { day, startMin, endMin, start, end };
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