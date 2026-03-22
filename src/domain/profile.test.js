import { describe, it, expect } from "vitest";
import {
  createProfile,
  cloneProfile,
  listSemesters,
  getNextSemesterNumber,
  getSemester,
  validateImportedProfile,
  serializeProfile,
  getCreditEntries,
  addCreditEntry,
  removeCreditEntry,
} from "./profile.js";

// ---------------------------------------------------------------------------
// createProfile
// ---------------------------------------------------------------------------

describe("createProfile", () => {
  it("creates a profile with only a name", () => {
    const profile = createProfile({ name: "Maria" });

    expect(profile.name).toBe("Maria");
    expect(profile.course).toBeNull();
    expect(profile.ingressYearSemester).toBeNull();
    expect(profile.ingressYear).toBeNull();
    expect(profile.semesters).toEqual([]);
    expect(profile.creditEntries).toEqual([]);
  });

  it("trims whitespace from the name", () => {
    const profile = createProfile({ name: "  João  " });
    expect(profile.name).toBe("João");
  });

  it("stores optional course and ingress information when provided", () => {
    const profile = createProfile({
      name: "Ana",
      course: "Engenharia Elétrica",
      ingressYearSemester: 1,
      ingressYear: 2022,
    });

    expect(profile.course).toBe("Engenharia Elétrica");
    expect(profile.ingressYearSemester).toBe(1);
    expect(profile.ingressYear).toBe(2022);
  });

  it("accepts ingressYearSemester 2", () => {
    const profile = createProfile({ name: "Pedro", ingressYearSemester: 2 });
    expect(profile.ingressYearSemester).toBe(2);
  });

  it("throws when name is empty string", () => {
    expect(() => createProfile({ name: "" })).toThrow();
  });

  it("throws when name is only whitespace", () => {
    expect(() => createProfile({ name: "   " })).toThrow();
  });

  it("throws when name is not provided", () => {
    expect(() => createProfile({ name: undefined })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// cloneProfile
// ---------------------------------------------------------------------------

describe("cloneProfile", () => {
  const base = createProfile({
    name: "Maria",
    course: "Ciência da Computação",
    ingressYearSemester: 1,
    ingressYear: 2021,
  });

  it("creates a new profile with the given name", () => {
    const clone = cloneProfile(base, "Maria (cópia)");
    expect(clone.name).toBe("Maria (cópia)");
  });

  it("trims whitespace from the new name", () => {
    const clone = cloneProfile(base, "  Cópia  ");
    expect(clone.name).toBe("Cópia");
  });

  it("copies all planning data from the original", () => {
    const clone = cloneProfile(base, "Clone");
    expect(clone.course).toBe(base.course);
    expect(clone.ingressYearSemester).toBe(base.ingressYearSemester);
    expect(clone.ingressYear).toBe(base.ingressYear);
    expect(clone.semesters).toEqual(base.semesters);
    expect(clone.creditEntries).toEqual(base.creditEntries);
  });

  it("produces a deep copy — mutating the clone does not affect the original", () => {
    const clone = cloneProfile(base, "Clone");
    clone.semesters.push({ label: "2021/1", classes: [] });
    expect(base.semesters).toHaveLength(0);
  });

  it("throws when the new name is empty", () => {
    expect(() => cloneProfile(base, "")).toThrow();
  });

  it("throws when the new name is only whitespace", () => {
    expect(() => cloneProfile(base, "   ")).toThrow();
  });

  it("throws when the new name equals the original name", () => {
    expect(() => cloneProfile(base, "Maria")).toThrow();
  });

  it("throws when the new name equals the original name with surrounding whitespace", () => {
    expect(() => cloneProfile(base, "  Maria  ")).toThrow();
  });
});

// ---------------------------------------------------------------------------
// listSemesters
// ---------------------------------------------------------------------------

describe("listSemesters", () => {
  it("returns an empty array for a freshly created profile", () => {
    const profile = createProfile({ name: "Ana" });
    expect(listSemesters(profile)).toEqual([]);
  });

  it("returns the semesters array from the profile", () => {
    const profile = {
      ...createProfile({ name: "Ana" }),
      semesters: [{ label: "2023/1", classes: [] }, { label: "2023/2", classes: [] }],
    };
    const result = listSemesters(profile);
    expect(result).toHaveLength(2);
    expect(result[0].label).toBe("2023/1");
    expect(result[1].label).toBe("2023/2");
  });

  it("returns the same reference as profile.semesters", () => {
    const profile = createProfile({ name: "Ana" });
    expect(listSemesters(profile)).toBe(profile.semesters);
  });
});

// ---------------------------------------------------------------------------
// getNextSemesterNumber
// ---------------------------------------------------------------------------

describe("getNextSemesterNumber", () => {
  it("returns 1 when there are no semesters yet", () => {
    const profile = createProfile({ name: "Bruno" });
    expect(getNextSemesterNumber(profile)).toBe(1);
  });

  it("returns 2 after one semester has been added", () => {
    const profile = {
      ...createProfile({ name: "Bruno" }),
      semesters: [{ label: "2023/1", classes: [] }],
    };
    expect(getNextSemesterNumber(profile)).toBe(2);
  });

  it("returns the correct next number after multiple semesters", () => {
    const semesters = [
      { label: "2022/1", classes: [] },
      { label: "2022/2", classes: [] },
      { label: "2023/1", classes: [] },
    ];
    const profile = { ...createProfile({ name: "Bruno" }), semesters };
    expect(getNextSemesterNumber(profile)).toBe(4);
  });
});

// ---------------------------------------------------------------------------
// getSemester
// ---------------------------------------------------------------------------

describe("getSemester", () => {
  const profile = {
    ...createProfile({ name: "Carla" }),
    semesters: [
      { label: "2022/1", classes: [] },
      { label: "2022/2", classes: [] },
      { label: "2023/1", classes: [] },
    ],
  };

  it("returns the semester that matches the given label", () => {
    const semester = getSemester(profile, "2022/2");
    expect(semester).toBeDefined();
    expect(semester.label).toBe("2022/2");
  });

  it("returns the first semester by label", () => {
    const semester = getSemester(profile, "2022/1");
    expect(semester).toBeDefined();
    expect(semester.label).toBe("2022/1");
  });

  it("returns undefined when no semester matches the label", () => {
    expect(getSemester(profile, "2025/1")).toBeUndefined();
  });

  it("returns undefined for an empty semesters list", () => {
    const empty = createProfile({ name: "Carla" });
    expect(getSemester(empty, "2022/1")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// validateImportedProfile
// ---------------------------------------------------------------------------

describe("validateImportedProfile", () => {
  it("accepts a valid profile object", () => {
    const data = { name: "Diego", semesters: [] };
    const result = validateImportedProfile(data);
    expect(result).toBe(data);
  });

  it("accepts a profile with extra fields", () => {
    const data = {
      name: "Diego",
      semesters: [{ label: "2024/1", classes: [] }],
      course: "Física",
      creditEntries: [],
    };
    expect(() => validateImportedProfile(data)).not.toThrow();
  });

  it("throws when data is null", () => {
    expect(() => validateImportedProfile(null)).toThrow();
  });

  it("throws when data is not an object (string)", () => {
    expect(() => validateImportedProfile("not an object")).toThrow();
  });

  it("throws when data is not an object (number)", () => {
    expect(() => validateImportedProfile(42)).toThrow();
  });

  it("throws when name is missing", () => {
    expect(() => validateImportedProfile({ semesters: [] })).toThrow();
  });

  it("throws when name is an empty string", () => {
    expect(() => validateImportedProfile({ name: "", semesters: [] })).toThrow();
  });

  it("throws when name is only whitespace", () => {
    expect(() => validateImportedProfile({ name: "   ", semesters: [] })).toThrow();
  });

  it("throws when name is not a string", () => {
    expect(() => validateImportedProfile({ name: 123, semesters: [] })).toThrow();
  });

  it("throws when semesters is missing", () => {
    expect(() => validateImportedProfile({ name: "Diego" })).toThrow();
  });

  it("throws when semesters is not an array", () => {
    expect(() => validateImportedProfile({ name: "Diego", semesters: {} })).toThrow();
  });
});

// ---------------------------------------------------------------------------
// serializeProfile
// ---------------------------------------------------------------------------

describe("serializeProfile", () => {
  it("returns a valid JSON string", () => {
    const profile = createProfile({ name: "Elisa" });
    const json = serializeProfile(profile);
    expect(() => JSON.parse(json)).not.toThrow();
  });

  it("round-trips the profile data faithfully", () => {
    const profile = createProfile({
      name: "Elisa",
      course: "Sistemas de Informação",
      ingressYearSemester: 2,
      ingressYear: 2020,
    });
    const parsed = JSON.parse(serializeProfile(profile));
    expect(parsed.name).toBe("Elisa");
    expect(parsed.course).toBe("Sistemas de Informação");
    expect(parsed.ingressYearSemester).toBe(2);
    expect(parsed.ingressYear).toBe(2020);
    expect(parsed.semesters).toEqual([]);
    expect(parsed.creditEntries).toEqual([]);
  });

  it("produces pretty-printed JSON (indented)", () => {
    const profile = createProfile({ name: "Elisa" });
    const json = serializeProfile(profile);
    // Pretty-printed JSON contains newlines
    expect(json).toContain("\n");
  });

  it("preserves semesters and credit entries in the serialized output", () => {
    const profile = {
      ...createProfile({ name: "Elisa" }),
      semesters: [{ label: "2024/1", classes: [] }],
      creditEntries: [{ subjectCode: "INF101", grantPosition: 0 }],
    };
    const parsed = JSON.parse(serializeProfile(profile));
    expect(parsed.semesters).toHaveLength(1);
    expect(parsed.creditEntries).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// getCreditEntries
// ---------------------------------------------------------------------------

describe("getCreditEntries", () => {
  it("returns an empty array for a freshly created profile", () => {
    const profile = createProfile({ name: "Felipe" });
    expect(getCreditEntries(profile)).toEqual([]);
  });

  it("returns the credit entries present on the profile", () => {
    const profile = {
      ...createProfile({ name: "Felipe" }),
      creditEntries: [
        { subjectCode: "MAT101", grantPosition: 0 },
        { subjectCode: "FIS101", grantPosition: 1 },
      ],
    };
    expect(getCreditEntries(profile)).toHaveLength(2);
  });


});

// ---------------------------------------------------------------------------
// addCreditEntry
// ---------------------------------------------------------------------------

describe("addCreditEntry", () => {
  it("adds a credit entry with grantPosition 0 (before course start)", () => {
    const profile = createProfile({ name: "Gabi" });
    const updated = addCreditEntry(profile, "MAT101", 0);

    const entries = getCreditEntries(updated);
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectCode).toBe("MAT101");
    expect(entries[0].grantPosition).toBe(0);
  });

  it("adds a credit entry with a positive grantPosition (during a planned semester)", () => {
    const profile = createProfile({ name: "Gabi" });
    const updated = addCreditEntry(profile, "FIS101", 3);

    const entries = getCreditEntries(updated);
    expect(entries[0].grantPosition).toBe(3);
  });

  it("trims whitespace from the subject code", () => {
    const profile = createProfile({ name: "Gabi" });
    const updated = addCreditEntry(profile, "  MAT101  ", 0);
    expect(getCreditEntries(updated)[0].subjectCode).toBe("MAT101");
  });

  it("does not mutate the original profile", () => {
    const profile = createProfile({ name: "Gabi" });
    addCreditEntry(profile, "MAT101", 0);
    expect(getCreditEntries(profile)).toHaveLength(0);
  });

  it("allows adding multiple different credit entries", () => {
    const profile = createProfile({ name: "Gabi" });
    const step1 = addCreditEntry(profile, "MAT101", 0);
    const step2 = addCreditEntry(step1, "FIS101", 0);
    expect(getCreditEntries(step2)).toHaveLength(2);
  });

  it("throws when subjectCode is empty", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, "", 0)).toThrow();
  });

  it("throws when subjectCode is only whitespace", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, "   ", 0)).toThrow();
  });

  it("throws when subjectCode is not a string", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, 101, 0)).toThrow();
  });

  it("throws when grantPosition is negative", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, "MAT101", -1)).toThrow();
  });

  it("throws when grantPosition is not an integer", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, "MAT101", 1.5)).toThrow();
  });

  it("throws when grantPosition is not a number", () => {
    const profile = createProfile({ name: "Gabi" });
    expect(() => addCreditEntry(profile, "MAT101", "0")).toThrow();
  });

  it("throws when a credit entry for the same subject already exists", () => {
    const profile = createProfile({ name: "Gabi" });
    const updated = addCreditEntry(profile, "MAT101", 0);
    expect(() => addCreditEntry(updated, "MAT101", 1)).toThrow();
  });

  it("throws on duplicate even when the new call has extra whitespace in the code", () => {
    const profile = createProfile({ name: "Gabi" });
    const updated = addCreditEntry(profile, "MAT101", 0);
    expect(() => addCreditEntry(updated, "  MAT101  ", 1)).toThrow();
  });
});

