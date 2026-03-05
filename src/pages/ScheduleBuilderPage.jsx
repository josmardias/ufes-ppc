import { useState, useMemo, useEffect, useCallback, useRef } from "react";
import {
  generateSemester,
  upsertSemester,
  deleteSemester,
  groupUnique,
  inferNextSemester,
  calcAvailableToAdd,
  enrichRowsWithOffer,
  mergeOffers,
} from "../domain/planning.js";
import {
  blockingReasons,
  periodHasScheduleConflict,
  allScheduleConflicts,
  sectionsInSlot,
  conflictCandidatesForBlock,
  resolveWinningCourseSection,
} from "../domain/calendar.js";
import { usePlanningContext } from "../App.jsx";
import { AddSectionModal, upsertCustomSection } from "./CustomOfferPage.jsx";
import ppcJson from "../data/ppc-2022.json";
import offer1Json from "../data/oferta-semestre-1.json";
import offer2Json from "../data/oferta-semestre-2.json";
import equivalenciasJson from "../data/equivalencias.json";
import WeekCalendar from "../components/WeekCalendar.jsx";

// Set of legacy (old curriculum) codes that have a PPC 2022 equivalent.
// Used to hide old-grade disciplines by default in period/add modals.
const LEGACY_CODES = new Set(
  Object.values(equivalenciasJson.equivalencias).flat(),
);

// ---------------------------------------------------------------------------
// useActiveOffer — returns system offer merged with the profile's custom offer.
// Called once per render of ScheduleBuilderPage so every downstream consumer
// (generateSemester, enrichRowsWithOffer, ModalConfirmarPeriodo, calcAvailableToAdd)
// automatically receives the merged offer without any extra wiring.
// ---------------------------------------------------------------------------

function useActiveOffer(planning) {
  const customOffer = planning?.customOffer ?? { 1: null, 2: null };
  const merged1 = useMemo(
    () => mergeOffers(offer1Json, customOffer[1]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customOffer[1]],
  );
  const merged2 = useMemo(
    () => mergeOffers(offer2Json, customOffer[2]),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [customOffer[2]],
  );
  return [merged1, merged2];
}

// ---------------------------------------------------------------------------
// useEscKey — calls handler when Escape is pressed, while modal is mounted
// ---------------------------------------------------------------------------

function useEscKey(handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") handlerRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, []);
}

const ANO_INICIO = 2024;
const SC_INICIO = 1;

