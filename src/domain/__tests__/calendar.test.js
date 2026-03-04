import { describe, it, expect } from "vitest";
import {
  courseSectionSlots,
  courseSectionsConflict,
  courseSectionHasConflict,
  rowsToCourseSections,
  blockingReasons,
  isPeriodResolved,
  sectionsInSlot,
  resolveWinningCourseSection,
  firstConflictingSlot,
  periodHasShift,
} from "../calendar.js";

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function makeCourseSection(codigo, horarios, courseCode = "DIS00001") {
  return {
    codigo,
    docente: "",
    horarios,
    courseCode,
    courseName: courseCode,
  };
}

function makeHorario(dia, inicio, fim) {
  return { dia, inicio, fim };
}

function makeRow(codigo, turmas, semestre_curso = "1") {
  return {
    semestre_curso,
    ano: "2024",
    semestre_oferta: "1",
    codigo,
    nome: codigo,
    periodo: "1",
    carga_horaria: "60",
    pre_requisitos: [],
    co_requisitos: [],
    turmas,
  };
}

function makeRawTurma(codigo, horarios) {
  return { codigo, docente: "", horarios };
}

// ---------------------------------------------------------------------------
// courseSectionSlots
// ---------------------------------------------------------------------------

describe("courseSectionSlots", () => {
  it("returns a valid slot for a simple schedule", () => {
    const turma = makeCourseSection("T1", [
      makeHorario("Ter", "09:00", "11:00"),
    ]);
    const slots = courseSectionSlots(turma);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      dia: "Ter",
      startMin: 9 * 60,
      endMin: 11 * 60,
    });
  });

  it("returns multiple slots for multiple schedules", () => {
    const turma = makeCourseSection("T1", [
      makeHorario("Ter", "09:00", "11:00"),
      makeHorario("Qui", "09:00", "11:00"),
    ]);
    const slots = courseSectionSlots(turma);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.dia)).toEqual(["Ter", "Qui"]);
  });

  it("discards invalid schedule (end <= start)", () => {
    const turma = makeCourseSection("T1", [
      makeHorario("Seg", "11:00", "09:00"),
    ]);
    expect(courseSectionSlots(turma)).toHaveLength(0);
  });

  it("discards malformed schedule", () => {
    const turma = makeCourseSection("T1", [
      { dia: "Seg", inicio: "abc", fim: "11:00" },
    ]);
    expect(courseSectionSlots(turma)).toHaveLength(0);
  });

  it("clamps schedule outside [HOUR_START, HOUR_END]", () => {
    const turma = makeCourseSection("T1", [
      makeHorario("Seg", "06:00", "08:00"),
    ]);
    const slots = courseSectionSlots(turma);
    expect(slots).toHaveLength(1);
    expect(slots[0].startMin).toBe(7 * 60); // clampado para 07:00
    expect(slots[0].rawStart).toBe(6 * 60); // original preservado
  });

  it("returns empty array for section without schedules", () => {
    const turma = makeCourseSection("T1", []);
    expect(courseSectionSlots(turma)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// courseSectionsConflict
// ---------------------------------------------------------------------------

describe("courseSectionsConflict", () => {
  it("detects conflict in a 1h slot on the same day", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "10:00", "12:00")],
      "DIS002",
    );
    expect(courseSectionsConflict(a, b)).toBe(true);
  });

  it("does not conflict on different days", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Qui", "09:00", "11:00")],
      "DIS002",
    );
    expect(courseSectionsConflict(a, b)).toBe(false);
  });

  it("does not conflict for adjacent schedules (end of A = start of B)", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "11:00", "13:00")],
      "DIS002",
    );
    expect(courseSectionsConflict(a, b)).toBe(false);
  });

  it("não conflita horários diferentes da MESMA section (ex: Ter e Qui da turma 06.1 N)", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T1",
      [makeHorario("Qui", "09:00", "11:00")],
      "DIS001",
    );
    expect(courseSectionsConflict(a, b)).toBe(false);
  });

  it("conflita sections DIFERENTES do mesmo course com horário sobreposto", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    expect(courseSectionsConflict(a, b)).toBe(true);
  });

  it("sections diferentes do mesmo course sem sobreposição de horário não conflitam por slot", () => {
    // Two sections of the same course at different times — student can't attend both,
    // but courseSectionsConflict only detects slot overlap; no overlap means no conflict here
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Qui", "14:00", "16:00")],
      "DIS001",
    );
    // No schedule overlap — no conflict by slot criterion
    expect(courseSectionsConflict(a, b)).toBe(false);
  });

  it("detects partial conflict (start of B inside A)", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Seg", "08:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Seg", "10:00", "12:00")],
      "DIS002",
    );
    expect(courseSectionsConflict(a, b)).toBe(true);
  });

  it("is commutative", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "10:00", "12:00")],
      "DIS002",
    );
    expect(courseSectionsConflict(a, b)).toBe(courseSectionsConflict(b, a));
  });

  it("does not conflict for sections without schedules", () => {
    const a = makeCourseSection("T1", [], "DIS001");
    const b = makeCourseSection("T2", [], "DIS002");
    expect(courseSectionsConflict(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// courseSectionHasConflict
// ---------------------------------------------------------------------------

describe("courseSectionHasConflict", () => {
  it("returns true when it conflicts with another section", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "10:00", "12:00")],
      "DIS002",
    );
    expect(courseSectionHasConflict(a, [a, b])).toBe(true);
  });

  it("returns false when alone", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    expect(courseSectionHasConflict(a, [a])).toBe(false);
  });

  it("does not conflict with itself (same reference)", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    expect(courseSectionHasConflict(a, [a])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rowsToTurmas
// ---------------------------------------------------------------------------

describe("rowsToCourseSections", () => {
  it("extracts sections from rows and enriches with courseCode", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    const sections = rowsToCourseSections(rows);
    expect(sections).toHaveLength(1);
    expect(sections[0].courseCode).toBe("MAT001");
    expect(sections[0].codigo).toBe("T1");
  });

  it("ignores waiver rows (semestre_curso === '_')", () => {
    const rows = [
      makeRow(
        "MAT001",
        [makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")])],
        "_",
      ),
    ];
    expect(rowsToCourseSections(rows)).toHaveLength(0);
  });

  it("extracts multiple sections from multiple rows", () => {
    const rows = [
      makeRow("MAT001", [makeRawTurma("T1", []), makeRawTurma("T2", [])]),
      makeRow("FIS001", [makeRawTurma("T1", [])]),
    ];
    expect(rowsToCourseSections(rows)).toHaveLength(3);
  });

  it("returns empty array for rows without sections", () => {
    const rows = [makeRow("MAT001", [])];
    expect(rowsToCourseSections(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// blockingReasons / isPeriodResolved
// ---------------------------------------------------------------------------

describe("blockingReasons", () => {
  it("returns empty for a period with no conflicts and 1 section per course", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(blockingReasons(rows)).toHaveLength(0);
  });

  it("detects course with more than 1 section", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const motivos = blockingReasons(rows);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true);
  });

  it("detects schedule conflict between different courses", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    const motivos = blockingReasons(rows);
    expect(
      motivos.some((m) => m.includes("MAT001") || m.includes("FIS001")),
    ).toBe(true);
  });

  it("detects conflict between different sections of the same course with overlapping schedules", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    // Should report multiple sections AND conflict between them (overlapping schedules)
    const motivos = blockingReasons(rows);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true);
  });

  it("does not detect conflict between different sections of the same course with non-overlapping schedules", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Qui", "14:00", "16:00")]),
      ]),
    ];
    // Should report multiple sections, but no schedule conflict
    const motivos = blockingReasons(rows);
    expect(motivos.some((m) => m.includes("Conflito"))).toBe(false);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true); // still has 2 sections
  });

  it("returns empty for empty rows", () => {
    expect(blockingReasons([])).toHaveLength(0);
  });
});

