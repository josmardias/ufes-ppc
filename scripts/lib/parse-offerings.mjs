// Parses a "Oferta de Disciplinas por Departamento (Modelo Ufes)" PDF —
// scripts/input/oferta-departamento-<dept>-<year>-<sem>.pdf.
//
// This template is shared by every department (only the department name and
// subjects differ), so a single parser covers all of them — unlike the PPC
// PDFs, which are one-off per course.

import { extractPdfLines } from './pdf-text.mjs';

const DEPARTMENT_RE = /^Departamento:\s*(.+?)(?:\s{2,}.*)?$/;
const YEAR_SEMESTER_RE = /Per[ií]odo:\s*(\d{4})\/(\d)/;

// A subject header line, e.g.:
// "ELE03613 INSTALACOES TECNICAS II   ...   CH Total Disciplina: 60"
const SUBJECT_RE = /^([A-Z]{2,5}\d{4,6})\s+(.+?)\s+CH Total Disciplina:\s*(\d+)\s*$/;

// A section (Turma) row, e.g.:
// "01     1   02 - Arquitetura e Urbanismo   33   0   23   10   OURESTE ELIAS BATISTA   M"
// The Turma column occasionally carries a trailing " N" flag (e.g. "06.1 N"),
// which is kept as part of the raw turma value rather than interpreted.
const SECTION_RE =
  /^\s*(\S+(?:\s+N)?)\s+([1-5])\s+(.+?)\s+(-?\d+)\s+(-?\d+)\s+(\d+)\s+(\d+)\s+(.+?)\s+([A-Z])\s*$/;

// A weekly session row trailing a section, e.g. "Seg   07:00   09:00".
const SESSION_RE = /^\s*(Seg|Ter|Qua|Qui|Sex|Sáb|Sab|Dom)\s+(\d{2}:\d{2})\s+(\d{2}:\d{2})\s*$/;

/**
 * Splits a "Curso" cell (e.g. "12 B - Matemática - Bacharelado") into the
 * target course code and name, on the first " - " separator.
 */
function parseTargetCourse(text) {
  const m = text.match(/^(.+?)\s-\s(.+)$/);
  if (!m) return { targetCourseCode: text.trim(), targetCourseName: null };
  return { targetCourseCode: m[1].trim(), targetCourseName: m[2].trim() };
}

/**
 * Derives a Section's shift from its weekly sessions, per DOMAIN.md: morning
 * if every session ends at or before 13:00, afternoon if every session
 * starts at or after 13:00, day otherwise. Sections with no sessions (e.g.
 * Estágio, TCC) have a null shift.
 */
export function computeShift(sessions) {
  if (sessions.length === 0) return null;
  if (sessions.every((s) => s.endTime <= '13:00')) return 'morning';
  if (sessions.every((s) => s.startTime >= '13:00')) return 'afternoon';
  return 'day';
}

/**
 * Parses an oferta-departamento-*.pdf file into its department, Year
 * Semester, and per-subject list of Sections.
 */
export function parseOfertaPdf(pdfPath) {
  const lines = extractPdfLines(pdfPath, { layout: true });

  const department = lines.find((l) => DEPARTMENT_RE.test(l))?.match(DEPARTMENT_RE)?.[1] ?? null;
  const yearSemesterLine = lines.find((l) => YEAR_SEMESTER_RE.test(l));
  const yearSemesterMatch = yearSemesterLine?.match(YEAR_SEMESTER_RE);
  if (!department || !yearSemesterMatch) {
    throw new Error(`Could not determine department/Year Semester from ${pdfPath}.`);
  }
  const yearSemester = { year: Number(yearSemesterMatch[1]), semester: Number(yearSemesterMatch[2]) };

  const subjects = [];
  let currentSubject = null;
  let currentSection = null;

  for (const line of lines) {
    const subjectMatch = line.match(SUBJECT_RE);
    if (subjectMatch) {
      const [, code, name, workloadHours] = subjectMatch;
      currentSubject = { code, name: name.trim(), workloadHours: Number(workloadHours), sections: [] };
      subjects.push(currentSubject);
      currentSection = null;
      continue;
    }

    const sectionMatch = line.match(SECTION_RE);
    if (sectionMatch && currentSubject) {
      const [, turma, scope, curso, seatsOffered, seatsIncreased, seatsOccupied, seatsAvailable, professor, status] =
        sectionMatch;
      currentSection = {
        turma: turma.trim(),
        scope: Number(scope),
        ...parseTargetCourse(curso.trim()),
        seatsOffered: Number(seatsOffered),
        seatsIncreased: Number(seatsIncreased),
        seatsOccupied: Number(seatsOccupied),
        seatsAvailable: Number(seatsAvailable),
        professor: professor.trim(),
        status,
        sessions: [],
        shift: null,
      };
      currentSubject.sections.push(currentSection);
      continue;
    }

    const sessionMatch = line.match(SESSION_RE);
    if (sessionMatch && currentSection) {
      const [, day, startTime, endTime] = sessionMatch;
      currentSection.sessions.push({ day, startTime, endTime });
    }
  }

  for (const subject of subjects) {
    for (const section of subject.sections) {
      section.shift = computeShift(section.sessions);
    }
  }

  return { department, yearSemester, subjects };
}
