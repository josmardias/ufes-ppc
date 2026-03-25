import { useState, createContext, useContext } from "react";
import ScheduleBuilderPage from "./pages/ScheduleBuilderPage";
import PpcPage from "./pages/PpcPage";
import OfertaPage from "./pages/OfertaPage";
import CustomOfferPage from "./pages/CustomOfferPage";
import StudentSelect from "./pages/StudentSelect";
import { usePlanning } from "./hooks/usePlanning.js";
import AppHeader from "./components/AppHeader.jsx";
import AppNavTabs from "./components/AppNavTabs.jsx";

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
  const { activeProfile, logout } = planningApi;

  const ActivePage = TABS.find((t) => t.id === activeTab)?.component ?? null;

  // No active student → show selection screen
  if (!activeProfile) {
    return (
      <PlanningContext.Provider value={planningApi}>
        <StudentSelect />
      </PlanningContext.Provider>
    );
  }

  return (
    <PlanningContext.Provider value={planningApi}>
      <div className="min-h-screen bg-gray-50 text-gray-900">
        <AppHeader activeProfile={activeProfile} onLogout={logout} />
        <AppNavTabs tabs={TABS} activeTab={activeTab} onTabChange={setActiveTab} />

        {/* Page content */}
        <main className="max-w-5xl mx-auto">
          {ActivePage && <ActivePage />}
        </main>
      </div>
    </PlanningContext.Provider>
  );
}