describe("isPeriodResolved", () => {
  it("returns true for a period with no issues", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    expect(isPeriodResolved(rows)).toBe(true);
  });

  it("returns false for a period with a conflict", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    expect(isPeriodResolved(rows)).toBe(false);
  });

  it("returns false for a period with multiple sections", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(isPeriodResolved(rows)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// sectionsInSlot
// ---------------------------------------------------------------------------

describe("sectionsInSlot", () => {
  it("returns all sections occupying the slot", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const candidatos = sectionsInSlot("Ter", 9 * 60, rows);
    expect(candidatos).toHaveLength(2);
    expect(candidatos.map((c) => c.courseCode)).toContain("MAT001");
    expect(candidatos.map((c) => c.courseCode)).toContain("FIS001");
  });

  it("does not return section that does not occupy the slot", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "11:00", "13:00")]),
      ]),
    ];
    // Slot at 09:00 — FIS001 starts at 11:00, should not appear
    const candidatos = sectionsInSlot("Ter", 9 * 60, rows);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].courseCode).toBe("MAT001");
  });

  it("returns empty for slot with no sections", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(sectionsInSlot("Seg", 9 * 60, rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// firstConflictingSlot
// ---------------------------------------------------------------------------

describe("firstConflictingSlot", () => {
  it("returns the first conflicting slot", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "10:00", "12:00")],
      "DIS002",
    );
    expect(firstConflictingSlot(a, [a, b])).toBe(10 * 60);
  });

  it("returns null when there is no conflict", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Qui", "09:00", "11:00")],
      "DIS002",
    );
    expect(firstConflictingSlot(a, [a, b])).toBeNull();
  });

  it("ignora a mesma section (mesmo codigo E mesmo course)", () => {
    // Same section with schedules on different days — not a conflict
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T1",
      [makeHorario("Qui", "09:00", "11:00")],
      "DIS001",
    );
    expect(firstConflictingSlot(a, [a, b])).toBeNull();
  });

  it("detects conflict between different sections of the same course", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS001",
    );
    expect(firstConflictingSlot(a, [a, b])).toBe(9 * 60);
  });

  it("returns the earliest slot when there are multiple conflicts", () => {
    const a = makeCourseSection(
      "T1",
      [makeHorario("Ter", "08:00", "12:00")],
      "DIS001",
    );
    const b = makeCourseSection(
      "T2",
      [makeHorario("Ter", "09:00", "11:00")],
      "DIS002",
    );
    expect(firstConflictingSlot(a, [a, b])).toBe(9 * 60);
  });
});

