import { describe, it, expect } from "vitest";
import {
  inferNextSemester,
  upsertSemester,
  deleteSemester,
  groupUnique,
  enrichRowsWithOffer,
  generateSemester,
} from "../planning.js";

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function makeRow(codigo, semestre_curso, turmas = []) {
  return {
    semestre_curso: String(semestre_curso),
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

function makeHorario(dia, inicio, fim) {
  return { dia, inicio, fim };
}

function makeRawTurma(codigo, horarios = []) {
  return { codigo, docente: "", horarios };
}

// Minimal PPC JSON fixture
function makePpcJson(courses) {
  // courses: [{ code, prereq, coreq, suggestedSemester, name }]
  const coursesObj = {};
  for (const c of courses) {
    coursesObj[c.code] = {
      code: c.code,
      name: c.name ?? c.code,
      suggestedSemester: c.suggestedSemester ?? null,
      prereq: c.prereq ?? [],
      coreq: c.coreq ?? [],
    };
  }
  return { version: 1, courses: coursesObj, edges: [] };
}

// Minimal oferta JSON fixture
function makeOfertaJson(semestre, disciplinas) {
  return {
    semestre,
    fonte_pdf: "test.pdf",
    gerado_em: new Date().toISOString(),
    disciplinas: disciplinas.map((d) => ({
      semestre,
      periodo: d.periodo ?? 1,
      codigo: d.codigo,
      nome: d.nome ?? d.codigo,
      carga_horaria: d.carga_horaria ?? 60,
      turmas: d.turmas ?? [],
    })),
  };
}

// ---------------------------------------------------------------------------
// inferNextSemester
// ---------------------------------------------------------------------------

describe("inferNextSemester", () => {
  it("returns sc=1 for empty planning (entryTerm=1)", () => {
    const result = inferNextSemester([], 2024, 1, 1);
    expect(result.courseTerm).toBe(1);
    expect(result.offerTerm).toBe(1);
    expect(result.ano).toBe(2024);
  });

  it("returns sc=1 for empty planning (entryTerm=2)", () => {
    const result = inferNextSemester([], 2024, 1, 2);
    expect(result.courseTerm).toBe(1);
    expect(result.offerTerm).toBe(2);
    expect(result.ano).toBe(2024);
  });

  it("advances sc correctly with entryTerm=1", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("FIS001", "1")];
    const result = inferNextSemester(rows, 2024, 1, 1);
    expect(result.courseTerm).toBe(2);
    expect(result.offerTerm).toBe(2);
    expect(result.ano).toBe(2024);
  });

  it("alterna entryTerm=1: sc1->S1, sc2->S2, sc3->S1, sc4->S2", () => {
    const ano = 2024;
    expect(inferNextSemester([], ano, 1, 1)).toMatchObject({
      courseTerm: 1,
      offerTerm: 1,
    });

    const rows1 = [makeRow("A", "1")];
    expect(inferNextSemester(rows1, ano, 1, 1)).toMatchObject({
      courseTerm: 2,
      offerTerm: 2,
    });

    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    expect(inferNextSemester(rows2, ano, 1, 1)).toMatchObject({
      courseTerm: 3,
      offerTerm: 1,
    });

    const rows3 = [makeRow("A", "1"), makeRow("B", "2"), makeRow("C", "3")];
    expect(inferNextSemester(rows3, ano, 1, 1)).toMatchObject({
      courseTerm: 4,
      offerTerm: 2,
    });
  });

  it("alterna entryTerm=2: sc1->S2, sc2->S1, sc3->S2, sc4->S1", () => {
    const ano = 2024;
    expect(inferNextSemester([], ano, 1, 2)).toMatchObject({
      courseTerm: 1,
      offerTerm: 2,
    });

    const rows1 = [makeRow("A", "1")];
    expect(inferNextSemester(rows1, ano, 1, 2)).toMatchObject({
      courseTerm: 2,
      offerTerm: 1,
    });

    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    expect(inferNextSemester(rows2, ano, 1, 2)).toMatchObject({
      courseTerm: 3,
      offerTerm: 2,
    });
  });

  it("ignores waiver rows when computing maxSc", () => {
    const rows = [makeRow("MAT001", "_"), makeRow("FIS001", "1")];
    const result = inferNextSemester(rows, 2024, 1, 1);
    expect(result.courseTerm).toBe(2);
  });

  it("year advances every 2 terms with entryTerm=1", () => {
    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    const r3 = inferNextSemester(rows2, 2024, 1, 1);
    expect(r3.ano).toBe(2025);
  });

  it("year advances every 2 terms with entryTerm=2", () => {
    const rows1 = [makeRow("A", "1")];
    const r2 = inferNextSemester(rows1, 2024, 1, 2);
    expect(r2.ano).toBe(2025);
  });
});

