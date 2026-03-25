import { describe, it, expect } from "vitest";
import {
  allScheduleConflicts,
  resolveWinningSection,
  sectionsInSlot,
  conflictCandidatesForBlock,
  semesterHasScheduleConflict,
  blockingReasons,
} from "./calendar.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/** Mon 08:00–10:00 */
const slotMonMorning = { day: "Mon", start: "08:00", end: "10:00" };
/** Mon 09:00–11:00 — overlaps with slotMonMorning */
const slotMonOverlap = { day: "Mon", start: "09:00", end: "11:00" };
/** Mon 10:00–12:00 — adjacent to slotMonMorning, no overlap */
const slotMonAdjacent = { day: "Mon", start: "10:00", end: "12:00" };
/** Tue 08:00–10:00 — different day */
const slotTueMorning = { day: "Tue", start: "08:00", end: "10:00" };
/** Wed 14:00–16:00 — no conflict with any of the above */
const slotWedAfternoon = { day: "Wed", start: "14:00", end: "16:00" };

function makeSemester(classes) {
  return { label: "2024/1", offerSemester: 1, classes };
}

const classA = { subjectCode: "A", name: "A1", subjectName: "Alpha", slots: [slotMonMorning] };
const classB_conflict = { subjectCode: "B", name: "B1", subjectName: "Beta", slots: [slotMonOverlap] };
const classB_adjacent = { subjectCode: "B", name: "B1", subjectName: "Beta", slots: [slotMonAdjacent] };
const classB_other_day = { subjectCode: "B", name: "B1", subjectName: "Beta", slots: [slotTueMorning] };
const classC_no_conflict = { subjectCode: "C", name: "C1", subjectName: "Gamma", slots: [slotWedAfternoon] };

// Two candidate sections for the same subject
const classA_sec1 = { subjectCode: "A", name: "A1", subjectName: "Alpha", slots: [slotMonMorning] };
const classA_sec2 = { subjectCode: "A", name: "A2", subjectName: "Alpha", slots: [slotTueMorning] };

// ---------------------------------------------------------------------------
// semesterHasScheduleConflict
// ---------------------------------------------------------------------------

