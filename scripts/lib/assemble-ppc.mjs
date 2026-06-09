// Reshapes a merged PPC subjects file (produced by extract-subjects-*.mjs and
// merge-equivalencias-*.mjs) into the committed PPC dataset shape from
// docs/ARCHITECTURE.md's "PPC dataset" — `{ id, name, subjects: [...] }` —
// combining `required` and `optional` into a single list and renaming
// `ppcId` to `id`. Course-agnostic — works on any *.subjects.json.

export function assemblePpc({ ppcId, name, required, optional }) {
  return {
    id: ppcId,
    name,
    subjects: [...required, ...optional],
  };
}