// ---------------------------------------------------------------------------
// upsertSemester
// ---------------------------------------------------------------------------

describe("upsertSemester", () => {
  it("adiciona rows de um semestre novo", () => {
    const existing = [makeRow("MAT001", "1")];
    const newRows = [makeRow("FIS001", "2"), makeRow("QUI001", "2")];
    const result = upsertSemester(existing, 2, newRows);
    expect(result).toHaveLength(3);
    expect(result.some((r) => r.codigo === "FIS001")).toBe(true);
  });

  it("substitui rows de semestre existente", () => {
    const existing = [
      makeRow("MAT001", "1"),
      makeRow("FIS001", "1"),
      makeRow("QUI001", "2"),
    ];
    const newRows = [makeRow("BIO001", "1")];
    const result = upsertSemester(existing, 1, newRows);
    expect(result.filter((r) => r.semestre_curso === "1")).toHaveLength(1);
    expect(result.find((r) => r.codigo === "BIO001")).toBeTruthy();
    expect(result.find((r) => r.codigo === "MAT001")).toBeUndefined();
  });

  it("keeps rows from other terms intact", () => {
    const existing = [makeRow("MAT001", "1"), makeRow("FIS001", "2")];
    const result = upsertSemester(existing, 1, [makeRow("BIO001", "1")]);
    expect(result.find((r) => r.codigo === "FIS001")).toBeTruthy();
  });

  it("sorts by numeric semestre_curso", () => {
    const existing = [makeRow("C", "3"), makeRow("A", "1")];
    const result = upsertSemester(existing, 2, [makeRow("B", "2")]);
    const semestres = result.map((r) => r.semestre_curso);
    expect(semestres).toEqual(["1", "2", "3"]);
  });

  it("funciona com array vazio de rows existentes", () => {
    const result = upsertSemester([], 1, [makeRow("MAT001", "1")]);
    expect(result).toHaveLength(1);
  });
});

// ---------------------------------------------------------------------------
// deleteSemester
// ---------------------------------------------------------------------------

describe("deleteSemester", () => {
  it("remove todas as rows do semestre especificado", () => {
    const rows = [
      makeRow("MAT001", "1"),
      makeRow("FIS001", "1"),
      makeRow("QUI001", "2"),
    ];
    const result = deleteSemester(rows, "1");
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("QUI001");
  });

  it("does not remove rows from other terms", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("FIS001", "2")];
    const result = deleteSemester(rows, "1");
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("FIS001");
  });

  it("returns empty array if there was only one term", () => {
    const rows = [makeRow("MAT001", "1")];
    expect(deleteSemester(rows, "1")).toHaveLength(0);
  });

  it("returns original if term does not exist", () => {
    const rows = [makeRow("MAT001", "1")];
    expect(deleteSemester(rows, "9")).toHaveLength(1);
  });

  it("does not remove waiver rows (_)", () => {
    const rows = [makeRow("MAT001", "_"), makeRow("FIS001", "1")];
    const result = deleteSemester(rows, "1");
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("MAT001");
  });
});

// ---------------------------------------------------------------------------
// groupUnique
// ---------------------------------------------------------------------------

