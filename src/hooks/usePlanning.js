import { useState, useCallback } from "react";

/**
 * Storage layout:
 *   ppc_alunos       -> { [nome]: { aluno: string, rows: PlanningRow[], turno: string, entryTerm: number } }
 *   ppc_aluno_ativo  -> string (name of the currently selected student)
 */

const DEFAULT_TURNO = "dia";
const DEFAULT_SEMESTRE_INGRESSO = 1;

const KEY_ALUNOS = "ppc_alunos";
const KEY_ATIVO = "ppc_aluno_ativo";

// ---------------------------------------------------------------------------
// Storage helpers
// ---------------------------------------------------------------------------

function readAllAlunos() {
  try {
    const raw = localStorage.getItem(KEY_ALUNOS);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
      return {};
    // ensure minimum shape per student
    const out = {};
    for (const [nome, v] of Object.entries(parsed)) {
      if (!nome) continue;
      out[nome] = {
        aluno: String(v?.aluno ?? nome),
        rows: Array.isArray(v?.rows) ? v.rows : [],
        turno: String(v?.turno ?? DEFAULT_TURNO),
        entryTerm: Number(
          v?.entryTerm ?? DEFAULT_SEMESTRE_INGRESSO,
        ),
      };
    }
    return out;
  } catch {
    return {};
  }
}

function writeAllAlunos(alunos) {
  try {
    localStorage.setItem(KEY_ALUNOS, JSON.stringify(alunos));
  } catch {
    // quota exceeded ou modo privado — falha silenciosa
  }
}

function readAlunoAtivo() {
  try {
    return localStorage.getItem(KEY_ATIVO) ?? "";
  } catch {
    return "";
  }
}

function writeAlunoAtivo(nome) {
  try {
    if (nome) {
      localStorage.setItem(KEY_ATIVO, nome);
    } else {
      localStorage.removeItem(KEY_ATIVO);
    }
  } catch {
    // silent failure
  }
}

function emptyPlanning(nome) {
  return {
    aluno: nome,
    rows: [],
    turno: DEFAULT_TURNO,
    entryTerm: DEFAULT_SEMESTRE_INGRESSO,
  };
}

// ---------------------------------------------------------------------------
// Hook
// ---------------------------------------------------------------------------

/**
 * Manages multiple student planning profiles in localStorage.
 *
 * API:
 *   alunos               -> string[]  (registered names, sorted)
 *   alunoAtivo           -> string    (selected student name, "" if none)
 *   planning             -> { aluno, rows, turno, entryTerm } for active student (null if none)
 *
 *   selectAluno(nome)    -> select existing student as active
 *   createAluno(nome)    -> create new student and select them; returns { ok, error }
 *   cloneAluno(nome, novoNome) -> clone a student's planning under a new name; returns { ok, error }
 *   exportAluno(nome)    -> JSON string of a student's planning (for download)
 *   importAluno(nome, str) -> import JSON into existing or new student; returns { ok, error }
 *   deleteAluno(nome)    -> remove student from storage
 *   logout()             -> deselect active student (returns to profile selection)
 *
 *   setRows(rows)                        -> replace rows for active student
 *   upsertRows(fn)                       -> apply fn(currentRows) => newRows without stale closure
 *   withCurrentRows(fn)                  -> call fn(currentRows) without mutating state (atomic read)
 *   setTurno(turno)                      -> persist shift preference for active student
 *   setSemestreIngresso(si)              -> persist enrollment semester for active student
 *   clearSemestreIngresso()              -> clear enrollment semester (when deleting 1st period)
 *   setRowsAndTurno(rows, turno, si?)    -> atomically replace rows, turno, and optionally entryTerm
 *   exportJson()                         -> JSON string of active student's planning
 *   importJson(str)                      -> import JSON into active student; returns { ok, error }
 *   resetPlanning()                      -> clear rows for active student (keeps profile)
 */
