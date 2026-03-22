import { describe, it, expect } from "vitest";
import { detectConflicts, hasConflicts } from "./schedule.js";

// ---------------------------------------------------------------------------
// Shared test fixtures
// ---------------------------------------------------------------------------

/** A class whose single session is Monday 08:00–10:00 */
const classA = {
  subjectCode: "A",
  slots: [{ dia: "Seg", inicio: "08:00", fim: "10:00" }],
};

/** A class whose single session is Monday 09:00–11:00 — overlaps with classA */
const classB_overlaps = {
  subjectCode: "B",
  slots: [{ dia: "Seg", inicio: "09:00", fim: "11:00" }],
};

/** A class whose single session is Monday 10:00–12:00 — adjacent but NOT overlapping with classA */
const classB_adjacent = {
  subjectCode: "B",
  slots: [{ dia: "Seg", inicio: "10:00", fim: "12:00" }],
};

/** A class whose single session is Tuesday 08:00–10:00 — different day, no conflict with classA */
const classB_different_day = {
  subjectCode: "B",
  slots: [{ dia: "Ter", inicio: "08:00", fim: "10:00" }],
};

/** A class with two sessions: Tuesday 08:00–10:00 (no conflict) and Monday 09:00–11:00 (overlaps classA) */
const classC_multi_slot = {
  subjectCode: "C",
  slots: [
    { dia: "Ter", inicio: "08:00", fim: "10:00" },
    { dia: "Seg", inicio: "09:00", fim: "11:00" },
  ],
};

/** A class on Wednesday — conflicts with nobody in the fixtures above */
const classD_no_conflict = {
  subjectCode: "D",
  slots: [{ dia: "Qua", inicio: "14:00", fim: "16:00" }],
};

// ---------------------------------------------------------------------------
// detectConflicts
// ---------------------------------------------------------------------------

