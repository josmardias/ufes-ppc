import { useState, useMemo } from "react";
import ppcJson from "../data/ppc-2022.json";

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

function Badge({ children, color }) {
  const colors = {
    blue: "bg-blue-100 text-blue-700 border-blue-200",
    orange: "bg-orange-100 text-orange-700 border-orange-200",
    gray: "bg-gray-100 text-gray-500 border-gray-200",
  };
  return (
    <span
      className={`inline-block text-xs font-medium px-1.5 py-0.5 rounded border ${colors[color] ?? colors.gray}`}
    >
      {children}
    </span>
  );
}

function CourseCard({ course, highlighted, onClick, dimmed }) {
  const hasPrereq = course.prereq.length > 0;
  const hasCoreq = course.coreq.length > 0;

  return (
    <div
      onClick={() => onClick(course.code)}
      className={[
        "rounded-lg border px-3 py-2.5 cursor-pointer transition-all select-none",
        highlighted === "self"
          ? "border-blue-500 bg-blue-50 shadow-md"
          : highlighted === "prereq"
            ? "border-orange-400 bg-orange-50 shadow-sm"
            : highlighted === "coreq"
              ? "border-purple-400 bg-purple-50 shadow-sm"
              : highlighted === "dependent"
                ? "border-green-400 bg-green-50 shadow-sm"
                : dimmed
                  ? "border-gray-100 bg-white opacity-30"
                  : "border-gray-200 bg-white hover:border-gray-300",
      ].join(" ")}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-mono text-xs text-gray-400 leading-none mb-0.5">
            {course.code}
          </p>
          <p className="text-sm font-medium text-gray-800 leading-snug">
            {course.name || course.code}
          </p>
        </div>
        <div className="flex flex-col gap-1 items-end flex-shrink-0">
          {hasPrereq && (
            <Badge color="orange">pré: {course.prereq.length}</Badge>
          )}
          {hasCoreq && <Badge color="blue">co: {course.coreq.length}</Badge>}
        </div>
      </div>
    </div>
  );
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
