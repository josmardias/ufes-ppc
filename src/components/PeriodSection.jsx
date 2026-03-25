import { useMemo } from "react";
import { ppcJson } from "../data/index.js";
import OfferCourseCard from "./OfferCourseCard.jsx";

// Map: code -> suggestedSemester from the PPC data
const PPC_PERIOD = new Map(
  Object.values(ppcJson.courses)
    .filter((c) => c.suggestedSemester != null)
    .map((c) => [c.code, c.suggestedSemester]),
);

export default function PeriodSection({ subjects }) {
  const grouped = useMemo(() => {
    const map = new Map();
    for (const s of subjects) {
      const key = PPC_PERIOD.get(s.code) ?? 0;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(s);
    }
    return [...map.entries()].sort(([a], [b]) => {
      if (a === 0) return 1;
      if (b === 0) return -1;
      return a - b;
    });
  }, [subjects]);

  return (
    <div className="space-y-6">
      {grouped.map(([period, periodSubjects]) => (
        <div key={period}>
          <div className="flex items-center gap-3 mb-2">
            <h4 className="text-xs font-bold text-gray-500 uppercase tracking-wider">
              {period === 0 ? "Fora do PPC" : `${period}º período`}
            </h4>
            <div className="flex-1 h-px bg-gray-100" />
            <span className="text-xs text-gray-400">{periodSubjects.length}</span>
          </div>
          <div className="space-y-1.5">
            {periodSubjects
              .sort((a, b) => a.code.localeCompare(b.code))
              .map((s) => (
                <OfferCourseCard key={s.code} subject={s} />
              ))}
          </div>
        </div>
      ))}
    </div>
  );
}