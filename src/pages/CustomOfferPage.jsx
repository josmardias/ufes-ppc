import { useState, useMemo } from "react";
import { usePlanningContext } from "../App.jsx";
import ppcJson from "../data/ppc-2022.json";
import offer1Json from "../data/oferta-semestre-1.json";
import offer2Json from "../data/oferta-semestre-2.json";
import AddSectionModal from "../components/AddSectionModal.jsx";
import SemesterPanel from "../components/SemesterPanel.jsx";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function emptyCustomOffer(semestre) {
  return { semestre, disciplinas: [] };
}

function emptySection() {
  return { turma: "", horarios: [{ dia: "Seg", inicio: "07:00", fim: "09:00" }] };
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