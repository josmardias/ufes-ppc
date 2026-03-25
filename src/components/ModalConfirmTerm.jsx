import { useState } from "react";
import { useEscKey } from "../hooks/useEscKey.js";
import equivalenciasJson from "../data/equivalencias.json";
import { classMatchesShift, groupClassesBySubject } from "../domain/offer.js";

const LEGACY_CODES = new Set(
  Object.values(equivalenciasJson.equivalencias).flat(),
);

export const SHIFT_OPTIONS = [
  { id: "dia", label: "Dia" },
  { id: "manha", label: "Manhã" },
  { id: "tarde", label: "Tarde" },
];

export default function ModalConfirmTerm({
  newClasses,
  semesterIndex,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);

  const [shift, setShift] = useState(() => {
    // Auto-detect shift from the majority of slots
    return "dia";
  });
  const [showLegacy, setShowLegacy] = useState(false);

  // Visible classes filtered by shift + legacy toggle
  function getVisibleClasses(s, legacy) {
    return newClasses.filter(
      (cls) =>
        classMatchesShift(cls, s) &&
        (legacy || !LEGACY_CODES.has(cls.subjectCode)),
    );
  }

  // Visible groups (one per unique subjectCode among visible classes)
  const visibleClasses = getVisibleClasses(shift, showLegacy);
  const visibleGroups = groupClassesBySubject(visibleClasses);

  // Selection is by subjectCode; selecting a subject selects ALL its classes
  const [selected, setSelected] = useState(
    () => new Set(visibleGroups.map((g) => g.subjectCode)),
  );

  function handleShiftChange(newShift) {
    setShift(newShift);
    const visible = groupClassesBySubject(getVisibleClasses(newShift, showLegacy));
    setSelected(new Set(visible.map((g) => g.subjectCode)));
  }

  function handleShowLegacyChange(val) {
    setShowLegacy(val);
    const visible = groupClassesBySubject(getVisibleClasses(shift, val));
    setSelected(new Set(visible.map((g) => g.subjectCode)));
  }

  function toggleSubject(subjectCode) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(subjectCode)) next.delete(subjectCode);
      else next.add(subjectCode);
      return next;
    });
  }

  function toggleAll() {
    if (selected.size === visibleGroups.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(visibleGroups.map((g) => g.subjectCode)));
    }
  }

  const allSelected =
    visibleGroups.length > 0 && selected.size === visibleGroups.length;
  const anySelected = selected.size > 0;

  // Collect the classes to confirm: all classes for selected subjects
  function getConfirmedClasses() {
    return newClasses.filter((cls) => selected.has(cls.subjectCode));
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
                {SHIFT_OPTIONS.map(({ id, label }) => {
                  const count = groupClassesBySubject(
                    getVisibleClasses(id, showLegacy),
                  ).length;
                  return (
                    <button
                      key={id}
                      onClick={() => handleShiftChange(id)}
                      className={[
                        "px-3 py-1.5 text-xs font-medium transition-colors cursor-pointer flex flex-col items-center leading-tight",
                        shift === id
                          ? "bg-blue-600 text-white"
                          : "bg-white text-gray-600 hover:bg-gray-50",
                      ].join(" ")}
                    >
                      <span>{label}</span>
                      <span
                        className={`text-xs ${shift === id ? "text-blue-200" : "text-gray-400"}`}
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
            onClick={toggleAll}
            className="text-xs font-medium text-blue-600 hover:text-blue-800 cursor-pointer"
          >
            {allSelected ? "Desmarcar todas" : "Selecionar todas"}
          </button>
        </div>

        <div className="overflow-y-auto flex-1 px-4 py-2">
          {visibleGroups.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-8">
              Nenhuma disciplina disponível neste turno.
            </p>
          ) : (
            visibleGroups.map((g) => {
              const checked = selected.has(g.subjectCode);
              const multiSection = g.classes.length > 1;
              return (
                <label
                  key={g.subjectCode}
                  className={[
                    "flex items-start gap-3 px-2 py-2.5 rounded-lg border-b border-gray-50 last:border-0 cursor-pointer",
                    multiSection
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
                      {multiSection && (
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
            onClick={() => onConfirm(getConfirmedClasses(), shift)}
            disabled={!anySelected}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Adicionar {selected.size} disciplina
            {selected.size !== 1 ? "s" : ""}
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