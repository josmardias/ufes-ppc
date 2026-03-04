import { useState, useMemo } from "react";
import ofertaS1 from "../data/oferta-semestre-1.json";
import ofertaS2 from "../data/oferta-semestre-2.json";
import ppcJson from "../data/ppc-2022.json";

// Mapa codigo -> suggestedSemester do PPC
const PPC_PERIODO = new Map(
  Object.values(ppcJson.courses)
    .filter((c) => c.suggestedSemester != null)
    .map((c) => [c.code, c.suggestedSemester]),
);

const SEMESTRES = [
  { id: 1, label: "1º semestre", data: ofertaS1 },
  { id: 2, label: "2º semestre", data: ofertaS2 },
];

const DIAS_ORDER = { Seg: 1, Ter: 2, Qua: 3, Qui: 4, Sex: 5, Sab: 6, Dom: 7 };

function formatHorarios(horarios) {
  if (!horarios || horarios.length === 0) return "—";
  return [...horarios]
    .sort((a, b) => (DIAS_ORDER[a.dia] ?? 9) - (DIAS_ORDER[b.dia] ?? 9))
    .map((h) => `${h.dia} ${h.inicio}–${h.fim}`)
    .join(" · ");
}

function TurmaRow({ turma }) {
  return (
    <div className="flex items-start gap-3 py-1.5 border-b border-gray-50 last:border-0">
      <span className="font-mono text-xs text-gray-500 w-16 flex-shrink-0 pt-0.5">
        {turma.turma || "—"}
      </span>
      <span className="text-xs text-gray-600 flex-1">
        {formatHorarios(turma.horarios)}
      </span>
      {turma.docente && (
        <span className="text-xs text-gray-400 flex-shrink-0 max-w-[140px] truncate">
          {turma.docente}
        </span>
      )}
    </div>
  );
}

function DisciplinaCard({ disciplina }) {
  const [open, setOpen] = useState(false);
  const turmas = disciplina.turmas ?? [];

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
            {turmas.length} turma{turmas.length !== 1 ? "s" : ""}
          </span>
          <span className="text-gray-300 text-xs">{open ? "▲" : "▼"}</span>
        </div>
      </button>

      {open && turmas.length > 0 && (
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
          {turmas.map((t, i) => (
            <TurmaRow key={i} turma={t} />
          ))}
        </div>
      )}

      {open && turmas.length === 0 && (
        <div className="px-4 pb-3 pt-2 border-t border-gray-100 text-xs text-gray-400">
          Sem turmas cadastradas.
        </div>
      )}
    </div>
  );
}

function PeriodoSection({ disciplinas }) {
  // Group by período sugerido no PPC
  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of disciplinas) {
      const key = PPC_PERIODO.get(d.codigo) ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(d);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    });
  }, [disciplinas]);

  return (
    <div className="space-y-6">
      {grouped.map(([periodo, discs]) => (
        <div key={periodo}>
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {periodo === 0 ? "Fora do PPC" : `${periodo}º período`}
            </h4>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">{discs.length}</span>
          </div>
          <div className="space-y-1.5">
            {discs
              .sort((a, b) => a.codigo.localeCompare(b.codigo))
              .map((d) => (
                <DisciplinaCard key={d.codigo} disciplina={d} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}

export default function OfertaPage() {
  const [activeSemestre, setActiveSemestre] = useState(1);
  const [search, setSearch] = useState("");

  const ofertaData = SEMESTRES.find((s) => s.id === activeSemestre)?.data;
  const disciplinas = ofertaData?.disciplinas ?? [];

  const filtered = useMemo(() => {
    if (!search.trim()) return disciplinas;
    const q = search.trim().toLowerCase();
    return disciplinas.filter(
      (d) =>
        d.codigo.toLowerCase().includes(q) || d.nome.toLowerCase().includes(q),
    );
  }, [disciplinas, search]);

  const totalTurmas = filtered.reduce(
    (acc, d) => acc + (d.turmas?.length ?? 0),
    0,
  );

  return (
    <div className="p-6 max-w-5xl mx-auto">
      {/* Semester tabs */}
      <div className="flex gap-0 border-b border-gray-200 mb-6">
        {SEMESTRES.map((s) => (
          <button
            key={s.id}
            onClick={() => {
              setActiveSemestre(s.id);
              setSearch("");
            }}
            className={[
              "px-5 py-2.5 text-sm font-medium border-b-2 transition-colors cursor-pointer",
              activeSemestre === s.id
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
        <PeriodoSection disciplinas={filtered} />
      )}
    </div>
  );
}
