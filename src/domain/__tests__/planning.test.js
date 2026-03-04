import { describe, it, expect } from "vitest";
import {
  inferNextSemester,
  upsertSemester,
  deleteSemester,
  groupUnique,
  enrichRowsWithOferta,
  gerarSemestre,
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
  it("retorna sc=1 para planejamento vazio (semestreIngresso=1)", () => {
    const result = inferNextSemester([], 2024, 1, 1);
    expect(result.semestreCurso).toBe(1);
    expect(result.semestreOferta).toBe(1);
    expect(result.ano).toBe(2024);
  });

  it("retorna sc=1 para planejamento vazio (semestreIngresso=2)", () => {
    const result = inferNextSemester([], 2024, 1, 2);
    expect(result.semestreCurso).toBe(1);
    expect(result.semestreOferta).toBe(2);
    expect(result.ano).toBe(2024);
  });

  it("avança sc corretamente com semestreIngresso=1", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("FIS001", "1")];
    const result = inferNextSemester(rows, 2024, 1, 1);
    expect(result.semestreCurso).toBe(2);
    expect(result.semestreOferta).toBe(2);
    expect(result.ano).toBe(2024);
  });

  it("alterna semestreIngresso=1: sc1->S1, sc2->S2, sc3->S1, sc4->S2", () => {
    const ano = 2024;
    expect(inferNextSemester([], ano, 1, 1)).toMatchObject({
      semestreCurso: 1,
      semestreOferta: 1,
    });

    const rows1 = [makeRow("A", "1")];
    expect(inferNextSemester(rows1, ano, 1, 1)).toMatchObject({
      semestreCurso: 2,
      semestreOferta: 2,
    });

    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    expect(inferNextSemester(rows2, ano, 1, 1)).toMatchObject({
      semestreCurso: 3,
      semestreOferta: 1,
    });

    const rows3 = [makeRow("A", "1"), makeRow("B", "2"), makeRow("C", "3")];
    expect(inferNextSemester(rows3, ano, 1, 1)).toMatchObject({
      semestreCurso: 4,
      semestreOferta: 2,
    });
  });

  it("alterna semestreIngresso=2: sc1->S2, sc2->S1, sc3->S2, sc4->S1", () => {
    const ano = 2024;
    expect(inferNextSemester([], ano, 1, 2)).toMatchObject({
      semestreCurso: 1,
      semestreOferta: 2,
    });

    const rows1 = [makeRow("A", "1")];
    expect(inferNextSemester(rows1, ano, 1, 2)).toMatchObject({
      semestreCurso: 2,
      semestreOferta: 1,
    });

    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    expect(inferNextSemester(rows2, ano, 1, 2)).toMatchObject({
      semestreCurso: 3,
      semestreOferta: 2,
    });
  });

  it("ignora rows de dispensa ao calcular maxSc", () => {
    const rows = [makeRow("MAT001", "_"), makeRow("FIS001", "1")];
    const result = inferNextSemester(rows, 2024, 1, 1);
    expect(result.semestreCurso).toBe(2);
  });

  it("ano avança a cada 2 semestres com semestreIngresso=1", () => {
    const rows2 = [makeRow("A", "1"), makeRow("B", "2")];
    const r3 = inferNextSemester(rows2, 2024, 1, 1);
    expect(r3.ano).toBe(2025);
  });

  it("ano avança a cada 2 semestres com semestreIngresso=2", () => {
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

  it("mantém rows de outros semestres intactas", () => {
    const existing = [makeRow("MAT001", "1"), makeRow("FIS001", "2")];
    const result = upsertSemester(existing, 1, [makeRow("BIO001", "1")]);
    expect(result.find((r) => r.codigo === "FIS001")).toBeTruthy();
  });

  it("ordena por semestre_curso numérico", () => {
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

  it("não remove rows de outros semestres", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("FIS001", "2")];
    const result = deleteSemester(rows, "1");
    expect(result).toHaveLength(1);
    expect(result[0].codigo).toBe("FIS001");
  });

  it("retorna array vazio se só havia um semestre", () => {
    const rows = [makeRow("MAT001", "1")];
    expect(deleteSemester(rows, "1")).toHaveLength(0);
  });

  it("retorna original se semestre não existe", () => {
    const rows = [makeRow("MAT001", "1")];
    expect(deleteSemester(rows, "9")).toHaveLength(1);
  });

  it("não remove rows de dispensa (_)", () => {
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
  it("mantém rows únicas intactas", () => {
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

  it("não mescla a mesma disciplina em semestres diferentes", () => {
    const rows = [makeRow("MAT001", "1"), makeRow("MAT001", "2")];
    expect(groupUnique(rows)).toHaveLength(2);
  });

  it("descarta rows sem codigo", () => {
    const rows = [{ ...makeRow("MAT001", "1"), codigo: "" }];
    expect(groupUnique(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// enrichRowsWithOferta
// ---------------------------------------------------------------------------

describe("enrichRowsWithOferta", () => {
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
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].horarios).toHaveLength(1);
  });

  it("não sobrescreve row que já tem turmas (mesmo sem horários)", () => {
    // Row com turma mas sem horários — representa escolha do usuário após resolução de conflito
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
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "dia");
    // Mantém a turma original (T1), não sobrescreve com T2 da oferta
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("não sobrescreve row com turmas com horários", () => {
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
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("não sobrescreve row com turmas vazias após resolução de conflito", () => {
    // Disciplina perdeu o conflito — resolverTurmaVencedora deixa 1 turma sem horários
    // como placeholder para evitar re-enriquecimento pela oferta.
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
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "dia");
    // Row com turma sem horários NÃO é re-enriquecida — placeholder preservado
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
    expect(result[0].turmas[0].horarios).toHaveLength(0);
  });

  it("usa oferta S2 quando semestre_oferta da row é '2'", () => {
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
    const result = enrichRowsWithOferta([row], {}, ofertaS2, "dia");
    expect(result[0].turmas[0].codigo).toBe("T2");
  });

  it("não enriquece rows de dispensa", () => {
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
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "dia");
    expect(result[0].turmas).toHaveLength(0);
  });

  it("filtra turmas pelo turno manhã", () => {
    const rows = [makeRow("MAT001", "1", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          }, // manhã
          {
            turma: "T2",
            horarios: [makeHorario("Seg", "14:00", "16:00")],
            docente: "",
          }, // tarde
        ],
      },
    ]);
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "manha");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T1");
  });

  it("filtra turmas pelo turno tarde", () => {
    const rows = [makeRow("MAT001", "1", [])];
    const ofertaS1 = makeOfertaJson(1, [
      {
        codigo: "MAT001",
        turmas: [
          {
            turma: "T1",
            horarios: [makeHorario("Seg", "09:00", "11:00")],
            docente: "",
          }, // manhã
          {
            turma: "T2",
            horarios: [makeHorario("Seg", "14:00", "16:00")],
            docente: "",
          }, // tarde
        ],
      },
    ]);
    const result = enrichRowsWithOferta(rows, ofertaS1, {}, "tarde");
    expect(result[0].turmas).toHaveLength(1);
    expect(result[0].turmas[0].codigo).toBe("T2");
  });
});

// ---------------------------------------------------------------------------
// gerarSemestre
// ---------------------------------------------------------------------------

describe("gerarSemestre", () => {
  it("seleciona disciplinas sem pré-requisitos no primeiro semestre", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "FIS001", suggestedSemester: 1 },
    ]);
    const { newRows, semestreCurso } = gerarSemestre({
      rows: [],
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    expect(semestreCurso).toBe(1);
    expect(newRows.map((r) => r.codigo)).toContain("MAT001");
    expect(newRows.map((r) => r.codigo)).toContain("FIS001");
  });

  it("não seleciona disciplina com pré-requisito não cumprido", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const { newRows } = gerarSemestre({
      rows: [],
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    expect(newRows.map((r) => r.codigo)).not.toContain("MAT002");
  });

  it("seleciona disciplina com pré-requisito cumprido no semestre anterior", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const existingRows = [makeRow("MAT001", "1")];
    const { newRows, semestreCurso } = gerarSemestre({
      rows: existingRows,
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    expect(semestreCurso).toBe(2);
    expect(newRows.map((r) => r.codigo)).toContain("MAT002");
  });

  it("não duplica disciplinas já planejadas em outros semestres", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "FIS001", suggestedSemester: 1 },
    ]);
    const existingRows = [makeRow("MAT001", "1")];
    const { newRows } = gerarSemestre({
      rows: existingRows,
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    // MAT001 já estava no sc=1, agora gera sc=2
    expect(newRows.map((r) => r.codigo)).not.toContain("MAT001");
  });

  it("inclui disciplinas dispensadas como cumpridas para pré-requisitos", () => {
    const ppcJson = makePpcJson([
      { code: "MAT001", suggestedSemester: 1 },
      { code: "MAT002", prereq: ["MAT001"], suggestedSemester: 2 },
    ]);
    const existingRows = [makeRow("MAT001", "_")]; // dispensada
    const { newRows } = gerarSemestre({
      rows: existingRows,
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    expect(newRows.map((r) => r.codigo)).toContain("MAT002");
  });

  it("infere o semestre correto a partir das rows existentes", () => {
    const ppcJson = makePpcJson([{ code: "FIS001" }]);
    const existingRows = [makeRow("MAT001", "1"), makeRow("FIS001", "1")];
    const { semestreCurso, semestreOferta } = gerarSemestre({
      rows: existingRows,
      ppcJson,
      ofertaJson: null,
      turno: "dia",
      semOferta: true,
      anoInicio: 2024,
      scInicio: 1,
      semestreIngresso: 1,
    });
    expect(semestreCurso).toBe(2);
    expect(semestreOferta).toBe(2);
  });
});
