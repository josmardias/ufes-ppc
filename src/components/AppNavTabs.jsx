// src/components/AppNavTabs.jsx
// Horizontal tab bar used in the main app layout to switch between pages.

export default function AppNavTabs({ tabs, activeTab, onTabChange }) {
  return (
    <nav className="bg-white border-b border-gray-200 px-4 flex gap-1">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          onClick={() => onTabChange(tab.id)}
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
  );
}