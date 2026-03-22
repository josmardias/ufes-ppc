import { useState } from "react";
import { DAY_LABELS } from "./ScheduleRow.jsx";

export default function SectionCard({ courseCode, courseName, section, onRemove }) {
  const [confirming, setConfirming] = useState(false);

  return (
    <div className="flex items-start justify-between gap-3 bg-white border border-gray-200 rounded-xl px-4 py-3">
      <div className="flex flex-col gap-1 min-w-0">
        <div className="flex items-baseline gap-2">
          <span className="font-mono text-sm font-semibold text-gray-800">
            {courseCode}
          </span>
          <span className="text-xs text-gray-500">turma {section.turma}</span>
        </div>
        {courseName && courseName !== courseCode && (
          <span className="text-xs text-gray-600 truncate">{courseName}</span>
        )}
        <div className="flex flex-col gap-0.5">
          {section.horarios.map((h, i) => (
            <span key={i} className="text-xs text-gray-500">
              {DAY_LABELS[h.dia] ?? h.dia} {h.inicio}–{h.fim}
            </span>
          ))}
        </div>
      </div>
      <button
        onClick={() => {
          if (confirming) {
            onRemove();
          } else {
            setConfirming(true);
          }
        }}
        onBlur={() => setConfirming(false)}
        className={[
          "flex-shrink-0 text-xs font-medium px-2 py-1 rounded-lg border transition-colors cursor-pointer whitespace-nowrap",
          confirming
            ? "bg-red-600 text-white border-red-600 hover:bg-red-700"
            : "text-red-400 border-transparent hover:text-red-600",
        ].join(" ")}
      >
        {confirming ? "Confirmar remoção" : "✕"}
      </button>
    </div>
  );
}