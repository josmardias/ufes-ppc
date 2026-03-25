import { useMemo } from "react";
import ppcJson from "../data/ppc-2022.json";
import OfferCourseCard from "./OfferCourseCard.jsx";

// Map: codigo -> suggestedSemester from the PPC data
const PPC_PERIOD = new Map(
  Object.values(ppcJson.courses)
    .filter((c) => c.suggestedSemester != null)
    .map((c) => [c.code, c.suggestedSemester]),
);

export default function PeriodSection({ disciplinas }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const d of disciplinas) {
      const key = PPC_PERIOD.get(d.codigo) ?? 0;
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
      {grouped.map(([period, courses]) => (
        <div key={period}>
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {period === 0 ? "Fora do PPC" : `${period}º período`}
            </h4>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">{courses.length}</span>
          </div>
          <div className="space-y-1.5">
            {courses
              .sort((a, b) => a.codigo.localeCompare(b.codigo))
              .map((d) => (
                <OfferCourseCard key={d.codigo} disciplina={d} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}