export function usePlanning() {
  const [alunos, setAlunosState] = useState(() => readAllAlunos());
  const [alunoAtivo, setAlunoAtivoState] = useState(() => readAlunoAtivo());

  const planning = alunoAtivo && alunos[alunoAtivo] ? alunos[alunoAtivo] : null;

  // Persist the full map and update state
  const persistAlunos = useCallback((next) => {
    writeAllAlunos(next);
    setAlunosState(next);
  }, []);

  // ---------------------------------------------------------------------------
  // Student selection / creation / removal
  // ---------------------------------------------------------------------------

  const selectAluno = useCallback(
    (nome) => {
      const trimmed = String(nome ?? "").trim();
      if (!trimmed || !alunos[trimmed]) return;
      writeAlunoAtivo(trimmed);
      setAlunoAtivoState(trimmed);
    },
    [alunos],
  );

  const createAluno = useCallback(
    (nome) => {
      const trimmed = String(nome ?? "").trim();
      if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };
      if (alunos[trimmed])
        return { ok: false, error: "Já existe um aluno com esse nome." };

      const next = { ...alunos, [trimmed]: emptyPlanning(trimmed) };
      persistAlunos(next);
      writeAlunoAtivo(trimmed);
      setAlunoAtivoState(trimmed);
      return { ok: true, error: null };
    },
    [alunos, persistAlunos],
  );

  const cloneAluno = useCallback(
    (nome, novoNome) => {
      const trimmed = String(novoNome ?? "").trim();
      if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };
      if (alunos[trimmed])
        return { ok: false, error: "Já existe um aluno com esse nome." };
      if (!alunos[nome])
        return { ok: false, error: "Aluno de origem não encontrado." };

      const cloned = { ...alunos[nome], aluno: trimmed };
      const next = { ...alunos, [trimmed]: cloned };
      persistAlunos(next);
      writeAlunoAtivo(trimmed);
      setAlunoAtivoState(trimmed);
      return { ok: true, error: null };
    },
    [alunos, persistAlunos],
  );

  const exportAluno = useCallback(
    (nome) => {
      const data = alunos[nome];
      if (!data) return null;
      return JSON.stringify({ aluno: data.aluno, rows: data.rows }, null, 2);
    },
    [alunos],
  );

  const importAluno = useCallback(
    (nome, str) => {
      try {
        const parsed = JSON.parse(str);
        if (!parsed || typeof parsed !== "object") {
          return { ok: false, error: "JSON inválido: não é um objeto." };
        }
        if (!Array.isArray(parsed.rows)) {
          return {
            ok: false,
            error: 'JSON inválido: campo "rows" ausente ou não é array.',
          };
        }
        const trimmed = String(nome ?? "").trim();
        if (!trimmed) return { ok: false, error: "Nome não pode ser vazio." };

        const existing = alunos[trimmed] ?? {
          aluno: trimmed,
          rows: [],
          turno: "dia",
          entryTerm: 1,
        };
        const next = {
          ...alunos,
          [trimmed]: { ...existing, aluno: trimmed, rows: parsed.rows },
        };
        persistAlunos(next);
        writeAlunoAtivo(trimmed);
        setAlunoAtivoState(trimmed);
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: `Erro ao parsear JSON: ${e?.message ?? e}` };
      }
    },
    [alunos, persistAlunos],
  );

  const deleteAluno = useCallback(
    (nome) => {
      const trimmed = String(nome ?? "").trim();
      if (!trimmed || !alunos[trimmed]) return;
      const next = { ...alunos };
      delete next[trimmed];
      persistAlunos(next);
      // if it was the active student, log out
      if (alunoAtivo === trimmed) {
        writeAlunoAtivo("");
        setAlunoAtivoState("");
      }
    },
    [alunos, alunoAtivo, persistAlunos],
  );

  const logout = useCallback(() => {
    writeAlunoAtivo("");
    setAlunoAtivoState("");
  }, []);

  // ---------------------------------------------------------------------------
  // Operations on the active student's planning
  // ---------------------------------------------------------------------------

  const setRows = useCallback(
    (rows) => {
      if (!alunoAtivo) return;
      // Read alunos from the latest state via functional setAlunosState
      // to avoid stale closure when multiple operations occur in sequence.
      setAlunosState((currentAlunos) => {
        const next = {
          ...currentAlunos,
          [alunoAtivo]: {
            ...currentAlunos[alunoAtivo],
            rows: Array.isArray(rows) ? rows : [],
          },
        };
        writeAllAlunos(next);
        return next;
      });
    },
    [alunoAtivo],
  );

  const setSemestreIngresso = useCallback(
    (entryTerm) => {
      if (!alunoAtivo) return;
      setAlunosState((currentAlunos) => {
        const next = {
          ...currentAlunos,
          [alunoAtivo]: {
            ...currentAlunos[alunoAtivo],
            entryTerm: Number(
              entryTerm ?? DEFAULT_SEMESTRE_INGRESSO,
            ),
          },
        };
        writeAllAlunos(next);
        return next;
      });
    },
    [alunoAtivo],
  );

  const setTurno = useCallback(
    (turno) => {
      if (!alunoAtivo) return;
      const next = {
        ...alunos,
        [alunoAtivo]: {
          ...alunos[alunoAtivo],
          turno: String(turno ?? DEFAULT_TURNO),
        },
      };
      persistAlunos(next);
    },
    [alunos, alunoAtivo, persistAlunos],
  );

  const upsertRows = useCallback(
    (fn) => {
      if (!alunoAtivo) return;
      setAlunosState((currentAlunos) => {
        const currentRows = currentAlunos[alunoAtivo]?.rows ?? [];
        const newRows = fn(currentRows);
        const next = {
          ...currentAlunos,
          [alunoAtivo]: {
            ...currentAlunos[alunoAtivo],
            rows: newRows,
          },
        };
        writeAllAlunos(next);
        return next;
      });
    },
    [alunoAtivo],
  );

  const withCurrentRows = useCallback(
    (fn) => {
      if (!alunoAtivo) return;
      // Read directly from localStorage — always the latest value,
      // without depending on React state (avoids stale closure and render side effects).
      const currentAlunos = readAllAlunos();
      const currentRows = currentAlunos[alunoAtivo]?.rows ?? [];
      fn(currentRows);
    },
    [alunoAtivo],
  );

  const clearSemestreIngresso = useCallback(() => {
    if (!alunoAtivo) return;
    setAlunosState((currentAlunos) => {
      const next = {
        ...currentAlunos,
        [alunoAtivo]: {
          ...currentAlunos[alunoAtivo],
          entryTerm: DEFAULT_SEMESTRE_INGRESSO,
        },
      };
      writeAllAlunos(next);
      return next;
    });
  }, [alunoAtivo]);

  const setRowsAndTurno = useCallback(
    (rows, turno, si = null) => {
      if (!alunoAtivo) return;
      setAlunosState((currentAlunos) => {
        const current = currentAlunos[alunoAtivo] ?? {};
        const next = {
          ...currentAlunos,
          [alunoAtivo]: {
            ...current,
            rows: Array.isArray(rows) ? rows : [],
            turno: String(turno ?? DEFAULT_TURNO),
            ...(si !== null ? { entryTerm: Number(si) } : {}),
          },
        };
        writeAllAlunos(next);
        return next;
      });
    },
    [alunoAtivo],
  );

  const exportJson = useCallback(() => {
    if (!planning) return "{}";
    return JSON.stringify(
      { aluno: planning.aluno, rows: planning.rows },
      null,
      2,
    );
  }, [planning]);

  const importJson = useCallback(
    (str) => {
      if (!alunoAtivo) return { ok: false, error: "Nenhum aluno selecionado." };
      try {
        const parsed = JSON.parse(str);
        if (!parsed || typeof parsed !== "object") {
          return { ok: false, error: "JSON inválido: não é um objeto." };
        }
        if (!Array.isArray(parsed.rows)) {
          return {
            ok: false,
            error: 'JSON inválido: campo "rows" ausente ou não é array.',
          };
        }
        const next = {
          ...alunos,
          [alunoAtivo]: {
            aluno: alunoAtivo,
            rows: parsed.rows,
          },
        };
        persistAlunos(next);
        return { ok: true, error: null };
      } catch (e) {
        return { ok: false, error: `Erro ao parsear JSON: ${e?.message ?? e}` };
      }
    },
    [alunos, alunoAtivo, persistAlunos],
  );

  const resetPlanning = useCallback(() => {
    if (!alunoAtivo) return;
    const next = {
      ...alunos,
      [alunoAtivo]: emptyPlanning(alunoAtivo),
    };
    persistAlunos(next);
  }, [alunos, alunoAtivo, persistAlunos]);

  // ---------------------------------------------------------------------------
  // Return
  // ---------------------------------------------------------------------------

  return {
    // listing
    alunos: Object.keys(alunos).sort(),
    alunoAtivo,
    planning,

    // selection
    selectAluno,
    createAluno,
    cloneAluno,
    exportAluno,
    importAluno,
    deleteAluno,
    logout,

    // active student's planning
    setRows,
    upsertRows,
    withCurrentRows,
    setTurno,
    setSemestreIngresso,
    clearSemestreIngresso,
    setRowsAndTurno,
    exportJson,
    importJson,
    resetPlanning,
  };
}
