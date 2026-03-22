import SectionCard from "./SectionCard.jsx";

export default function SemesterPanel({ semestre, offer, onAdd, onRemove }) {
  const disciplinas = offer?.disciplinas ?? [];
  // Flatten to a list of { courseCode, courseName, section } for display
  const entries = disciplinas.flatMap((d) =>
    (d.turmas ?? []).map((t) => ({
      courseCode: d.codigo,
      courseName: d.nome ?? "",
      section: t,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {semestre}º semestre
        </h3>
        <button
          onClick={() => onAdd(semestre)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
        >
          + Turma
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Nenhuma turma customizada para o {semestre}º semestre.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(({ courseCode, courseName, section }, i) => (
            <SectionCard
              key={`${courseCode}-${section.turma}-${i}`}
              courseCode={courseCode}
              courseName={courseName}
              section={section}
              onRemove={() => onRemove(semestre, courseCode, section.turma)}
            />
          ))}
        </div>
      )}
    </div>
  );
}