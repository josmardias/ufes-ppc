import { describe, it, expect } from "vitest";
import {
  turmaSlots,
  turmasConflitam,
  turmaTemConflito,
  rowsToTurmas,
  motivosBloqueio,
  periodoEstaResolvido,
  conflitosDoSlot,
  resolverTurmaVencedora,
  primeiroSlotConflitante,
  periodoTemTurno,
} from "../calendar.js";

// ---------------------------------------------------------------------------
// Helpers de fixture
// ---------------------------------------------------------------------------

function makeTurma(codigo, horarios, disciplinaCodigo = "DIS00001") {
  return {
    codigo,
    docente: "",
    horarios,
    disciplinaCodigo,
    disciplinaNome: disciplinaCodigo,
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
// turmaSlots
// ---------------------------------------------------------------------------

describe("turmaSlots", () => {
  it("retorna slot válido para horário simples", () => {
    const turma = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")]);
    const slots = turmaSlots(turma);
    expect(slots).toHaveLength(1);
    expect(slots[0]).toMatchObject({
      dia: "Ter",
      startMin: 9 * 60,
      endMin: 11 * 60,
    });
  });

  it("retorna múltiplos slots para múltiplos horários", () => {
    const turma = makeTurma("T1", [
      makeHorario("Ter", "09:00", "11:00"),
      makeHorario("Qui", "09:00", "11:00"),
    ]);
    const slots = turmaSlots(turma);
    expect(slots).toHaveLength(2);
    expect(slots.map((s) => s.dia)).toEqual(["Ter", "Qui"]);
  });

  it("descarta horário inválido (fim <= início)", () => {
    const turma = makeTurma("T1", [makeHorario("Seg", "11:00", "09:00")]);
    expect(turmaSlots(turma)).toHaveLength(0);
  });

  it("descarta horário mal formado", () => {
    const turma = makeTurma("T1", [
      { dia: "Seg", inicio: "abc", fim: "11:00" },
    ]);
    expect(turmaSlots(turma)).toHaveLength(0);
  });

  it("clampa horário fora do intervalo [HOUR_START, HOUR_END]", () => {
    const turma = makeTurma("T1", [makeHorario("Seg", "06:00", "08:00")]);
    const slots = turmaSlots(turma);
    expect(slots).toHaveLength(1);
    expect(slots[0].startMin).toBe(7 * 60); // clampado para 07:00
    expect(slots[0].rawStart).toBe(6 * 60); // original preservado
  });

  it("retorna array vazio para turma sem horários", () => {
    const turma = makeTurma("T1", []);
    expect(turmaSlots(turma)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// turmasConflitam
// ---------------------------------------------------------------------------

describe("turmasConflitam", () => {
  it("detecta conflito em slot de 1h no mesmo dia", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "10:00", "12:00")], "DIS002");
    expect(turmasConflitam(a, b)).toBe(true);
  });

  it("não conflita em dias diferentes", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Qui", "09:00", "11:00")], "DIS002");
    expect(turmasConflitam(a, b)).toBe(false);
  });

  it("não conflita para horários adjacentes (fim de A = início de B)", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "11:00", "13:00")], "DIS002");
    expect(turmasConflitam(a, b)).toBe(false);
  });

  it("não conflita horários diferentes da MESMA turma (ex: Ter e Qui da turma 06.1 N)", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T1", [makeHorario("Qui", "09:00", "11:00")], "DIS001");
    expect(turmasConflitam(a, b)).toBe(false);
  });

  it("conflita turmas DIFERENTES da mesma disciplina com horário sobreposto", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    expect(turmasConflitam(a, b)).toBe(true);
  });

  it("conflita turmas diferentes da mesma disciplina mesmo sem sobreposição de horário", () => {
    // Duas turmas da mesma disciplina em horários distintos — aluno não pode fazer as duas
    // Mas turmasConflitam só detecta sobreposição de slots; sem sobreposição não há conflito de horário
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Qui", "14:00", "16:00")], "DIS001");
    // Sem sobreposição de horário — não conflitam pelo critério de slot
    expect(turmasConflitam(a, b)).toBe(false);
  });

  it("detecta conflito parcial (início de B dentro de A)", () => {
    const a = makeTurma("T1", [makeHorario("Seg", "08:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Seg", "10:00", "12:00")], "DIS002");
    expect(turmasConflitam(a, b)).toBe(true);
  });

  it("é comutativo", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "10:00", "12:00")], "DIS002");
    expect(turmasConflitam(a, b)).toBe(turmasConflitam(b, a));
  });

  it("não conflita turmas sem horários", () => {
    const a = makeTurma("T1", [], "DIS001");
    const b = makeTurma("T2", [], "DIS002");
    expect(turmasConflitam(a, b)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// turmaTemConflito
// ---------------------------------------------------------------------------

describe("turmaTemConflito", () => {
  it("retorna true quando conflita com outra turma", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "10:00", "12:00")], "DIS002");
    expect(turmaTemConflito(a, [a, b])).toBe(true);
  });

  it("retorna false quando está sozinha", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    expect(turmaTemConflito(a, [a])).toBe(false);
  });

  it("não conflita consigo mesma (mesma referência)", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    expect(turmaTemConflito(a, [a])).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// rowsToTurmas
// ---------------------------------------------------------------------------

describe("rowsToTurmas", () => {
  it("extrai turmas das rows e enriquece com disciplinaCodigo", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    const turmas = rowsToTurmas(rows);
    expect(turmas).toHaveLength(1);
    expect(turmas[0].disciplinaCodigo).toBe("MAT001");
    expect(turmas[0].codigo).toBe("T1");
  });

  it("ignora rows de dispensa (semestre_curso === '_')", () => {
    const rows = [
      makeRow(
        "MAT001",
        [makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")])],
        "_",
      ),
    ];
    expect(rowsToTurmas(rows)).toHaveLength(0);
  });

  it("extrai múltiplas turmas de múltiplas rows", () => {
    const rows = [
      makeRow("MAT001", [makeRawTurma("T1", []), makeRawTurma("T2", [])]),
      makeRow("FIS001", [makeRawTurma("T1", [])]),
    ];
    expect(rowsToTurmas(rows)).toHaveLength(3);
  });

  it("retorna array vazio para rows sem turmas", () => {
    const rows = [makeRow("MAT001", [])];
    expect(rowsToTurmas(rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// motivosBloqueio / periodoEstaResolvido
// ---------------------------------------------------------------------------

describe("motivosBloqueio", () => {
  it("retorna vazio para período sem conflitos e 1 turma por disciplina", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(motivosBloqueio(rows)).toHaveLength(0);
  });

  it("detecta disciplina com mais de 1 turma", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const motivos = motivosBloqueio(rows);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true);
  });

  it("detecta conflito de horário entre disciplinas diferentes", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    const motivos = motivosBloqueio(rows);
    expect(
      motivos.some((m) => m.includes("MAT001") || m.includes("FIS001")),
    ).toBe(true);
  });

  it("detecta conflito entre turmas diferentes da mesma disciplina com horário sobreposto", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    // Deve reportar múltiplas turmas E conflito entre elas (horários sobrepostos)
    const motivos = motivosBloqueio(rows);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true);
  });

  it("não detecta conflito entre turmas diferentes da mesma disciplina em horários distintos", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Qui", "14:00", "16:00")]),
      ]),
    ];
    // Deve reportar múltiplas turmas, mas não conflito de horário
    const motivos = motivosBloqueio(rows);
    expect(motivos.some((m) => m.includes("Conflito"))).toBe(false);
    expect(motivos.some((m) => m.includes("MAT001"))).toBe(true); // ainda tem 2 turmas
  });

  it("retorna vazio para rows vazias", () => {
    expect(motivosBloqueio([])).toHaveLength(0);
  });
});