describe("groupUnique", () => {
  it("keeps unique rows intact", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("FIS001", "1")];
    expect(groupUnique(rows)).toHaveLength(2);
  });

  it("remove duplicatas por (semestre_curso + codigo)", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("MAT001", "1")];
    expect(groupUnique(rows)).toHaveLength(1);
  });

  it("mescla turmas de duplicatas", () => {
    const r1 = makeRow("MAT001", "1", [makeRawTurma("T1", [])]);
    const r2 = makeRow("MAT001", "1", [makeRawTurma("T2", [])]);
    const result = groupUnique([r1, r2]);
    expect(result[0].turmas).toHaveLength(2);
  });

  it("does not merge the same course across different terms", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("MAT001", "2")];
    expect(groupUnique(rows)).toHaveLength(2);
  });

  it("descarta rows sem codigo", () => {
    const rows = [{ ...makeRow("MAT001", "1"), codigo: "" }];
    expect(groupUnique(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// enrichRowsWithOffer
// ---------------------------------------------------------------------------

describe("enrichRowsWithOffer", () => {
  it("enriquece row sem turmas com dados da oferta", () => {
    const rows = [makeRow("MAT001", "1", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].horarios).toHaveLength(1);
  });

  it("does not overwrite row that already has sections (even without schedules)", () => {
    // Row with a section but no schedules — represents user choice after conflict resolution
    const rows = [makeRow("MAT001", "1", [makeRawTurma("T1", [])])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T2",
            horarios: [makeHorario("Qui", "09:00", "11:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "dia");
    // Keeps the original section (T1), does not overwrite with T2 from offer
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("does not overwrite row with sections that have schedules", () => {
    const rows = [
      makeRow("MAT001", "1", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T2",
            horarios: [makeHorario("Qui", "09:00", "11:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("does not overwrite row with empty sections after conflict resolution", () => {
    // Course lost the conflict — resolveWinningCourseSection leaves 1 section without schedules
    // as a placeholder to prevent re-enrichment from the offer.
    const rows = [makeRow("INF001", "1", [makeRawTurma("T1", [])])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "INF001",
        turmas: [
          {
            turma: "T2",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "dia");
    // Row with a section but no schedules is NOT re-enriched — placeholder preserved
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
    expect(result[0].turmas[0].horarios).toHaveLength(0);
  });

  it("uses offer S2 when semestre_oferta on the row is '2'", () => {
    const row = { ...makeRow("MAT001", "1", []), semestre_oferta: "2" };
    const ofertaS2 = makeOfertaJson(2, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T2",
            horarios: [makeHorario("Sex", "14:00", "16:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer([row], {}, ofertaS2, "dia");
    expect(result[0].turmas[0].codigo).toBe("T2");
  });

  it("does not enrich waiver rows", () => {
    const rows = [makeRow("MAT001", "_", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          },
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas).toHaveLength(0);
  });

  it("filters sections by morning shift", () => {
    const rows = [makeRow("MAT001", "1", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          }, // morning
          {
            turma: "T2",
            horarios: [makeHorario("Seg", "14:00", "16:00")],
            docente: "",
          }, // afternoon
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "manha");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("filters sections by afternoon shift", () => {
    const rows = [makeRow("MAT001", "1", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          }, // morning
          {
            turma: "T2",
            horarios: [makeHorario("Seg", "14:00", "16:00")],
            docente: "",
          }, // afternoon
        ],
      },
    ]);
    const result = enrichRowsWithOffer(rows, ofertaS1, {}, "tarde");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T2");
  });
});

// ---------------------------------------------------------------------------
// generateSemester
// ---------------------------------------------------------------------------

describe("generateSemester", () => {
  it("selects courses with no prerequisites in the first term", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "FIS001", suggestedSemester: 1 },
    ]);
    const { newRows, courseTerm } = generateSemester({
      rows: [],
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    expect(courseTerm).toBe(1);
    expect(newRows.map((r) => r.codigo)).toContain("MAT001");
    expect(newRows.map((r) => r.codigo)).toContain("FIS001");
  });

  it("does not select course with unmet prerequisite", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const { newRows } = generateSemester({
      rows: [],
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    expect(newRows.map((r) => r.codigo)).not.toContain("MAT002");
  });

  it("selects course with prerequisite met in the previous term", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const existingRows = [makeRow("MAT001", "1")];
    const { newRows, courseTerm } = generateSemester({
      rows: existingRows,
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    expect(courseTerm).toBe(2);
    expect(newRows.map((r) => r.codigo)).toContain("MAT002");
  });

  it("does not duplicate courses already planned in other terms", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "FIS001", suggestedSemester: 1 },
    ]);
    const existingRows = [makeRow("MAT001", "1")];
    const { newRows } = generateSemester({
      rows: existingRows,
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    // MAT001 was already in sc=1, now generates sc=2
    expect(newRows.map((r) => r.codigo)).not.toContain("MAT001");
  });

  it("treats waived courses as completed for prerequisites", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const existingRows = [makeRow("MAT001", "_")]; // dispensada
    const { newRows } = generateSemester({
      rows: existingRows,
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    expect(newRows.map((r) => r.codigo)).toContain("MAT002");
  });

  it("infers the correct term from existing rows", () => {
    const ppcJson = makePpcJson([{ code: "FIS001" }]);
    const existingRows = [makeRow("MAT001", "1"), makeRow("FIS001", "1")];
    const { courseTerm, offerTerm } = generateSemester({
      rows: existingRows,
      ppcJson,
      offerJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      entryTerm: 1,
    });
    expect(courseTerm).toBe(2);
    expect(offerTerm).toBe(2);
  });
});
