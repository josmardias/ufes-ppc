// src/components/CollapsibleBanner.jsx
// Collapsible alert/info banner used in the schedule builder.
import { useState } from "react";

export default function CollapsibleBanner({ color, title, children }) {
  const [open, setOpen] = useState(false);
  const colors = {
    red: {
      wrapper: "bg-red-50 border-red-200 text-red-800",
      button: "hover:bg-red-100",
    },
    amber: {
      wrapper: "bg-amber-50 border-amber-200 text-amber-800",
      button: "hover:bg-amber-100",
    },
  };
  const c = colors[color] ?? colors.amber;
  return (
    <div className={`mb-4 border rounded-lg text-sm ${c.wrapper}`}>
      <button
        onClick={() => setOpen((v) => !v)}
        className={`w-full flex items-center justify-between px-4 py-2.5 font-semibold cursor-pointer rounded-lg transition-colors ${c.button}`}
      >
        <span>{title}</span>
        <span className="text-xs opacity-60">{open ? "▲" : "▼"}</span>
      </button>
      {open && <div className="px-4 pb-3">{children}</div>}
    </div>
  );
}