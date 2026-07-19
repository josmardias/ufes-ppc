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
  const subject = offerings?.subjects.find((s) => s.code === section.subjectCode);
  return subject?.sections.find((sec) => sec.turma === section.turma)?.sessions ?? [];
}

/** Converts an "HH:MM" time string to minutes since midnight. */
export function timeToMinutes(time) {
  const [hours, minutes] = time.split(':').map(Number);
  return hours * 60 + minutes;
}
