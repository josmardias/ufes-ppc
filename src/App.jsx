import { useState, createContext, useContext } from "react";
import ScheduleBuilderPage from "./pages/ScheduleBuilderPage";
import PpcPage from "./pages/PpcPage";
import OfertaPage from "./pages/OfertaPage";
import CustomOfferPage from "./pages/CustomOfferPage";
import StudentSelect from "./pages/StudentSelect";
import { usePlanning } from "./hooks/usePlanning.js";

export const PlanningContext = createContext(null);

export function usePlanningContext() {
  return useContext(PlanningContext);
}

const TABS = [
  {
    id: "schedule-builder",
    label: "Simular Grade",
    component: ScheduleBuilderPage,
  },
  { id: "ppc", label: "PPC", component: PpcPage },
  { id: "oferta", label: "Oferta", component: OfertaPage },
  { id: "custom-offer", label: "Oferta Custom", component: CustomOfferPage },
];

export default function App() {
  const [activeTab, setActiveTab] = useState("schedule-builder");
  const planningApi = usePlanning();
  const { alunoAtivo, logout } = planningApi;

  const ActivePage = TABS.find((t) => t.id === activeTab)?.component ?? null;

  // No active student → show selection screen
  if (!alunoAtivo) {
    return (
      <PlanningContext.Provider value={planningApi}>
        <StudentSelect />
      </PlanningContext.Provider>
    );
  }

  return (
    <PlanningContext.Provider value={planningApi}>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        {/* Header */}
        <header className="bg-white border-b border-gray-200 px-4 py-3 flex items-center justify-between">
          <h1 className="text-lg font-bold tracking-tight text-gray-900">
            Gerador PPC — UFES Elétrica
          </h1>
          <button
            onClick={logout}
            className="flex items-center gap-2 text-sm text-gray-500 hover:text-gray-900 transition-colors cursor-pointer group"
            title="Trocar aluno"
          >
            <span className="w-7 h-7 rounded-full bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center group-hover:bg-blue-200 transition-colors">
              {alunoAtivo.charAt(0).toUpperCase()}
            </span>
            <span className="hidden sm:inline font-medium">{alunoAtivo}</span>
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

        {/* Tab bar */}
        <nav className="bg-white border-b border-gray-200 px-4 flex gap-1">
          {TABS.map((tab) => (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={[
                "px-4 py-2 text-sm font-medium border-b-2 transition-colors cursor-pointer",
                activeTab === tab.id
                  ? "border-blue-600 text-blue-600"
                  : "border-transparent text-gray-500 hover:text-gray-700 hover:border-gray-300",
              ].join(" ")}
            >
              {tab.label}
            </button>
          ))}
        </nav>

        {/* Page content */}
        <main className="max-w-5xl mx-auto">
          {ActivePage && <ActivePage />}
        </main>
      </div>
    </PlanningContext.Provider>
  );
}
