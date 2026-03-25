import { useState } from "react";

const DAY_ORDER = { Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sab: 6, Dom: 7 };

function formatSchedules(schedules) {
  if (!schedules || schedules.length === 0) return "—";
  return [...schedules]
    .sort((a, b) => (DAY_ORDER[a.dia] ?? 9) - (DAY_ORDER[b.dia] ?? 9))
    .map((h) => `${h.dia} ${h.inicio}–${h.fim}`)
    .join(" · ");
}

function SectionRow({ section }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0 pt-0.5">
        {section.turma || "—"}
      </span>
      <span className="text-xs text-gray-600 flex-1">
        {formatSchedules(section.horarios)}
      </span>
      {section.docente && (
        <span className="text-xs text-gray-400 flex-shrink-0 max-w-[140px] truncate">
          {section.docente}
        </span>
      )}
    </div>
  );
}

export default function OfferCourseCard({ disciplina }) {
  const [open, setOpen] = useState(false);
  const sections = disciplina.turmas ?? [];

  return (
    <div className="bg-white border border-gray-200 rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-gray-50 transition-colors cursor-pointer"
      >
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs text-gray-400 flex-shrink-0">
              {disciplina.codigo}
            </span>
            <span className="text-sm font-medium text-gray-800 truncate">
              {disciplina.nome}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {disciplina.carga_horaria && (
            <span className="text-xs text-gray-400">
              {disciplina.carga_horaria}h
            </span>
          )}
          <span className="text-xs bg-gray-100 text-gray-600 rounded px-1.5 py-0.5">
            {sections.length} turma{sections.length !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-300 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && sections.length > 0 && (
        <div className="px-4 pb-3 border-t border-gray-100">
          <div className="flex items-center gap-2 py-1.5 mb-1">
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-16">
              Turma
            </span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider flex-1">
              Horários
            </span>
            <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider w-[140px]">
              Docente
            </span>
          </div>
          {sections.map((s, i) => (
            <SectionRow key={i} section={s} />
          ))}
        </div>
      )}

      {open && sections.length === 0 && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
          Sem turmas cadastradas.
        </div>
      )}
    </div>
  );
}