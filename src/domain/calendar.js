/**
 * src/domain/calendar.js
 *
 * Weekly calendar domain logic.
 * Pure functions — answer questions about the domain, no side effects.
 *
 * Domain model:
 *   Course        -> has course sections (turmas in JSON)
 *   CourseSection -> has schedules (horarios in JSON: {dia, inicio, fim})
 *   Schedule      -> a time slot on a weekday
 *
 * Exports:
 *   HOUR_START / HOUR_END                — relevant academic day range (7–22)
 *   rowsToCourseSections(rows)           -> CourseSection[]  — extract all course sections from planning rows
 *   courseSectionSlots(section)          -> Slot[]           — valid time intervals for a course section
 *   courseSectionsConflict(a, b)         -> boolean          — do two sections share a 1h slot?
 *   courseSectionHasConflict(s, all)     -> boolean          — does this section conflict with any other?
 *   isPeriodResolved(rows)           -> boolean          — period has no conflicts and 1 section per course?
 *   periodHasScheduleConflict(rows)    -> boolean          — period has any schedule conflict?
 *   blockingReasons(rows)               -> string[]         — blocking issues preventing next period generation
 *   allScheduleConflicts(rows)        -> { dia, horaInicio }[]  — all unique conflicting slots
 *   sectionsInSlot(dia, hora, rows)     -> { courseCode, sectionCode }[]  — sections in a slot
 *   resolveSlotConflict(...)            -> PlanningRow[]   — resolve a slot conflict
 *   resolveWinningCourseSection(...)     -> PlanningRow[]   — elect winner section, remove conflicting ones
 *   periodHasShift(rows, turno)         -> boolean         — period has any schedule in the given shift?
 *
 * Informal types:
 *
 *   PlanningRow {
 *     codigo, nome, semestre_curso,
 *     turmas: CourseSection[]   // JSON field name kept as-is (persisted)
 *   }
 *
 *   CourseSection {
 *     codigo:   string
 *     docente:  string
 *     horarios: Schedule[]   // JSON field name kept as-is (persisted)
 *     // enriched by rowsToCourseSections:
 *     courseCode: string
 *     courseName: string
 *   }
 *
 *   Schedule {
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
// rowsToCourseSections
// ---------------------------------------------------------------------------

/**
 * Extracts all course sections from planning rows, enriching each with
 * courseCode and courseName for traceability.
 *
 * Waiver rows (semestre_curso === "_") are ignored.
 *
 * @param {PlanningRow[]} rows
 * @returns {CourseSection[]}
 */
export function rowsToCourseSections(rows) {
  const result = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.semestre_curso ?? "").trim() === "_") continue;

    const courseCode = String(row?.codigo ?? "").trim();
    const courseName = String(row?.nome ?? "").trim() || courseCode;

    const sections = Array.isArray(row.turmas) ? row.turmas : [];
    for (const section of sections) {
      result.push({
        codigo: String(section?.codigo ?? "").trim(),
        docente: String(section?.docente ?? "").trim(),
        horarios: Array.isArray(section?.horarios) ? section.horarios : [],
        courseCode,
        courseName,
      });
    }
  }

  return result;
}

// ---------------------------------------------------------------------------
// courseSectionSlots
// ---------------------------------------------------------------------------

/**
 * Converts a course section's schedules into validated time slots clamped to
 * [HOUR_START, HOUR_END]. Invalid entries are discarded.
 *
 * @param {CourseSection} section
 * @returns {Slot[]}
 */
