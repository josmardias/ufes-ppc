// The Completed (Concluídos) entry's content (UC-09 step 6, UC-15 — see
// docs/USE_CASES.md): the Course Curriculum rendered as a checklist —
// Required (grouped by Suggested Semester, collapsible) and Optional (flat,
// searchable) tabs — where checking/unchecking a Subject creates/removes its
// Credit Entry, with no confirmation in either direction (UC-16, removed,
// merged into UC-15). Audit Marks are toggled per checked row (UC-20, UC-21).
// No weekly grid — Credit Entries have no sessions (see docs/DOMAIN.md,
// Credit Entry).

import { useEffect, useMemo, useRef, useState } from 'react';
import { useStore } from '../../store/index.js';
import { IconChevronRight } from '../icons.jsx';

const TABS = [
  { value: 'required', label: 'Obrigatórias' },
  { value: 'optional', label: 'Optativas' },
];

const BUTTON_FOCUS_CLASS =
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2';

/** Case- and accent-insensitive text matching for the Optional tab's search (UC-15 step 5). */
function normalizeForSearch(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase();
}

function isCredited(profile, subjectCode) {
  return profile.creditEntries.some(
    (entry) => entry.subjectCode === subjectCode,
  );
}

function creditEntryOf(profile, subjectCode) {
  return (
    profile.creditEntries.find((entry) => entry.subjectCode === subjectCode) ??
    null
  );
}

/**
 * Required-tab groups (UC-15 step 3): ascending by Suggested Semester, with a
 * trailing "Sem período sugerido" group for Required Subjects that have none.
 * A Subject with no known classification counts as Required (see
 * docs/DOMAIN.md, Subject — same convention as domain/eligibility.js).
 */
function buildRequiredGroups(ppc) {
  const bySemester = new Map();
  const noSuggested = [];
  for (const subject of ppc.subjects) {
    const classification = subject.classification ?? 'required';
    if (classification !== 'required') continue;
    if (subject.suggestedSemester == null) {
      noSuggested.push(subject);
    } else {
      const list = bySemester.get(subject.suggestedSemester) ?? [];
      list.push(subject);
      bySemester.set(subject.suggestedSemester, list);
    }
  }

  const groups = [...bySemester.keys()]
    .sort((a, b) => a - b)
    .map((semester) => ({
      key: `semester-${semester}`,
      label: `${semester}º período`,
      subjects: bySemester.get(semester),
    }));
  if (noSuggested.length > 0) {
    groups.push({
      key: 'no-suggested',
      label: 'Sem período sugerido',
      subjects: noSuggested,
    });
  }
  return groups;
}

/** Credit Entries whose Subject code no longer resolves in the current PPC (UC-15, last note). */
function buildOutOfCurriculumEntries(profile, ppc) {
  return profile.creditEntries.filter(
    (entry) => !ppc.subjects.some((s) => s.code === entry.subjectCode),
  );
}

/**
 * A single checkable Subject (or out-of-curriculum Credit Entry) row (UC-15
 * steps 2, 6, 7). The Audit Mark toggle's slot is always reserved so
 * checking/unchecking never shifts the row (`invisible`, not unmounted).
 */
function SubjectRow({
  name,
  code,
  checked,
  audit,
  onToggleChecked,
  onToggleAudit,
}) {
  return (
    <li className="flex items-center gap-2 py-1">
      <label className="flex min-w-0 flex-1 items-center gap-3 rounded px-2 py-2 hover:bg-slate-50">
        <input
          type="checkbox"
          checked={checked}
          onChange={onToggleChecked}
          className="size-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
        />
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm text-slate-800">{name}</span>
          {code && <span className="block text-xs text-slate-400">{code}</span>}
        </span>
      </label>
      <button
        type="button"
        onClick={onToggleAudit}
        aria-pressed={audit}
        className={`shrink-0 rounded border px-2.5 py-1.5 text-xs font-medium ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400 ${
          checked ? '' : 'invisible pointer-events-none'
        } ${
          audit
            ? 'border-slate-900 bg-slate-900 text-white'
            : 'border-slate-300 text-slate-600 hover:bg-slate-50'
        }`}
      >
        Ouvinte
      </button>
    </li>
  );
}

