// src/components/Badge.jsx
// Unified badge/chip component used across multiple pages.
export default function Badge({ children, color = "gray", variant = "pill" }) {
  const colors = {
    gray:   variant === "tag" ? "bg-gray-100 text-gray-500 border-gray-200"   : "bg-gray-100 text-gray-600",
    blue:   variant === "tag" ? "bg-blue-100 text-blue-700 border-blue-200"   : "bg-blue-100 text-blue-700",
    orange: variant === "tag" ? "bg-orange-100 text-orange-700 border-orange-200" : "bg-orange-100 text-orange-700",
  };
  const base = variant === "tag"
    ? "inline-block text-xs font-medium px-1.5 py-0.5 rounded border"
    : "inline-block text-xs font-medium px-2 py-0.5 rounded-full";
  return (
    <span className={`${base} ${colors[color] ?? colors.gray}`}>
      {children}
    </span>
  );
}