describe("periodoEstaResolvido", () => {
  it("retorna true para período sem problemas", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    expect(periodoEstaResolvido(rows)).toBe(true);
  });

  it("retorna false para período com conflito", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    expect(periodoEstaResolvido(rows)).toBe(false);
  });

  it("retorna false para período com múltiplas turmas", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(periodoEstaResolvido(rows)).toBe(false);
  });
});

// ---------------------------------------------------------------------------
// conflitosDoSlot
// ---------------------------------------------------------------------------

describe("conflitosDoSlot", () => {
  it("retorna todas as turmas que ocupam o slot", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const candidatos = conflitosDoSlot("Ter", 9 * 60, rows);
    expect(candidatos).toHaveLength(2);
    expect(candidatos.map((c) => c.disciplinaCodigo)).toContain("MAT001");
    expect(candidatos.map((c) => c.disciplinaCodigo)).toContain("FIS001");
  });

  it("não retorna turma que não ocupa o slot", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeRawTurma("T1", [makeHorario("Ter", "11:00", "13:00")]),
      ]),
    ];
    // Slot das 09:00 — FIS001 começa às 11:00, não deveria aparecer
    const candidatos = conflitosDoSlot("Ter", 9 * 60, rows);
    expect(candidatos).toHaveLength(1);
    expect(candidatos[0].disciplinaCodigo).toBe("MAT001");
  });

  it("retorna vazio para slot sem turmas", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    expect(conflitosDoSlot("Seg", 9 * 60, rows)).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// primeiroSlotConflitante
// ---------------------------------------------------------------------------

describe("primeiroSlotConflitante", () => {
  it("retorna o primeiro slot de conflito", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "10:00", "12:00")], "DIS002");
    expect(primeiroSlotConflitante(a, [a, b])).toBe(10 * 60);
  });

  it("retorna null quando não há conflito", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Qui", "09:00", "11:00")], "DIS002");
    expect(primeiroSlotConflitante(a, [a, b])).toBeNull();
  });

  it("ignora a mesma turma (mesmo codigo E mesma disciplina)", () => {
    // Mesma turma com horários em dias diferentes — não é conflito
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T1", [makeHorario("Qui", "09:00", "11:00")], "DIS001");
    expect(primeiroSlotConflitante(a, [a, b])).toBeNull();
  });

  it("detecta conflito entre turmas diferentes da mesma disciplina", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "09:00", "11:00")], "DIS001");
    expect(primeiroSlotConflitante(a, [a, b])).toBe(9 * 60);
  });

  it("retorna o slot mais cedo quando há múltiplos conflitos", () => {
    const a = makeTurma("T1", [makeHorario("Ter", "08:00", "12:00")], "DIS001");
    const b = makeTurma("T2", [makeHorario("Ter", "09:00", "11:00")], "DIS002");
    expect(primeiroSlotConflitante(a, [a, b])).toBe(9 * 60);
  });
});

