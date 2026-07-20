import { execFileSync } from 'node:child_process';

const MAX_BUFFER = 50 * 1024 * 1024;

/**
 * Extracts text from a PDF using the system `pdftotext` (poppler-utils).
 * @param {string} pdfPath
 * @param {{ layout?: boolean }} [options] - `layout: true` preserves the original
 *   table columns (needed for the requisites matrix); `layout: false` returns
 *   reading-order text (needed for the per-subject "Ementa" headers, where
 *   long names aren't split across the narrow matrix columns).
 * @returns {string[]} lines of the extracted text
 */
export function extractPdfLines(pdfPath, { layout = true } = {}) {
  const args = [];
  if (layout) args.push('-layout');
  args.push(pdfPath, '-');
  const text = execFileSync('pdftotext', args, {
    encoding: 'utf8',
    maxBuffer: MAX_BUFFER,
  });
  return text.split('\n');
}
