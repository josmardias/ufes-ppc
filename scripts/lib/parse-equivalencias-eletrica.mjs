// Parses scripts/input/ppc_engenharia_eletrica_equivalencias_*.pdf specifically.
//
// This is NOT a general equivalences-PDF parser: it assumes this course's exact
// PDF template — a "Curso: NN - <Nome>  Versão:YYYY" header line, then subject
// header lines ("<CODE>  <NAME>") each optionally followed by one or more
// "Equivalências: BLOCO N   Disciplinas Vencida   <CODE>  <NAME>" lines (one per
// old-curriculum/other-course code that satisfies the subject). Other courses'
// equivalences PDFs may follow a different template and will need their own
// `parse-equivalencias-<curso>.mjs`, reusing `pdf-text.mjs` (course-agnostic) but
// not this file's line-classification logic.

import { extractPdfLines } from './pdf-text.mjs';

const COURSE_META_RE = /^Curso:\s*\d+\s*-\s*(.+?)\s+Vers[aã]o:\s*(\d{4})/;
const SUBJECT_HEADER_RE = /^([A-Z]{2,5}\d{4,6})\s+(.+)$/;
const EQUIVALENCE_RE = /Equivalências:.*Disciplinas Vencida\s+([A-Z]{2,5}\d{4,6})\s+(.+)$/;

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Parses a ppc_engenharia_eletrica_equivalencias_*.pdf file into a map from a
 * subject's own code to the list of codes that satisfy it (see `equivalents`
 * in docs/ARCHITECTURE.md's PPC dataset shape). Subjects with no equivalence
 * entries in the source PDF are simply absent from the map.
 */
export function parseEletricaEquivalenciasPdf(pdfPath) {
  const lines = extractPdfLines(pdfPath, { layout: true });

  const metaLine = lines.find((l) => COURSE_META_RE.test(l));
  const metaMatch = metaLine?.match(COURSE_META_RE);
  if (!metaMatch) {
    throw new Error('Could not determine course name/version from the equivalences PDF header.');
  }
  const [, courseName, year] = metaMatch;

  const equivalences = new Map();
  let currentCode = null;

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) continue;

    const eqMatch = line.match(EQUIVALENCE_RE);
    if (eqMatch) {
      if (!currentCode) {
        throw new Error(`Equivalence line found before any subject header: "${line}"`);
      }
      const [, equivCode] = eqMatch;
      const list = equivalences.get(currentCode) ?? [];
      if (!list.includes(equivCode)) list.push(equivCode);
      equivalences.set(currentCode, list);
      continue;
    }

    const headerMatch = line.match(SUBJECT_HEADER_RE);
    if (headerMatch) {
      currentCode = headerMatch[1];
    }
    // Otherwise: page header/footer noise, "Disciplina", "Descrição da
    // Estrutura: ..." section titles, or a subject header the PDF renders
    // without a proper code (e.g. "ELE-PROP-" placeholder codes) — ignored.
  }

  return {
    ppcId: `${slugify(courseName)}-${year}`,
    equivalences: Object.fromEntries(equivalences),
  };
}
