import { useState } from "react";
import WeekCalendar from "./WeekCalendar.jsx";
import DisciplinaCard from "./DisciplinaCard.jsx";

export default function SemestreView({
  semester,
  onResolverConflito,
  onEscolherTurma,
  onRemoverDisciplina,
  focusedSections,
  onEmptyClick,
}) {
  const [view, setView] = useState("calendar");

  return (
    <div>
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
          semester={semester}
          onConflictClick={onResolverConflito}
          onMultiSectionClick={onEscolherTurma}
          onRemoverClick={onRemoverDisciplina}
          focusedSections={focusedSections}
          onEmptyClick={onEmptyClick}
        />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {(semester?.classes ?? []).map((cls, i) => (
            <DisciplinaCard key={`${cls.subjectCode}-${cls.name}-${i}`} cls={cls} />
          ))}
        </div>
      )}
    </div>
  );
}