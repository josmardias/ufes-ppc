export const DAYS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export const DAY_LABELS = {
  Mon: "Segunda",
  Tue: "Terça",
  Wed: "Quarta",
  Thu: "Quinta",
  Fri: "Sexta",
  Sat: "Sábado",
};

export const HOURS = Array.from({ length: 16 }, (_, i) => {
  const h = 7 + i;
  return `${String(h).padStart(2, "0")}:00`;
});

export default function ScheduleRow({ schedule, onChange, onRemove, canRemove }) {
  return (
    <div className="flex items-center gap-2">
      <select
        value={schedule.day}
        onChange={(e) => onChange({ ...schedule, day: e.target.value })}
        className="border border-gray-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      >
        {DAYS.map((d) => (
          <option key={d} value={d}>
            {DAY_LABELS[d]}
          </option>
        ))}
      </select>
      <select
        value={schedule.start}
        onChange={(e) => onChange({ ...schedule, start: e.target.value })}
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
        value={schedule.end}
        onChange={(e) => onChange({ ...schedule, end: e.target.value })}
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