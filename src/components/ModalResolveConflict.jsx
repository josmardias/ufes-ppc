import { useState } from "react";
import { useEscKey } from "../hooks/useEscKey.js";

export default function ModalResolveConflict({
  day,
  blockStart,
  candidates,
  initialPending,
  onChoose,
  onRemoveSection,
  onClose,
}) {
  useEscKey(onClose);
  const [pending, setPending] = useState(initialPending ?? null);
  const [pendingRemove, setPendingRemove] = useState(null);
  const horaLabel = `${String(Math.floor(blockStart / 60)).padStart(2, "0")}:00`;

  function handleClick(c) {
    setPendingRemove(null);
    const key = `${c.courseCode}-${c.sectionCode}`;
    const pendingKey = pending
      ? `${pending.courseCode}-${pending.sectionCode}`
      : null;
    if (pendingKey === key) {
      onChoose(c.courseCode, c.sectionCode);
    } else {
      setPending(c);
    }
  }

  function handleRemoveClick(c) {
    setPending(null);
    const key = `${c.courseCode}-${c.sectionCode}`;
    const pendingRemoveKey = pendingRemove
      ? `${pendingRemove.courseCode}-${pendingRemove.sectionCode}`
      : null;
    if (pendingRemoveKey === key) {
      onRemoveSection(c.courseCode, c.sectionCode);
    } else {
      setPendingRemove(c);
    }
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/40"
      onClick={onClose}
    >
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4"
        onClick={(e) => e.stopPropagation()}
      >
        <h3 className="text-base font-bold text-gray-900 mb-1">
          Resolver conflito
        </h3>
        <p className="text-sm text-gray-500 mb-4">
          {day} {horaLabel} — escolha a turma vencedora. As demais serão
          removidas deste slot.
        </p>
        <div className="flex flex-col gap-2">
          {candidates.map((c) => {
            const key = `${c.courseCode}-${c.sectionCode}`;
            const isPending =
              pending && `${pending.courseCode}-${pending.sectionCode}` === key;
            const isPendingRemove =
              pendingRemove &&
              `${pendingRemove.courseCode}-${pendingRemove.sectionCode}` === key;
            return (
              <div key={key} className="flex gap-2 items-stretch">
                <button
                  onClick={() => handleClick(c)}
                  className={[
                    "flex-1 text-left px-4 py-3 rounded-xl border-2 transition-colors cursor-pointer",
                    isPending
                      ? "border-blue-500 bg-blue-50"
                      : "border-gray-200 hover:border-blue-400 hover:bg-blue-50",
                  ].join(" ")}
                >
                  <div className="flex items-baseline justify-between gap-2 mb-1">
                    <div className="flex flex-col gap-0">
                      <span className="font-semibold text-sm text-gray-800">
                        {c.courseName || c.courseCode}
                      </span>
                      <div className="flex items-baseline gap-2">
                        <span className="font-mono text-xs text-gray-400">
                          {c.courseCode}
                        </span>
                        {c.sectionCode && (
                          <span className="text-xs text-gray-500">
                            Turma {c.sectionCode}
                          </span>
                        )}
                      </div>
                    </div>
                    {isPending && (
                      <span className="text-xs font-semibold text-blue-600 flex-shrink-0">
                        Clique para confirmar
                      </span>
                    )}
                  </div>
                  {c.slots?.length > 0 && (
                    <div className="flex flex-wrap gap-x-3 gap-y-0.5">
                      {c.slots.map((s, i) => (
                        <span key={i} className="text-xs text-gray-400">
                          {s.day} {s.start}–{s.end}
                        </span>
                      ))}
                    </div>
                  )}
                </button>
                {onRemoveSection && (
                  <button
                    onClick={() => handleRemoveClick(c)}
                    title="Remover esta turma"
                    className={[
                      "flex-shrink-0 px-3 rounded-xl border-2 text-xs font-medium transition-colors cursor-pointer",
                      isPendingRemove
                        ? "border-red-500 bg-red-600 text-white hover:bg-red-700"
                        : "border-gray-200 text-red-400 hover:border-red-400 hover:bg-red-50",
                    ].join(" ")}
                  >
                    {isPendingRemove ? "Confirmar" : "✕"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
        <button
          onClick={onClose}
          className="mt-4 w-full text-sm text-gray-400 hover:text-gray-600 cursor-pointer"
        >
          Cancelar
        </button>
      </div>
    </div>
  );
}