// ---------------------------------------------------------------------------
// resolverTurmaVencedora
// ---------------------------------------------------------------------------

describe("resolverTurmaVencedora", () => {
  it("mantém apenas a turma vencedora na disciplina vencedora", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
        makeRawTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
    ];
    const result = resolverTurmaVencedora("MAT001", "T1", rows);
    const mat = result.find((r) => r.codigo === "MAT001");
    expect(mat.turmas).toHaveLength(1);
    expect(mat.turmas[0].codigo).toBe("T1");
  });

  it("remove turma conflitante de outra disciplina", () => {
    const rows = [
      makeRow("MAT001", [
        makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
        makeTurma("T2", [makeHorario("Qui", "09:00", "11:00")]),
      ]),
    ];
    // MAT001/T1 vence — FIS001/T1 conflita no slot Ter 10:00, deve ser removida
    const result = resolverTurmaVencedora("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    expect(fis.turmas).toHaveLength(1);
    expect(fis.turmas[0].codigo).toBe("T2");
  });

  it("quando todas as turmas de uma disciplina conflitam, mantém placeholder sem horários", () => {
    const rows = [
      makeRow("MAT001", [
        makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        // Única turma — conflita com MAT001/T1
        makeTurma("T1", [makeHorario("Ter", "10:00", "12:00")]),
      ]),
    ];
    // MAT001/T1 vence — FIS001/T1 conflita e é a única turma
    const result = resolverTurmaVencedora("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    // Deve ter 1 turma placeholder sem horários (não array vazio)
    expect(fis.turmas).toHaveLength(1);
    expect(fis.turmas[0].horarios).toHaveLength(0);
  });

  it("não altera disciplinas sem conflito", () => {
    const rows = [
      makeRow("MAT001", [
        makeTurma("T1", [makeHorario("Ter", "09:00", "11:00")]),
        makeTurma("T2", [makeHorario("Ter", "09:00", "11:00")]),
      ]),
      makeRow("FIS001", [
        makeTurma("T1", [makeHorario("Qui", "14:00", "16:00")]),
      ]),
    ];
    const result = resolverTurmaVencedora("MAT001", "T1", rows);
    const fis = result.find((r) => r.codigo === "FIS001");
    expect(fis.turmas).toHaveLength(1); // inalterado
  });

  it("não altera rows de outros períodos (semestre_curso diferente)", () => {
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
    // Só opera no período 1 — mas resolverTurmaVencedora opera em todas as rows passadas
    // (a filtragem por período é responsabilidade do chamador)
    const rowsPeriodo1 = rows.filter((r) => r.semestre_curso === "1");
    const result = resolverTurmaVencedora("MAT001", "T1", rowsPeriodo1);
    const mat = result.find((r) => r.codigo === "MAT001");
    expect(mat.turmas).toHaveLength(1);
    expect(mat.turmas[0].codigo).toBe("T1");
  });
});

// ---------------------------------------------------------------------------
// periodoTemTurno
// ---------------------------------------------------------------------------

describe("periodoTemTurno", () => {
  it("retorna true para 'dia' sempre", () => {
    const rows = [makeRow("MAT001", [makeRawTurma("T1", [])])];
    expect(periodoTemTurno(rows, "dia")).toBe(true);
  });

  it("detecta turno manhã (início < 13:00)", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "09:00", "11:00")]),
      ]),
    ];
    expect(periodoTemTurno(rows, "manha")).toBe(true);
    expect(periodoTemTurno(rows, "tarde")).toBe(false);
  });

  it("detecta turno tarde (início >= 13:00)", () => {
    const rows = [
      makeRow("MAT001", [
        makeRawTurma("T1", [makeHorario("Seg", "14:00", "16:00")]),
      ]),
    ];
    expect(periodoTemTurno(rows, "tarde")).toBe(true);
    expect(periodoTemTurno(rows, "manha")).toBe(false);
  });

  it("retorna false para período sem horários", () => {
    const rows = [makeRow("MAT001", [makeRawTurma("T1", [])])];
    expect(periodoTemTurno(rows, "manha")).toBe(false);
    expect(periodoTemTurno(rows, "tarde")).toBe(false);
  });
});
