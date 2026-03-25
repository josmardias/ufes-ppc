import { useEscKey } from "../hooks/useEscKey.js";

export default function ModalRemoveCourse({ courseCode, courseName, onConfirm, onClose }) {
  useEscKey(onClose);
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
          Remover disciplina
        </h3>
        <p className="text-sm text-gray-500 mb-5">
          Remover{" "}
          <span className="font-semibold text-gray-700">
            {courseName || courseCode}
          </span>{" "}
          <span className="font-mono text-xs text-gray-400">
            ({courseCode})
          </span>{" "}
          deste período?
        </p>
        <div className="flex gap-2">
          <button
            onClick={onConfirm}
            className="flex-1 py-2.5 bg-red-600 hover:bg-red-700 text-white text-sm font-bold rounded-xl transition-colors cursor-pointer"
          >
            Remover
          </button>
          <button
            onClick={onClose}
            className="flex-1 py-2.5 border border-gray-300 text-gray-600 hover:border-gray-400 text-sm font-medium rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}