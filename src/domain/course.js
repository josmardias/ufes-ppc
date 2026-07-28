// Groups PPC datasets by their course, for the course → PPC cascading pick
// at profile creation (UC-02). Pure, framework-agnostic (see docs/DOMAIN.md,
// Course Curriculum and Student).

/**
 * @typedef {Object} CourseOption
 * @property {string} courseId
 * @property {string} courseName
 * @property {Array<{id: string, name: string}>} ppcs
 */

/**
 * Groups a flat list of PPC datasets into courses, each carrying its PPC
 * (Course Curriculum) versions. A course may have several PPC versions; only
 * one is the current one, but older versions remain selectable (see
 * docs/DOMAIN.md, Course Curriculum). Order is stable: courses sorted by
 * name, each course's PPC versions sorted by name.
 * @param {Array<{id: string, name: string, courseId: string, courseName: string}>} ppcs
 * @returns {CourseOption[]}
 */
export function groupPpcsByCourse(ppcs) {
  const byCourse = new Map();
  for (const ppc of ppcs) {
    if (!byCourse.has(ppc.courseId)) {
      byCourse.set(ppc.courseId, {
        courseId: ppc.courseId,
        courseName: ppc.courseName,
        ppcs: [],
      });
    }
    byCourse.get(ppc.courseId).ppcs.push({ id: ppc.id, name: ppc.name });
  }

  const courses = [...byCourse.values()];
  courses.sort((a, b) => a.courseName.localeCompare(b.courseName));
  for (const course of courses) {
    course.ppcs.sort((a, b) => a.name.localeCompare(b.name));
  }
  return courses;
}
