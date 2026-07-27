// Drives the course → PPC cascading pick shared by profile creation (UC-02)
// and profile data editing (UC-24, see docs/USE_CASES.md): each field
// pre-fills when only one option exists; with several options it starts
// empty and requires an explicit choice. Choosing a course resets the PPC
// pick (auto-filling it too when the chosen course has a single PPC
// version).

import { useState } from 'react';
import { ppcs } from '../data/index.js';
import { groupPpcsByCourse } from '../domain/course.js';

const COURSES = groupPpcsByCourse(Object.values(ppcs));

function findCourseForPpc(ppcId) {
  return COURSES.find((course) => course.ppcs.some((p) => p.id === ppcId)) ?? null;
}

function findCourse(courseId) {
  return COURSES.find((course) => course.courseId === courseId) ?? null;
}

function initialSelection(initialPpcId) {
  if (initialPpcId) {
    const course = findCourseForPpc(initialPpcId);
    return { courseId: course?.courseId ?? '', ppcId: initialPpcId };
  }
  const courseId = COURSES.length === 1 ? COURSES[0].courseId : '';
  const course = findCourse(courseId);
  const ppcId = course && course.ppcs.length === 1 ? course.ppcs[0].id : '';
  return { courseId, ppcId };
}

/** @param {string|null} [initialPpcId] - pre-selects the course + PPC that resolve to it */
export function useCourseCascade(initialPpcId = null) {
  const [selection, setSelection] = useState(() =>
    initialSelection(initialPpcId),
  );

  function selectCourse(courseId) {
    const course = findCourse(courseId);
    const ppcId = course && course.ppcs.length === 1 ? course.ppcs[0].id : '';
    setSelection({ courseId, ppcId });
  }

  function selectPpc(ppcId) {
    setSelection((prev) => ({ ...prev, ppcId }));
  }

  function reset(nextInitialPpcId = null) {
    setSelection(initialSelection(nextInitialPpcId));
  }

  return {
    courses: COURSES,
    courseId: selection.courseId,
    ppcId: selection.ppcId,
    ppcOptions: findCourse(selection.courseId)?.ppcs ?? [],
    selectCourse,
    selectPpc,
    reset,
  };
}
