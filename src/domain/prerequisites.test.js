import { describe, it, expect } from "vitest";
import {
  getEquivalentCodes,
  isSatisfied,
  buildFulfilledSet,
  isEligible,
  getEligibleCourses,
} from "./prerequisites.js";

// ---------------------------------------------------------------------------
// getEquivalentCodes
// ---------------------------------------------------------------------------

describe("getEquivalentCodes", () => {
  it("returns a set containing only the code itself when no equivalences exist", () => {
    const result = getEquivalentCodes("A001", {});
    expect(result).toBeInstanceOf(Set);
    expect([...result]).toEqual(["A001"]);
  });

  it("returns a set containing the code plus all its equivalents", () => {
    const equivalences = { A001: ["B001", "C001", "D001"] };
    const result = getEquivalentCodes("A001", equivalences);
    expect(result).toBeInstanceOf(Set);
    expect(result.has("A001")).toBe(true);
    expect(result.has("B001")).toBe(true);
    expect(result.has("C001")).toBe(true);
    expect(result.has("D001")).toBe(true);
    expect(result.size).toBe(4);
  });

  it("returns a set containing only the code when it is not in the equivalences map", () => {
    const equivalences = { B001: ["C001"] };
    const result = getEquivalentCodes("A001", equivalences);
    expect(result.size).toBe(1);
    expect(result.has("A001")).toBe(true);
  });

  it("always includes the target code even if it appears in another entry's equivalents", () => {
    const equivalences = { B001: ["A001"] };
    const result = getEquivalentCodes("A001", equivalences);
    expect(result.size).toBe(1);
    expect(result.has("A001")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// isSatisfied
// ---------------------------------------------------------------------------

describe("isSatisfied", () => {
  it("returns true when the target code itself is in passedCodes", () => {
    const passed = new Set(["A001", "B001"]);
    expect(isSatisfied("A001", passed, {})).toBe(true);
  });

  it("returns true when an equivalent code is in passedCodes", () => {
    const equivalences = { A001: ["B001", "C001"] };
    const passed = new Set(["B001"]);
    expect(isSatisfied("A001", passed, equivalences)).toBe(true);
  });

  it("returns false when neither the target nor any equivalent is in passedCodes", () => {
    const equivalences = { A001: ["B001", "C001"] };
    const passed = new Set(["D001"]);
    expect(isSatisfied("A001", passed, equivalences)).toBe(false);
  });

  it("returns false when passedCodes is empty", () => {
    const equivalences = { A001: ["B001"] };
    expect(isSatisfied("A001", new Set(), equivalences)).toBe(false);
  });

  it("returns false when no equivalences are defined and target is not passed", () => {
    const passed = new Set(["B001", "C001"]);
    expect(isSatisfied("A001", passed, {})).toBe(false);
  });

  it("only the target itself satisfies when no equivalences are defined for it", () => {
    const equivalences = { B001: ["C001"] };
    const passed = new Set(["C001"]);
    // C001 satisfies B001, but not A001
    expect(isSatisfied("A001", passed, equivalences)).toBe(false);
    expect(isSatisfied("B001", passed, equivalences)).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// buildFulfilledSet
// ---------------------------------------------------------------------------

describe("buildFulfilledSet", () => {
  it("returns an empty set when semesters and credits are empty", () => {
    const result = buildFulfilledSet([], [], 0, false);
    expect(result.size).toBe(0);
  });

  it("always includes credits with grantPosition 0", () => {
    const credits = [
      { subjectCode: "MAT001", grantPosition: 0 },
      { subjectCode: "FIS001", grantPosition: 0 },
    ];
    const result = buildFulfilledSet([], credits, 0, false);
    expect(result.has("MAT001")).toBe(true);
    expect(result.has("FIS001")).toBe(true);
  });

  it("includes classes from semesters strictly before upToIndex", () => {
    const semesters = [
      { classes: [{ subjectCode: "A001" }, { subjectCode: "B001" }] },
      { classes: [{ subjectCode: "C001" }] },
      { classes: [{ subjectCode: "D001" }] },
    ];
    // Evaluating semester 2 (index 2): semesters 0 and 1 are fulfilled
    const result = buildFulfilledSet(semesters, [], 2, false);
    expect(result.has("A001")).toBe(true);
    expect(result.has("B001")).toBe(true);
    expect(result.has("C001")).toBe(true);
    expect(result.has("D001")).toBe(false);
  });

  it("does NOT include the current semester's classes when includeCurrentForCoreq is false", () => {
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [{ subjectCode: "B001" }] },
    ];
    const result = buildFulfilledSet(semesters, [], 1, false);
    expect(result.has("A001")).toBe(true);
    expect(result.has("B001")).toBe(false);
  });

  it("includes the current semester's classes when includeCurrentForCoreq is true", () => {
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [{ subjectCode: "B001" }] },
    ];
    const result = buildFulfilledSet(semesters, [], 1, true);
    expect(result.has("A001")).toBe(true);
    expect(result.has("B001")).toBe(true);
  });

  it("does not include classes from semesters beyond upToIndex even in coreq mode", () => {
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [{ subjectCode: "B001" }] },
      { classes: [{ subjectCode: "C001" }] },
    ];
    const result = buildFulfilledSet(semesters, [], 1, true);
    expect(result.has("C001")).toBe(false);
  });

  it("excludes credit with grantPosition k when evaluating semester k (prereq mode)", () => {
    // grantPosition = 2 means the credit was granted during semester 2 (1-based).
    // In prereq mode it should only be available from upToIndex >= 2.
    const credits = [{ subjectCode: "MAT001", grantPosition: 2 }];

    // upToIndex = 1 (evaluating semester index 1 = the 2nd semester) → not yet available
    const notYet = buildFulfilledSet([], credits, 1, false);
    expect(notYet.has("MAT001")).toBe(false);

    // upToIndex = 2 → available
    const available = buildFulfilledSet([], credits, 2, false);
    expect(available.has("MAT001")).toBe(true);
  });

  it("includes credit with grantPosition k in coreq mode at semester index k-1", () => {
    // grantPosition = 2 → in coreq mode available from upToIndex >= 1 (k-1 = 1)
    const credits = [{ subjectCode: "MAT001", grantPosition: 2 }];

    // upToIndex = 0 → not yet available
    const notYet = buildFulfilledSet([], credits, 0, true);
    expect(notYet.has("MAT001")).toBe(false);

    // upToIndex = 1 → available in coreq mode
    const available = buildFulfilledSet([], credits, 1, true);
    expect(available.has("MAT001")).toBe(true);
  });

  it("upToIndex = 0 with no semesters before it gives only grantPosition-0 credits", () => {
    const semesters = [{ classes: [{ subjectCode: "A001" }] }];
    const credits = [
      { subjectCode: "MAT001", grantPosition: 0 },
      { subjectCode: "FIS001", grantPosition: 1 },
    ];
    const result = buildFulfilledSet(semesters, credits, 0, false);
    expect(result.has("MAT001")).toBe(true);
    expect(result.has("FIS001")).toBe(false);
    expect(result.has("A001")).toBe(false);
  });

  it("returns an empty set when upToIndex is 0 and includeCurrentForCoreq is false with no credits", () => {
    const semesters = [{ classes: [{ subjectCode: "A001" }] }];
    const result = buildFulfilledSet(semesters, [], 0, false);
    expect(result.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// isEligible
// ---------------------------------------------------------------------------

describe("isEligible", () => {
  const equivalences = {};

  it("is always eligible when course has no prereqs and no coreqs", () => {
    const course = { code: "A001", prereq: [], coreq: [] };
    expect(isEligible(course, new Set(), equivalences)).toBe(true);
  });

  it("is eligible when the single prereq is satisfied", () => {
    const course = { code: "B001", prereq: ["A001"], coreq: [] };
    const fulfilled = new Set(["A001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(true);
  });

  it("is not eligible when a prereq is not satisfied", () => {
    const course = { code: "B001", prereq: ["A001"], coreq: [] };
    expect(isEligible(course, new Set(), equivalences)).toBe(false);
  });

  it("is not eligible when one of multiple prereqs is missing", () => {
    const course = { code: "C001", prereq: ["A001", "B001"], coreq: [] };
    const fulfilled = new Set(["A001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(false);
  });

  it("is eligible when all prereqs are satisfied", () => {
    const course = { code: "C001", prereq: ["A001", "B001"], coreq: [] };
    const fulfilled = new Set(["A001", "B001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(true);
  });

  it("is eligible when the coreq is satisfied via the current semester", () => {
    const course = { code: "B001", prereq: [], coreq: ["LAB001"] };
    // The current semester contains LAB001, so the fulfilled set includes it.
    const fulfilled = new Set(["LAB001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(true);
  });

  it("is not eligible when a coreq is not satisfied", () => {
    const course = { code: "B001", prereq: [], coreq: ["LAB001"] };
    expect(isEligible(course, new Set(), equivalences)).toBe(false);
  });

  it("is eligible when prereq is satisfied via an equivalence", () => {
    const equiv = { A001: ["A001_OLD"] };
    const course = { code: "B001", prereq: ["A001"], coreq: [] };
    const fulfilled = new Set(["A001_OLD"]);
    expect(isEligible(course, fulfilled, equiv)).toBe(true);
  });

  it("is eligible when both prereqs and coreqs are satisfied", () => {
    const course = { code: "C001", prereq: ["A001"], coreq: ["LAB001"] };
    const fulfilled = new Set(["A001", "LAB001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(true);
  });

  it("is not eligible when prereq is satisfied but coreq is not", () => {
    const course = { code: "C001", prereq: ["A001"], coreq: ["LAB001"] };
    const fulfilled = new Set(["A001"]);
    expect(isEligible(course, fulfilled, equivalences)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// getEligibleCourses
// ---------------------------------------------------------------------------

describe("getEligibleCourses", () => {
  it("returns an empty array when allCourses is empty", () => {
    const result = getEligibleCourses([], [], [], 0, {});
    expect(result).toEqual([]);
  });

  it("includes a course with no prereqs and no coreqs", () => {
    const courses = [{ code: "A001", prereq: [], coreq: [] }];
    const result = getEligibleCourses(courses, [], [], 0, {});
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("A001");
  });

  it("excludes a course whose code is already planned in any semester", () => {
    const courses = [{ code: "A001", prereq: [], coreq: [] }];
    const semesters = [{ classes: [{ subjectCode: "A001" }] }];
    const result = getEligibleCourses(courses, semesters, [], 1, {});
    expect(result).toHaveLength(0);
  });

  it("excludes a course already planned in a later semester", () => {
    const courses = [{ code: "C001", prereq: [], coreq: [] }];
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [{ subjectCode: "B001" }] },
      { classes: [{ subjectCode: "C001" }] },
    ];
    // Even when evaluating semester 0, C001 is planned in semester 2 → excluded
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    expect(result).toHaveLength(0);
  });

  it("includes a course when all its prereqs are satisfied by prior semesters", () => {
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [] },
    ];
    const result = getEligibleCourses(courses, semesters, [], 1, {});
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("B001");
  });

  it("excludes a course whose prereq has not yet been fulfilled", () => {
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const semesters = [{ classes: [] }];
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    expect(result).toHaveLength(0);
  });

  it("excludes a course when its prereq appears only in the current semester (prereq requires prior)", () => {
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
    ];
    // semesterIndex = 0: A001 is in semester 0 (the current one) → not a fulfilled prereq
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    expect(result).toHaveLength(0);
  });

  it("includes a course whose coreq is satisfied by a class in the current semester", () => {
    const courses = [{ code: "B001", prereq: [], coreq: ["LAB001"] }];
    const semesters = [
      { classes: [{ subjectCode: "LAB001" }] },
    ];
    // semesterIndex = 0: LAB001 is in the current semester → satisfies coreq
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("B001");
  });

  it("excludes a course whose coreq is not satisfied by any planned class", () => {
    const courses = [{ code: "B001", prereq: [], coreq: ["LAB001"] }];
    const semesters = [{ classes: [{ subjectCode: "OTHER001" }] }];
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    expect(result).toHaveLength(0);
  });

  it("includes a course whose prereq is satisfied via a credit entry with grantPosition 0", () => {
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const credits = [{ subjectCode: "A001", grantPosition: 0 }];
    const result = getEligibleCourses(courses, [], credits, 0, {});
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("B001");
  });

  it("excludes a course whose prereq equivalence is not in the fulfilled set", () => {
    const equivalences = { A001: ["A001_OLD"] };
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const semesters = [{ classes: [] }];
    const result = getEligibleCourses(courses, semesters, [], 1, equivalences);
    expect(result).toHaveLength(0);
  });

  it("includes a course whose prereq is satisfied via equivalence in a prior semester", () => {
    const equivalences = { A001: ["A001_OLD"] };
    const courses = [{ code: "B001", prereq: ["A001"], coreq: [] }];
    const semesters = [
      { classes: [{ subjectCode: "A001_OLD" }] },
      { classes: [] },
    ];
    const result = getEligibleCourses(courses, semesters, [], 1, equivalences);
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("B001");
  });

  it("returns only eligible courses from a mixed list", () => {
    const courses = [
      { code: "A001", prereq: [], coreq: [] },           // eligible
      { code: "B001", prereq: ["A001"], coreq: [] },     // not eligible (A001 not prior)
      { code: "C001", prereq: [], coreq: [] },           // eligible
    ];
    const semesters = [{ classes: [] }];
    const result = getEligibleCourses(courses, semesters, [], 0, {});
    const codes = result.map((c) => c.code);
    expect(codes).toContain("A001");
    expect(codes).toContain("C001");
    expect(codes).not.toContain("B001");
  });

  it("handles multiple semesters and a mix of satisfied and unsatisfied prereqs", () => {
    const courses = [
      { code: "C001", prereq: ["A001", "B001"], coreq: [] }, // eligible: both prior
      { code: "D001", prereq: ["A001", "X001"], coreq: [] }, // not eligible: X001 missing
    ];
    const semesters = [
      { classes: [{ subjectCode: "A001" }] },
      { classes: [{ subjectCode: "B001" }] },
      { classes: [] },
    ];
    const result = getEligibleCourses(courses, semesters, [], 2, {});
    expect(result).toHaveLength(1);
    expect(result[0].code).toBe("C001");
  });
});