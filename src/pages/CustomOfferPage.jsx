import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { usePlanningContext } from "../App.jsx";
import ppcJson from "../data/ppc-2022.json";
import offer1Json from "../data/oferta-semestre-1.json";
import offer2Json from "../data/oferta-semestre-2.json";

// ---------------------------------------------------------------------------
// useEscKey
// ---------------------------------------------------------------------------

function useEscKey(handler) {
  const ref = useRef(handler);
  ref.current = handler;
  useEffect(() => {
    function onKey(e) {
      if (e.key === "Escape") ref.current?.();
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const DAYS = ["Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];

const DAY_LABELS = {
  Seg: "Segunda",
  Ter: "Terça",
  Qua: "Quarta",
  Qui: "Quinta",
  Sex: "Sexta",
  Sab: "Sábado",
};

const HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = 7 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptySchedule() {
  return { dia: "Seg", inicio: "07:00", fim: "09:00" };
}

function emptySection() {
  return { turma: "", horarios: [emptySchedule()] };
}

function emptyCustomOffer(semestre) {
  return { semestre, disciplinas: [] };
}

function normalizeOffer(raw, semestre) {
  if (!raw || !Array.isArray(raw.disciplinas))
    return emptyCustomOffer(semestre);
  return raw;
}

/**
 * Inserts a new section into a custom offer object, creating the discipline
 * entry if it doesn't exist yet. Returns the updated offer object.
 * Silently skips if the turma code already exists for that discipline.
 *
 * @param {object|null} currentOffer — existing custom offer for the semester (may be null)
 * @param {number} semestre          — 1 or 2
 * @param {string} courseCode        — e.g. "ELE15940"
 * @param {{ turma, horarios, docente }} section
 * @returns {object} — updated offer with same shape as system offer JSON
 */
export function upsertCustomSection(
  currentOffer,
  semestre,
  courseCode,
  section,
  courseName = "",
) {
  const current = normalizeOffer(currentOffer, semestre);
  const existing = current.disciplinas.find((d) => d.codigo === courseCode);
  let newDisciplinas;

  if (existing) {
    const alreadyHas = existing.turmas.some(
      (t) => (t.turma ?? t.codigo) === section.turma,
    );
    newDisciplinas = current.disciplinas.map((d) => {
      if (d.codigo !== courseCode) return d;
      const updatedTurmas = alreadyHas
        ? // Section exists — append new horarios (dedup by dia+inicio+fim)
          d.turmas.map((t) => {
            if ((t.turma ?? t.codigo) !== section.turma) return t;
            const existingKeys = new Set(
              (t.horarios ?? []).map((h) => `${h.dia}|${h.inicio}|${h.fim}`),
            );
            const newHorarios = (section.horarios ?? []).filter(
              (h) => !existingKeys.has(`${h.dia}|${h.inicio}|${h.fim}`),
            );
            return { ...t, horarios: [...(t.horarios ?? []), ...newHorarios] };
          })
        : [...d.turmas, section];
      return {
        ...d,
        nome: d.nome && d.nome !== courseCode ? d.nome : courseName || d.nome,
        turmas: updatedTurmas,
      };
    });
  } else {
    newDisciplinas = [
      ...current.disciplinas,
      {
        semestre,
        periodo: "",
        codigo: courseCode,
        nome: courseName || courseCode,
        carga_horaria: null,
        turmas: [section],
      },
    ];
  }

  return { ...current, semestre, disciplinas: newDisciplinas };
}

// ---------------------------------------------------------------------------
// ScheduleRow — single dia/inicio/fim row
// ---------------------------------------------------------------------------

function ScheduleRow({ schedule, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={schedule.dia}
        onChange={(e) => onChange({ ...schedule, dia: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {DAY_LABELS[d]}
          </option>
        ))}
      </select>
      <select
        value={schedule.inicio}
        onChange={(e) => onChange({ ...schedule, inicio: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-gray-400 text-sm">→</span>
      <select
        value={schedule.fim}
        onChange={(e) => onChange({ ...schedule, fim: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      {canRemove && (
        <button
          onClick={onRemove}
          className="text-red-400 hover:text-red-600 text-sm cursor-pointer px-1"
          title="Remover horário"
        >
          ✕
        </button>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// CourseCombobox — searchable dropdown with keyboard navigation and highlight
// ---------------------------------------------------------------------------

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Returns a match score for query against text, or null if no match.
 * Higher score = better match.
 *
 * Scoring tiers:
 *   3 — substring match at start of text
 *   2 — substring match anywhere
 *   1 — subsequence match (each char of query appears in order in text)
 *   null — no match
 *
 * Subsequence matching enables "FIS IV" to match "FÍSICA IV":
 * each normalized character of the query must appear in the target
 * in the same order, but not necessarily contiguously.
 */
function matchScore(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 2;

  // Tier 3 / 2: substring
  const idx = t.indexOf(q);
  if (idx === 0) return 3;
  if (idx !== -1) return 2;

  // Tier 1: subsequence — try to consume every char of q in order within t
  let ti = 0;
  let qi = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) qi++;
    ti++;
  }
  if (qi === q.length) return 1;

  return null;
}

/**
 * For subsequence matches, returns the indices in `text` that were matched,
 * so we can highlight them individually.
 */
function subsequenceIndices(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  const indices = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return qi === q.length ? indices : [];
}

function highlightMatch(text, query) {
  if (!query) return text;
  const normText = normalize(text);
  const normQuery = normalize(query);

  // Substring match — highlight the contiguous run
  const idx = normText.indexOf(normQuery);
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-inherit rounded-sm">
          {text.slice(idx, idx + normQuery.length)}
        </mark>
        {text.slice(idx + normQuery.length)}
      </>
    );
  }

  // Subsequence match — highlight each individually matched character
  const indices = subsequenceIndices(text, query);
  if (indices.length === 0) return text;
  const parts = [];
  let last = 0;
  for (const i of indices) {
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className="bg-yellow-200 text-inherit rounded-sm">
        {text[i]}
      </mark>,
    );
    last = i + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

function CourseCombobox({ value, onChange, suggestions, placeholder }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Keep query in sync when value is cleared externally
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return suggestions.slice(0, 50);

    // Score each suggestion against both codigo and nome, take the best score
    const scored = suggestions
      .map((s) => {
        const sc = matchScore(s.codigo, q);
        const sn = matchScore(s.nome, q);
        const score = Math.max(sc ?? -1, sn ?? -1);
        return { s, score };
      })
      .filter(({ score }) => score >= 1)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ s }) => s).slice(0, 50);
  }, [query, suggestions]);

  function select(s) {
    setQuery(s.codigo);
    onChange(s.codigo);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function handleInputChange(e) {
    const v = e.target.value;
    setQuery(v);
    onChange(v.toUpperCase());
    setOpen(true);
    setActiveIdx(-1);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) {
        select(filtered[activeIdx]);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx];
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto"
        >
          {filtered.map((s, i) => (
            <li
              key={s.codigo}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                "flex flex-col px-3 py-2 cursor-pointer select-none",
                i === activeIdx ? "bg-blue-50" : "hover:bg-gray-50",
                i > 0 ? "border-t border-gray-100" : "",
              ].join(" ")}
            >
              <span className="text-sm font-mono font-semibold text-gray-800">
                {highlightMatch(s.codigo, query)}
              </span>
              {s.nome && (
                <span className="text-xs text-gray-500 truncate">
                  {highlightMatch(s.nome, query)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// AddSectionModal
// ---------------------------------------------------------------------------

export function AddSectionModal({
  semestre,
  courseSuggestions,
  accessibleCodes,
  initialSchedules,
  onConfirm,
  onCancel,
}) {
  useEscKey(onCancel);
  const [courseCode, setCourseCode] = useState("");
  const [sectionCode, setSectionCode] = useState("");
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
    const sec = sectionCode.trim();
    if (!code) return setError("Informe o código da disciplina.");
    if (!sec) return setError("Informe o código da turma.");

    // Validate schedules
    for (const s of schedules) {
      if (s.inicio >= s.fim) {
        return setError(
          `Horário inválido: ${DAY_LABELS[s.dia]} ${s.inicio} → ${s.fim} (fim deve ser após início).`,
        );
      }
    }

    onConfirm({
      semestre,
      courseCode: code,
      section: {
        turma: sec,
        horarios: schedules.map((s) => ({
          dia: s.dia,
          inicio: s.inicio,
          fim: s.fim,
        })),
        docente: "",
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
          Adicionar turma — {semestre}º semestre
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
                ? courseSuggestions.filter((s) => accessibleCodes.has(s.codigo))
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
            value={sectionCode}
            onChange={(e) => {
              setSectionCode(e.target.value);
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

// ---------------------------------------------------------------------------
// SectionCard — displays a single custom section entry
// ---------------------------------------------------------------------------

function SectionCard({ courseCode, courseName, section, onRemove }) {
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

// ---------------------------------------------------------------------------
// SemesterPanel — lists and manages custom sections for one semester
// ---------------------------------------------------------------------------

function SemesterPanel({ semestre, offer, onAdd, onRemove }) {
  const disciplinas = offer?.disciplinas ?? [];
  // Flatten to a list of { courseCode, section } for display
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

// ---------------------------------------------------------------------------
// CustomOfferPage
// ---------------------------------------------------------------------------

export default function CustomOfferPage() {
  const { planning, setCustomOffer } = usePlanningContext();
  const [adding, setAdding] = useState(null); // semestre: 1 | 2 | null

  // Build a deduplicated list of { codigo, nome } from PPC + both system offers,
  // sorted by PPC suggested semester then code.
  const courseSuggestions = useMemo(() => {
    const map = new Map(); // codigo -> nome

    // From PPC
    for (const [key, v] of Object.entries(ppcJson?.courses ?? {})) {
      const codigo = String(v?.code ?? key).trim();
      if (!codigo || codigo.startsWith("Carga")) continue;
      map.set(codigo, String(v?.name ?? "").trim());
    }

    // From system offers (may add disciplines not in PPC)
    for (const offerJson of [offer1Json, offer2Json]) {
      for (const d of offerJson?.disciplinas ?? []) {
        const codigo = String(d?.codigo ?? "").trim();
        if (!codigo) continue;
        if (!map.has(codigo)) map.set(codigo, String(d?.nome ?? "").trim());
      }
    }

    return Array.from(map.entries())
      .map(([codigo, nome]) => ({ codigo, nome }))
      .sort((a, b) => a.codigo.localeCompare(b.codigo));
  }, []);

  const customOffer = planning?.customOffer ?? { 1: null, 2: null };
  const offer1 = normalizeOffer(customOffer[1], 1);
  const offer2 = normalizeOffer(customOffer[2], 2);

  function handleAdd(semestre) {
    setAdding(semestre);
  }

  function handleConfirmAdd({ semestre, courseCode, section }) {
    setAdding(null);
    // Look up the name from suggestions for a well-formed custom offer entry
    const suggestion = courseSuggestions.find((s) => s.codigo === courseCode);
    const updated = upsertCustomSection(
      customOffer[semestre],
      semestre,
      courseCode,
      section,
      suggestion?.nome ?? "",
    );
    setCustomOffer(semestre, updated);
  }

  function handleRemove(semestre, courseCode, turmaCode) {
    const current = normalizeOffer(customOffer[semestre], semestre);

    const newDisciplinas = current.disciplinas
      .map((d) => {
        if (d.codigo !== courseCode) return d;
        return {
          ...d,
          turmas: d.turmas.filter((t) => (t.turma ?? t.codigo) !== turmaCode),
        };
      })
      .filter((d) => d.turmas.length > 0); // remove empty discipline entries

    setCustomOffer(semestre, {
      ...current,
      semestre,
      disciplinas: newDisciplinas,
    });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Oferta customizada
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Turmas adicionadas aqui são mescladas à oferta do sistema e ficam
          disponíveis para este perfil.
        </p>
      </div>

      <div className="flex flex-col gap-8">
        <SemesterPanel
          semestre={1}
          offer={offer1}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
        <div className="border-t border-gray-200" />
        <SemesterPanel
          semestre={2}
          offer={offer2}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>

      {adding !== null && (
        <AddSectionModal
          semestre={adding}
          courseSuggestions={courseSuggestions}
          onConfirm={handleConfirmAdd}
          onCancel={() => setAdding(null)}
        />
      )}
    </div>
  );
}
