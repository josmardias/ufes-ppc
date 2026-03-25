import { useState, useMemo } from "react";
import { usePlanningContext } from "../App.jsx";
import { ppcJson, offer1Json, offer2Json } from "../data/index.js";
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

  // Build a deduplicated list of { code, name } from PPC + both system offers,
  // sorted by code.
  const courseSuggestions = useMemo(() => {
    const map = new Map(); // code -> name

    // From PPC
    for (const [key, v] of Object.entries(ppcJson?.courses ?? {})) {
      const code = String(v?.code ?? key).trim();
      if (!code || code.startsWith("Carga")) continue;
      map.set(code, String(v?.name ?? "").trim());
    }

    // From system offers (may add subjects not in PPC)
    for (const offer of [offer1Json, offer2Json]) {
      for (const s of offer?.subjects ?? []) {
        const code = String(s?.code ?? "").trim();
        if (!code) continue;
        if (!map.has(code)) map.set(code, String(s?.name ?? "").trim());
      }
    }

    return Array.from(map.entries())
      .map(([code, name]) => ({ code, name }))
      .sort((a, b) => a.code.localeCompare(b.code));
  }, []);

  const customOffer = planning?.customOffer ?? { 1: null, 2: null };
  const offer1 = normalizeOffer(customOffer[1], 1);
  const offer2 = normalizeOffer(customOffer[2], 2);

  function handleAdd(semester) {
    setAdding(semester);
  }

  function handleConfirmAdd({ semester, courseCode, section }) {
    setAdding(null);
    const suggestion = courseSuggestions.find((s) => s.code === courseCode);
    const updated = upsertCustomSection(
      customOffer[semester],
      semester,
      courseCode,
      section,
      suggestion?.name ?? "",
    );
    setCustomOffer(semester, updated);
  }

  function handleRemove(semester, subjectCode, classId) {
    const current = normalizeOffer(customOffer[semester], semester);

    const newSubjects = current.subjects
      .map((s) => {
        if (s.code !== subjectCode) return s;
        return {
          ...s,
          classes: s.classes.filter((c) => c.id !== classId),
        };
      })
      .filter((s) => s.classes.length > 0);

    setCustomOffer(semester, {
      ...current,
      semester,
      subjects: newSubjects,
    });
  }

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="mb-6">
        <h2 className="text-lg font-semibold text-gray-900">
          Oferta customizada
        </h2>
        <p className="text-sm text-gray-500 mt-1">
          Classes adicionadas aqui são mescladas à oferta do sistema e ficam
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