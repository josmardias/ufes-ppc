// src/components/ScheduleClassCard.jsx
// Renders a single Class card in the schedule builder cards view.
export default function ScheduleClassCard({ cls }) {
  const slots = Array.isArray(cls.slots) ? cls.slots : [];
  return (
    <div className="bg-white border border-gray-200 rounded-lg p-4 flex flex-col gap-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <span className="font-mono text-xs text-gray-400">{cls.subjectCode}</span>
          {cls.name && (
            <span className="ml-2 text-xs text-gray-500">{cls.name}</span>
          )}
          <p className="font-medium text-gray-900 text-sm leading-snug">
            {cls.subjectName || cls.subjectCode}
          </p>
        </div>
      </div>
      {slots.length > 0 && (
        <div className="flex flex-wrap gap-x-3 gap-y-0.5">
          {slots.map((h, j) => (
            <span key={j} className="text-xs text-gray-500">
              {h.day} {h.start}–{h.end}
            </span>
          ))}
        </div>
      )}
    </div>
  );
}