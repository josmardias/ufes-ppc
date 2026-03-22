import { useState, useEffect, useRef } from "react";
import equivalenciasJson from "../data/equivalencias.json";

const LEGACY_CODES = new Set(
  Object.values(equivalenciasJson.equivalencias).flat(),
);

export const TURNO_OPCOES = [
  { id: "dia", label: "Dia" },
  { id: "manha", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
];

function useEscKey(handler) {
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  useEffect(() => {
    if (!handler) return;
    function onKeyDown(e) {
      if (e.key === "Escape") handlerRef.current?.();
    }
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [handler]);
}

export default function ModalConfirmarPeriodo({
  newClasses,
  semesterIndex,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);

  const CUTOFF = 13 * 60;

  // Returns true when any slot in the class matches the requested shift
  function classMatchesShift(cls, t) {
    if (t === "dia") return true;
    return (cls.slots ?? []).some((h) => {
      const mins = parseInt(String(h.inicio ?? "").split(":")[0] ?? "0") * 60;
      return t === "manha" ? mins < CUTOFF : mins >= CUTOFF;
    });
  }

  // Group classes by subjectCode for display
  function groupBySubject(classes) {
    const map = new Map();
    for (const cls of classes) {
      const code = cls.subjectCode;
      if (!map.has(code)) {
        map.set(code, { subjectCode: code, nome: cls.nome ?? "", classes: [] });
      }
      map.get(code).classes.push(cls);
    }
    return Array.from(map.values());
  }

  const [turno, setTurno] = useState(() => {
    // Auto-detect shift from the majority of slots
    return "dia";
  });
  const [showLegacy, setShowLegacy] = useState(false);

  // Visible classes filtered by shift + legacy toggle
  function getVisibleClasses(t, legacy) {
    return newClasses.filter(
      (cls) =>
        classMatchesShift(cls, t) &&
        (legacy || !LEGACY_CODES.has(cls.subjectCode)),
    );
  }

  // Visible groups (one per unique subjectCode among visible classes)
  const visibleClasses = getVisibleClasses(turno, showLegacy);
  const visibleGroups = groupBySubject(visibleClasses);

  // Selection is by subjectCode; selecting a subject selects ALL its classes
  const [selecionados, setSelecionados] = useState(
    () => new Set(visibleGroups.map((g) => g.subjectCode)),
  );

  function handleShiftChange(newShift) {
    setTurno(newShift);
    const visiveis = groupBySubject(getVisibleClasses(newShift, showLegacy));
    setSelecionados(new Set(visiveis.map((g) => g.subjectCode)));
  }

  function handleShowLegacyChange(val) {
    setShowLegacy(val);
    const visiveis = groupBySubject(getVisibleClasses(turno, val));
    setSelecionados(new Set(visiveis.map((g) => g.subjectCode)));
  }

  function toggleSubject(subjectCode) {
    setSelecionados((prev) => {
      const next = new Set(prev);
      if (next.has(subjectCode)) next.delete(subjectCode);
      else next.add(subjectCode);
      return next;
    });
  }

  function toggleTodos() {
    if (selecionados.size === visibleGroups.length) {
      setSelecionados(new Set());
    } else {
      setSelecionados(new Set(visibleGroups.map((g) => g.subjectCode)));
    }
  }

  const todosSelecionados =
    visibleGroups.length > 0 && selecionados.size === visibleGroups.length;
  const algumSelecionado = selecionados.size > 0;

  // Collect the classes to confirm: all classes for selected subjects
  function getConfirmedClasses() {
    return newClasses.filter((cls) => selecionados.has(cls.subjectCode));
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
            {semesterIndex + 1}º período
          </h3>
          <p className="text-sm text-gray-500 mb-3">
            {visibleGroups.length} disciplina
            {visibleGroups.length !== 1 ? "s" : ""} disponíve
            {visibleGroups.length !== 1 ? "is" : "l"} neste turno. Desmarque
            as que não deseja incluir.
          </p>
          <div className="flex items-center gap-3 flex-wrap">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-gray-500">Turno:</span>
              <div className="flex rounded-lg border border-gray-300 overflow-hidden">
                {TURNO_OPCOES.map(({ id, label }) => {
                  const count = groupBySubject(
                    getVisibleClasses(id, showLegacy),
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
              <span className="text-xs text-gray-500">Incluir PPC antigo</span>
            </label>
          </div>
        </div>

        <div className="px-6 py-2 border-b border-gray-100">
          <button
            onClick={toggleTodos}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {todosSelecionados ? "Desmarcar todas" : "Selecionar todas"}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {visibleGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível neste turno.
            </p>
          ) : (
            visibleGroups.map((g) => {
              const checked = selecionados.has(g.subjectCode);
              const multiplas = g.classes.length > 1;
              return (
                <label
                  key={g.subjectCode}
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
                    onChange={() => toggleSubject(g.subjectCode)}
                    className="mt-1 accent-blue-600 w-4 h-4 flex-shrink-0 cursor-pointer"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {g.nome || g.subjectCode}
                      </p>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                        {g.subjectCode}
                      </span>
                      {multiplas && (
                        <span className="text-xs font-semibold text-amber-600 flex-shrink-0">
                          {g.classes.length} turmas
                        </span>
                      )}
                    </div>
                    {g.classes.length > 0 && (
                      <div className="mt-1 flex flex-col gap-0.5">
                        {g.classes.map((cls, i) => {
                          const slots = Array.isArray(cls.slots) ? cls.slots : [];
                          return (
                            <div
                              key={i}
                              className="flex flex-wrap gap-x-2 text-xs text-gray-500"
                            >
                              {cls.name && (
                                <span className="font-medium text-gray-600">
                                  {cls.name}
                                </span>
                              )}
                              {slots.map((h, j) => (
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
            onClick={() => onConfirm(getConfirmedClasses(), turno)}
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