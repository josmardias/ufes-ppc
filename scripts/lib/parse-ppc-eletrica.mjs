// Parses scripts/input/ppc_engenharia_eletrica_*.pdf specifically.
//
// This is NOT a general PPC-PDF parser: it assumes this course's exact PDF
// template (the requisites-matrix column layout, its 4-table order — TCC,
// Estágio, Disciplinas Obrigatórias, Disciplinas Optativas — and the cover
// page wording). Other courses' PPC PDFs may follow a different template
// (different section headers/order, extra tables, etc.) and will need their
// own `parse-ppc-<curso>.mjs`, reusing `pdf-text.mjs` (course-agnostic) but
// not this file's table-parsing logic.

import { extractPdfLines } from './pdf-text.mjs';

const CODE_RE = /\b([A-Z]{2,5}\d{4,6})\b/;

// Matches a requisites-matrix row's "center line" — the single physical line that
// always carries Período/Código/Cr/C.H.S/Distribuição/Tipo, regardless of how many
// extra lines the Departamento/Nome/Pré-Requisitos columns wrap onto around it.
// Group 6 captures whatever sits between Distribuição and Tipo, which is where a
// single inline requisite code (or the Estágio "vencida: N" text) shows up.
const CENTER_LINE_RE =
  /^\s*(\d{1,2}º|-)\s+.*?([A-Z]{2,5}\d{4,6})\s+.*?\b(\d{1,2})\s+(\d{2,3})\s+(\d+-\d+-\d+-\d+)\b(.*?)\b(OB|OP|EC)\s*$/;

/**
 * Reads course name/year from the cover page (raw reading-order text).
 */
function parseCourseMeta(rawLines) {
  const titleIdx = rawLines.findIndex(
    (l) => l.trim() === 'Projeto Pedagógico de Curso',
  );
  const courseName = rawLines
    .slice(titleIdx + 1)
    .find((l) => l.trim())
    ?.trim();
  const yearLine = rawLines.find((l) => l.includes('Ano Versão:'));
  const year = Number(yearLine?.match(/Ano Versão:\s*(\d{4})/)?.[1]);
  if (!courseName || !year) {
    throw new Error(
      'Could not determine course name/year from the PDF cover page.',
    );
  }
  return { courseName, year };
}

/**
 * Builds a code -> name map from the per-subject "Disciplina: CODE - NAME" ementa
 * headers (raw reading-order text). This is the name source because the matrix's
 * own Nome column wraps across narrow lines that are hard to reassemble reliably.
 *
 * Known limitation: a handful of very long optional-subject titles are truncated
 * in the source PDF itself (not a parsing bug) — e.g. ELE17128. These are left
 * as-is; fixing them would require guessing the missing words.
 */
function buildNameMap(rawLines) {
  const names = new Map();
  const re = /^([A-Z]{2,5}\d{4,6}) - (.+)$/;
  for (const line of rawLines) {
    const m = line.match(re);
    if (m) names.set(m[1], m[2].trim());
  }
  return names;
}

/**
 * Classifies the requisites-column text of a single line into ordered tokens.
 * The column position drifts a few characters row to row (pdftotext -layout
 * isn't pixel-perfect on dense lines), so instead of slicing by character
 * column this searches for the known label/value substrings anywhere in the
 * line — which is robust to that drift.
 */
function classifyFragmentTokens(text) {
  const tokens = [];
  for (const [label, type] of [
    ['Co-requisito:', 'coreq-label'],
    ['Disciplina:', 'prereq-label'],
    ['Carga horária', 'workload-label'],
  ]) {
    const idx = text.indexOf(label);
    if (idx >= 0) tokens.push({ idx, type, value: null });
  }
  const vencidaMatch = text.match(/vencida:\s*(\d+)/);
  if (vencidaMatch)
    tokens.push({
      idx: vencidaMatch.index,
      type: 'workload-value',
      value: Number(vencidaMatch[1]),
    });
  const codeMatch = text.match(CODE_RE);
  if (codeMatch)
    tokens.push({
      idx: codeMatch.index,
      type: 'code-value',
      value: codeMatch[1],
    });
  tokens.sort((a, b) => a.idx - b.idx);
  return tokens;
}

/**
 * Finds the requisites-matrix tables (TCC, Estágio, Disciplinas Obrigatórias,
 * Disciplinas Optativas) by locating their repeated column header line, and
 * bounds each table by the next header (or "Atividades Complementares" for
 * the last one).
 */
function findTableSections(layoutLines) {
  const headerIdx = [];
  layoutLines.forEach((line, i) => {
    if (line.includes('Pré-Requisitos') && line.includes('Tipo'))
      headerIdx.push(i);
  });
  if (headerIdx.length !== 4) {
    throw new Error(
      `Expected 4 requisites tables (TCC, Estágio, Obrigatórias, Optativas), found ${headerIdx.length}.`,
    );
  }
  const endMarker = layoutLines.findIndex(
    (line, i) =>
      i > headerIdx[headerIdx.length - 1] &&
      line.includes('Atividades Complementares'),
  );
  const sectionClassifications = [
    'required',
    'required',
    'required',
    'optional',
  ];
  return headerIdx.map((h, i) => ({
    classification: sectionClassifications[i],
    start: h + 1,
    end: i + 1 < headerIdx.length ? headerIdx[i + 1] : endMarker,
  }));
}