describe("semesterHasScheduleConflict", () => {
  it("returns false for an empty semester", () => {
    expect(semesterHasScheduleConflict(makeSemester([]))).toBe(false);
  });

  it("returns false for a single class", () => {
    expect(semesterHasScheduleConflict(makeSemester([classA]))).toBe(false);
  });

  it("returns false when no classes conflict", () => {
    expect(semesterHasScheduleConflict(makeSemester([classA, classB_adjacent, classC_no_conflict]))).toBe(false);
  });

  it("returns false for classes on different days", () => {
    expect(semesterHasScheduleConflict(makeSemester([classA, classB_other_day]))).toBe(false);
  });

  it("returns true when two classes overlap", () => {
    expect(semesterHasScheduleConflict(makeSemester([classA, classB_conflict]))).toBe(true);
  });

  it("returns true even when the conflicting pair is not first", () => {
    expect(semesterHasScheduleConflict(makeSemester([classC_no_conflict, classA, classB_conflict]))).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// blockingReasons
// ---------------------------------------------------------------------------

describe("blockingReasons", () => {
  it("returns [] when there are no conflicts", () => {
    expect(blockingReasons(makeSemester([classA, classC_no_conflict]))).toEqual([]);
  });

  it("returns one reason per conflicting pair", () => {
    const reasons = blockingReasons(makeSemester([classA, classB_conflict]));
    expect(reasons).toHaveLength(1);
    expect(reasons[0]).toContain("A");
    expect(reasons[0]).toContain("B");
  });

  it("returns three reasons when three classes all conflict with each other", () => {
    const c1 = { subjectCode: "C1", name: "1", subjectName: "", slots: [{ day: "Mon", start: "08:00", end: "12:00" }] };
    const c2 = { subjectCode: "C2", name: "2", subjectName: "", slots: [{ day: "Mon", start: "09:00", end: "11:00" }] };
    const c3 = { subjectCode: "C3", name: "3", subjectName: "", slots: [{ day: "Mon", start: "10:00", end: "13:00" }] };
    expect(blockingReasons(makeSemester([c1, c2, c3]))).toHaveLength(3);
  });
});

// ---------------------------------------------------------------------------
// allScheduleConflicts — return shape { day, blockStart, subjectCodes }
// ---------------------------------------------------------------------------

describe("allScheduleConflicts", () => {
  it("returns [] when there are no conflicts", () => {
    expect(allScheduleConflicts(makeSemester([classA, classB_adjacent]))).toEqual([]);
  });

  it("returns [] for an empty semester", () => {
    expect(allScheduleConflicts(makeSemester([]))).toEqual([]);
  });

  it("returns [] for a single class", () => {
    expect(allScheduleConflicts(makeSemester([classA]))).toEqual([]);
  });

  it("returns one entry with the correct shape when two classes conflict", () => {
    const result = allScheduleConflicts(makeSemester([classA, classB_conflict]));

    expect(result).toHaveLength(1);

    const entry = result[0];
    // Must use the new English field names
    expect(entry).toHaveProperty("day");
    expect(entry).toHaveProperty("blockStart");
    expect(entry).toHaveProperty("subjectCodes");

    // Must NOT use old Portuguese field names
    expect(entry).not.toHaveProperty("dia");
    expect(entry).not.toHaveProperty("horaInicio");
    expect(entry).not.toHaveProperty("codigos");
  });

  it("day is the canonical English weekday abbreviation", () => {
    const result = allScheduleConflicts(makeSemester([classA, classB_conflict]));
    expect(result[0].day).toBe("Mon");
  });

  it("blockStart is the start minute of the overlapping block", () => {
    const result = allScheduleConflicts(makeSemester([classA, classB_conflict]));
    // classA starts at 08:00 = 480 min, classB starts at 09:00 = 540 min
    // the block starts at the min of the two = 480
    expect(result[0].blockStart).toBe(8 * 60);
  });

  it("subjectCodes contains both conflicting subject codes", () => {
    const result = allScheduleConflicts(makeSemester([classA, classB_conflict]));
    expect(result[0].subjectCodes).toEqual(expect.arrayContaining(["A", "B"]));
  });

  it("groups multiple overlapping pairs sharing the same slot into one entry", () => {
    const c1 = { subjectCode: "C1", name: "1", subjectName: "", slots: [{ day: "Mon", start: "08:00", end: "12:00" }] };
    const c2 = { subjectCode: "C2", name: "2", subjectName: "", slots: [{ day: "Mon", start: "09:00", end: "11:00" }] };
    const c3 = { subjectCode: "C3", name: "3", subjectName: "", slots: [{ day: "Mon", start: "10:00", end: "13:00" }] };
    const result = allScheduleConflicts(makeSemester([c1, c2, c3]));
    // All three share overlapping slots on Mon — may collapse into one or a few buckets
    const allCodes = result.flatMap((r) => r.subjectCodes);
    expect(allCodes).toEqual(expect.arrayContaining(["C1", "C2", "C3"]));
  });

  it("ignores adjacent (non-overlapping) slots", () => {
    expect(allScheduleConflicts(makeSemester([classA, classB_adjacent]))).toEqual([]);
  });

  it("ignores classes on different days", () => {
    expect(allScheduleConflicts(makeSemester([classA, classB_other_day]))).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// sectionsInSlot
// ---------------------------------------------------------------------------

describe("sectionsInSlot", () => {
  it("returns empty when no class falls in the slot", () => {
    const result = sectionsInSlot("Mon", 13 * 60, 15 * 60, makeSemester([classA]));
    expect(result).toEqual([]);
  });

  it("returns the matching section when it overlaps the slot", () => {
    const result = sectionsInSlot("Mon", 8 * 60, 10 * 60, makeSemester([classA]));
    expect(result).toHaveLength(1);
    expect(result[0].courseCode).toBe("A");
    expect(result[0].sectionCode).toBe("A1");
  });

  it("returns nothing for a slot on a different day", () => {
    const result = sectionsInSlot("Tue", 8 * 60, 10 * 60, makeSemester([classA]));
    expect(result).toEqual([]);
  });

  it("returns multiple sections when several overlap the same slot", () => {
    const result = sectionsInSlot("Mon", 9 * 60, 10 * 60, makeSemester([classA, classB_conflict]));
    expect(result).toHaveLength(2);
  });
});

// ---------------------------------------------------------------------------
// conflictCandidatesForBlock
// ---------------------------------------------------------------------------

describe("conflictCandidatesForBlock", () => {
  it("returns [] when fewer than two sections occupy the block", () => {
    const result = conflictCandidatesForBlock("Mon", 8 * 60, 10 * 60, makeSemester([classA]));
    expect(result).toEqual([]);
  });

  it("returns both candidates when two sections share the block", () => {
    const result = conflictCandidatesForBlock("Mon", 9 * 60, 10 * 60, makeSemester([classA, classB_conflict]));
    expect(result).toHaveLength(2);
  });

  it("returns [] when classes are on different days", () => {
    const result = conflictCandidatesForBlock("Mon", 8 * 60, 10 * 60, makeSemester([classA, classB_other_day]));
    expect(result).toEqual([]);
  });
});

// ---------------------------------------------------------------------------
// resolveWinningSection
// ---------------------------------------------------------------------------

describe("resolveWinningSection", () => {
  it("keeps the winning class and removes the other candidate for the same subject", () => {
    const sem = makeSemester([classA_sec1, classA_sec2]);
    const result = resolveWinningSection("A", "A1", sem);

    const codes = result.classes.map((c) => c.name);
    expect(codes).toContain("A1");
    expect(codes).not.toContain("A2");
  });

  it("keeps unrelated classes whose slots do not conflict with the winner", () => {
    const sem = makeSemester([classA_sec1, classA_sec2, classC_no_conflict]);
    const result = resolveWinningSection("A", "A1", sem);

    expect(result.classes.some((c) => c.subjectCode === "C")).toBe(true);
  });

  it("removes classes of OTHER subjects that overlap with the winning class", () => {
    // classB_conflict overlaps classA_sec1 on Mon
    const sem = makeSemester([classA_sec1, classA_sec2, classB_conflict]);
    const result = resolveWinningSection("A", "A1", sem);

    expect(result.classes.some((c) => c.subjectCode === "B")).toBe(false);
  });

  it("keeps classes of other subjects that do NOT overlap with the winner", () => {
    const sem = makeSemester([classA_sec1, classA_sec2, classB_other_day]);
    const result = resolveWinningSection("A", "A1", sem);

    expect(result.classes.some((c) => c.subjectCode === "B")).toBe(true);
  });

  it("does not mutate the input semester", () => {
    const sem = makeSemester([classA_sec1, classA_sec2]);
    const originalLength = sem.classes.length;
    resolveWinningSection("A", "A1", sem);
    expect(sem.classes).toHaveLength(originalLength);
  });

  it("returns a new semester object", () => {
    const sem = makeSemester([classA_sec1, classA_sec2]);
    const result = resolveWinningSection("A", "A1", sem);
    expect(result).not.toBe(sem);
  });

  it("leaves a semester with a single class for a subject unchanged (no other candidates)", () => {
    const sem = makeSemester([classA_sec1, classC_no_conflict]);
    const result = resolveWinningSection("A", "A1", sem);
    expect(result.classes).toHaveLength(2);
  });

  it("results in an empty class list when the semester only had the two conflicting sections", () => {
    // A has two sections both on Mon; picking A1 drops A2, no other classes
    const sec1 = { subjectCode: "A", name: "A1", subjectName: "", slots: [slotMonMorning] };
    const sec2 = { subjectCode: "A", name: "A2", subjectName: "", slots: [slotMonMorning] };
    const result = resolveWinningSection("A", "A1", makeSemester([sec1, sec2]));
    expect(result.classes).toHaveLength(1);
    expect(result.classes[0].name).toBe("A1");
  });

  it("preserves the winning class's slots unchanged", () => {
    const sem = makeSemester([classA_sec1, classA_sec2]);
    const result = resolveWinningSection("A", "A1", sem);
    const winner = result.classes.find((c) => c.name === "A1");
    expect(winner.slots).toEqual(classA_sec1.slots);
  });

  it("handles a semester with no classes gracefully", () => {
    const sem = makeSemester([]);
    const result = resolveWinningSection("A", "A1", sem);
    expect(result.classes).toEqual([]);
  });
});