export function courseSectionSlots(section) {
  const schedules = Array.isArray(section?.horarios) ? section.horarios : [];
  const result = [];

  for (const h of schedules) {
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
// courseSectionsConflict
// ---------------------------------------------------------------------------

/**
 * Answers: "do these two course sections conflict?"
 *
 * A conflict is defined by overlap in at least one 1h slot (HH:00–HH+1:00)
 * on the same day — same rule as the imprimir-periodo.mjs script.
 *
 * Rules:
 * - Same section (same codigo AND same course) → no conflict
 *   (these are the multiple days of the same class, e.g. Tue and Thu of section 06.1 N)
 * - Different sections of the same course → conflict
 *   (student cannot attend two sections of the same course)
 * - Sections of different courses → conflict if there is schedule overlap
 *
 * @param {CourseSection} a
 * @param {CourseSection} b
 * @returns {boolean}
 */
export function courseSectionsConflict(a, b) {
  // Same section of the same course → not a conflict
  // (these are the multiple schedules of the same class, e.g. Tue and Thu of section 06.1 N)
  if (a.courseCode && a.courseCode === b.courseCode && a.codigo === b.codigo) {
    return false;
  }

  const slotsA = courseSectionSlots(a);
  const slotsB = courseSectionSlots(b);

  for (const sa of slotsA) {
    for (const sb of slotsB) {
      if (sa.dia !== sb.dia) continue;
      if (_slotsByHourConflict(sa, sb)) return true;
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// courseSectionHasConflict
// ---------------------------------------------------------------------------

/**
 * Returns true if this course section conflicts with any other in the list.
 *
 * @param {CourseSection} section
 * @param {CourseSection[]} allCourseSections
 * @returns {boolean}
 */
export function courseSectionHasConflict(section, allCourseSections) {
  return (Array.isArray(allCourseSections) ? allCourseSections : [])
    .filter((other) => other !== section)
    .some((other) => courseSectionsConflict(section, other));
}

/**
 * Returns true if this course section conflicts with any other section
 * within the rendered card's block interval [blockStart, blockEnd) on the
 * given day.
 *
 * blockStart/blockEnd are the pixel-block bounds of the specific card being
 * rendered. A section with non-contiguous slots on the same day produces
 * multiple cards; each card is only red when its own time range actually
 * overlaps another section — not because a different fragment of the same
 * section conflicts elsewhere on that day.
 *
 * When blockStart/blockEnd are omitted the full section interval is used
 * (backward-compatible).
 *
 * @param {CourseSection} section
 * @param {CourseSection[]} allCourseSections
 * @param {string} dia        — e.g. "Qua"
 * @param {number} [blockStart] — card start in minutes since 00:00
 * @param {number} [blockEnd]   — card end in minutes since 00:00
 * @returns {boolean}
 */
export function courseSectionHasConflictOnDay(
  section,
  allCourseSections,
  dia,
  blockStart,
  blockEnd,
) {
  const allSlotsOnDay = courseSectionSlots(section).filter(
    (s) => s.dia === dia,
  );
  if (allSlotsOnDay.length === 0) return false;

  // If block bounds are provided, restrict to slots within that block.
  const mySlotsOnDay =
    blockStart != null && blockEnd != null
      ? allSlotsOnDay.filter(
          (s) => s.startMin < blockEnd && s.endMin > blockStart,
        )
      : allSlotsOnDay;

  if (mySlotsOnDay.length === 0) return false;

  const others = (
    Array.isArray(allCourseSections) ? allCourseSections : []
  ).filter((other) => other !== section);

  for (const other of others) {
    // Same section of the same course — never a conflict (multiple days of the same class)
    if (
      other.courseCode === section.courseCode &&
      other.codigo === section.codigo
    )
      continue;

    const otherSlotsOnDay = courseSectionSlots(other).filter(
      (s) => s.dia === dia,
    );

    for (const mine of mySlotsOnDay) {
      for (const theirs of otherSlotsOnDay) {
        if (!_slotsByHourConflict(mine, theirs)) continue;

        // Same course, different section: only red when they actually share a
        // 1h slot on this day (student physically can't be in two places).
        // When they are on different days/times, yellow (multiple sections) is enough.
        if (other.courseCode === section.courseCode) {
          return true; // slot overlap already confirmed by _slotsByHourConflict
        }

        // Different course: always red when there is slot overlap.
        return true;
      }
    }
  }

  return false;
}

// ---------------------------------------------------------------------------
// isPeriodResolved / blockingReasons
// ---------------------------------------------------------------------------

/**
 * Returns true if the period is resolved and the next one can be generated.
 *
 * A period is resolved when:
 * 1. Each course has exactly 1 section.
 * 2. No section conflicts with another.
 *
 * @param {PlanningRow[]} rows
 * @returns {boolean}
 */
export function isPeriodResolved(rows) {
  return blockingReasons(rows).length === 0;
}

/**
 * Returns true if the period has any schedule conflict between sections.
 *
 * Ignores the multiple-sections-per-course problem — only checks
 * for schedule overlap between distinct sections.
 *
 * @param {PlanningRow[]} rows
 * @returns {boolean}
 */
export function periodHasScheduleConflict(rows) {
  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );
  const allCourseSections = rowsToCourseSections(validRows);
  for (let i = 0; i < allCourseSections.length; i++) {
    for (let j = i + 1; j < allCourseSections.length; j++) {
      if (courseSectionsConflict(allCourseSections[i], allCourseSections[j]))
        return true;
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
export function allScheduleConflicts(rows) {
  const DIAS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab", "Dom"];
  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );
  const allCourseSections = rowsToCourseSections(validRows);
  const slots = new Map(); // key "Dia|HH:00" -> Set<courseCode>

  for (let i = 0; i < allCourseSections.length; i++) {
    for (let j = i + 1; j < allCourseSections.length; j++) {
      const a = allCourseSections[i];
      const b = allCourseSections[j];
      if (!courseSectionsConflict(a, b)) continue;

      // Find the 1h slots where they conflict
      for (const sa of courseSectionSlots(a)) {
        for (const sb of courseSectionSlots(b)) {
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
              slots.get(key).add(a.courseCode);
              slots.get(key).add(b.courseCode);
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
export function blockingReasons(rows) {
  const motivos = [];
  const validRows = (Array.isArray(rows) ? rows : []).filter(
    (r) => String(r?.semestre_curso ?? "").trim() !== "_",
  );

  // 1) courses with more than 1 section
  for (const row of validRows) {
    const sections = Array.isArray(row?.turmas) ? row.turmas : [];
    if (sections.length > 1) {
      motivos.push(
        `${row.codigo} tem ${sections.length} turmas — escolha apenas 1.`,
      );
    }
  }

  // 2) schedule conflicts between sections of different courses
  const allCourseSections = rowsToCourseSections(validRows);
  const conflicting = new Set();
  for (let i = 0; i < allCourseSections.length; i++) {
    for (let j = i + 1; j < allCourseSections.length; j++) {
      if (courseSectionsConflict(allCourseSections[i], allCourseSections[j])) {
        conflicting.add(allCourseSections[i].courseCode);
        conflicting.add(allCourseSections[j].courseCode);
      }
    }
  }
  if (conflicting.size > 0) {
    motivos.push(
      `Conflito de horário entre: ${[...conflicting].sort().join(", ")}.`,
    );
  }

  return motivos;
}

// ---------------------------------------------------------------------------
// periodHasShift
// ---------------------------------------------------------------------------

const CUTOFF = 13 * 60; // 13:00

/**
 * Returns true if the period has any section with a schedule in the given shift.
 *
 * @param {PlanningRow[]} rows
 * @param {"manha"|"tarde"|"dia"} turno
 * @returns {boolean}
 */
export function periodHasShift(rows, turno) {
  if (turno === "dia") return true;
  const allCourseSections = rowsToCourseSections(
    Array.isArray(rows) ? rows : [],
  );
  for (const section of allCourseSections) {
    for (const slot of courseSectionSlots(section)) {
      const startMin = slot.startMin;
      if (turno === "manha" && startMin < CUTOFF) return true;
      if (turno === "tarde" && startMin >= CUTOFF) return true;
    }
  }
  return false;
}

// ---------------------------------------------------------------------------
// sectionsInSlot / resolveSlotConflict
// ---------------------------------------------------------------------------

/**
 * Returns the first 1h slot (in minutes since 00:00) where this section
 * conflicts with another section, restricted to the given day.
 *
 * Priority: cross-course conflicts are preferred over same-course conflicts.
 * This ensures that clicking a card on Tuesday where a cross-course conflict
 * exists opens that conflict, even if a same-course conflict also exists
 * earlier on the same day.
 *
 * @param {CourseSection} section
 * @param {CourseSection[]} allCourseSections
 * @param {string|null} [dia] — if provided, only search for conflicts on this day
 * @returns {number|null}
 */
export function firstConflictingSlot(section, allCourseSections, dia = null) {
  const baseSections = (
    Array.isArray(allCourseSections) ? allCourseSections : []
  ).filter(
    (other) =>
      other !== section &&
      !(
        other.courseCode === section.courseCode &&
        other.codigo === section.codigo
      ),
  );

  const crossCourseOthers = baseSections.filter(
    (other) => other.courseCode !== section.courseCode,
  );
  const sameCourseOthers = baseSections.filter(
    (other) => other.courseCode === section.courseCode,
  );

  const mySlotsOrdered = courseSectionSlots(section)
    .filter((s) => dia === null || s.dia === dia)
    .sort((a, b) => a.startMin - b.startMin);

  function findFirstSlot(others) {
    for (const mySlot of mySlotsOrdered) {
      for (
        let slot = Math.floor(mySlot.startMin / 60) * 60;
        slot < mySlot.endMin;
        slot += 60
      ) {
        const slotEnd = slot + 60;
        for (const other of others) {
          for (const otherSlot of courseSectionSlots(other)) {
            if (otherSlot.dia !== mySlot.dia) continue;
            if (otherSlot.startMin < slotEnd && otherSlot.endMin > slot) {
              return slot;
            }
          }
        }
      }
    }
    return null;
  }

  // Prefer cross-course conflict slot; fall back to same-course if none found.
  return findFirstSlot(crossCourseOthers) ?? findFirstSlot(sameCourseOthers);
}

/**
 * Returns all (course, section) pairs occupying a given 1h slot.
 *
 * @param {string} dia        — e.g. "Ter"
 * @param {number} horaInicio — full hour in minutes, e.g. 9*60 for 09:00
 * @param {PlanningRow[]} rows
 * @returns {{ courseCode: string, sectionCode: string }[]}
 */
export function sectionsInSlot(dia, horaInicio, rows) {
  const slotStart = horaInicio;
  const slotEnd = horaInicio + 60;
  const result = [];

  for (const row of Array.isArray(rows) ? rows : []) {
    if (String(row?.semestre_curso ?? "").trim() === "_") continue;

    const sections = Array.isArray(row?.turmas) ? row.turmas : [];
    for (const section of sections) {
      const slots = courseSectionSlots({
        ...section,
        courseCode: row.codigo,
        courseName: row.nome,
      });
      const ocupa = slots.some(
        (s) => s.dia === dia && s.startMin < slotEnd && s.endMin > slotStart,
      );
      if (ocupa) {
        result.push({
          courseCode: String(row?.codigo ?? "").trim(),
          sectionCode: String(section?.codigo ?? "").trim(),
        });
      }
    }
  }

  return result;
}

/**
 * Returns all (course, section) pairs that conflict with a clicked calendar
 * block — i.e. every section occupying any 1h slot within [blockStart, blockEnd)
 * on the given day, including the clicked section itself.
 *
 * This is the canonical domain query for "who else is in my time block?".
 * The presentation layer calls this when a conflict card is clicked and passes
 * the result directly to the conflict resolution modal.
 *
 * Using the card's rendered block bounds (rather than the full section interval)
 * ensures correctness when a section has non-contiguous slots on the same day:
 * clicking the 07:00-09:00 block will NOT include sections that only appear
 * at 11:00-12:00, even if both blocks belong to the same section.
 *
 * @param {string} dia        — weekday, e.g. "Ter"
 * @param {number} blockStart — block start in minutes since 00:00
 * @param {number} blockEnd   — block end in minutes since 00:00
 * @param {PlanningRow[]} rows — planning rows for the active period
 * @returns {{ courseCode: string, sectionCode: string }[]}
 */
export function conflictCandidatesForBlock(dia, blockStart, blockEnd, rows) {
  const seen = new Set();
  const result = [];

  for (let h = Math.floor(blockStart / 60) * 60; h < blockEnd; h += 60) {
    for (const c of sectionsInSlot(dia, h, rows)) {
      const key = `${c.courseCode}::${c.sectionCode}`;
      if (!seen.has(key)) {
        seen.add(key);
        result.push(c);
      }
    }
  }

  return result;
}

/**
 * Resolves a slot conflict by electing a winner section.
 *
 * For each course occupying the slot:
 * - If it is the winning course+section → keeps only that section in the row.
 * - If it is another section of the SAME course occupying the slot → removes it.
 * - If it is a section of a DIFFERENT course occupying the slot → removes it.
 *
 * Rows with no sections after removal are kept (no schedule is not a removal reason).
 *
 * @param {string} dia
 * @param {number} horaInicio              — full hour in minutes
 * @param {string} winnerCourseCode
 * @param {string} winnerSectionCode
 * @param {PlanningRow[]} rows
 * @returns {PlanningRow[]}
 */
export function resolveSlotConflict(
  dia,
  horaInicio,
  winnerCourseCode,
  winnerSectionCode,
  rows,
) {
  const slotStart = horaInicio;
  const slotEnd = horaInicio + 60;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    if (String(row?.semestre_curso ?? "").trim() === "_") return row;

    const sections = Array.isArray(row?.turmas) ? row.turmas : [];
    const courseCode = String(row?.codigo ?? "").trim();

    // Filter out sections that occupy the slot and are not the winner
    const filteredSections = sections.filter((section) => {
      const sectionCode = String(section?.codigo ?? "").trim();
      const slots = courseSectionSlots({
        ...section,
        courseCode,
        courseName: row.nome,
      });
      const ocupaSlot = slots.some(
        (s) => s.dia === dia && s.startMin < slotEnd && s.endMin > slotStart,
      );

      if (!ocupaSlot) return true; // not in the slot → keep

      // in the slot: keep only if it is the winner
      return (
        courseCode === winnerCourseCode && sectionCode === winnerSectionCode
      );
    });

    if (filteredSections.length === sections.length) return row; // nothing changed
    return { ...row, turmas: filteredSections };
  });
}

// ---------------------------------------------------------------------------
// resolveWinningCourseSection
// ---------------------------------------------------------------------------

/**
 * Elects a winner course section and applies the resolution across the entire period:
 *
 * 1. For the winner's course: keeps only the winner section.
 * 2. For all other courses: removes any section that conflicts with the winner.
 *
 * @param {string} winnerCourseCode
 * @param {string} winnerSectionCode
 * @param {PlanningRow[]} rows
 * @returns {PlanningRow[]}
 */
export function resolveWinningCourseSection(
  winnerCourseCode,
  winnerSectionCode,
  rows,
) {
  // Build the winner CourseSection object for comparison with courseSectionsConflict
  const winnerRow = (Array.isArray(rows) ? rows : []).find(
    (r) => String(r?.codigo ?? "").trim() === winnerCourseCode,
  );
  const winnerSectionRaw = (winnerRow?.turmas ?? []).find(
    (t) => String(t?.codigo ?? "").trim() === winnerSectionCode,
  );
  const winnerSection = winnerSectionRaw
    ? {
        ...winnerSectionRaw,
        courseCode: winnerCourseCode,
        courseName: winnerRow?.nome ?? "",
      }
    : null;

  return (Array.isArray(rows) ? rows : []).map((row) => {
    const courseCode = String(row?.codigo ?? "").trim();
    const sections = Array.isArray(row?.turmas) ? row.turmas : [];

    if (courseCode === winnerCourseCode) {
      // Winner's course: keep only the winner section
      const filtered = sections.filter(
        (t) => String(t?.codigo ?? "").trim() === winnerSectionCode,
      );
      if (filtered.length === sections.length) return row;
      return { ...row, turmas: filtered };
    }

    if (!winnerSection) return row;

    // Other courses: remove sections that conflict with the winner
    const filtered = sections.filter((t) => {
      const sectionObj = {
        ...t,
        courseCode,
        courseName: row?.nome ?? "",
      };
      return !courseSectionsConflict(winnerSection, sectionObj);
    });

    if (filtered.length === sections.length) return row;

    // If all sections were removed, keep the first one with empty schedules.
    // turmas: [] would be re-enriched from the offer; a section without schedules won't be.
    if (filtered.length === 0 && sections.length > 0) {
      const placeholder = { ...sections[0], horarios: [] };
      return { ...row, turmas: [placeholder] };
    }

    return { ...row, turmas: filtered };
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
function _slotsByHourConflict(a, b) {
  const slotInicio = Math.floor(a.startMin / 60) * 60;
  const slotFim = a.endMin;

  for (let slot = slotInicio; slot < slotFim; slot += 60) {
    const slotEnd = slot + 60;
    if (b.startMin < slotEnd && b.endMin > slot) return true;
  }

  return false;
}