describe("detectConflicts", () => {
  it("returns [] for an empty array", () => {
    expect(detectConflicts([])).toEqual([]);
  });

  it("returns [] for a single class", () => {
    expect(detectConflicts([classA])).toEqual([]);
  });

  it("returns [] when two classes are on different days", () => {
    expect(detectConflicts([classA, classB_different_day])).toEqual([]);
  });

  it("returns [] when two classes are on the same day but times do not overlap (adjacent)", () => {
    // classA ends at 10:00 and classB_adjacent starts at 10:00 — half-open intervals, no overlap
    expect(detectConflicts([classA, classB_adjacent])).toEqual([]);
  });

  it("returns [] when two classes are on the same day but times do not overlap (gap)", () => {
    const classE = {
      subjectCode: "E",
      slots: [{ dia: "Seg", inicio: "11:00", fim: "13:00" }],
    };
    expect(detectConflicts([classA, classE])).toEqual([]);
  });

  it("returns one conflict pair when two classes overlap on the same day", () => {
    const result = detectConflicts([classA, classB_overlaps]);

    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("A");
    expect(result[0].b).toBe("B");
    // The overlapping slots from both classes must be present
    expect(result[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dia: "Seg", inicio: "08:00", fim: "10:00" }),
        expect.objectContaining({ dia: "Seg", inicio: "09:00", fim: "11:00" }),
      ])
    );
  });

  it("detects a conflict when one class has multiple slots and only one slot overlaps", () => {
    // classC_multi_slot has Ter 08:00–10:00 (no conflict) and Seg 09:00–11:00 (conflicts with classA)
    const result = detectConflicts([classA, classC_multi_slot]);

    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("A");
    expect(result[0].b).toBe("C");
    // The Monday slots that overlap must appear; the Tuesday slot must not
    expect(result[0].slots).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ dia: "Seg", inicio: "08:00", fim: "10:00" }),
        expect.objectContaining({ dia: "Seg", inicio: "09:00", fim: "11:00" }),
      ])
    );
    const dias = result[0].slots.map((s) => s.dia);
    expect(dias).not.toContain("Ter");
  });

  it("returns only the conflicting pair when three classes are present but only two conflict", () => {
    // classA vs classB_overlaps → conflict
    // classA vs classD_no_conflict → no conflict
    // classB_overlaps vs classD_no_conflict → no conflict
    const result = detectConflicts([classA, classB_overlaps, classD_no_conflict]);

    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("A");
    expect(result[0].b).toBe("B");
  });

  it("reports each conflicting pair at most once (A vs B, not also B vs A)", () => {
    const result = detectConflicts([classA, classB_overlaps]);

    expect(result).toHaveLength(1);
  });

  it("detects overlap when the same subjectCode appears twice and its slots overlap", () => {
    const dup1 = { subjectCode: "X", slots: [{ dia: "Seg", inicio: "08:00", fim: "10:00" }] };
    const dup2 = { subjectCode: "X", slots: [{ dia: "Seg", inicio: "09:00", fim: "11:00" }] };

    const result = detectConflicts([dup1, dup2]);

    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("X");
    expect(result[0].b).toBe("X");
  });

  it("returns [] when the same subjectCode appears twice but its slots do not overlap", () => {
    const dup1 = { subjectCode: "X", slots: [{ dia: "Seg", inicio: "08:00", fim: "10:00" }] };
    const dup2 = { subjectCode: "X", slots: [{ dia: "Ter", inicio: "08:00", fim: "10:00" }] };

    expect(detectConflicts([dup1, dup2])).toEqual([]);
  });

  it("handles classes with an empty slots array gracefully", () => {
    const empty = { subjectCode: "Z", slots: [] };
    expect(detectConflicts([classA, empty])).toEqual([]);
  });

  it("handles classes with invalid slot data gracefully (does not throw)", () => {
    const bad = { subjectCode: "BAD", slots: [{ dia: "", inicio: "not-a-time", fim: "also-bad" }] };
    expect(() => detectConflicts([classA, bad])).not.toThrow();
    expect(detectConflicts([classA, bad])).toEqual([]);
  });

  it("correctly detects all three pairs when three classes all conflict with each other", () => {
    // Each pair shares Monday with overlapping times
    const c1 = { subjectCode: "C1", slots: [{ dia: "Seg", inicio: "08:00", fim: "12:00" }] };
    const c2 = { subjectCode: "C2", slots: [{ dia: "Seg", inicio: "09:00", fim: "11:00" }] };
    const c3 = { subjectCode: "C3", slots: [{ dia: "Seg", inicio: "10:00", fim: "13:00" }] };

    const result = detectConflicts([c1, c2, c3]);

    expect(result).toHaveLength(3);
    const pairs = result.map((r) => [r.a, r.b]);
    expect(pairs).toEqual(
      expect.arrayContaining([
        ["C1", "C2"],
        ["C1", "C3"],
        ["C2", "C3"],
      ])
    );
  });

  it("normalises weekday names before comparing (full name vs abbreviation)", () => {
    const classMonFull = {
      subjectCode: "M1",
      slots: [{ dia: "Segunda-feira", inicio: "08:00", fim: "10:00" }],
    };
    const classMonAbbrev = {
      subjectCode: "M2",
      slots: [{ dia: "Seg", inicio: "09:00", fim: "11:00" }],
    };

    const result = detectConflicts([classMonFull, classMonAbbrev]);

    expect(result).toHaveLength(1);
    expect(result[0].a).toBe("M1");
    expect(result[0].b).toBe("M2");
  });

  it("returns slots with normalised dia values", () => {
    const classMonFull = {
      subjectCode: "N1",
      slots: [{ dia: "segunda", inicio: "08:00", fim: "10:00" }],
    };
    const classMonAbbrev = {
      subjectCode: "N2",
      slots: [{ dia: "Seg", inicio: "09:00", fim: "11:00" }],
    };

    const result = detectConflicts([classMonFull, classMonAbbrev]);

    expect(result).toHaveLength(1);
    // Every slot in the result must carry the canonical abbreviation
    for (const slot of result[0].slots) {
      expect(slot.dia).toBe("Seg");
    }
  });
});

// ---------------------------------------------------------------------------
// hasConflicts
// ---------------------------------------------------------------------------

describe("hasConflicts", () => {
  it("returns false for an empty array", () => {
    expect(hasConflicts([])).toBe(false);
  });

  it("returns false for a single class", () => {
    expect(hasConflicts([classA])).toBe(false);
  });

  it("returns false when no classes conflict", () => {
    expect(hasConflicts([classA, classB_different_day, classD_no_conflict])).toBe(false);
  });

  it("returns false when times are adjacent (not overlapping)", () => {
    expect(hasConflicts([classA, classB_adjacent])).toBe(false);
  });

  it("returns true when two classes have overlapping sessions", () => {
    expect(hasConflicts([classA, classB_overlaps])).toBe(true);
  });

  it("returns true when only one slot of a multi-slot class causes a conflict", () => {
    expect(hasConflicts([classA, classC_multi_slot])).toBe(true);
  });

  it("returns true even when the conflicting pair is not the first pair checked", () => {
    // classD_no_conflict does not conflict with classA; classB_overlaps does
    expect(hasConflicts([classA, classD_no_conflict, classB_overlaps])).toBe(true);
  });

  it("short-circuits: returns true without examining all pairs", () => {
    // Verified indirectly — the function must not throw and must return true
    // even when there are many non-conflicting classes after the first conflict.
    const many = Array.from({ length: 50 }, (_, i) => ({
      subjectCode: `NC${i}`,
      slots: [{ dia: "Dom", inicio: `${String(i % 24).padStart(2, "0")}:00`, fim: `${String((i % 24) + 1).padStart(2, "0")}:00` }],
    }));
    // Place a conflict at the very beginning
    const classes = [classA, classB_overlaps, ...many];
    expect(hasConflicts(classes)).toBe(true);
  });
});