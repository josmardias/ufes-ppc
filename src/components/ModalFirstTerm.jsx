import { useState } from "react";

export default function ModalFirstTerm({ onConfirm }) {
  const [ingressSemester, setIngressSemester] = useState(null);
  const ready = ingressSemester !== null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30">
      <div
        className="bg-white rounded-2xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-5"
        onClick={(e) => e.stopPropagation()}
      >
        <div>
          <h3 className="text-base font-bold text-gray-900 mb-1">
            Primeiro período
          </h3>
          <p className="text-sm text-gray-500">
            Algumas perguntas para começar.
          </p>
        </div>

        <div>
          <p className="text-xs font-semibold text-gray-500 uppercase tracking-wider mb-2">
            Semestre de ingresso
          </p>
          <div className="flex gap-2">
            {[
              { n: 1, exemplo: "ex: 2025/1" },
              { n: 2, exemplo: "ex: 2025/2" },
            ].map(({ n, exemplo }) => (
              <button
                key={n}
                onClick={() => setIngressSemester(n)}
                className={[
                  "flex-1 py-2.5 px-3 rounded-xl border-2 text-sm font-semibold transition-colors cursor-pointer",
                  ingressSemester === n
                    ? "border-blue-500 bg-blue-50 text-blue-700"
                    : "border-gray-200 text-gray-700 hover:border-blue-400 hover:bg-blue-50",
                ].join(" ")}
              >
                {n}º semestre
                <span
                  className={`block text-xs font-normal mt-0.5 ${ingressSemester === n ? "text-blue-400" : "text-gray-400"}`}
                >
                  {exemplo}
                </span>
              </button>
            ))}
          </div>
        </div>

        <button
          disabled={!ready}
          onClick={() => onConfirm(ingressSemester)}
          className="w-full py-3 bg-blue-600 hover:bg-blue-700 disabled:opacity-40 disabled:cursor-not-allowed text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
        >
          Gerar 1º período
        </button>
      </div>
    </div>
  );
}