/**
 * A Required-tab group (UC-15 step 3): a tri-state select-all checkbox, an
 * `n/m` count, and a collapse chevron — the checkbox toggles selection,
 * activating the rest of the header toggles collapse.
 */
function RequiredGroup({
  group,
  profile,
  collapsed,
  onToggleCollapse,
  onToggleGroupAll,
  onToggleSubject,
  onToggleAudit,
}) {
  const selectAllRef = useRef(null);
  const total = group.subjects.length;
  const checkedCount = group.subjects.filter((s) =>
    isCredited(profile, s.code),
  ).length;
  const allChecked = checkedCount === total;

  useEffect(() => {
    if (selectAllRef.current) {
      selectAllRef.current.indeterminate = checkedCount > 0 && !allChecked;
    }
  }, [checkedCount, allChecked]);

  return (
    <div>
      <div className="flex items-center gap-1">
        <span className="p-2">
          <input
            ref={selectAllRef}
            type="checkbox"
            checked={allChecked}
            onChange={onToggleGroupAll}
            aria-label={`Selecionar todas as disciplinas de ${group.label}`}
            className="size-4 shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
          />
        </span>
        <button
          type="button"
          onClick={onToggleCollapse}
          aria-expanded={!collapsed}
          className={`flex flex-1 items-center gap-1.5 rounded px-2 py-2 text-left text-sm font-semibold text-slate-800 hover:bg-slate-50 ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400`}
        >
          <IconChevronRight
            className={`size-3.5 shrink-0 transition-transform ${collapsed ? '' : 'rotate-90'}`}
          />
          <span>{group.label}</span>
          <span className="ml-auto shrink-0 font-normal text-slate-400">
            {checkedCount}/{total}
          </span>
        </button>
      </div>
      {!collapsed && (
        <ul className="mt-1 divide-y divide-slate-100 pl-2">
          {group.subjects.map((subject) => (
            <SubjectRow
              key={subject.code}
              name={subject.name}
              code={subject.code}
              checked={isCredited(profile, subject.code)}
              audit={creditEntryOf(profile, subject.code)?.audit ?? false}
              onToggleChecked={() => onToggleSubject(subject.code)}
              onToggleAudit={() => onToggleAudit(subject.code)}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * @param {{
 *   profile: import('../../domain/types.js').ProfileRecord,
 *   ppc: {subjects: Array},
 * }} props
 */
export default function CompletedEntryView({ profile, ppc }) {
  const addCreditEntry = useStore((state) => state.addCreditEntry);
  const removeCreditEntry = useStore((state) => state.removeCreditEntry);
  const toggleCreditEntryAudit = useStore(
    (state) => state.toggleCreditEntryAudit,
  );

  // Tab and search state are ephemeral (UC-15 step 2/5): they reset every
  // time the view opens, which happens naturally here since PlannerPage
  // mounts a fresh instance of this component each time it is selected.
  const [tab, setTab] = useState('required');
  const [search, setSearch] = useState('');

  const requiredGroups = useMemo(() => buildRequiredGroups(ppc), [ppc]);
  const outOfCurriculum = buildOutOfCurriculumEntries(profile, ppc);

  // Collapse state (UC-15 step 4): computed once, here, when the view opens
  // — a group starts collapsed when every Subject in it is checked or none is,
  // and expanded only when partially checked — then left entirely to the
  // user for the rest of the session.
  const [collapsed, setCollapsed] = useState(() => {
    const initial = new Set();
    for (const group of requiredGroups) {
      const checkedCount = group.subjects.filter((s) =>
        isCredited(profile, s.code),
      ).length;
      if (checkedCount === 0 || checkedCount === group.subjects.length) {
        initial.add(group.key);
      }
    }
    return initial;
  });

  function toggleGroupCollapse(key) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  }

  function toggleSubject(subjectCode) {
    if (isCredited(profile, subjectCode)) {
      removeCreditEntry(profile.id, subjectCode);
    } else {
      addCreditEntry(profile.id, subjectCode);
    }
  }

  function toggleGroupAll(group) {
    const allChecked = group.subjects.every((s) => isCredited(profile, s.code));
    for (const subject of group.subjects) {
      const credited = isCredited(profile, subject.code);
      if (allChecked && credited) removeCreditEntry(profile.id, subject.code);
      else if (!allChecked && !credited)
        addCreditEntry(profile.id, subject.code);
    }
  }

  const optionalSubjects = useMemo(
    () =>
      ppc.subjects
        .filter((s) => (s.classification ?? 'required') === 'optional')
        .sort((a, b) => a.name.localeCompare(b.name)),
    [ppc],
  );

  const filteredOptionalSubjects = useMemo(() => {
    const query = normalizeForSearch(search.trim());
    if (!query) return optionalSubjects;
    return optionalSubjects.filter(
      (s) =>
        normalizeForSearch(s.name).includes(query) ||
        normalizeForSearch(s.code).includes(query),
    );
  }, [optionalSubjects, search]);

  return (
    <section>
      <h2 className="text-lg font-semibold text-slate-900">Concluídos</h2>

      <div className="mt-4 flex gap-1 border-b border-slate-200" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.value}
            type="button"
            role="tab"
            aria-selected={tab === t.value}
            onClick={() => setTab(t.value)}
            className={`-mb-px border-b-2 px-3 py-2 text-sm font-medium ${BUTTON_FOCUS_CLASS} focus-visible:ring-slate-400 ${
              tab === t.value
                ? 'border-slate-900 text-slate-900'
                : 'border-transparent text-slate-500 hover:text-slate-700'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
        {tab === 'required' ? (
          <div className="space-y-4">
            {requiredGroups.map((group) => (
              <RequiredGroup
                key={group.key}
                group={group}
                profile={profile}
                collapsed={collapsed.has(group.key)}
                onToggleCollapse={() => toggleGroupCollapse(group.key)}
                onToggleGroupAll={() => toggleGroupAll(group)}
                onToggleSubject={toggleSubject}
                onToggleAudit={(code) =>
                  toggleCreditEntryAudit(profile.id, code)
                }
              />
            ))}
            {outOfCurriculum.length > 0 && (
              <div>
                <h3 className="px-2 text-xs font-semibold tracking-wide text-slate-400 uppercase">
                  Fora do currículo
                </h3>
                <ul className="mt-1 divide-y divide-slate-100">
                  {outOfCurriculum.map((entry) => (
                    <SubjectRow
                      key={entry.subjectCode}
                      name={entry.subjectCode}
                      code={null}
                      checked={true}
                      audit={entry.audit}
                      onToggleChecked={() =>
                        removeCreditEntry(profile.id, entry.subjectCode)
                      }
                      onToggleAudit={() =>
                        toggleCreditEntryAudit(profile.id, entry.subjectCode)
                      }
                    />
                  ))}
                </ul>
              </div>
            )}
          </div>
        ) : (
          <div>
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Buscar por nome ou código"
              aria-label="Buscar disciplina optativa"
              className="w-full rounded border border-slate-300 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
            />
            {filteredOptionalSubjects.length === 0 ? (
              <p className="mt-3 text-sm text-slate-500">
                Nenhuma disciplina encontrada.
              </p>
            ) : (
              <ul className="mt-3 divide-y divide-slate-100">
                {filteredOptionalSubjects.map((subject) => {
                  const entry = creditEntryOf(profile, subject.code);
                  return (
                    <SubjectRow
                      key={subject.code}
                      name={subject.name}
                      code={subject.code}
                      checked={entry != null}
                      audit={entry?.audit ?? false}
                      onToggleChecked={() => toggleSubject(subject.code)}
                      onToggleAudit={() =>
                        toggleCreditEntryAudit(profile.id, subject.code)
                      }
                    />
                  );
                })}
              </ul>
            )}
          </div>
        )}
      </div>
    </section>
  );
}
