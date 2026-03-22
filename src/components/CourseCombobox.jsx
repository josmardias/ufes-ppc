import { useState, useMemo, useEffect, useRef } from "react";

function normalize(s) {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "");
}

/**
 * Returns a match score for query against text, or null if no match.
 * Higher score = better match.
 *
 * Scoring tiers:
 *   3 — substring match at start of text
 *   2 — substring match anywhere
 *   1 — subsequence match (each char of query appears in order in text)
 *   null — no match
 *
 * Subsequence matching enables "FIS IV" to match "FÍSICA IV":
 * each normalized character of the query must appear in the target
 * in the same order, but not necessarily contiguously.
 */
function matchScore(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  if (!q) return 2;

  // Tier 3 / 2: substring
  const idx = t.indexOf(q);
  if (idx === 0) return 3;
  if (idx !== -1) return 2;

  // Tier 1: subsequence — try to consume every char of q in order within t
  let ti = 0;
  let qi = 0;
  while (ti < t.length && qi < q.length) {
    if (t[ti] === q[qi]) qi++;
    ti++;
  }
  if (qi === q.length) return 1;

  return null;
}

/**
 * For subsequence matches, returns the indices in `text` that were matched,
 * so we can highlight them individually.
 */
function subsequenceIndices(text, query) {
  const t = normalize(text);
  const q = normalize(query);
  const indices = [];
  let qi = 0;
  for (let ti = 0; ti < t.length && qi < q.length; ti++) {
    if (t[ti] === q[qi]) {
      indices.push(ti);
      qi++;
    }
  }
  return qi === q.length ? indices : [];
}

function highlightMatch(text, query) {
  if (!query) return text;
  const normText = normalize(text);
  const normQuery = normalize(query);

  // Substring match — highlight the contiguous run
  const idx = normText.indexOf(normQuery);
  if (idx !== -1) {
    return (
      <>
        {text.slice(0, idx)}
        <mark className="bg-yellow-200 text-inherit rounded-sm">
          {text.slice(idx, idx + normQuery.length)}
        </mark>
        {text.slice(idx + normQuery.length)}
      </>
    );
  }

  // Subsequence match — highlight each individually matched character
  const indices = subsequenceIndices(text, query);
  if (indices.length === 0) return text;
  const parts = [];
  let last = 0;
  for (const i of indices) {
    if (i > last) parts.push(text.slice(last, i));
    parts.push(
      <mark key={i} className="bg-yellow-200 text-inherit rounded-sm">
        {text[i]}
      </mark>,
    );
    last = i + 1;
  }
  if (last < text.length) parts.push(text.slice(last));
  return <>{parts}</>;
}

export default function CourseCombobox({ value, onChange, suggestions, placeholder }) {
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [activeIdx, setActiveIdx] = useState(-1);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  // Keep query in sync when value is cleared externally
  useEffect(() => {
    setQuery(value);
  }, [value]);

  const filtered = useMemo(() => {
    const q = query.trim();
    if (!q) return suggestions.slice(0, 50);

    // Score each suggestion against both codigo and nome, take the best score
    const scored = suggestions
      .map((s) => {
        const sc = matchScore(s.codigo, q);
        const sn = matchScore(s.nome, q);
        const score = Math.max(sc ?? -1, sn ?? -1);
        return { s, score };
      })
      .filter(({ score }) => score >= 1)
      .sort((a, b) => b.score - a.score);

    return scored.map(({ s }) => s).slice(0, 50);
  }, [query, suggestions]);

  function select(s) {
    setQuery(s.codigo);
    onChange(s.codigo);
    setOpen(false);
    setActiveIdx(-1);
    inputRef.current?.focus();
  }

  function handleInputChange(e) {
    const v = e.target.value;
    setQuery(v);
    onChange(v.toUpperCase());
    setOpen(true);
    setActiveIdx(-1);
  }

  function handleKeyDown(e) {
    if (!open) {
      if (e.key === "ArrowDown" || e.key === "Enter") {
        setOpen(true);
        setActiveIdx(0);
        e.preventDefault();
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setActiveIdx((i) => Math.min(i + 1, filtered.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setActiveIdx((i) => Math.max(i - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (activeIdx >= 0 && filtered[activeIdx]) {
        select(filtered[activeIdx]);
      } else {
        setOpen(false);
      }
    } else if (e.key === "Escape") {
      setOpen(false);
    }
  }

  // Scroll active item into view
  useEffect(() => {
    if (activeIdx >= 0 && listRef.current) {
      const item = listRef.current.children[activeIdx];
      item?.scrollIntoView({ block: "nearest" });
    }
  }, [activeIdx]);

  return (
    <div className="relative">
      <input
        ref={inputRef}
        autoFocus
        value={query}
        onChange={handleInputChange}
        onFocus={() => setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        onKeyDown={handleKeyDown}
        placeholder={placeholder}
        autoComplete="off"
        className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-400"
      />
      {open && filtered.length > 0 && (
        <ul
          ref={listRef}
          className="absolute z-50 left-0 right-0 mt-1 bg-white border border-gray-200 rounded-xl shadow-lg max-h-56 overflow-y-auto"
        >
          {filtered.map((s, i) => (
            <li
              key={s.codigo}
              onMouseDown={() => select(s)}
              onMouseEnter={() => setActiveIdx(i)}
              className={[
                "flex flex-col px-3 py-2 cursor-pointer select-none",
                i === activeIdx ? "bg-blue-50" : "hover:bg-gray-50",
                i > 0 ? "border-t border-gray-100" : "",
              ].join(" ")}
            >
              <span className="text-sm font-mono font-semibold text-gray-800">
                {highlightMatch(s.codigo, query)}
              </span>
              {s.nome && (
                <span className="text-xs text-gray-500 truncate">
                  {highlightMatch(s.nome, query)}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}