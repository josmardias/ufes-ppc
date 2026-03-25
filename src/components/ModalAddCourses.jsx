import { useState } from "react";
import { equivalences } from "../data/index.js";
import { groupClassesBySubject } from "../domain/offer.js";
import { useEscKey } from "../hooks/useEscKey.js";

const LEGACY_CODES = new Set(
  Object.values(equivalences).flat(),
);

export default function ModalAddCourses({
  available,
  allCourses,
  semesterIndex,
  existingSubjectCodes,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);
  // Track selected subject codes (one selection = all classes for that code)
  const [selected, setSelected] = useState(new Set());
  const [onlyAccessible, setOnlyAccessible] = useState(true);
  const [showLegacy, setShowLegacy] = useState(false);
  const [search, setSearch] = useState("");

  const normalize = (s) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");

  const sourceList = onlyAccessible ? available : allCourses;
  const grouped = groupClassesBySubject(
    sourceList.filter((r) => showLegacy || !LEGACY_CODES.has(r.subjectCode)),
  );
  const displayGroups = search.trim()
    ? grouped.filter((g) => {
        const q = normalize(search.trim());
        return (
          normalize(g.subjectCode).includes(q) ||
          normalize(g.subjectName).includes(q)
        );
      })
    : grouped;

  function toggle(subjectCode) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subjectCode)) next.delete(subjectCode);
      else next.add(subjectCode);
      return next;
    });
  }

  // Collect all Class objects for selected subjects to pass to onConfirm
  function getSelectedClasses() {
    return (onlyAccessible ? available : allCourses).filter((cls) =>
      selected.has(cls.subjectCode),
    );
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
            Disciplinas disponíveis para o {semesterIndex + 1}º período.
            Selecione as que deseja adicionar.
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
              <span className="text-xs text-gray-500">Incluir PPC antigo</span>
            </label>
          </div>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {displayGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível para adicionar.
            </p>
          ) : (
            displayGroups.map((g) => {
              const checked = selected.has(g.subjectCode);
              const alreadyAdded = existingSubjectCodes?.has(g.subjectCode) ?? false;
              return (
                <label
                  key={g.subjectCode}
                  className={[
                    "flex items-start gap-3 px-2 py-2.5 rounded-lg border-b border-gray-50 last:border-0",
                    alreadyAdded
                      ? "opacity-40 cursor-not-allowed"
                      : "hover:bg-gray-50 cursor-pointer",
                  ].join(" ")}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => toggle(g.subjectCode)}
                    disabled={alreadyAdded}
                    className="mt-1 accent-blue-600 w-4 h-4 flex-shrink-0 cursor-pointer disabled:opacity-40"
                  />
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <p className="text-sm font-medium text-gray-800 leading-snug">
                        {g.subjectName || g.subjectCode}
                      </p>
                      <span className="text-xs text-gray-400 font-mono flex-shrink-0">
                        {g.subjectCode}
                      </span>
                      {alreadyAdded && (
                        <span className="text-xs text-gray-400">
                          já na grade
                        </span>
                      )}
                    </div>
                    {g.classes.length > 0 && (
                      <div className="mt-0.5 flex flex-col gap-0.5">
                        {g.classes.map((cls, i) => {
                          const slots = Array.isArray(cls.slots) ? cls.slots : [];
                          return (
                            <div
                              key={i}
                              className="flex flex-wrap gap-x-2 text-xs text-gray-400"
                            >
                              {cls.name && (
                                <span className="font-medium text-gray-500">
                                  {cls.name}
                                </span>
                              )}
                              {slots.map((s, j) => (
                                <span key={j}>
                                  {s.day} {s.start}–{s.end}
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
            onClick={() => onConfirm(getSelectedClasses())}
            disabled={selected.size === 0}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Adicionar {selected.size > 0 ? selected.size : ""}{" "}
            disciplina{selected.size !== 1 ? "s" : ""}
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