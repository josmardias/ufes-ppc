import SectionCard from "./SectionCard.jsx";

export default function SemesterPanel({ semester, offer, onAdd, onRemove }) {
  const subjects = offer?.subjects ?? [];
  const entries = subjects.flatMap((s) =>
    (s.classes ?? []).map((cls) => ({
      subjectCode: s.code,
      subjectName: s.name ?? "",
      cls,
    })),
  );

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">
          {semester}º semestre
        </h3>
        <button
          onClick={() => onAdd(semester)}
          className="px-3 py-1.5 text-xs font-medium rounded-lg border border-blue-300 text-blue-600 bg-white hover:border-blue-500 hover:bg-blue-50 transition-colors cursor-pointer"
        >
          + Class
        </button>
      </div>

      {entries.length === 0 ? (
        <p className="text-sm text-gray-400 py-4 text-center">
          Nenhuma turma customizada para o {semester}º semestre.
        </p>
      ) : (
        <div className="flex flex-col gap-2">
          {entries.map(({ subjectCode, subjectName, cls }, i) => (
            <SectionCard
              key={`${subjectCode}-${cls.id}-${i}`}
              subjectCode={subjectCode}
              subjectName={subjectName}
              cls={cls}
              onRemove={() => onRemove(semester, subjectCode, cls.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}