import { useState } from "react";
import ScheduleRow from "./ScheduleRow.jsx";
import CourseCombobox from "./CourseCombobox.jsx";
import { DAY_LABELS } from "./ScheduleRow.jsx";
import { useEscKey } from "../hooks/useEscKey.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySchedule() {
  return { day: "Mon", start: "07:00", end: "09:00" };
}

// ---------------------------------------------------------------------------
// AddSectionModal
// ---------------------------------------------------------------------------

export default function AddSectionModal({
  semester,
  courseSuggestions,
  accessibleCodes,
  initialSchedules,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);
  const [courseCode, setCourseCode] = useState("");
  const [sectionId, setSectionId] = useState("");
  const [onlyAccessible, setOnlyAccessible] = useState(accessibleCodes != null);
  const [schedules, setSchedules] = useState(
    initialSchedules && initialSchedules.length > 0
      ? initialSchedules
      : [emptySchedule()],
  );
  const [error, setError] = useState("");

  function handleAddSchedule() {
    setSchedules((prev) => [...prev, emptySchedule()]);
  }

  function handleChangeSchedule(i, updated) {
    setSchedules((prev) => prev.map((s, idx) => (idx === i ? updated : s)));
  }

  function handleRemoveSchedule(i) {
    setSchedules((prev) => prev.filter((_, idx) => idx !== i));
  }

  function handleConfirm() {
    const code = courseCode.trim().toUpperCase();
    const sec = sectionId.trim();
    if (!code) return setError("Informe o código da disciplina.");
    if (!sec) return setError("Informe o código da turma.");

    // Validate schedules
    for (const s of schedules) {
      if (s.start >= s.end) {
        return setError(
          `Horário inválido: ${DAY_LABELS[s.day]} ${s.start} → ${s.end} (fim deve ser após início).`,
        );
      }
    }

    onConfirm({
      semester,
      courseCode: code,
      section: {
        id: sec,
        slots: schedules.map((s) => ({ day: s.day, start: s.start, end: s.end })),
        instructor: null,
      },
    });
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onCancel}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-md mx-4 flex flex-col gap-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-base font-semibold text-gray-800">
          Adicionar turma — {semester}º semestre
        </h2>

        {/* Course code */}
        <div className="flex flex-col gap-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">
              Código da disciplina
            </label>
            {accessibleCodes != null && (
              <label className="flex items-center gap-1.5 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={onlyAccessible}
                  onChange={(e) => setOnlyAccessible(e.target.checked)}
                  className="accent-blue-600 w-3.5 h-3.5"
                />
                <span className="text-xs text-gray-500">Só acessíveis</span>
              </label>
            )}
          </div>
          <CourseCombobox
            value={courseCode}
            onChange={(v) => {
              setCourseCode(v);
              setError("");
            }}
            suggestions={
              onlyAccessible && accessibleCodes != null
                ? courseSuggestions.filter((s) => accessibleCodes.has(s.code))
                : courseSuggestions
            }
            placeholder="ex: ELE15940 ou nome da disciplina"
          />
        </div>

        {/* Section code */}
        <div className="flex flex-col gap-1">
          <label className="text-xs font-medium text-gray-500">
            Código da turma
            </label>
          <input
            value={sectionId}
            onChange={(e) => {
              setSectionId(e.target.value);
              setError("");
            }}
            placeholder="ex: 06.1 N"
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
          />
        </div>

        {/* Schedules */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between">
            <label className="text-xs font-medium text-gray-500">
              Horários
            </label>
            <button
              onClick={handleAddSchedule}
              className="text-xs text-blue-600 hover:text-blue-800 cursor-pointer"
            >
              + Adicionar horário
            </button>
          </div>
          <div className="flex flex-col gap-2">
            {schedules.map((s, i) => (
              <ScheduleRow
                key={i}
                schedule={s}
                onChange={(updated) => handleChangeSchedule(i, updated)}
                onRemove={() => handleRemoveSchedule(i)}
                canRemove={schedules.length > 1}
              />
            ))}
          </div>
        </div>

        {error && <p className="text-xs text-red-600">{error}</p>}

        <div className="flex gap-2 pt-1">
          <button
            onClick={onCancel}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 hover:border-gray-400 text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
          <button
            onClick={handleConfirm}
            className="flex-1 py-2.5 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Adicionar
          </button>
        </div>
      </div>
    </div>
  );
}