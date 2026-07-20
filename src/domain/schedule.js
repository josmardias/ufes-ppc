// Weekly schedule helpers — Session overlap and Shift filter logic (see
// docs/DOMAIN.md, Section and Planned Semester; docs/ARCHITECTURE.md,
// Offerings dataset). Pure, framework-agnostic.

/**
 * Two sessions overlap when they fall on the same day and their time ranges
 * intersect (touching endpoints, e.g. 10:00–12:00 and 12:00–14:00, do not
 * count as overlapping).
 * @param {import('./types.js').Session} a
 * @param {import('./types.js').Session} b
 */
function sessionsOverlap(a, b) {
  return a.day === b.day && a.startTime < b.endTime && b.startTime < a.endTime;
}

/**
 * A Schedule Conflict (see docs/DOMAIN.md) exists between two Sections when
 * at least one session of each overlaps.
 * @param {import('./types.js').Session[]} sessionsA
 * @param {import('./types.js').Session[]} sessionsB
 */
export function sectionsOverlap(sessionsA, sessionsB) {
  return sessionsA.some((a) => sessionsB.some((b) => sessionsOverlap(a, b)));
}

/**
 * Whether a Section's sessions include at least one session overlapping
 * the given time window (day, startTime, endTime) — the membership test
 * for a Schedule Conflict pass's resolution set (see docs/USE_CASES.md,
 * UC-25). Reuses the same boundary rule as `sessionsOverlap` (touching
 * endpoints do not count). A Section with no sessions is never a member.
 * @param {import('./types.js').Session[]} sessions
 * @param {{day: string, startTime: string, endTime: string}} window
 */
export function sectionOverlapsWindow(sessions, window) {
  return sessions.some((session) => sessionsOverlap(session, window));
}

function sessionsWithinWindow(sessions, window) {
  return sessions.filter((session) => sessionsOverlap(session, window));
}

/**
 * Whether two Sections conflict *within* a window (see docs/USE_CASES.md,
 * UC-25): each Section's window-overlapping sessions overlap the other's.
 * A Section can overlap the window without overlapping another Section
 * that also overlaps the window — e.g. two sessions that each cover one
 * edge of the window without touching each other.
 * @param {import('./types.js').Session[]} sessionsA
 * @param {import('./types.js').Session[]} sessionsB
 * @param {{day: string, startTime: string, endTime: string}} window
 */
export function sectionsConflictInWindow(sessionsA, sessionsB, window) {
  return sectionsOverlap(
    sessionsWithinWindow(sessionsA, window),
    sessionsWithinWindow(sessionsB, window),
  );
}

/**
 * Whether two evaluated Sections conflict for a UC-25 resolution pass:
 * window-scoped session overlap for the Schedule Conflict pass, shared
 * resolved Subject for the Duplicate Subject pass. `window` is unused for
 * the duplicate pass.
 * @param {{sessions: import('./types.js').Session[], resolvedSubjectCode: string|null}} a
 * @param {{sessions: import('./types.js').Session[], resolvedSubjectCode: string|null}} b
 * @param {"conflict"|"duplicate"} signalType
 * @param {{day: string, startTime: string, endTime: string}|null} window
 */
export function sectionsConflictForPass(a, b, signalType, window) {
  if (signalType === 'duplicate') {
    return a.resolvedSubjectCode != null && a.resolvedSubjectCode === b.resolvedSubjectCode;
  }
  return sectionsConflictInWindow(a.sessions, b.sessions, window);
}

/**
 * The ids of the resolution set members (excluding the keeper) to remove on
 * keeper confirmation (see docs/USE_CASES.md, UC-25): exactly the members
 * that conflict with the keeper for the given pass. Returns an empty array
 * when `keeperId` matches no member.
 * @param {Array<{id: string, sessions: import('./types.js').Session[], resolvedSubjectCode: string|null}>} members
 * @param {string} keeperId
 * @param {"conflict"|"duplicate"} signalType
 * @param {{day: string, startTime: string, endTime: string}|null} window
 */
export function keeperRemovalIds(members, keeperId, signalType, window) {
  const keeper = members.find((m) => m.id === keeperId);
  if (!keeper) return [];
  return members
    .filter(
      (member) => member.id !== keeper.id && sectionsConflictForPass(member, keeper, signalType, window),
    )
    .map((member) => member.id);
}

/**
 * Whether a UC-25 resolution pass's anchor still holds a conflict among the
 * given members (see docs/USE_CASES.md): for the Schedule Conflict pass, at
 * least one overlapping pair within the window; for the Duplicate Subject
 * pass, at least two members. Drives both the initial pass determination
 * (at click time) and the resolution dialog's auto-close (as members are
 * pruned).
 * @param {Array<{sessions: import('./types.js').Session[], resolvedSubjectCode: string|null}>} members
 * @param {"conflict"|"duplicate"} signalType
 * @param {{day: string, startTime: string, endTime: string}|null} window
 */
export function stillConflicted(members, signalType, window) {
  if (signalType === 'duplicate') return members.length >= 2;
  for (let i = 0; i < members.length; i++) {
    for (let j = i + 1; j < members.length; j++) {
      if (sectionsConflictForPass(members[i], members[j], signalType, window)) {
        return true;
      }
    }
  }
  return false;
}

/**
 * Whether a Section of the given `shift` should be listed under a Shift
 * filter value (see docs/DOMAIN.md, Planned Semester): a "day" filter shows
 * everything, and day-shift Sections are shown under every filter value.
 * @param {"morning"|"afternoon"|"day"|null} sectionShift
 * @param {"morning"|"afternoon"|"day"} filter
 */
export function sectionMatchesShiftFilter(sectionShift, filter) {
  if (filter === 'day') return true;
  return sectionShift === filter || sectionShift === 'day';
}

/** The Shift filter in effect for a profile: the persisted toggle, or the profile's own shift. */
export function effectiveShiftFilter(profile) {
  return profile.shiftFilter ?? profile.shift;
}

/**
 * The raw Offerings-dataset Section a Planned Section resolves to (see
 * docs/ARCHITECTURE.md, Offerings dataset), looked up by subject code (as
 * offered — possibly an equivalent) and turma. Custom Sections have no
 * Offerings-dataset counterpart, so this returns null for them.
 * @param {import('./types.js').PlannedSection} section
 * @param {{subjects: Array}|undefined} offerings
 */
export function plannedSectionOffering(section, offerings) {
  if (section.kind === 'custom') return null;
  const subject = offerings?.subjects.find((s) => s.code === section.subjectCode);
  return subject?.sections.find((sec) => sec.turma === section.turma) ?? null;
}

/**
 * The weekly sessions of a Planned Section, resolved against the Offerings
 * snapshot for its semester's Year Semester. Custom Sections carry their own
 * embedded sessions; offering Sections are looked up by subject code (as
 * offered — possibly an equivalent) and turma.
 * @param {import('./types.js').PlannedSection} section
 * @param {{subjects: Array}|undefined} offerings
 * @returns {import('./types.js').Session[]}
 */
export function plannedSectionSessions(section, offerings) {
  if (section.kind === 'custom') return section.custom.sessions;
  return plannedSectionOffering(section, offerings)?.sessions ?? [];
}

/** Converts an "HH:MM" time string to minutes since midnight. */
export function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