// ---------------------------------------------------------------------------
// resolverTurmaVencedora
// ---------------------------------------------------------------------------

describe("resolveWinningCourseSection", () => {
  it("keeps only the winning section in the winner course", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const result = resolveWinningCourseSection("MAT001", "T1", rows);
    const mat = result.find((r) => r.codigo === "MAT001");
    expect(mat.turmas).toHaveLength(1);
    expect(mat.turmas[0].codigo).toBe("T1");
  });

  it("removes conflicting section from another course", () => {
    const rows = [
      makeRow("MAT001", [
        makeCourseSection("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeCourseSection("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeCourseSection("T2", [makeHorario("Qui", "09:00", "11:00")]),
      ]),
    ];
    // MAT001/T1 vence — FIS001/T1 conflita (mesma Ter 09:00), deve ser removida; T2 (Qui) fica
    const result = resolveWinningCourseSection("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    expect(fis.turmas).toHaveLength(1);
    expect(fis.turmas[0].codigo).toBe("T2");
  });

  it("when all sections of a course conflict, keeps a placeholder with no schedules", () => {
    const rows = [
      makeRow("MAT001", [
        makeCourseSection("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        // Only section — conflicts with MAT001/T1
        makeCourseSection("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    // MAT001/T1 wins — FIS001/T1 conflicts and is the only section
    const result = resolveWinningCourseSection("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    // Should have 1 placeholder section with no schedules (not an empty array)
    expect(fis.turmas).toHaveLength(1);
    expect(fis.turmas[0].horarios).toHaveLength(0);
  });

  it("does not alter courses without conflict", () => {
    const rows = [
      makeRow("MAT001", [
        makeCourseSection("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeCourseSection("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeCourseSection("T1", [makeHorario("Qui", "14:00", "16:00")]),
      ]),
    ];
    const result = resolveWinningCourseSection("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    expect(fis.turmas).toHaveLength(1); // inalterado
  });

  it("does not alter rows from other terms (different semestre_curso)", () => {
    const rows = [
      makeRow(
        "MAT001",
        [
          makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
          makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
        ],
        "1",
      ),
      makeRow(
        "MAT001",
        [
          makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
          makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
        ],
        "2",
      ),
    ];
    // Only operates on period 1 — but resolveWinningCourseSection operates on all passed rows
    // (filtering by period is the caller's responsibility)
    const rowsPeriodo1 = rows.filter((r) => r.semestre_curso === "1");
    const result = resolveWinningCourseSection("MAT001", "T1", rowsPeriodo1);
    const mat = result.find((r) => r.codigo === "MAT001");
    expect(mat.turmas).toHaveLength(1);
    expect(mat.turmas[0].codigo).toBe("T1");
  });
});

// ---------------------------------------------------------------------------
// periodHasShift
// ---------------------------------------------------------------------------

describe("periodHasShift", () => {
  it('returns true for "dia" always', () => {
    const rows = [makeRow("MAT001", [makeRawTurma("T1", [])])];
    expect(periodHasShift(rows, "dia")).toBe(true);
  });

  it("detects morning shift (start < 13:00)", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    expect(periodHasShift(rows, "manha")).toBe(true);
    expect(periodHasShift(rows, "tarde")).toBe(false);
  });

  it("detects afternoon shift (start >= 13:00)", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "14:00", "16:00")]),
      ]),
    ];
    expect(periodHasShift(rows, "tarde")).toBe(true);
    expect(periodHasShift(rows, "manha")).toBe(false);
  });

  it("returns false for a period with no sections having schedules", () => {
    const rows = [makeRow("MAT001", [makeRawTurma("T1", [])])];
    expect(periodHasShift(rows, "manha")).toBe(false);
    expect(periodHasShift(rows, "tarde")).toBe(false);
  });
});
