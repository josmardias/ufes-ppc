// src/components/AppHeader.jsx
// Top navigation bar — shows the app title and the active profile logout button.

export default function AppHeader({ activeProfile, onLogout }) {
  return (
    <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
      <h1 className="text-lg font-bold tracking-tight text-gray-900">
        Gerador PPC — UFES Elétrica
      </h1>
      <button
        onClick={onLogout}
        className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer group"
        title="Trocar aluno"
      >
        <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center group-hover:bg-blue-200 transition-colors">
          {activeProfile.charAt(0).toUpperCase()}
        </span>
        <span className="hidden sm:inline font-medium">{activeProfile}</span>
        <svg
          className="w-4 h-4 text-gray-400 group-hover:text-gray-600"
          fill="none"
          stroke="currentColor"
          strokeWidth={2}
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M7.5 21L3 16.5m0 0L7.5 12M3 16.5h13.5m0-13.5L21 7.5m0 0L16.5 3M21 7.5H7.5"
          />
        </svg>
      </button>
    </header>
  );
}