import { describe, it, expect } from "vitest";
import { generateSemester, calcAvailableToAdd } from "./planning.js";

// ---------------------------------------------------------------------------
// Shared fixtures
// ---------------------------------------------------------------------------

/**
 * Minimal PPC with three subjects:
 *   A — no prereqs, no coreqs (1st semester candidate)
 *   B — requires A (2nd semester candidate)
 *   C — no prereqs, no coreqs (1st semester candidate)
 */
const ppcJson = {
  courses: {
    A: { code: "A", name: "Alpha",   prereq: [], coreq: [] },
    B: { code: "B", name: "Beta",    prereq: ["A"], coreq: [] },
    C: { code: "C", name: "Gamma",   prereq: [], coreq: [] },
  },
};

const equivalences = {};

/** Offer that only contains subjects A and C — B is absent. */
const offer = {
  semester: 1,
  subjects: [
    {
      code: "A",
      name: "Alpha",
      creditHours: 60,
      classes: [
        { id: "A.1", instructor: null, slots: [{ day: "Mon", start: "08:00", end: "10:00" }] },
        { id: "A.2", instructor: null, slots: [{ day: "Mon", start: "14:00", end: "16:00" }] },
      ],
    },
    {
      code: "C",
      name: "Gamma",
      creditHours: 60,
      classes: [
        { id: "C.1", instructor: null, slots: [{ day: "Tue", start: "08:00", end: "10:00" }] },
      ],
    },
  ],
};

/** Offer where subject A only has an afternoon class. */
const offerAfternoonOnly = {
  semester: 1,
  subjects: [
    {
      code: "A",
      name: "Alpha",
      creditHours: 60,
      classes: [
        { id: "A.PM", instructor: null, slots: [{ day: "Mon", start: "14:00", end: "16:00" }] },
      ],
    },
  ],
};

/** Empty offer — no subjects at all. */
const emptyOffer = { semester: 1, subjects: [] };

const BASE_YEAR = 2024;
const BASE_OFFER_SEMESTER = 1;

function generate(opts = {}) {
  return generateSemester({
    semesters: [],
    creditEntries: [],
    ppcJson,
    offer,
    shift: "dia",
    ingressYear: null,
    ingressYearSemester: null,
    baseYear: BASE_YEAR,
    baseOfferSemester: BASE_OFFER_SEMESTER,
    equivalences,
    ...opts,
  });
}

// ---------------------------------------------------------------------------
// Only offer subjects appear in the generated semester
// ---------------------------------------------------------------------------

describe("generateSemester — offer filtering", () => {
  it("only includes subjects that are present in the offer", () => {
    const { newSemester } = generate();
    const codes = newSemester.sections.map((s) => s.subjectCode);

    // A and C are in the offer → must appear
    expect(codes).toContain("A");
    expect(codes).toContain("C");

    // B is NOT in the offer → must not appear, even though prereqs are fine
    // (it has no prereqs of its own but B is absent from offer)
    expect(codes).not.toContain("B");
  });

  it("produces one section per offer section for a subject with multiple sections", () => {
    const { newSemester } = generate();
    const aSections = newSemester.sections.filter((s) => s.subjectCode === "A");
    // offer has two sections for A → two entries
    expect(aSections).toHaveLength(2);
    expect(aSections.map((s) => s.name)).toEqual(expect.arrayContaining(["A.1", "A.2"]));
  });

  it("copies slots from the offer section verbatim", () => {
    const { newSemester } = generate();
    const a1 = newSemester.sections.find((s) => s.name === "A.1");
    expect(a1.slots).toEqual([{ day: "Mon", start: "08:00", end: "10:00" }]);
  });

  it("uses the subject name from the offer", () => {
    const { newSemester } = generate();
    const a = newSemester.sections.find((s) => s.subjectCode === "A");
    expect(a.subjectName).toBe("Alpha");
  });

  it("returns an empty sections array when the offer is empty", () => {
    const { newSemester } = generate({ offer: emptyOffer });
    expect(newSemester.sections).toHaveLength(0);
  });

  it("excludes a subject that is in the PPC but completely absent from the offer", () => {
    // Only A is in this offer; C is absent
    const partialOffer = {
      semester: 1,
      subjects: [
        {
          code: "A",
          name: "Alpha",
          creditHours: 60,
          classes: [{ id: "A.1", instructor: null, slots: [] }],
        },
      ],
    };
    const { newSemester } = generate({ offer: partialOffer });
    const codes = newSemester.sections.map((s) => s.subjectCode);
    expect(codes).not.toContain("C");
  });
});

