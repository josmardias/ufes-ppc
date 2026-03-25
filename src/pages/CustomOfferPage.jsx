import { useState, useMemo } from "react";
import { usePlanningContext } from "../App.jsx";
import ppcJson from "../data/ppc-2022.json";
import offer1Json from "../data/oferta-semestre-1.json";
import offer2Json from "../data/oferta-semestre-2.json";
import AddSectionModal from "../components/AddSectionModal.jsx";
import SemesterPanel from "../components/SemesterPanel.jsx";
import {
  upsertCustomSection,
  normalizeOffer,
} from "../domain/offer.js";



// ---------------------------------------------------------------------------
// CustomOfferPage
// ---------------------------------------------------------------------------

export default function CustomOfferPage() {
  const { planning, setCustomOffer } = usePlanningContext();
  const [adding, setAdding] = useState(null); // semester: 1 | 2 | null

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

  function handleAdd(semester) {
    setAdding(semester);
  }

  function handleConfirmAdd({ semester, courseCode, section }) {
    setAdding(null);
    // Look up the name from suggestions for a well-formed custom offer entry
    const suggestion = courseSuggestions.find((s) => s.codigo === courseCode);
    const updated = upsertCustomSection(
      customOffer[semester],
      semester,
      courseCode,
      section,
      suggestion?.nome ?? "",
    );
    setCustomOffer(semester, updated);
  }

  function handleRemove(semester, courseCode, turmaCode) {
    const current = normalizeOffer(customOffer[semester], semester);

    const newDisciplinas = current.disciplinas
      .map((d) => {
        if (d.codigo !== courseCode) return d;
        return {
          ...d,
          turmas: d.turmas.filter((t) => (t.turma ?? t.codigo) !== turmaCode),
        };
      })
      .filter((d) => d.turmas.length > 0); // remove empty discipline entries

    setCustomOffer(semester, {
      ...current,
      semestre: semester,
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
          semester={1}
          offer={offer1}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
        <div className="border-t border-gray-200" />
        <SemesterPanel
          semester={2}
          offer={offer2}
          onAdd={handleAdd}
          onRemove={handleRemove}
        />
      </div>

      {adding !== null && (
        <AddSectionModal
          semester={adding}
          courseSuggestions={courseSuggestions}
          onConfirm={handleConfirmAdd}
          onCancel={() => setAdding(null)}
        />
      )}
    </div>
  );
}