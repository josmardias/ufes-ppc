// Parses scripts/input/ppc_engenharia_eletrica_requisitos_optativas_*.d2 to
// extract prerequisites for optional subjects that the main PPC PDF doesn't
// capture (the PDF's requisites matrix only reliably lists a subject's own
// row-level requisites; cross-references from required/other-optional
// subjects into an optional subject are documented separately in this file).
//
// The d2 file is a directed graph: `SOURCE -> TARGET` means SOURCE is a
// prerequisite of TARGET (TARGET requires SOURCE). An optional leading
// "N." on SOURCE (e.g. "7.ELE15954 -> ELE15989") is just the suggested
// semester of that (required) subject and carries no parsing meaning beyond
// stripping it to get the code.

import { readFileSync } from 'node:fs';

const EDGE_RE = /^(?:\d+\.)?([A-Z]{2,5}\d{4,6})\s*->\s*([A-Z]{2,5}\d{4,6})\s*$/;

/**
 * Parses a d2 file into a list of `{ prerequisite, subject }` edges, where
 * `subject` requires `prerequisite`.
 */
export function parseRequisitosOptativasD2(d2Path) {
  const content = readFileSync(d2Path, 'utf8');
  const lines = content.split('\n').filter((l) => l.trim());

  const edges = [];
  for (const line of lines) {
    const match = line.match(EDGE_RE);
    if (!match) {
      throw new Error(`Unrecognized line in ${d2Path}: "${line}"`);
    }
    const [, prerequisite, subject] = match;
    edges.push({ prerequisite, subject });
  }
  return edges;
}
