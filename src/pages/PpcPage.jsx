import { useState, useMemo } from "react";
import { ppcJson } from "../data/index.js";
import Badge from "../components/Badge.jsx";
import CourseCard from "../components/CourseCard.jsx";

const COURSES = Object.values(ppcJson.courses).filter((c) =>
  /^[A-Z]{2,}\d{3,}$/.test(c.code),
);

function groupBySemester(courses) {
  const map = new Map();
  for (const c of courses) {
    const key = c.suggestedSemester ?? 0;
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(c);
  }
  return [...map.entries()].sort(([a], [b]) => {
    if (a === 0) return 1;
    if (b === 0) return -1;
    return a - b;
  });
}

export default function PpcPage() {
  const [selectedCode, setSelectedCode] = useState(null);

  const activeCode = selectedCode;

  const grouped = useMemo(() => groupBySemester(COURSES), []);

  const { prereqOfMap, coreqOfMap } = useMemo(() => {
    const prereqOfMap = new Map();
    const coreqOfMap = new Map();
    for (const c of COURSES) {
      for (const dep of c.prereq) {
        if (!prereqOfMap.has(dep)) prereqOfMap.set(dep, []);
        prereqOfMap.get(dep).push(c.code);
      }
      for (const dep of c.coreq) {
        if (!coreqOfMap.has(dep)) coreqOfMap.set(dep, []);
        coreqOfMap.get(dep).push(c.code);
      }
    }
    return { prereqOfMap, coreqOfMap };
  }, []);

  const prereqSet = useMemo(
    () => new Set(COURSES.find((c) => c.code === activeCode)?.prereq ?? []),
    [activeCode],
  );
  const coreqSet = useMemo(
    () => new Set(COURSES.find((c) => c.code === activeCode)?.coreq ?? []),
    [activeCode],
  );
  const dependentSet = useMemo(
    () =>
      new Set([
        ...(prereqOfMap.get(activeCode) ?? []),
        ...(coreqOfMap.get(activeCode) ?? []),
      ]),
    [activeCode, prereqOfMap, coreqOfMap],
  );

  function getHighlight(code) {
    if (!activeCode) return null;
    if (code === activeCode) return "self";
    if (prereqSet.has(code)) return "prereq";
    if (coreqSet.has(code)) return "coreq";
    if (dependentSet.has(code)) return "dependent";
    return null;
  }

  function isDimmed(code) {
    if (!activeCode) return false;
    return getHighlight(code) === null;
  }

  function handleClick(code) {
    setSelectedCode((prev) => (prev === code ? null : code));
  }

  return (
    <div className="p-6 max-w-6xl mx-auto">
      {/* Discipline tree by semester */}
      <div className="space-y-8">
        {grouped.map(([semester, courses]) => (
          <div key={semester}>
            <div className="flex items-center gap-3 mb-3">
              <h3 className="text-sm font-bold text-gray-700">
                {semester === 0
                  ? "Sem período definido"
                  : `${semester}º período`}
              </h3>
              <div className="flex-1 h-px bg-gray-200" />
              <span className="text-xs text-gray-400">
                {courses.length} disciplina{courses.length !== 1 ? "s" : ""}
              </span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {courses
                .sort((a, b) => a.code.localeCompare(b.code))
                .map((course) => (
                  <CourseCard
                    key={course.code}
                    course={course}
                    highlighted={getHighlight(course.code)}
                    dimmed={isDimmed(course.code)}
                    onClick={handleClick}
                  />
                ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