const TURNO_OPCOES = [
  { id: "manha", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
  { id: "dia", label: "Dia inteiro" },
];

function ModalPrimeiroperiodo({ onConfirm }) {
  // No Esc close — user must make a choice before proceeding.
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
  available,
  allCourses,
  courseTerm,
  existingSections,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);
  const [selecionados, setSelecionados] = useState(new Set());
  const [turno, setTurno] = useState("dia");
  const [onlyAccessible, setOnlyAccessible] = useState(true);
  const [showLegacy, setShowLegacy] = useState(false);
  const [search, setSearch] = useState("");

  const normalize = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const baseCourses = (onlyAccessible ? available : allCourses).filter(
    (r) => showLegacy || !LEGACY_CODES.has(r.codigo),
  );
  const displayCourses = search.trim()
    ? baseCourses.filter((r) => {
        const q = normalize(search.trim());
        return (
          normalize(r.codigo).includes(q) || normalize(r.nome ?? "").includes(q)
        );
      })
    : baseCourses;

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
            Disciplinas disponíveis para o {courseTerm}º período. Selecione as
            que deseja adicionar.
          </p>
          <input
            autoFocus
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por código ou nome…"
            className="mt-3 w-full border border-gray-200 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
          <div className="flex items-center gap-4 mt-3 flex-wrap">
            <label className="flex items-center gap-2 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={onlyAccessible}
                onChange={(e) => setOnlyAccessible(e.target.checked)}
                className="accent-blue-600 w-4 h-4"
              />
              <span className="text-xs text-gray-600">
                Só disciplinas com pré-requisitos satisfeitos
              </span>
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLegacy}
                onChange={(e) => setShowLegacy(e.target.checked)}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-500">
                Incluir PPC antigo
              </span>
            </label>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {displayCourses.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível para adicionar.
            </p>
          ) : (
            displayCourses.map((r) => {
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
                (existingSections?.[r.codigo] ?? []).map((t) =>
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
              onConfirm(
                displayCourses.filter((r) => selecionados.has(r.codigo)),
              )
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
  courseCode,
  courseName,
  onConfirm,
  onFechar,
}) {
  useEscKey(onFechar);
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
            {courseName || courseCode}
          </span>{" "}
          <span className="font-mono text-xs text-gray-400">
            ({courseCode})
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
  useEscKey(onFechar);
  const [pending, setPendente] = useState(row._pendenteInicial ?? null);
  const turmas = Array.isArray(row.turmas) ? row.turmas : [];

  function handleClick(sectionCode) {
    if (pending === sectionCode) {
      onEscolher(row.codigo, sectionCode);
    } else {
      setPendente(sectionCode);
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
            const isPendente = pending === t.codigo;
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
  courseTerm,
  offerTerm,
  initialShift,
  ofertaS1,
  ofertaS2,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);
  const CUTOFF = 13 * 60;

  // Busca turmas de uma disciplina na oferta correta para este período
  function getSectionsForCourse(codigo) {
    const turmas = [];
    const seen = new Set();
    // Usa só a oferta do offerTerm deste período, não ambas
    const correctOffer = offerTerm === 1 ? ofertaS1 : ofertaS2;
    for (const oferta of [correctOffer]) {
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

  function sectionMatchesShift(turma, t) {
    if (t === "dia") return true;
    return (turma.horarios ?? []).some((h) => {
      const mins = parseInt(h.inicio?.split(":")[0] ?? "0") * 60;
      return t === "manha" ? mins < CUTOFF : mins >= CUTOFF;
    });
  }

  function isCourseVisible(r, t) {
    if (t === "dia") return true;
    const turmas = getSectionsForCourse(r.codigo);
    return turmas.some((turma) => sectionMatchesShift(turma, t));
  }

  const [turno, setTurno] = useState(initialShift ?? "dia");

  // Ao mudar turno: seleciona todas as visíveis
  const [showLegacy, setShowLegacy] = useState(false);

  const visibleRows = newRows.filter(
    (r) =>
      isCourseVisible(r, turno) && (showLegacy || !LEGACY_CODES.has(r.codigo)),
  );

  const [selecionados, setSelecionados] = useState(
    () => new Set(visibleRows.map((r) => r.codigo)),
  );

  function handleShiftChange(newShift) {
    setTurno(newShift);
    // Seleciona todas as disciplinas visíveis no novo turno
    const visiveis = newRows.filter(
      (r) =>
        isCourseVisible(r, newShift) &&
        (showLegacy || !LEGACY_CODES.has(r.codigo)),
    );
    setSelecionados(new Set(visiveis.map((r) => r.codigo)));
  }

  function handleShowLegacyChange(val) {
    setShowLegacy(val);
    const visiveis = newRows.filter(
      (r) => isCourseVisible(r, turno) && (val || !LEGACY_CODES.has(r.codigo)),
    );
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
    if (selecionados.size === visibleRows.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(visibleRows.map((r) => r.codigo)));
    }
  }

  const todosSelecionados =
    visibleRows.length > 0 && selecionados.size === visibleRows.length;
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
            {courseTerm}º período
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            {visibleRows.length} disciplina
            {visibleRows.length !== 1 ? "s" : ""} disponíve
            {visibleRows.length !== 1 ? "is" : "l"} neste turno. Desmarque as
            que não deseja incluir.
          </p>
          {/* Turno + legacy toggle */}
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Turno:</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                {TURNO_OPCOES.map(({ id, label }) => {
                  const count = newRows.filter(
                    (r) =>
                      isCourseVisible(r, id) &&
                      (showLegacy || !LEGACY_CODES.has(r.codigo)),
                  ).length;
                  return (
                    <button
                      key={id}
                      onClick={() => handleShiftChange(id)}
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
            <label className="flex items-center gap-1.5 cursor-pointer select-none">
              <input
                type="checkbox"
                checked={showLegacy}
                onChange={(e) => handleShowLegacyChange(e.target.checked)}
                className="accent-blue-600 w-3.5 h-3.5"
              />
              <span className="text-xs text-gray-500">
                Incluir PPC antigo
              </span>
            </label>
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
          {visibleRows.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível neste turno.
            </p>
          ) : (
            visibleRows.map((r) => {
              const checked = selecionados.has(r.codigo);
              const turmas = getSectionsForCourse(r.codigo);
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
                            turno === "dia" || sectionMatchesShift(t, turno);
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
                visibleRows.filter((r) => selecionados.has(r.codigo)),
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
  candidates,
  initialPending,
  onEscolher,
  onFechar,
}) {
  useEscKey(onFechar);
  const [pending, setPendente] = useState(initialPending ?? null);
  const horaLabel = `${String(Math.floor(horaInicio / 60)).padStart(2, "0")}:00`;

  function handleClick(c) {
    const key = `${c.courseCode}-${c.sectionCode}`;
    const pendenteKey = pending
      ? `${pending.courseCode}-${pending.sectionCode}`
      : null;

    if (pendenteKey === key) {
      onEscolher(c.courseCode, c.sectionCode);
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
          Resolver conflict
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {dia} {horaLabel} — escolha a turma vencedora. As demais serão
          removidas deste slot.
        </p>
        <div className="flex flex-col gap-2">
          {candidates.map((c) => {
            const key = `${c.courseCode}-${c.sectionCode}`;
            const isPendente =
              pending && `${pending.courseCode}-${pending.sectionCode}` === key;
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
                  <div className="flex flex-col gap-0">
                    <span className="font-semibold text-sm text-gray-800">
                      {c.courseName || c.courseCode}
                    </span>
                    <div className="flex items-baseline gap-2">
                      <span className="font-mono text-xs text-gray-400">
                        {c.courseCode}
                      </span>
                      {c.sectionCode && (
                        <span className="text-xs text-gray-500">
                          Turma {c.sectionCode}
                        </span>
                      )}
                    </div>
                  </div>
                  {isPendente && (
                    <span className="text-xs font-semibold text-blue-600 flex-shrink-0">
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
  focusedSections,
  turno,
  onEmptyClick,
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
          onMultiSectionClick={onEscolherTurma}
          onRemoverClick={onRemoverDisciplina}
          focusedSections={focusedSections}
          onEmptyClick={onEmptyClick}
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

export default function ScheduleBuilderPage() {
  const {
    planning,
    setRows,
    upsertRows,
    withCurrentRows,
    setTurno,
    setSemestreIngresso,
    clearSemestreIngresso,
    setRowsAndTurno,
    setCustomOffer,
  } = usePlanningContext();

  const [mergedOffer1, mergedOffer2] = useActiveOffer(planning);

  // All course suggestions — PPC + both system offers, deduplicated, no prereq filter
  const courseSuggestions = useMemo(() => {
    const map = new Map();
    for (const [key, v] of Object.entries(ppcJson?.courses ?? {})) {
      const codigo = String(v?.code ?? key).trim();
      if (!codigo || codigo.startsWith("Carga")) continue;
      map.set(codigo, String(v?.name ?? "").trim());
    }
    for (const offerJson of [offer1Json, offer2Json]) {
      for (const d of offerJson?.disciplinas ?? []) {
        const codigo = String(d?.codigo ?? "").trim();
        if (!codigo) continue;
        if (!map.has(codigo)) map.set(codigo, String(d?.nome ?? "").trim());
      }
    }
    return Array.from(map.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, []);

  // Default de turno baseado no semestre de ingresso:
  // 1º semestre → manhã, 2º semestre → tarde, sem ingresso → dia
  const defaultShift =
    planning?.entryTerm === 1
      ? "manha"
      : planning?.entryTerm === 2
        ? "tarde"
        : "dia";
  const turno = planning?.turno ?? defaultShift;
  const [activeTab, setActiveTab] = useState(null);
  const [lastResult, setLastResult] = useState(null);
  const [error, setError] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [conflict, setConflict] = useState(null); // { dia, horaInicio, candidates, rawRows }
  const [pendingTerm, setPendingTerm] = useState(null); // { newRows, courseTerm, offerTerm, isFirst, shiftVal }
  const [pickingSection, setPickingSection] = useState(null); // row with multiple sections
  const [addingCourses, setAddingCourses] = useState(false);
  const [removingCourse, setRemovingCourse] = useState(null); // { code, name }
  const [editingTerm, setEditingTerm] = useState(null); // sc string of the term being edited
  const [addingCustomSection, setAddingCustomSection] = useState(null); // { semestre, initialSchedules }

  const [askingEntryTerm, setAskingEntryTerm] = useState(false);
  const entryTerm = planning?.entryTerm ?? 1;
  const hasEntryTerm =
    planning?.entryTerm != null &&
    planning.rows?.some((r) => String(r?.semestre_curso ?? "").trim() !== "_");

  const isFirstGeneration =
    (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() !== "_",
    ).length === 0;

  const next = inferNextSemester(
    planning?.rows ?? [],
    ANO_INICIO,
    SC_INICIO,
    entryTerm,
  );

  // Codes accessible in the active term (prereqs satisfied) — used for the
  // "only accessible" toggle in AddSectionModal and ModalAdicionarDisciplinas.
  const accessibleCodes = useMemo(() => {
    if (!activeTab) return new Set();
    const rows = (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() !== activeTab,
    );
    const scRows = (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() === activeTab,
    );
    const so2 = scRows[0]?.semestre_oferta;
    const offerJson =
      so2 === "1" ? mergedOffer1 : so2 === "2" ? mergedOffer2 : null;
    const available = calcAvailableToAdd({
      rows,
      ppcJson,
      offerJson,
      turno: "dia",
      courseTerm: Number(activeTab),
      entryTerm,
      anoInicio: ANO_INICIO,
      scInicio: SC_INICIO,
      equivalenciasJson,
    });
    return new Set(available.map((r) => r.codigo));
  }, [activeTab, planning?.rows, mergedOffer1, mergedOffer2, entryTerm]);

  // Agrupa rows por semestre_curso
  const { grouped, sortedKeys, lastTerm } = useMemo(() => {
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
    const lastTerm = numericKeys.at(-1) ?? null;
    return { grouped, sortedKeys, lastTerm };
  }, [planning?.rows]);

  const lastRows = useMemo(() => {
    if (!lastTerm) return [];
    return (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() === lastTerm,
    );
  }, [planning?.rows, lastTerm]);

  const termBlockingReasons = useMemo(
    () => (lastTerm ? blockingReasons(lastRows) : []),
    [lastRows, lastTerm],
  );
  const generateBlocked = termBlockingReasons.length > 0;

  // The "active" term for edit purposes: last term always, or whichever is in edit mode
  const isEditable = (sc) => sc === lastTerm || sc === editingTerm;

  // Quando um novo semestre é gerado, seleciona a aba dele automaticamente
  useEffect(() => {
    if (lastResult) {
      setActiveTab(String(lastResult.courseTerm));
    }
  }, [lastResult]);

  // Se a aba ativa sumiu (ex: delete), volta para o último
  useEffect(() => {
    if (activeTab && !grouped.has(activeTab)) {
      setActiveTab(lastTerm);
    }
    if (!activeTab && lastTerm) {
      setActiveTab(lastTerm);
    }
    setConfirmDelete(false);
  }, [sortedKeys.join(",")]); // eslint-disable-line react-hooks/exhaustive-deps

  // Exit edit mode when switching away from the term being edited
  useEffect(() => {
    if (editingTerm && activeTab !== editingTerm) {
      setEditingTerm(null);
    }
  }, [activeTab, editingTerm]);

  function doGenerate(
    semestreIngressoVal,
    shiftVal = turno,
    isFirst = false,
    newEntryTerm = null,
  ) {
    setError(null);
    // Lê as rows mais recentes do estado para evitar stale closure
    withCurrentRows((currentRows) => {
      try {
        const { courseTerm, offerTerm } = (() => {
          const inf = inferNextSemester(
            currentRows,
            ANO_INICIO,
            SC_INICIO,
            semestreIngressoVal,
          );
          return inf;
        })();

        // Use the offer for the computed offerTerm so only disciplines
        // actually offered this semester are shown. turno: "dia" so all
        // sections are included — the modal handles shift filtering.
        const offerJsonForTerm = offerTerm === 1 ? mergedOffer1 : mergedOffer2;
        const { newRows } = generateSemester({
          rows: currentRows,
          ppcJson,
          offerJson: offerJsonForTerm,
          turno: "dia",
          semOferta: false,
          anoInicio: ANO_INICIO,
          scInicio: SC_INICIO,
          entryTerm: semestreIngressoVal,
          equivalenciasJson,
        });

        if (newRows.length === 0) {
          setError("Nenhuma disciplina disponível para este período.");
        } else {
          setPendingTerm({
            newRows,
            courseTerm,
            offerTerm,
            isFirst,
            shiftVal,
            newEntryTerm,
          });
        }
      } catch (e) {
        setError(String(e?.message ?? e));
      }
    });
  }

  const handleConfirmTerm = useCallback(
    (rowsSelecionadas, turnoEscolhido) => {
      if (!pendingTerm) return;
      const { courseTerm, offerTerm, isFirst, newEntryTerm } = pendingTerm;
      const shiftVal = turnoEscolhido ?? pendingTerm.shiftVal;

      // Enriquece as rows selecionadas com turmas de ambas as ofertas
      const so = pendingTerm.offerTerm;
      const rowsEnriquecidas = rowsSelecionadas.map((r) => ({
        ...r,
        semestre_oferta: String(so),
      }));
      const rowsComTurmas = enrichRowsWithOffer(
        rowsEnriquecidas,
        mergedOffer1,
        mergedOffer2,
        shiftVal,
        equivalenciasJson,
      );

      if (isFirst) {
        setRowsAndTurno(
          groupUnique(
            upsertSemester(planning?.rows ?? [], courseTerm, rowsComTurmas),
          ),
          shiftVal,
          newEntryTerm,
        );
      } else {
        upsertRows((currentRows) =>
          groupUnique(upsertSemester(currentRows, courseTerm, rowsComTurmas)),
        );
      }

      setLastResult({
        courseTerm,
        offerTerm,
        count: rowsSelecionadas.length,
      });
      setPendingTerm(null);
    },
    [pendingTerm, upsertRows, setTurno, setRowsAndTurno, planning?.rows],
  );

  function handleGenerate() {
    if (generateBlocked) return;
    if (isFirstGeneration) {
      setAskingEntryTerm(true);
      return;
    }
    doGenerate(entryTerm);
  }

  function handleConfirmFirstTerm(so) {
    setAskingEntryTerm(false);
    // turno default por semestre de ingresso
    const defaultShift = so === 1 ? "manha" : "tarde";
    doGenerate(so, defaultShift, true, so);
  }

  function handleEmptyClick(dia, startMin, endMin) {
    // Determine the offer semester for the active tab
    const scRows = (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() === activeTab,
    );
    const semestre = Number(scRows[0]?.semestre_oferta ?? 1) || 1;

    const toHHMM = (mins) =>
      `${String(Math.floor(mins / 60)).padStart(2, "0")}:00`;

    setAddingCustomSection({
      semestre,
      initialSchedules: [
        { dia, inicio: toHHMM(startMin), fim: toHHMM(endMin) },
      ],
      accessibleCodes,
    });
  }

  function handleDeleteTerm() {
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
  // activeRows already contain schedules — no enrichment needed

  const activeFirst = activeRows[0];

  // Uses activeRows (enriched with schedules) to detect conflict candidates,
  // but persists using rawRows (the real planning, without enrichment).
  function handleConflictClick(
    dia,
    blockStart,
    blockEnd,
    clickedDisciplina,
    clickedTurma,
  ) {
    // Collect all sections that overlap with the clicked card's rendered
    // block interval [blockStart, blockEnd) on this day.
    // This correctly scopes the modal to the visible block — a section with
    // non-contiguous slots (e.g. 07-09 and 11-12 on Tuesday) produces two
    // separate cards, and clicking the 07-09 block will NOT include sections
    // that only appear at 11-12.
    const candidates = conflictCandidatesForBlock(
      dia,
      blockStart,
      blockEnd,
      activeRows,
    );

    if (candidates.length < 2) return;

    // Enrich each candidate with name and schedules
    const candidatesWithSchedules = candidates.map((c) => {
      const row = activeRows.find((r) => r.codigo === c.courseCode);
      const section = (row?.turmas ?? []).find(
        (t) => String(t?.codigo ?? "").trim() === c.sectionCode,
      );
      const horarios = Array.isArray(section?.horarios) ? section.horarios : [];
      return { ...c, courseName: row?.nome ?? "", horarios };
    });

    setConflict({
      dia,
      horaInicio: blockStart,
      candidates: candidatesWithSchedules,
      initialPending:
        clickedDisciplina && clickedTurma
          ? { courseCode: clickedDisciplina, sectionCode: clickedTurma }
          : null,
    });
  }

  function handlePickWinner(courseCode, sectionCode) {
    if (!conflict) return;

    const outras = (planning?.rows ?? []).filter(
      (r) => String(r?.semestre_curso ?? "").trim() !== activeTab,
    );

    // Resolves over activeRows (enriched) — they have the schedules needed
    // to detect conflicts. We persist the enriched result directly.
    const resolvidas = resolveWinningCourseSection(
      courseCode,
      sectionCode,
      activeRows,
    );

    setRows([...outras, ...resolvidas]);
    setConflict(null);
  }

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {askingEntryTerm && (
        <ModalPrimeiroperiodo onConfirm={handleConfirmFirstTerm} />
      )}
      {pendingTerm && (
        <ModalConfirmarPeriodo
          newRows={pendingTerm.newRows}
          courseTerm={pendingTerm.courseTerm}
          offerTerm={pendingTerm.offerTerm}
          initialShift={pendingTerm.shiftVal}
          ofertaS1={mergedOffer1}
          ofertaS2={mergedOffer2}
          onConfirm={handleConfirmTerm}
          onCancel={() => setPendingTerm(null)}
        />
      )}
      {addingCourses && (
        <ModalAdicionarDisciplinas
          courseTerm={Number(lastTerm)}
          existingSections={Object.fromEntries(
            (planning?.rows ?? [])
              .filter(
                (r) => String(r?.semestre_curso ?? "").trim() === lastTerm,
              )
              .map((r) => [r.codigo, r.turmas ?? []]),
          )}
          allCourses={(() => {
            // All PPC courses as rows, regardless of prereqs, for the "show all" toggle
            const scRows = (planning?.rows ?? []).filter(
              (r) => String(r?.semestre_curso ?? "").trim() === activeTab,
            );
            const offerTermStr = scRows[0]?.semestre_oferta ?? "1";
            return courseSuggestions.map(({ codigo, nome }) => {
              const ppcCourse = ppcJson?.courses?.[codigo] ?? {};
              return {
                semestre_curso: activeTab,
                ano: scRows[0]?.ano ?? String(ANO_INICIO),
                semestre_oferta: offerTermStr,
                codigo,
                nome,
                periodo: "",
                carga_horaria: "",
                pre_requisitos: ppcCourse?.prereq ?? [],
                co_requisitos: ppcCourse?.coreq ?? [],
                turmas: [],
              };
            });
          })()}
          available={calcAvailableToAdd({
            // Pass rows WITHOUT the current term — same behavior as generating
            // the term from scratch: courses in the current term are not
            // considered planned or completed.
            rows: (planning?.rows ?? []).filter(
              (r) => String(r?.semestre_curso ?? "").trim() !== activeTab,
            ),
            ppcJson,
            offerJson: (() => {
              const scRows = (planning?.rows ?? []).filter(
                (r) => String(r?.semestre_curso ?? "").trim() === activeTab,
              );
              const so2 = scRows[0]?.semestre_oferta;
              return so2 === "1"
                ? mergedOffer1
                : so2 === "2"
                  ? mergedOffer2
                  : null;
            })(),
            turno: "dia",
            courseTerm: Number(activeTab),
            entryTerm,
            anoInicio: ANO_INICIO,
            scInicio: SC_INICIO,
            equivalenciasJson,
          })}
          onConfirm={(rowsParaAdicionar) => {
            if (rowsParaAdicionar.length === 0) {
              setAddingCourses(false);
              return;
            }
            // Use activeTab so adding works for both lastTerm and editingTerm
            const targetTerm = activeTab;

            // Enrich the incoming rows with turmas from the merged offer so
            // they show up in the calendar immediately. Rows that already have
            // turmas (from calcAvailableToAdd with an offerJson) are untouched.
            const offerTermForTab = (() => {
              const scRows = (planning?.rows ?? []).filter(
                (r) => String(r?.semestre_curso ?? "").trim() === targetTerm,
              );
              return scRows[0]?.semestre_oferta ?? "1";
            })();
            const enriched = enrichRowsWithOffer(
              rowsParaAdicionar,
              mergedOffer1,
              mergedOffer2,
              "dia",
              equivalenciasJson,
            ).map((r) => ({ ...r, semestre_oferta: offerTermForTab }));

            upsertRows((currentRows) => {
              const outras = currentRows.filter(
                (r) => String(r?.semestre_curso ?? "").trim() !== targetTerm,
              );
              const atuais = currentRows.filter(
                (r) => String(r?.semestre_curso ?? "").trim() === targetTerm,
              );
              const atuaisPorCodigo = new Map(atuais.map((r) => [r.codigo, r]));
              const mescladas = atuais.map((row) => {
                const nova = enriched.find((r) => r.codigo === row.codigo);
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
              const novas = enriched.filter(
                (r) => !atuaisPorCodigo.has(r.codigo),
              );
              return groupUnique([...outras, ...mescladas, ...novas]);
            });
            setAddingCourses(false);
          }}
          onCancel={() => setAddingCourses(false)}
        />
      )}
      {removingCourse && (
        <ModalRemoverDisciplina
          courseCode={removingCourse.codigo}
          courseName={removingCourse.nome}
          onConfirm={() => {
            const updated = (planning?.rows ?? []).filter(
              (r) =>
                !(
                  String(r?.semestre_curso ?? "").trim() === activeTab &&
                  r.codigo === removingCourse.codigo
                ),
            );
            setRows(updated);
            setRemovingCourse(null);
          }}
          onFechar={() => setRemovingCourse(null)}
        />
      )}
      {pickingSection && (
        <ModalEscolherTurma
          row={pickingSection}
          onEscolher={(courseCode, sectionCode) => {
            const outras = (planning?.rows ?? []).filter(
              (r) => String(r?.semestre_curso ?? "").trim() !== activeTab,
            );
            const resolvidas = resolveWinningCourseSection(
              courseCode,
              sectionCode,
              activeRows,
            );
            setRows([...outras, ...resolvidas]);
            setPickingSection(null);
          }}
          onFechar={() => setPickingSection(null)}
        />
      )}
      {addingCustomSection && (
        <AddSectionModal
          semestre={addingCustomSection.semestre}
          courseSuggestions={courseSuggestions}
          initialSchedules={addingCustomSection.initialSchedules}
          accessibleCodes={addingCustomSection.accessibleCodes ?? null}
          onConfirm={({ semestre, courseCode, section }) => {
            setAddingCustomSection(null);

            // 1) Persist to customOffer so it survives re-enrichment
            const currentOffer =
              (planning?.customOffer ?? {})[semestre] ?? null;
            const ppcCourse = ppcJson?.courses?.[courseCode] ?? {};
            const suggestedName =
              courseSuggestions.find((s) => s.codigo === courseCode)?.nome ??
              "";
            const courseName =
              String(ppcCourse?.name ?? "").trim() ||
              suggestedName ||
              courseCode;
            setCustomOffer(
              semestre,
              upsertCustomSection(
                currentOffer,
                semestre,
                courseCode,
                section,
                courseName,
              ),
            );

            // 2) Also inject the new turma directly into the active term's rows
            // so it shows up immediately without waiting for a re-generation.
            // If the course doesn't exist in the active term (e.g. prerequisites
            // not met), create a new row for it — the user is explicitly asking
            // to add it regardless.
            upsertRows((currentRows) => {
              const newTurma = {
                codigo: section.turma,
                horarios: section.horarios,
                docente: section.docente ?? "",
              };

              const existingRow = currentRows.find(
                (r) =>
                  String(r?.semestre_curso ?? "").trim() === activeTab &&
                  String(r?.codigo ?? "").trim() === courseCode,
              );

              if (existingRow) {
                // Row exists — append turma if not already present
                return currentRows.map((row) => {
                  if (
                    String(row?.semestre_curso ?? "").trim() !== activeTab ||
                    String(row?.codigo ?? "").trim() !== courseCode
                  )
                    return row;

                  const existingCodes = new Set(
                    (row.turmas ?? []).map((t) =>
                      String(t?.turma ?? t?.codigo ?? "").trim(),
                    ),
                  );
                  if (existingCodes.has(section.turma)) {
                    // Section already exists — append new horarios (dedup by dia+inicio+fim)
                    return {
                      ...row,
                      turmas: (row.turmas ?? []).map((t) => {
                        if (
                          String(t?.turma ?? t?.codigo ?? "").trim() !==
                          section.turma
                        )
                          return t;
                        const existingKeys = new Set(
                          (t.horarios ?? []).map(
                            (h) => `${h.dia}|${h.inicio}|${h.fim}`,
                          ),
                        );
                        const newHorarios = (section.horarios ?? []).filter(
                          (h) =>
                            !existingKeys.has(`${h.dia}|${h.inicio}|${h.fim}`),
                        );
                        return {
                          ...t,
                          horarios: [...(t.horarios ?? []), ...newHorarios],
                        };
                      }),
                    };
                  }

                  return {
                    ...row,
                    turmas: [...(row.turmas ?? []), newTurma],
                  };
                });
              }

              // Row doesn't exist — create it, bypassing prerequisite checks.
              // courseName and ppcCourse are already computed in the outer scope.
              const activeScRows = currentRows.filter(
                (r) => String(r?.semestre_curso ?? "").trim() === activeTab,
              );
              const offerTermStr =
                activeScRows[0]?.semestre_oferta ?? String(semestre);

              const newRow = {
                semestre_curso: activeTab,
                ano: activeScRows[0]?.ano ?? String(ANO_INICIO),
                semestre_oferta: offerTermStr,
                codigo: courseCode,
                nome: courseName,
                periodo: "",
                carga_horaria: "",
                pre_requisitos: ppcCourse?.prereq ?? [],
                co_requisitos: ppcCourse?.coreq ?? [],
                turmas: [newTurma],
              };

              return [...currentRows, newRow];
            });
          }}
          onCancel={() => setAddingCustomSection(null)}
        />
      )}
      {conflict && (
        <ModalResolverConflito
          dia={conflict.dia}
          horaInicio={conflict.horaInicio}
          candidates={conflict.candidates}
          initialPending={conflict.initialPending}
          onEscolher={handlePickWinner}
          onFechar={() => setConflict(null)}
        />
      )}

      {/* Feedback — conflitos de horário (vermelho, prioridade visual) */}
      {generateBlocked && periodHasScheduleConflict(lastRows) && (
        <CollapsibleBanner
          color="red"
          title={`Conflitos de horário no ${lastTerm}º período`}
        >
          <ul className="list-disc list-inside space-y-0.5">
            {allScheduleConflicts(activeRows).map(
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
      {generateBlocked &&
        termBlockingReasons.some((m) => !m.includes("Conflito")) && (
          <CollapsibleBanner
            color="amber"
            title={`Múltiplas turmas no ${lastTerm}º período`}
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
          ✓ {lastResult.courseTerm}º período gerado — {lastResult.count}{" "}
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
            onClick={handleGenerate}
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
              const isLast = sc === lastTerm;
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
              onClick={handleGenerate}
              disabled={generateBlocked}
              title={
                generateBlocked ? termBlockingReasons.join("\n") : undefined
              }
              className="flex-shrink-0 px-4 py-2.5 text-sm font-medium border-b-2 border-transparent text-gray-400 hover:text-gray-600 hover:border-gray-300 disabled:opacity-30 disabled:cursor-not-allowed transition-colors cursor-pointer whitespace-nowrap border-l border-l-gray-200"
            >
              + {next.courseTerm}º per
            </button>
          </div>

          {/* Cabeçalho da aba ativa */}
          {activeTab && activeTab !== "_" && (
            <div className="flex items-center justify-between mb-4">
              <div>
                <h3 className="font-semibold text-gray-800">
                  {activeTab}º período
                  {editingTerm === activeTab && (
                    <span className="ml-2 text-xs font-normal text-amber-600 bg-amber-50 border border-amber-200 rounded px-1.5 py-0.5">
                      editando
                    </span>
                  )}
                </h3>
                <p className="text-xs text-gray-400 mt-0.5">
                  {activeRows.length} disciplina
                  {activeRows.length !== 1 ? "s" : ""}
                </p>
              </div>
              <div className="flex gap-2">
                {activeTab === lastTerm ? (
                  <>
                    <button
                      onClick={() => setAddingCourses(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      + Disciplinas
                    </button>
                    <button
                      onClick={handleDeleteTerm}
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
                  </>
                ) : activeTab !== "_" && editingTerm !== activeTab ? (
                  <button
                    onClick={() => setEditingTerm(activeTab)}
                    className="px-3 py-1.5 text-xs font-medium rounded-lg border border-gray-300 text-gray-600 bg-white hover:border-gray-400 hover:bg-gray-50 transition-colors cursor-pointer"
                  >
                    ✏️ Editar
                  </button>
                ) : activeTab !== "_" && editingTerm === activeTab ? (
                  <>
                    <button
                      onClick={() => setAddingCourses(true)}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
                    >
                      + Disciplinas
                    </button>
                    <button
                      onClick={() => {
                        setEditingTerm(null);
                        setConflict(null);
                        setPickingSection(null);
                        setRemovingCourse(null);
                      }}
                      className="px-3 py-1.5 text-xs font-medium rounded-lg border border-amber-300 text-amber-700 bg-amber-50 hover:bg-amber-100 transition-colors cursor-pointer"
                    >
                      ✓ Encerrar edição
                    </button>
                  </>
                ) : null}
              </div>
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
              focusedSections={(() => {
                // Highlights course sections from the open conflict modal
                if (conflict) {
                  return new Set(
                    conflict.candidates.map(
                      (c) => `${c.courseCode}::${c.sectionCode}`,
                    ),
                  );
                }
                // Destaca todas as turmas da disciplina com múltiplas turmas aberta
                if (pickingSection) {
                  return new Set(
                    (pickingSection.turmas ?? []).map(
                      (t) => `${pickingSection.codigo}::${t.codigo}`,
                    ),
                  );
                }
                return null;
              })()}
              onEmptyClick={
                isEditable(activeTab) ? handleEmptyClick : undefined
              }
              onResolverConflito={
                isEditable(activeTab) ? handleConflictClick : undefined
              }
              onEscolherTurma={
                isEditable(activeTab)
                  ? (codigo, sectionCode) => {
                      const row = activeRows.find((r) => r.codigo === codigo);
                      if (row)
                        setPickingSection({
                          ...row,
                          _pendenteInicial: sectionCode ?? null,
                        });
                    }
                  : undefined
              }
              onRemoverDisciplina={
                isEditable(activeTab)
                  ? (codigo) => {
                      const row = activeRows.find((r) => r.codigo === codigo);
                      if (row)
                        setRemovingCourse({
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
