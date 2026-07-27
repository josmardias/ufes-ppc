// Two-tier, collapsible Subject group listing shared by UC-11 ("Add a New
// Planned Semester"), UC-12 ("Add a Section to a Planned Semester"), and
// UC-27 ("Add an Optional Section", see docs/USE_CASES.md, UC-11 steps 5-6).
// Presentational only: each Section row is rendered by the caller via
// `renderSection`, so checkbox (UC-11) vs radio (UC-12/UC-27) selection and
// live signal styling stay with the dialog that owns that behavior.

import { useEffect, useState } from 'react';
import { TIER_LABELS } from '../../domain/format.js';
import { candidateSectionKey } from '../../domain/eligibility.js';
import { IconChevronRight } from '../icons.jsx';

const TIERS = ['core', 'other'];

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

function groupKeyOf(candidate) {
  return candidate.subjectCode ?? candidate.subjectName;
}

/**
 * @param {{
 *   candidates: import('../../domain/eligibility.js').CandidateSubject[],
 *   selectedKeys: Set<string>, // drives each group's "n/m turmas" summary
 *   renderSection: (section: object, candidate: object) => import('react').ReactNode,
 *   groupExtra?: (candidate: object) => import('react').ReactNode, // e.g. UC-28's "Ocultar" action
 *   isGroupFlagged?: (candidate: object) => boolean, // e.g. Duplicate Subject styling
 *   emptyMessage: string,
 *   resetKey: unknown, // collapse state resets whenever this value changes (UC-11 step 6: ephemeral, resets when the screen opens)
 * }} props
 */
export default function CandidateGroupList({
  candidates,
  selectedKeys,
  renderSection,
  groupExtra,
  isGroupFlagged = () => false,
  emptyMessage,
  resetKey,
}) {
  const [expanded, setExpanded] = useState(() => new Set());

  useEffect(() => {
    setExpanded(new Set());
  }, [resetKey]);

  function toggleExpanded(key) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  if (candidates.length === 0) {
    return <p className="text-sm text-slate-500">{emptyMessage}</p>;
  }

  const tiersPresent = TIERS.filter((tier) =>
    candidates.some((c) => c.tier === tier),
  );

  return (
    <div className="space-y-4">
      {tiersPresent.map((tier) => (
        <div key={tier}>
          <h3 className="text-xs font-semibold tracking-wide text-slate-400 uppercase">
            {TIER_LABELS[tier]}
          </h3>
          <ul className="mt-1 space-y-1">
            {candidates
              .filter((c) => c.tier === tier)
              .map((candidate) => {
                const groupKey = groupKeyOf(candidate);
                const isExpanded = expanded.has(groupKey);
                const selectedCount = candidate.sections.filter((section) =>
                  selectedKeys.has(candidateSectionKey(section)),
                ).length;
                const flagged = isGroupFlagged(candidate);

                return (
                  <li key={groupKey}>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => toggleExpanded(groupKey)}
                        aria-expanded={isExpanded}
                        className={`flex flex-1 items-center gap-1.5 rounded px-2 py-2 text-left text-sm font-semibold hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400 ${flagged ? 'text-amber-700' : 'text-slate-800'}`}
                      >
                        <IconChevronRight
                          className={`size-3.5 shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
                        />
                        <span
                          className={candidate.stale ? 'text-slate-400 italic' : ''}
                        >
                          {candidate.subjectName}
                        </span>
                        {flagged && ' — disciplina duplicada'}
                        <span className="ml-auto shrink-0 font-normal text-slate-400">
                          {selectedCount}/{candidate.sections.length} turmas
                        </span>
                      </button>
                      {groupExtra?.(candidate)}
                    </div>
                    {isExpanded && (
                      <ul className="mt-1 ml-5 space-y-1">
                        {candidate.sections.map((section) => (
                          <li key={candidateSectionKey(section)}>
                            {renderSection(section, candidate)}
                          </li>
                        ))}
                      </ul>
                    )}
                  </li>
                );
              })}
          </ul>
        </div>
      ))}
    </div>
  );
}