/**
 * Parses one table section into subject rows with correctly attributed
 * requisites.
 *
 * The tricky part: a subject's requisites are rendered as a "Disciplina:"/
 * "Co-requisito:" label followed by a code, one pair per requisite, and this
 * whole list is vertically centered around the subject's own center line —
 * NOT bounded by it. A subject with several requisites has entries trailing
 * both above and below its row, sometimes closer (by line distance) to a
 * neighboring subject's row than to its own. Empirically, the label/value
 * items split exactly in half around the center line (N items before, N
 * after, out of 2N total) regardless of how that lines up with row spacing.
 * So instead of assigning each item to its nearest center line, this walks
 * the item stream in order and, for each center line encountered, carries
 * forward exactly as many "before" items as were buffered since the previous
 * center line — that many items after the line belong to the same subject.
 */
function parseTableSection(layoutLines, { start, end, classification }) {
  const centers = [];
  const itemStream = [];
  const workloadStream = [];

  for (let i = start; i < end; i++) {
    const line = layoutLines[i] ?? '';
    const centerMatch = line.match(CENTER_LINE_RE);
    let inlineText = line;
    if (centerMatch) {
      const [, period, code, cr, chs, distribution, inline] = centerMatch;
      centers.push({
        lineIdx: i,
        code,
        suggestedSemester:
          period === '-' ? null : Number(period.replace('º', '')),
        workloadHours: Number(chs),
        prerequisites: [],
        corequisites: [],
        minWorkloadHours: null,
      });
      inlineText = inline;
    }
    for (const token of classifyFragmentTokens(inlineText)) {
      const bucket = token.type.startsWith('workload')
        ? workloadStream
        : itemStream;
      bucket.push({ lineIdx: i, ...token });
    }
  }

  const groups = new Map(centers.map((c) => [c, []]));
  let pendingAfterCenter = null;
  let pendingAfterRemaining = 0;
  let beforeBuffer = [];
  let centerCursor = 0;
  for (const item of itemStream) {
    while (
      centerCursor < centers.length &&
      centers[centerCursor].lineIdx <= item.lineIdx
    ) {
      const center = centers[centerCursor];
      pendingAfterCenter = center;
      pendingAfterRemaining = beforeBuffer.length;
      groups.get(center).push(...beforeBuffer);
      beforeBuffer = [];
      centerCursor++;
    }
    if (pendingAfterRemaining > 0) {
      groups.get(pendingAfterCenter).push(item);
      pendingAfterRemaining--;
    } else {
      beforeBuffer.push(item);
    }
  }

  for (const center of centers) {
    const items = groups.get(center);
    for (let i = 0; i + 1 < items.length; i += 2) {
      const [label, value] = [items[i], items[i + 1]];
      if (value.type !== 'code-value') continue; // unexpected shape; skip defensively
      (label.type === 'coreq-label'
        ? center.corequisites
        : center.prerequisites
      ).push(value.value);
    }
  }

  // Workload-threshold requisites (only Estágio today) are rare enough that
  // nearest-line assignment is unambiguous.
  let pendingWorkloadLine = null;
  for (const token of workloadStream) {
    if (token.type === 'workload-label') {
      pendingWorkloadLine = token.lineIdx;
      continue;
    }
    const anchor =
      pendingWorkloadLine != null
        ? Math.round((pendingWorkloadLine + token.lineIdx) / 2)
        : token.lineIdx;
    const nearest = centers.reduce((best, c) =>
      Math.abs(c.lineIdx - anchor) < Math.abs(best.lineIdx - anchor) ? c : best,
    );
    nearest.minWorkloadHours = token.value;
    pendingWorkloadLine = null;
  }

  return centers.map((c) => ({ ...c, classification }));
}

function slugify(text) {
  return text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/(^-|-$)/g, '');
}

/**
 * Parses a ppc_engenharia_eletrica_*.pdf file into the required/optional
 * subject lists described in docs/ARCHITECTURE.md's PPC dataset shape (minus
 * `equivalents`, which comes from a separate equivalence document).
 */
export function parseEletricaPpcPdf(pdfPath) {
  const rawLines = extractPdfLines(pdfPath, { layout: false });
  const layoutLines = extractPdfLines(pdfPath, { layout: true });

  const { courseName, year } = parseCourseMeta(rawLines);
  const names = buildNameMap(rawLines);
  const sections = findTableSections(layoutLines);

  const subjects = sections
    .flatMap((section) => parseTableSection(layoutLines, section))
    .map((s) => ({
      code: s.code,
      name: names.get(s.code) ?? null,
      workloadHours: s.workloadHours,
      classification: s.classification,
      suggestedSemester: s.suggestedSemester,
      prerequisites: s.prerequisites,
      corequisites: s.corequisites,
      minWorkloadHours: s.minWorkloadHours,
      equivalents: [],
    }));

  const missingNames = subjects
    .filter((s) => s.name == null)
    .map((s) => s.code);
  if (missingNames.length) {
    console.warn(`No ementa name found for: ${missingNames.join(', ')}`);
  }

  return {
    ppcId: `${slugify(courseName)}-${year}`,
    name: `${courseName} ${year}`,
    required: subjects.filter((s) => s.classification === 'required'),
    optional: subjects.filter((s) => s.classification === 'optional'),
  };
}
