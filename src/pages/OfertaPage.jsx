import { useState, useMemo } from "react";
import ofertaS1 from "../data/oferta-semestre-1.json";
import ofertaS2 from "../data/oferta-semestre-2.json";
import equivalenciasJson from "../data/equivalencias.json";
import PeriodSection from "../components/PeriodSection.jsx";

// Set of all legacy (old) codes that have a PPC 2022 equivalent.
// These are the offer codes that belong to the old curriculum.
const LEGACY_CODES = new Set(
  Object.values(equivalenciasJson.equivalencias).flat(),
);

const SEMESTERS = [
  { id: 1, label: "1º semestre", data: ofertaS1 },
  { id: 2, label: "2º semestre", data: ofertaS2 },
];

export default function OfertaPage() {
  const [activeSemester, setActiveSemester] = useState(1);
  const [search, setSearch] = useState("");
  const [showLegacy, setShowLegacy] = useState(false);

  const ofertaData = SEMESTERS.find((s) => s.id === activeSemester)?.data;
  const disciplinas = ofertaData?.disciplinas ?? [];

  const filtered = useMemo(() => {
    const base = showLegacy
      ? disciplinas
      : disciplinas.filter((d) => !LEGACY_CODES.has(d.codigo));
    if (!search.trim()) return base;
    const q = search.trim().toLowerCase();
    return base.filter(
      (d) =>
        d.codigo.toLowerCase().includes(q) || d.nome.toLowerCase().includes(q),
    );
  }, [disciplinas, search, showLegacy]);

  const totalTurmas = filtered.reduce(
    (acc, d) => acc + (d.turmas?.length ?? 0),
    0,
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Semester tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {SEMESTERS.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setActiveSemester(s.id);
              setSearch("");
            }}
            className={[
              "px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer",
              activeSemester === s.id
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
            ].join(" ")}
          >
            {s.label}
          </button>
        ))}
      </div>

      {/* Search + stats */}
      <div className="flex items-center gap-3 mb-5">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar disciplina..."
          className="flex-1 border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <label className="flex items-center gap-1.5 cursor-pointer select-none flex-shrink-0">
          <input
            type="checkbox"
            checked={showLegacy}
            onChange={(e) => setShowLegacy(e.target.checked)}
            className="accent-blue-600 w-3.5 h-3.5"
          />
          <span className="text-xs text-gray-500">Incluir PPC antigo</span>
        </label>
        <span className="text-xs text-gray-400 flex-shrink-0">
          {filtered.length} disciplina{filtered.length !== 1 ? "s" : ""} ·{" "}
          {totalTurmas} turma{totalTurmas !== 1 ? "s" : ""}
        </span>
      </div>

      {/* fonte_pdf + gerado_em */}
      {ofertaData && (
        <p className="text-xs text-gray-300 mb-5">
          Fonte: {ofertaData.fonte_pdf} —{" "}
          {new Date(ofertaData.gerado_em).toLocaleDateString("pt-BR")}
        </p>
      )}

      {filtered.length === 0 ? (
        <div className="text-center py-12 text-gray-400 text-sm">
          Nenhuma disciplina encontrada.
        </div>
      ) : (
        <PeriodSection disciplinas={filtered} />
      )}
    </div>
  );
}