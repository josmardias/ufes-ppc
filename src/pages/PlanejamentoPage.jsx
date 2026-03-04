import { useState, useMemo, useEffect, useCallback } from "react";
import {
  gerarSemestre,
  upsertSemester,
  deleteSemester,
  groupUnique,
  inferNextSemester,
  calcDisponiveisParaAdicionar,
  enrichRowsWithOferta,
} from "../domain/planning.js";
import {
  motivosBloqueio,
  periodoTemConflitoDeHorario,
  todosConflitosDeHorario,
  conflitosDoSlot,
  resolverTurmaVencedora,
} from "../domain/calendar.js";
import { usePlanningContext } from "../App.jsx";
import ppcJson from "../data/ppc-2022.json";
import ofertaS1Json from "../data/oferta-semestre-1.json";
import ofertaS2Json from "../data/oferta-semestre-2.json";
import WeekCalendar from "../components/WeekCalendar.jsx";

const ANO_INICIO = 2024;
const SC_INICIO = 1;

const TURNO_OPCOES = [
  { id: "manha", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
  { id: "dia", label: "Dia inteiro" },
];

function ModalPrimeiroperiodo({ onConfirm }) {
  const [so, setSo] = useState(null); // semestre oferta de ingresso: 1 | 2

  const pronto = so !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Primeiro período
          </h3>
          <p className="text-sm text-gray-500">
            Algumas perguntas para começar.
          </p>
        </div>

        {/* Semestre de ingresso */}
        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Semestre de ingresso
          </p>
          <div className="flex gap-2">
            {[
              { n: 1, exemplo: "ex: 2025/1" },
              { n: 2, exemplo: "ex: 2025/2" },
            ].map(({ n, exemplo }) => (
              <button
                key={n}
                onClick={() => setSo(n)}
                className={[
                  "flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer",
                  so === n
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50",
                ].join(" ")}
              >
                {n}º semestre
                <span
                  className={`block text-xs font-normal mt-0.5 ${so === n ? "text-blue-400" : "text-gray-400"}`}
                >
                  {exemplo}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!pronto}
          onClick={() => onConfirm(so)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
        >
          Gerar 1º período
        </button>
      </div>
    </div>
  );
}

function Badge({ children, color = "gray" }) {
  const colors = {
    gray: "bg-gray-100 text-gray-600",
    blue: "bg-blue-100 text-blue-700",
  };
  return (
    <span
      className={`inline-block text-xs font-medium px-2 py-0.5 rounded-full ${colors[color]}`}
    >
      {children}
    </span>
  );
}

function ModalAdicionarDisciplinas({
  disponiveis,
  semestreCurso,
  turmasJaNoPeriodo,
  onConfirm,
  onCancel,
}) {
  const [selecionados, setSelecionados] = useState(new Set());
  const [turno, setTurno] = useState("dia");

  function toggle(codigo) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 mb-0.5">
            Adicionar disciplinas
          </h3>
          <p className="text-sm text-gray-500">
            Disciplinas disponíveis para o {semestreCurso}º período. Selecione
            as que deseja adicionar.
          </p>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {disponiveis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível para adicionar.
            </p>
          ) : (
            disponiveis.map((r) => {
              const checked = selecionados.has(r.codigo);
              const allTurmas = Array.isArray(r.turmas) ? r.turmas : [];
              // Verifica se há turmas disponíveis no turno selecionado
              const CUTOFF_ADICIONAR = 13 * 60;
              const temTurmaNoTurno =
                turno === "dia"
                  ? true
                  : allTurmas.some((t) =>
                      (Array.isArray(t.horarios) ? t.horarios : []).some(
                        (h) => {
                          const hh = parseInt(h.inicio?.split(":")[0] ?? "0");
                          const minutos = hh * 60;
                          return turno === "manha"
                            ? minutos < CUTOFF_ADICIONAR
                            : minutos >= CUTOFF_ADICIONAR;
                        },
                      ),
                    );
              const semTurmaNoTurno = !temTurmaNoTurno && turno !== "dia";
              // Turmas já presentes no período para esta disciplina
              const jaExistentes = new Set(
                (turmasJaNoPeriodo?.[r.codigo] ?? []).map((t) =>
                  String(t?.codigo ?? "").trim(),
                ),
              );
              // Mostra todas as turmas, indicando quais já existem
              const turmas = allTurmas.map((t) => ({
                ...t,
                jaExiste: jaExistentes.has(String(t?.codigo ?? "").trim()),
              }));
              const temNovas = turmas.some((t) => !t.jaExiste);
              return (
                <label
                  key={r.codigo}
                  className={[
                    "flex items-start gap-3 px-2 py-2.5 rounded-lg border-b border-gray-50 last:border-0",
                    semTurmaNoTurno
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-gray-50 cursor-pointer",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(r.codigo)}
                    disabled={
                      (!temNovas && jaExistentes.size > 0) || semTurmaNoTurno
                    }
                    className="mt-1 accent-blue-600 w-4 h-4 flex-shrink-0 cursor-pointer disabled:opacity-40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {r.nome || r.codigo}
                      </p>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                        {r.codigo}
                      </span>
                      {semTurmaNoTurno && (
                        <span className="text-xs text-gray-400">
                          sem turma no turno da{" "}
                          {turno === "manha" ? "manhã" : "tarde"}
                        </span>
                      )}
                    </div>
                    {turmas.length > 0 && (
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        {turmas.map((t, i) => {
                          const horarios = Array.isArray(t.horarios)
                            ? t.horarios
                            : [];
                          return (
                            <div
                              key={i}
                              className={`flex flex-wrap gap-x-2 text-xs ${t.jaExiste ? "text-gray-300 line-through" : "text-gray-400"}`}
                            >
                              {t.codigo && (
                                <span
                                  className={`font-medium ${t.jaExiste ? "text-gray-300" : "text-gray-500"}`}
                                >
                                  {t.codigo}
                                  {t.jaExiste && " (já na grade)"}
                                </span>
                              )}
                              {horarios.map((h, j) => (
                                <span key={j}>
                                  {h.dia} {h.inicio}–{h.fim}
                                </span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={() =>
              onConfirm(disponiveis.filter((r) => selecionados.has(r.codigo)))
            }
            disabled={selecionados.size === 0}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Adicionar {selecionados.size > 0 ? selecionados.size : ""}{" "}
            disciplina{selecionados.size !== 1 ? "s" : ""}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalRemoverDisciplina({
  disciplinaCodigo,
  disciplinaNome,
  onConfirm,
  onFechar,
}) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onFechar}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 mb-1">
          Remover disciplina
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Remover{" "}
          <span className="font-semibold text-gray-700">
            {disciplinaNome || disciplinaCodigo}
          </span>{" "}
          <span className="font-mono text-xs text-gray-400">
            ({disciplinaCodigo})
          </span>{" "}
          deste período?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Remover
          </button>
          <button
            onClick={onFechar}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 hover:border-gray-400 text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalEscolherTurma({ row, onEscolher, onFechar }) {
  const [pendente, setPendente] = useState(row._pendenteInicial ?? null);
  const turmas = Array.isArray(row.turmas) ? row.turmas : [];

  function handleClick(turmaCodigo) {
    if (pendente === turmaCodigo) {
      onEscolher(row.codigo, turmaCodigo);
    } else {
      setPendente(turmaCodigo);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onFechar}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 mb-0.5">
          Escolher turma
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          <span className="font-mono">{row.codigo}</span> — {row.nome}
        </p>
        <div className="flex flex-col gap-2">
          {turmas.map((t) => {
            const isPendente = pendente === t.codigo;
            const horarios = Array.isArray(t.horarios) ? t.horarios : [];
            return (
              <button
                key={t.codigo}
                onClick={() => handleClick(t.codigo)}
                className={[
                  "w-full text-left px-4 py-3 rounded-xl border-2 transition-colors cursor-pointer",
                  isPendente
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-400 hover:bg-blue-50",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2">
                  <span
                    className={`text-sm font-semibold ${isPendente ? "text-blue-700" : "text-gray-800"}`}
                  >
                    Turma {t.codigo}
                  </span>
                  {isPendente && (
                    <span className="text-xs font-semibold text-blue-600">
                      Clique para confirmar
                    </span>
                  )}
                </div>
                {t.docente && (
                  <p className="text-xs text-gray-400 mt-0.5">{t.docente}</p>
                )}
                {horarios.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 mt-0.5">
                    {horarios.map((h, i) => (
                      <span key={i} className="text-xs text-gray-400">
                        {h.dia} {h.inicio}–{h.fim}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onFechar}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function DisciplinaCard({ row }) {
  const turmas = Array.isArray(row.turmas) ? row.turmas : [];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-gray-400">{row.codigo}</span>
          <p className="font-medium text-gray-900 text-sm leading-snug">
            {row.nome || "—"}
          </p>
        </div>
        <div className="flex gap-1 flex-shrink-0">
          {row.periodo && <Badge color="blue">P{row.periodo}</Badge>}
          {row.carga_horaria && (
            <Badge color="gray">{row.carga_horaria}h</Badge>
          )}
        </div>
      </div>

      {turmas.length > 0 && (
        <div className="flex flex-col gap-1">
          {turmas.map((t, i) => {
            const horarios = Array.isArray(t.horarios) ? t.horarios : [];
            return (
              <div
                key={i}
                className="text-xs text-gray-500 flex flex-wrap gap-x-3 gap-y-0.5"
              >
                {t.codigo && (
                  <span className="font-medium text-gray-700">
                    Turma {t.codigo}
                  </span>
                )}
                {t.docente && <span>{t.docente}</span>}
                {horarios.map((h, j) => (
                  <span key={j}>
                    {h.dia} {h.inicio}–{h.fim}
                  </span>
                ))}
              </div>
            );
          })}
        </div>
      )}

      {row.pre_requisitos?.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {row.pre_requisitos.map((r) => (
            <span
              key={r}
              className="text-xs bg-orange-50 text-orange-600 border border-orange-200 rounded px-1.5 py-0.5"
            >
              pré: {r}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

function ModalConfirmarPeriodo({
  newRows,
  semestreCurso,
  semestreOferta,
  turnoInicial,
  ofertaS1,
  ofertaS2,
  onConfirm,
  onCancel,
}) {
  const CUTOFF = 13 * 60;

  // Busca turmas de uma disciplina na oferta correta para este período
  function getTurmasDisciplina(codigo) {
    const turmas = [];
    const seen = new Set();
    // Usa só a oferta do semestreOferta deste período, não ambas
    const ofertaCorreta = semestreOferta === 1 ? ofertaS1 : ofertaS2;
    for (const oferta of [ofertaCorreta]) {
      const d = (oferta?.disciplinas ?? []).find((d) => d.codigo === codigo);
      for (const t of d?.turmas ?? []) {
        const key = String(t?.turma ?? t?.codigo ?? "").trim();
        if (key && seen.has(key)) continue;
        if (key) seen.add(key);
        turmas.push({
          codigo: key,
          docente: String(t?.docente ?? "").trim(),
          horarios: (Array.isArray(t?.horarios) ? t.horarios : []).map((h) => ({
            dia: String(h?.dia ?? "").trim(),
            inicio: String(h?.inicio ?? "").trim(),
            fim: String(h?.fim ?? "").trim(),
          })),
        });
      }
    }
    return turmas;
  }

  function turmaNoTurno(turma, t) {
    if (t === "dia") return true;
    return (turma.horarios ?? []).some((h) => {
      const mins = parseInt(h.inicio?.split(":")[0] ?? "0") * 60;
      return t === "manha" ? mins < CUTOFF : mins >= CUTOFF;
    });
  }

  function disciplinaVisivel(r, t) {
    if (t === "dia") return true;
    const turmas = getTurmasDisciplina(r.codigo);
    return turmas.some((turma) => turmaNoTurno(turma, t));
  }

  const [turno, setTurno] = useState(turnoInicial ?? "dia");

  // Ao mudar turno: seleciona todas as visíveis
  const rowsVisiveis = newRows.filter((r) => disciplinaVisivel(r, turno));

  const [selecionados, setSelecionados] = useState(
    () => new Set(rowsVisiveis.map((r) => r.codigo)),
  );

  function handleTurnoChange(novoTurno) {
    setTurno(novoTurno);
    // Seleciona todas as disciplinas visíveis no novo turno
    const visiveis = newRows.filter((r) => disciplinaVisivel(r, novoTurno));
    setSelecionados(new Set(visiveis.map((r) => r.codigo)));
  }

  function toggleCodigo(codigo) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(codigo)) next.delete(codigo);
      else next.add(codigo);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === rowsVisiveis.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(rowsVisiveis.map((r) => r.codigo)));
    }
  }

  const todosSelecionados =
    rowsVisiveis.length > 0 && selecionados.size === rowsVisiveis.length;
  const algumSelecionado = selecionados.size > 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl w-full max-w-md mx-4 flex flex-col max-h-[80vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-6 pt-6 pb-4 border-b border-gray-100">
          <h3 className="text-base font-bold text-gray-900 mb-0.5">
            {semestreCurso}º período
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            {rowsVisiveis.length} disciplina
            {rowsVisiveis.length !== 1 ? "s" : ""} disponíve
            {rowsVisiveis.length !== 1 ? "is" : "l"} neste turno. Desmarque as
            que não deseja incluir.
          </p>
          {/* Turno */}
          <div className="flex items-center gap-2">
            <span className="text-xs font-medium text-gray-500">Turno:</span>
            <div className="flex rounded-lg border border-gray-300 overflow-hidden">
              {TURNO_OPCOES.map(({ id, label }) => {
                const count = newRows.filter((r) =>
                  disciplinaVisivel(r, id),
                ).length;
                return (
                  <button
                    key={id}
                    onClick={() => handleTurnoChange(id)}
                    className={[
                      "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex flex-col items-center leading-tight",
                      turno === id
                        ? "bg-blue-600 text-white"
                        : "bg-white text-gray-600 hover:bg-gray-50",
                    ].join(" ")}
                  >
                    <span>{label}</span>
                    <span
                      className={`text-xs ${turno === id ? "text-blue-200" : "text-gray-400"}`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        {/* Toggle todos */}
        <div className="px-6 py-2 border-b border-gray-100">
          <button
            onClick={toggleTodos}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {todosSelecionados ? "Desmarcar todas" : "Selecionar todas"}
          </button>
        </div>

        {/* Lista — só mostra disciplinas visíveis no turno */}
        <div className="overflow-y-auto flex-1 px-4 py-2">
          {rowsVisiveis.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível neste turno.
            </p>
          ) : (
            rowsVisiveis.map((r) => {
              const checked = selecionados.has(r.codigo);
              const turmas = getTurmasDisciplina(r.codigo);
              const multiplas = turmas.length > 1;
              return (
                <label
                  key={r.codigo}
                  className={[
                    "flex items-start gap-3 px-2 py-2.5 rounded-lg border-b border-gray-50 last:border-0 cursor-pointer",
                    multiplas
                      ? "bg-amber-50 border-amber-100 hover:bg-amber-100"
                      : "hover:bg-gray-50",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggleCodigo(r.codigo)}
                    className="mt-1 accent-blue-600 w-4 h-4 flex-shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {r.nome || r.codigo}
                      </p>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                        {r.codigo}
                      </span>
                      {multiplas && (
                        <span className="text-xs font-semibold text-amber-600 flex-shrink-0">
                          {turmas.length} turmas
                        </span>
                      )}
                    </div>
                    {turmas.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {turmas.map((t, i) => {
                          const horarios = Array.isArray(t.horarios)
                            ? t.horarios
                            : [];
                          const destaque =
                            turno === "dia" || turmaNoTurno(t, turno);
                          return (
                            <div
                              key={i}
                              className={`flex flex-wrap gap-x-2 text-xs ${destaque ? "text-gray-500" : "text-gray-300"}`}
                            >
                              {t.codigo && (
                                <span
                                  className={`font-medium ${destaque ? "text-gray-600" : "text-gray-300"}`}
                                >
                                  {t.codigo}
                                </span>
                              )}
                              {horarios.map((h, j) => (
                                <span key={j}>
                                  {h.dia} {h.inicio}–{h.fim}
                                </span>
                              ))}
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </label>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-gray-100 flex gap-2">
          <button
            onClick={() =>
              onConfirm(
                rowsVisiveis.filter((r) => selecionados.has(r.codigo)),
                turno,
              )
            }
            disabled={!algumSelecionado}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Adicionar {selecionados.size} disciplina
            {selecionados.size !== 1 ? "s" : ""}
          </button>
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-sm text-gray-500 hover:text-gray-700 cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}

function ModalResolverConflito({
  dia,
  horaInicio,
  candidatos,
  pendenteInicial,
  onEscolher,
  onFechar,
}) {
  const [pendente, setPendente] = useState(pendenteInicial ?? null);
  const horaLabel = `${String(Math.floor(horaInicio / 60)).padStart(2, "0")}:00`;

  function handleClick(c) {
    const key = `${c.disciplinaCodigo}-${c.turmaCodigo}`;
    const pendenteKey = pendente
      ? `${pendente.disciplinaCodigo}-${pendente.turmaCodigo}`
      : null;

    if (pendenteKey === key) {
      onEscolher(c.disciplinaCodigo, c.turmaCodigo);
    } else {
      setPendente(c);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onFechar}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 mb-1">
          Resolver conflito
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {dia} {horaLabel} — escolha a turma vencedora. As demais serão
          removidas deste slot.
        </p>
        <div className="flex flex-col gap-2">
          {candidatos.map((c) => {
            const key = `${c.disciplinaCodigo}-${c.turmaCodigo}`;
            const isPendente =
              pendente &&
              `${pendente.disciplinaCodigo}-${pendente.turmaCodigo}` === key;
            return (
              <button
                key={key}
                onClick={() => handleClick(c)}
                className={[
                  "w-full text-left px-4 py-3 rounded-xl border-2 transition-colors cursor-pointer",
                  isPendente
                    ? "border-blue-500 bg-blue-50"
                    : "border-gray-200 hover:border-blue-400 hover:bg-blue-50",
                ].join(" ")}
              >
                <div className="flex items-baseline justify-between gap-2 mb-1">
                  <div className="flex items-baseline gap-2">
                    <span className="font-semibold text-sm text-gray-800">
                      {c.disciplinaCodigo}
                    </span>
                    {c.turmaCodigo && (
                      <span className="text-xs text-gray-500">
                        Turma {c.turmaCodigo}
                      </span>
                    )}
                  </div>
                  {isPendente && (
                    <span className="text-xs font-semibold text-blue-600">
                      Clique para confirmar
                    </span>
                  )}
                </div>
                {c.horarios?.length > 0 && (
                  <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                    {c.horarios.map((h, i) => (
                      <span key={i} className="text-xs text-gray-400">
                        {h.dia} {h.inicio}–{h.fim}
                      </span>
                    ))}
                  </div>
                )}
              </button>
            );
          })}
        </div>
        <button
          onClick={onFechar}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}

function CollapsibleBanner({ color, title, children }) {
  const [open, setOpen] = useState(false);
  const colors = {
    red: {
      wrapper: "bg-red-50 border-red-200 text-red-800",
      button: "hover:bg-red-100",
    },
    amber: {
      wrapper: "bg-amber-50 border-amber-200 text-amber-800",
      button: "hover:bg-amber-100",
    },
  };
  const c = colors[color] ?? colors.amber;
  return (
    <div className={`mb-4 border rounded-lg text-sm ${c.wrapper}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 font-semibold cursor-pointer rounded-lg transition-colors ${c.button}`}
      >
        <span>{title}</span>
        <span className="text-xs opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}

function SemestreView({
  rows,
  onResolverConflito,
  onEscolherTurma,
  onRemoverDisciplina,
  focusedTurmas,
  turno,
}) {
  const [view, setView] = useState("calendar");

  return (
    <div>
      {/* Toggle calendário / cards */}
      <div className="flex gap-1 mb-4 items-center">
        {[
          { id: "calendar", label: "📅 Calendário" },
          { id: "cards", label: "📋 Cards" },
        ].map((v) => (
          <button
            key={v.id}
            onClick={() => setView(v.id)}
            className={[
              "px-3 py-1 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
              view === v.id
                ? "bg-gray-800 text-white border-gray-800"
                : "bg-white text-gray-500 border-gray-300 hover:border-gray-400",
            ].join(" ")}
          >
            {v.label}
          </button>
        ))}
      </div>

      {view === "calendar" ? (
        <WeekCalendar
          rows={rows}
          onConflictClick={onResolverConflito}
          onMultiTurmaClick={onEscolherTurma}
          onRemoverClick={onRemoverDisciplina}
          focusedTurmas={focusedTurmas}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {rows.map((r) => (
            <DisciplinaCard key={r.codigo} row={r} />
          ))}
        </div>
      )}
    </div>
  );
}

export default function PlanejamentoPage() {
  const {
    planning,
    setRows,
    upsertRows,
    withCurrentRows,
    setTurno,
    setSemestreIngresso,
    clearSemestreIngresso,
    setRowsAndTurno,
  } = usePlanningContext();

  // Default de turno baseado no semestre de ingresso:
  // 1º semestre → manhã, 2º semestre → tarde, sem ingresso → dia
  const defaultTurno =
    planning?.semestreIngresso === 1
      ? "manha"
      : planning?.semestreIngresso === 2
        ? "tarde"
        : "dia";
  const turno = planning?.turno ?? defaultTurno;
  const [activeTab, setActiveTab] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflito, setConflito] = useState(null); // { dia, horaInicio, candidatos, rawRows }
  const [pendingPeriodo, setPendingPeriodo] = useState(null); // { newRows, semestreCurso, semestreOferta, isFirst, turnoVal }
  const [escolhendoTurma, setEscolhendoTurma] = useState(null); // row com múltiplas turmas
  const [adicionandoDisciplinas, setAdicionandoDisciplinas] = useState(false);
  const [removendoDisciplina, setRemovendoDisciplina] = useState(null); // { codigo, nome }

  const [askingSemestreIngresso, setAskingSemestreIngresso] = useState(false);
  const semestreIngresso = planning?.semestreIngresso ?? 1;
  const temSemestreIngresso =
    planning?.semestreIngresso != null &&
    planning.rows?.some((r) => String(r?.semestre_curso ?? "").trim() !== "_");

  const isFirstGeneration =
    (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() !== "_",
    ).length === 0;

  const next = inferNextSemester(
    planning?.rows ?? [],
    ANO_INICIO,
    SC_INICIO,
    semestreIngresso,
  );

  // Agrupa rows por semestre_curso
  const { grouped, sortedKeys, lastNumericSc } = useMemo(() => {
    const grouped = new Map();
    for (const r of planning?.rows ?? []) {
      const sc = String(r?.semestre_curso ?? "");
      if (!grouped.has(sc)) grouped.set(sc, []);
      grouped.get(sc).push(r);
    }
    const sortedKeys = Array.from(grouped.keys()).sort((a, b) => {
      if (a === "_" && b === "_") return 0;
      if (a === "_") return 1;
      if (b === "_") return -1;
      return Number(a) - Number(b);
    });
    const numericKeys = sortedKeys.filter((k) => k !== "_");
    const lastNumericSc = numericKeys.at(-1) ?? null;
    return { grouped, sortedKeys, lastNumericSc };
  }, [planning?.rows]);

  const lastRows = useMemo(() => {
    if (!lastNumericSc) return [];
    return (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() === lastNumericSc,
    );
  }, [planning?.rows, lastNumericSc]);

  const bloqueios = useMemo(
    () => (lastNumericSc ? motivosBloqueio(lastRows) : []),
    [lastRows, lastNumericSc],
  );
  const gerarBloqueado = bloqueios.length > 0;

  // Quando um novo semestre é gerado, seleciona a aba dele automaticamente
  useEffect(() => {
    if (lastResult) {
      setActiveTab(String(lastResult.semestreCurso));
    }
  }, [lastResult]);

  // Se a aba ativa sumiu (ex: delete), volta para o último
  useEffect(() => {
    if (activeTab && !grouped.has(activeTab)) {
      setActiveTab(lastNumericSc);
    }
    if (!activeTab && lastNumericSc) {
      setActiveTab(lastNumericSc);
    }
    setConfirmDelete(false);
  }, [sortedKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  function doGerar(
    semestreIngressoVal,
    turnoVal = turno,
    isFirst = false,
    novoSemestreIngresso = null,
  ) {
    setError(null);
    // Lê as rows mais recentes do estado para evitar stale closure
    withCurrentRows((currentRows) => {
      try {
        const { semestreCurso, semestreOferta } = (() => {
          const inf = inferNextSemester(
            currentRows,
            ANO_INICIO,
            SC_INICIO,
            semestreIngressoVal,
          );
          return inf;
        })();

        // Gera sempre sem filtro de turno — todas as disciplinas elegíveis
        // pelo PPC. A modal cuidará de habilitar/desabilitar pelo turno.
        const { newRows } = gerarSemestre({
          rows: currentRows,
          ppcJson,
          ofertaJson: null,
          turno: "dia",
          semOferta: true,
          anoInicio: ANO_INICIO,
          scInicio: SC_INICIO,
          semestreIngresso: semestreIngressoVal,
        });

        if (newRows.length === 0) {
          setError("Nenhuma disciplina disponível para este período.");
        } else {
          setPendingPeriodo({
            newRows,
            semestreCurso,
            semestreOferta,
            isFirst,
            turnoVal,
            novoSemestreIngresso,
          });
        }
      } catch (e) {
        setError(String(e?.message ?? e));
      }
    });
  }

  const handleConfirmarPeriodo = useCallback(
    (rowsSelecionadas, turnoEscolhido) => {
      if (!pendingPeriodo) return;
      const { semestreCurso, semestreOferta, isFirst, novoSemestreIngresso } =
        pendingPeriodo;
      const turnoVal = turnoEscolhido ?? pendingPeriodo.turnoVal;

      // Enriquece as rows selecionadas com turmas de ambas as ofertas
      const so = pendingPeriodo.semestreOferta;
      const rowsEnriquecidas = rowsSelecionadas.map((r) => ({
        ...r,
        semestre_oferta: String(so),
      }));
      const rowsComTurmas = enrichRowsWithOferta(
        rowsEnriquecidas,
        ofertaS1Json,
        ofertaS2Json,
        turnoVal,
      );

      if (isFirst) {
        setRowsAndTurno(
          groupUnique(
            upsertSemester(planning?.rows ?? [], semestreCurso, rowsComTurmas),
          ),
          turnoVal,
          novoSemestreIngresso,
        );
      } else {
        upsertRows((currentRows) =>
          groupUnique(
            upsertSemester(currentRows, semestreCurso, rowsComTurmas),
          ),
        );
      }

      setLastResult({
        semestreCurso,
        semestreOferta,
        count: rowsSelecionadas.length,
      });
      setPendingPeriodo(null);
    },
    [pendingPeriodo, upsertRows, setTurno, setRowsAndTurno, planning?.rows],
  );

  function handleGerar() {
    if (gerarBloqueado) return;
    if (isFirstGeneration) {
      setAskingSemestreIngresso(true);
      return;
    }
    doGerar(semestreIngresso);
  }

  function handleConfirmPrimeiroperiodo(so) {
    setAskingSemestreIngresso(false);
    // turno default por semestre de ingresso
    const turnoDefault = so === 1 ? "manha" : "tarde";
    doGerar(so, turnoDefault, true, so);
  }

  function handleDeletePeriodo() {
    if (!activeTab) return;
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    const updated = deleteSemester(planning?.rows ?? [], activeTab);
    setRows(updated);
    setLastResult(null);
    setConfirmDelete(false);
    // Se deletou o 1º período, limpa o semestre de ingresso
    if (Number(activeTab) === 1) {
      clearSemestreIngresso();
    }
  }

  const tabLabel = (sc) => (sc === "_" ? "Dispensas" : `${sc}º per`);

  const activeRows = activeTab ? (grouped.get(activeTab) ?? []) : [];
  // activeRows já contêm horários — não precisa de enriquecimento

  const activeFirst = activeRows[0];

  // Usa activeRows (enriquecidas com horários) para detectar candidatos ao conflito,
  // mas persiste usando rawRows (planejamento real, sem enriquecimento).
  function handleConflictClick(
    dia,
    horaInicio,
    clickedDisciplina,
    clickedTurma,
  ) {
    const candidatos = conflitosDoSlot(dia, horaInicio, activeRows);
    if (candidatos.length < 2) return;

    // Enriquece cada candidato com os horários da turma correspondente
    const candidatosComHorarios = candidatos.map((c) => {
      const row = activeRows.find((r) => r.codigo === c.disciplinaCodigo);
      const turma = (row?.turmas ?? []).find(
        (t) => String(t?.codigo ?? "").trim() === c.turmaCodigo,
      );
      const horarios = Array.isArray(turma?.horarios) ? turma.horarios : [];
      return { ...c, horarios };
    });

    setConflito({
      dia,
      horaInicio,
      candidatos: candidatosComHorarios,
      pendenteInicial:
        clickedDisciplina && clickedTurma
          ? { disciplinaCodigo: clickedDisciplina, turmaCodigo: clickedTurma }
          : null,
    });
  }

  function handleEscolherVencedor(disciplinaCodigo, turmaCodigo) {
    if (!conflito) return;

    const outras = (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() !== lastNumericSc,
    );

    // Resolve sobre activeRows (enriquecidas) — têm os horários necessários
    // para detectar conflitos. Persistimos o resultado enriquecido diretamente.
    const resolvidas = resolverTurmaVencedora(
      disciplinaCodigo,
      turmaCodigo,
      activeRows,
    );

    setRows([...outras, ...resolvidas]);
    setConflito(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {askingSemestreIngresso && (
        <ModalPrimeiroperiodo onConfirm={handleConfirmPrimeiroperiodo} />
      )}
      {pendingPeriodo && (
        <ModalConfirmarPeriodo
          newRows={pendingPeriodo.newRows}
          semestreCurso={pendingPeriodo.semestreCurso}
          semestreOferta={pendingPeriodo.semestreOferta}
          turnoInicial={pendingPeriodo.turnoVal}
          ofertaS1={ofertaS1Json}
          ofertaS2={ofertaS2Json}
          onConfirm={handleConfirmarPeriodo}
          onCancel={() => setPendingPeriodo(null)}
        />
      )}
      {adicionandoDisciplinas && (
        <ModalAdicionarDisciplinas
          semestreCurso={Number(lastNumericSc)}
          turmasJaNoPeriodo={Object.fromEntries(
            (planning?.rows ?? [])
              .filter(
                (r) => String(r?.semestre_curso ?? "").trim() === lastNumericSc,
              )
              .map((r) => [r.codigo, r.turmas ?? []]),
          )}
          disponiveis={calcDisponiveisParaAdicionar({
            // Passa rows SEM o período atual — comportamento idêntico a gerar
            // o período do zero: disciplinas do período atual não são
            // consideradas planejadas nem concluídas.
            rows: (planning?.rows ?? []).filter(
              (r) => String(r?.semestre_curso ?? "").trim() !== lastNumericSc,
            ),
            ppcJson,
            ofertaJson: (() => {
              const scRows = (planning?.rows ?? []).filter(
                (r) => String(r?.semestre_curso ?? "").trim() === lastNumericSc,
              );
              const so2 = scRows[0]?.semestre_oferta;
              return so2 === "1"
                ? ofertaS1Json
                : so2 === "2"
                  ? ofertaS2Json
                  : null;
            })(),
            turno: "dia",
            semestreCurso: Number(lastNumericSc),
            semestreIngresso,
            anoInicio: ANO_INICIO,
            scInicio: SC_INICIO,
          })}
          onConfirm={(rowsParaAdicionar) => {
            if (rowsParaAdicionar.length === 0) {
              setAdicionandoDisciplinas(false);
              return;
            }
            upsertRows((currentRows) => {
              const outras = currentRows.filter(
                (r) => String(r?.semestre_curso ?? "").trim() !== lastNumericSc,
              );
              const atuais = currentRows.filter(
                (r) => String(r?.semestre_curso ?? "").trim() === lastNumericSc,
              );
              const atuaisPorCodigo = new Map(atuais.map((r) => [r.codigo, r]));
              const mescladas = atuais.map((row) => {
                const nova = rowsParaAdicionar.find(
                  (r) => r.codigo === row.codigo,
                );
                if (!nova) return row;
                const turmasExistentes = new Set(
                  (row.turmas ?? []).map((t) => String(t?.codigo ?? "").trim()),
                );
                const turmasNovas = (nova.turmas ?? []).filter(
                  (t) => !turmasExistentes.has(String(t?.codigo ?? "").trim()),
                );
                if (turmasNovas.length === 0) return row;
                return {
                  ...row,
                  turmas: [...(row.turmas ?? []), ...turmasNovas],
                };
              });
              const novas = rowsParaAdicionar.filter(
                (r) => !atuaisPorCodigo.has(r.codigo),
              );
              return groupUnique([...outras, ...mescladas, ...novas]);
            });
            setAdicionandoDisciplinas(false);
          }}
          onCancel={() => setAdicionandoDisciplinas(false)}
        />
      )}
      {removendoDisciplina && (
        <ModalRemoverDisciplina
          disciplinaCodigo={removendoDisciplina.codigo}
          disciplinaNome={removendoDisciplina.nome}
          onConfirm={() => {
            const updated = (planning?.rows ?? []).filter(
              (r) =>
                !(
                  String(r?.semestre_curso ?? "").trim() === lastNumericSc &&
                  r.codigo === removendoDisciplina.codigo
                ),
            );
            setRows(updated);
            setRemovendoDisciplina(null);
          }}
          onFechar={() => setRemovendoDisciplina(null)}
        />
      )}
      {escolhendoTurma && (
        <ModalEscolherTurma
          row={escolhendoTurma}
          onEscolher={(disciplinaCodigo, turmaCodigo) => {
            const outras = (planning?.rows ?? []).filter(
              (r) => String(r?.semestre_curso ?? "").trim() !== lastNumericSc,
            );
            const resolvidas = resolverTurmaVencedora(
              disciplinaCodigo,
              turmaCodigo,
              activeRows,
            );
            setRows([...outras, ...resolvidas]);
            setEscolhendoTurma(null);
          }}
          onFechar={() => setEscolhendoTurma(null)}
        />
      )}
      {conflito && (
        <ModalResolverConflito
          dia={conflito.dia}
          horaInicio={conflito.horaInicio}
          candidatos={conflito.candidatos}
          pendenteInicial={conflito.pendenteInicial}
          onEscolher={handleEscolherVencedor}
          onFechar={() => setConflito(null)}
        />
      )}

      {/* Feedback — conflitos de horário (vermelho, prioridade visual) */}
      {gerarBloqueado && periodoTemConflitoDeHorario(lastRows) && (
        <CollapsibleBanner
          color="red"
          title={`Conflitos de horário no ${lastNumericSc}º período`}
        >
          <ul className="list-disc list-inside space-y-0.5">
            {todosConflitosDeHorario(activeRows).map(
              ({ dia, horaInicio, codigos }) => {
                const hora = `${String(Math.floor(horaInicio / 60)).padStart(2, "0")}:00`;
                return (
                  <li key={`${dia}-${horaInicio}`}>
                    {dia} {hora} — {codigos.join(" × ")}
                  </li>
                );
              },
            )}
          </ul>
        </CollapsibleBanner>
      )}

      {/* Feedback — múltiplas turmas (amarelo, sempre visível se houver) */}
      {gerarBloqueado && bloqueios.some((m) => !m.includes("Conflito")) && (
        <CollapsibleBanner
          color="amber"
          title={`Múltiplas turmas no ${lastNumericSc}º período`}
        >
          <ul className="list-disc list-inside space-y-0.5">
            {lastRows
              .filter((r) => (r.turmas?.length ?? 0) > 1)
              .map((r) => (
                <li key={r.codigo}>
                  {r.codigo} tem {r.turmas.length} turmas
                </li>
              ))}
          </ul>
        </CollapsibleBanner>
      )}

      {error && (
        <div className="mb-4 bg-red-50 border border-red-200 text-red-700 text-sm rounded-lg px-4 py-3">
          {error}
        </div>
      )}

      {lastResult && (
        <div className="mb-4 bg-green-50 border border-green-200 text-green-700 text-sm rounded-lg px-4 py-3">
          ✓ {lastResult.semestreCurso}º período gerado — {lastResult.count}{" "}
          disciplina{lastResult.count !== 1 ? "s" : ""} selecionada
          {lastResult.count !== 1 ? "s" : ""}
        </div>
      )}

      {/* Conteúdo: estado vazio ou abas */}
      {isFirstGeneration ? (
        <div className="flex flex-col items-center justify-center py-24 gap-4">
          <p className="text-gray-400 text-sm">
            Nenhuma disciplina planejada ainda.
          </p>
          <button
            onClick={handleGerar}
            className="px-8 py-3 bg-blue-600 hover:bg-blue-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer shadow"
          >
            Gerar 1º período
          </button>
        </div>
      ) : (
        <div>
          {/* Tab bar de semestres + botão gerar */}
          <div className="flex items-stretch gap-0 border-b border-gray-200 mb-6 overflow-x-auto">
            {sortedKeys.map((sc) => {
              const isActive = sc === activeTab;
              const isLast = sc === lastNumericSc;
              return (
                <button
                  key={sc}
                  onClick={() => setActiveTab(sc)}
                  className={[
                    "flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer whitespace-nowrap",
                    isActive
                      ? "border-blue-600 text-blue-600"
                      : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
                  ].join(" ")}
                >
                  {tabLabel(sc)}
                  {isLast && sc !== "_" && (
                    <span className="ml-1.5 inline-block w-1.5 h-1.5 rounded-full bg-blue-500 align-middle" />
                  )}
                </button>
              );
            })}
            {/* Botão gerar estilizado como aba */}
            <button
              onClick={handleGerar}
              disabled={gerarBloqueado}
              title={gerarBloqueado ? bloqueios.join("\n") : undefined}
              className="flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap border-l border-l-gray-200"
            >
              + {next.semestreCurso}º per
            </button>
          </div>

          {/* Cabeçalho da aba ativa */}
          {activeTab && activeTab !== "_" && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {activeTab}º período
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeRows.length} disciplina
                  {activeRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              {activeTab === lastNumericSc && (
                <div className="flex gap-2">
                  <button
                    onClick={() => setAdicionandoDisciplinas(true)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                  >
                    + Disciplinas
                  </button>
                  <button
                    onClick={handleDeletePeriodo}
                    onBlur={() => setConfirmDelete(false)}
                    className={[
                      "px-3 py-1.5 text-xs font-medium rounded-lg border transition-colors cursor-pointer",
                      confirmDelete
                        ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
                        : "bg-white text-red-500 border-red-300 hover:border-red-500",
                    ].join(" ")}
                  >
                    {confirmDelete
                      ? `Confirmar exclusão do ${activeTab}º período`
                      : `Deletar ${activeTab}º período`}
                  </button>
                </div>
              )}
            </div>
          )}

          {activeTab === "_" && (
            <div className="mb-4">
              <h3 className="font-semibold text-gray-800">Dispensas</h3>
              <p className="text-xs text-gray-400 mt-0.5">
                {activeRows.length} disciplina
                {activeRows.length !== 1 ? "s" : ""} dispensadas
              </p>
            </div>
          )}

          {/* Conteúdo da aba */}
          {activeTab && (
            <SemestreView
              key={activeTab}
              rows={activeRows}
              turno={turno}
              focusedTurmas={(() => {
                // Destaca turmas do modal de conflito aberto
                if (conflito) {
                  return new Set(
                    conflito.candidatos.map(
                      (c) => `${c.disciplinaCodigo}::${c.turmaCodigo}`,
                    ),
                  );
                }
                // Destaca todas as turmas da disciplina com múltiplas turmas aberta
                if (escolhendoTurma) {
                  return new Set(
                    (escolhendoTurma.turmas ?? []).map(
                      (t) => `${escolhendoTurma.codigo}::${t.codigo}`,
                    ),
                  );
                }
                return null;
              })()}
              onResolverConflito={
                activeTab === lastNumericSc ? handleConflictClick : undefined
              }
              onEscolherTurma={
                activeTab === lastNumericSc
                  ? (codigo, turmaCodigo) => {
                      const row = activeRows.find((r) => r.codigo === codigo);
                      if (row)
                        setEscolhendoTurma({
                          ...row,
                          _pendenteInicial: turmaCodigo ?? null,
                        });
                    }
                  : undefined
              }
              onRemoverDisciplina={
                activeTab === lastNumericSc
                  ? (codigo) => {
                      const row = activeRows.find((r) => r.codigo === codigo);
                      if (row)
                        setRemovendoDisciplina({
                          codigo: row.codigo,
                          nome: row.nome,
                        });
                    }
                  : undefined
              }
            />
          )}
        </div>
      )}
    </div>
  );
}