// ---------------------------------------------------------------------------
// Shift filtering
// ---------------------------------------------------------------------------

describe("generateSemester — shift filtering", () => {
  it("includes all sections when shift is 'dia'", () => {
    const { newSemester } = generate({ offer: offerAfternoonOnly, shift: "dia" });
    expect(newSemester.sections.some((s) => s.subjectCode === "A")).toBe(true);
  });

  it("includes a section when its slot matches the requested shift (tarde)", () => {
    const { newSemester } = generate({ offer: offerAfternoonOnly, shift: "tarde" });
    expect(newSemester.sections.some((s) => s.subjectCode === "A")).toBe(true);
  });

  it("emits a placeholder with empty slots when subject is in offer but no section matches shift", () => {
    // offerAfternoonOnly has A with only an afternoon section; requesting 'manha' yields no match
    const { newSemester } = generate({ offer: offerAfternoonOnly, shift: "manha" });
    const entry = newSemester.sections.find((s) => s.subjectCode === "A");
    expect(entry).toBeDefined();
    expect(entry.name).toBe("");
    expect(entry.slots).toEqual([]);
  });

  it("does NOT emit a placeholder for a subject entirely absent from the offer", () => {
    // B is absent from offerAfternoonOnly; it must not appear at all, not even as a placeholder
    const { newSemester } = generate({ offer: offerAfternoonOnly, shift: "manha" });
    expect(newSemester.sections.some((s) => s.subjectCode === "B")).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// Prerequisite filtering
// ---------------------------------------------------------------------------

describe("generateSemester — prerequisite filtering", () => {
  const offerWithB = {
    semester: 1,
    subjects: [
      {
        code: "A",
        name: "Alpha",
        creditHours: 60,
        classes: [{ id: "A.1", instructor: null, slots: [] }],
      },
      {
        code: "B",
        name: "Beta",
        creditHours: 60,
        classes: [{ id: "B.1", instructor: null, slots: [] }],
      },
    ],
  };

  it("excludes B when its prereq A has not been completed", () => {
    const { newSemester } = generate({ offer: offerWithB });
    const codes = newSemester.sections.map((s) => s.subjectCode);
    expect(codes).not.toContain("B");
  });

  it("includes B once A appears in a prior semester", () => {
    const priorSemester = {
      label: "2024/1",
      offerSemester: 1,
      sections: [{ subjectCode: "A", name: "A.1", subjectName: "Alpha", slots: [] }],
    };
    const { newSemester } = generateSemester({
      semesters: [priorSemester],
      creditEntries: [],
      ppcJson,
      offer: offerWithB,
      shift: "dia",
      ingressYear: BASE_YEAR,
      ingressYearSemester: 1,
      baseYear: BASE_YEAR,
      baseOfferSemester: BASE_OFFER_SEMESTER,
      equivalences,
    });
    const codes = newSemester.sections.map((s) => s.subjectCode);
    expect(codes).toContain("B");
  });

  it("excludes a subject already planned in a prior semester", () => {
    const priorSemester = {
      label: "2024/1",
      offerSemester: 1,
      sections: [{ subjectCode: "A", name: "A.1", subjectName: "Alpha", slots: [] }],
    };
    const { newSemester } = generateSemester({
      semesters: [priorSemester],
      creditEntries: [],
      ppcJson,
      offer: offerWithB,
      shift: "dia",
      ingressYear: BASE_YEAR,
      ingressYearSemester: 1,
      baseYear: BASE_YEAR,
      baseOfferSemester: BASE_OFFER_SEMESTER,
      equivalences,
    });
    const codes = newSemester.sections.map((s) => s.subjectCode);
    // A was in the prior semester → must not be re-suggested
    expect(codes).not.toContain("A");
  });

  it("includes B when A is satisfied via a credit entry with grantPosition 0", () => {
    const { newSemester } = generateSemester({
      semesters: [],
      creditEntries: [{ subjectCode: "A", grantPosition: 0 }],
      ppcJson,
      offer: offerWithB,
      shift: "dia",
      ingressYear: null,
      ingressYearSemester: null,
      baseYear: BASE_YEAR,
      baseOfferSemester: BASE_OFFER_SEMESTER,
      equivalences,
    });
    const codes = newSemester.sections.map((s) => s.subjectCode);
    expect(codes).toContain("B");
  });
});

// ---------------------------------------------------------------------------
// Semester metadata
// ---------------------------------------------------------------------------

describe("generateSemester — metadata", () => {
  it("returns semesterIndex 0 for the first generation", () => {
    const { semesterIndex } = generate();
    expect(semesterIndex).toBe(0);
  });

  it("returns semesterIndex 1 for the second generation", () => {
    const prior = { label: "2024/1", offerSemester: 1, sections: [] };
    const { semesterIndex } = generateSemester({
      semesters: [prior],
      creditEntries: [],
      ppcJson,
      offer,
      shift: "dia",
      ingressYear: BASE_YEAR,
      ingressYearSemester: 1,
      baseYear: BASE_YEAR,
      baseOfferSemester: BASE_OFFER_SEMESTER,
      equivalences,
    });
    expect(semesterIndex).toBe(1);
  });

  it("derives a label from ingressYear and ingressYearSemester", () => {
    const { newSemester } = generateSemester({
      semesters: [],
      creditEntries: [],
      ppcJson,
      offer,
      shift: "dia",
      ingressYear: 2024,
      ingressYearSemester: 1,
      baseYear: BASE_YEAR,
      baseOfferSemester: BASE_OFFER_SEMESTER,
      equivalences,
    });
    expect(newSemester.label).toBe("2024/1");
  });

  it("falls back to a positional label when no ingress info is provided", () => {
    const { newSemester } = generate();
    expect(newSemester.label).toBe("1");
  });

  it("records the correct offerSemester on the new semester", () => {
    const { newSemester, offerSemester } = generate();
    expect(newSemester.offerSemester).toBe(offerSemester);
  });
});

// ---------------------------------------------------------------------------
// calcAvailableToAdd — same offer-filtering rules
// ---------------------------------------------------------------------------

describe("calcAvailableToAdd — offer filtering", () => {
  it("only returns subjects present in the offer", () => {
    const result = calcAvailableToAdd({
      semesters: [],
      creditEntries: [],
      ppcJson,
      offer,
      shift: "dia",
      semesterIndex: 0,
      equivalences,
    });
    const codes = result.map((s) => s.subjectCode);
    expect(codes).toContain("A");
    expect(codes).toContain("C");
    expect(codes).not.toContain("B");
  });

  it("returns an empty array when the offer is empty", () => {
    const result = calcAvailableToAdd({
      semesters: [],
      creditEntries: [],
      ppcJson,
      offer: emptyOffer,
      shift: "dia",
      semesterIndex: 0,
      equivalences,
    });
    expect(result).toHaveLength(0);
  });

  it("emits a placeholder for a subject in offer but with no matching-shift section", () => {
    const result = calcAvailableToAdd({
      semesters: [],
      creditEntries: [],
      ppcJson,
      offer: offerAfternoonOnly,
      shift: "manha",
      semesterIndex: 0,
      equivalences,
    });
    const entry = result.find((s) => s.subjectCode === "A");
    expect(entry).toBeDefined();
    expect(entry.name).toBe("");
    expect(entry.slots).toEqual([]);
  });
});