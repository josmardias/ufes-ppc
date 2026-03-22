// src/components/CourseCard.jsx
// Card representing a PPC subject, used in the PPC grid view.
import Badge from "./Badge.jsx";

export default function CourseCard({ course, highlighted, onClick, dimmed }) {
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
            <Badge color="orange" variant="tag">pré: {course.prereq.length}</Badge>
          )}
          {hasCoreq && <Badge color="blue" variant="tag">co: {course.coreq.length}</Badge>}
        </div>
      </div>
    </div>
  );
}