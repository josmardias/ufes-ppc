// Shared per-course configuration for Stage 2 of the offerings pipeline
// (see docs/ARCHITECTURE.md, "Data Pipeline"): the `ppcId` to filter by,
// which source semester fills which Year Semester slot, and the course's
// own official id/name — stamped onto the assembled PPC dataset as
// `courseId`/`courseName` (see "PPC dataset"). Shared by
// collect-course-offerings.mjs and assemble-ppc.mjs so both stages agree on
// the same course identity.

export const COURSES = [
  {
    ppcId: 'engenharia-eletrica-2022',
    courseId: '06',
    courseName: 'Engenharia Elétrica',
    yearSemesters: {
      1: { year: 2026, semester: 1 },
      2: { year: 2025, semester: 2 },
    },
  },
];