// ---------------------------------------------------------------------------
// removeCreditEntry
// ---------------------------------------------------------------------------

describe("removeCreditEntry", () => {
  it("removes an existing credit entry by subject code", () => {
    const profile = createProfile({ name: "Hugo" });
    const withEntry = addCreditEntry(profile, "MAT101", 0);
    const updated = removeCreditEntry(withEntry, "MAT101");

    expect(getCreditEntries(updated)).toHaveLength(0);
  });

  it("removes only the targeted entry when multiple entries exist", () => {
    const profile = createProfile({ name: "Hugo" });
    const step1 = addCreditEntry(profile, "MAT101", 0);
    const step2 = addCreditEntry(step1, "FIS101", 1);
    const updated = removeCreditEntry(step2, "MAT101");

    const entries = getCreditEntries(updated);
    expect(entries).toHaveLength(1);
    expect(entries[0].subjectCode).toBe("FIS101");
  });

  it("does not mutate the original profile", () => {
    const profile = createProfile({ name: "Hugo" });
    const withEntry = addCreditEntry(profile, "MAT101", 0);
    removeCreditEntry(withEntry, "MAT101");
    expect(getCreditEntries(withEntry)).toHaveLength(1);
  });

  it("throws when the subject code does not match any entry", () => {
    const profile = createProfile({ name: "Hugo" });
    expect(() => removeCreditEntry(profile, "NONEXISTENT")).toThrow();
  });

  it("throws when trying to remove an entry that was already removed", () => {
    const profile = createProfile({ name: "Hugo" });
    const withEntry = addCreditEntry(profile, "MAT101", 0);
    const removed = removeCreditEntry(withEntry, "MAT101");
    expect(() => removeCreditEntry(removed, "MAT101")).toThrow();
  });
});