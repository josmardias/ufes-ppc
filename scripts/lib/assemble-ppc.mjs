// Reshapes a merged PPC subjects file (produced by extract-subjects-*.mjs and
// merge-equivalencias-*.mjs) into the committed PPC dataset shape from
// docs/ARCHITECTURE.md's "PPC dataset" — `{ id, name, courseId, courseName,
// subjects: [...] }` — combining `required` and `optional` into a single
// list and renaming `ppcId` to `id`. The course's official id/name (see
// scripts/lib/courses-config.mjs) is stamped in by the caller.

export function assemblePpc({ ppcId, name, required, optional }, { courseId, courseName }) {
  return {
    id: ppcId,
    name,
    courseId,
    courseName,
    subjects: [...required, ...optional],
  };
}
