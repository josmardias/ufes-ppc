# Domain

This document describes the key concepts (entities) that participate in the UFES course enrollment and planning domain.

Throughout this document, each concept is presented with its English name followed by its Portuguese (PT-BR) name in parentheses — for example, **Subject (Disciplina)**. The PT-BR terms are the ones used in the actual UFES systems and official documents.

---

## Concepts

### Course Curriculum (PPC)
A Course Curriculum (PPC — Projeto Pedagógico de Curso) is a formal document that defines the structure of a graduation program. It specifies the required subjects, their workload, prerequisites, and the rules students must fulfill to obtain their degree.

A Course Curriculum is static once approved. A course may have multiple curriculum versions over time, but only one is considered the **current** curriculum — the one that newly enrolled students will follow. Students enrolled under older curriculum versions may continue on their original curriculum or migrate to the current one.

### Subject (Disciplina)
A Subject (Disciplina) is an academic unit of knowledge with a defined syllabus, workload, and learning objectives. It is identified by a unique **code** and is the basic building block of a Course Curriculum (PPC).

A Subject in a PPC may have a **Suggested Semester** (see below), indicating when it is typically expected to be taken. This is optional — not all Subjects carry a suggestion.

Within a PPC, a Subject may have:
- **Prerequisites (Pré-requisitos)** — other Subjects that must be passed before the student can enroll in this Subject.
- **Co-requisites (Co-requisitos)** — other Subjects that must be taken concurrently with this Subject.

A prerequisite or co-requisite is considered satisfied if the student has passed the Subject itself **or any of its Equivalences** as defined in the PPC.

Within a Course Curriculum, Subjects are classified as:
- **Required (Obrigatória)** — mandatory for all students in the program.
- **Elective (Eletiva)** — taken by a student outside of their own PPC, with no curriculum obligation (consequence of enrolling in a Scope 3 Class).

### Suggested Semester (Período Sugerido)
A Suggested Semester (Período Sugerido) is an optional attribute of a Subject within a PPC. It indicates the semester of the program in which that Subject is typically expected to be taken — the 1st, 2nd, 3rd, and so on. It is a recommendation to help students plan their academic path, not a rule or constraint.

Not all Subjects have a Suggested Semester. Optional and elective Subjects, for example, often carry no suggestion.

### Department (Departamento)
A Department (Departamento) is the academic unit responsible for a subject area (e.g. Mathematics Department, Physics Department). It owns a set of Subjects and is responsible for publishing Offerings each Year Semester, deciding which Classes to open and for which courses.

### Year Semester (Semestre)
A Year Semester (Semestre) is the calendar position within the academic year: either the **1st** or the **2nd** semester of the year.

### Offering (Oferta)
A Department publishes Offerings for a given Year Semester. An Offering (Oferta) groups one or more Classes for a given Subject. Within an Offering, there is typically one Class per course that has that Subject in its PPC.

Offerings for a given Subject tend to repeat on the same Year Semester each year. The set of Subjects and Classes offered in a given Year Semester remains largely stable from one year to the next — because the same cohorts, progressing through the same subjects, generate the same demand. This is why past Offerings from the same Year Semester are used to infer which Subjects and Classes are likely to be available in a future Year Semester.

### Class (Turma)
A Class (Turma) is a specific group of students enrolled in a Subject for a given Year Semester. It is assigned to one or more professors and has a defined schedule — composed of one or more weekly sessions, each specifying a day of the week and a start and end time. A Class typically meets on the same days and hours every week throughout the semester.

Each Class has a **target course** and an **Enrollment Scope (Escopo)** that together control who is eligible to enroll:

- **Scope 1** — Only students of the target course may enroll. The target course is meaningful here.
- **Scope 2** — Students of any course that includes that Subject in their Course Curriculum (PPC) may enroll. The target course is no longer a restriction.
- **Scope 3** — Any UFES student may enroll, even if the Subject is not part of their curriculum. In this case the Subject is taken as an **Elective (Eletiva)**. The target course is not a restriction.

The Enrollment Scope of a Class may change between Enrollment Periods. It is common for a Class to open at Scope 1 during the First Enrollment Period and expand to Scope 2 during the Second Enrollment Period.

### Enrollment Period (Etapa de Matrícula)
Each Year Semester has two Enrollment Periods (Etapas de Matrícula) during which students can enroll in Classes:

- **First Enrollment Period (Primeira Etapa)** — Classes are typically opened with Scope 1, giving priority to students of the target course.
- **Second Enrollment Period (Segunda Etapa)** — Classes may expand their Scope (e.g. from Scope 1 to Scope 2 or 3) to fill remaining seats with students from other courses.

### Student (Aluno)
A Student (Aluno) is enrolled in a single course at UFES and follows one version of that course's Course Curriculum (PPC). They progress through the program by passing Subjects in whichever order their prerequisites and co-requisites allow. Key attributes include:

- The **course** they are enrolled in.
- The **curriculum version** (PPC) they are following.
- The **ingress Year Semester and year** — when they started the program.

A student may enroll in Classes from other courses if the Enrollment Scope of those Classes allows it.

### Academic Transcript (Histórico Escolar)
An Academic Transcript (Histórico Escolar) is the official record of a student's academic history. It lists all Classes the student has attempted, including grades and professor information. For prerequisite and co-requisite purposes, only the Subjects the student has passed are relevant.

### Equivalence (Equivalência)
An Equivalence (Equivalência) defines a directional relationship between Subjects, scoped to a specific Course Curriculum (PPC). It states that completing **any one** of a set of equivalent Subjects satisfies the requirement for a target Subject within that curriculum.

For example, if Subject **A** (the target) has equivalents **B**, **C**, and **D**, then a student who has passed B, C, or D will be treated as having passed A — for prerequisite, co-requisite, and curriculum fulfillment purposes.

Key properties:
- **Directional** — B satisfies A, but A does not necessarily satisfy B.
- **OR logic** — completing any single equivalent is sufficient; there is no case where multiple equivalents must all be completed together.
- **PPC-scoped** — equivalences are defined in the context of a specific Course Curriculum, and may be maintained in a separate document from the PPC itself.

Equivalences are especially relevant when a PPC is updated or when students from different courses share overlapping subjects with different codes.

---

### Curriculum Semester (Período)
A Curriculum Semester (Período) is a slot in a Student's academic timeline, representing one Year Semester's worth of intended enrollment. It holds the set of Classes the Student intends to attend during that Year Semester.

A Student's Curriculum Semesters form an ordered sequence — their 1st, 2nd, 3rd semester in the program, and so on. This sequence reflects the student's own progression and is independent of the Suggested Semesters assigned to Subjects in the PPC.

Curriculum Semesters can represent any point in a student's timeline: semesters that have already taken place, the semester currently underway, or future semesters the student wishes to anticipate. The nature of a Curriculum Semester — past, present, or future — is understood from the student's ingress information and the current calendar date.

It is common for a course to accept new students in both Year Semesters. When that happens, the course typically organizes Classes at different shifts (morning, afternoon, or night) to accommodate both groups simultaneously. For example, at UFES Electrical Engineering, students who ingress in Year Semester 1 tend to attend morning Classes, while students who ingress in Year Semester 2 tend to attend afternoon Classes. This gives students flexibility to attend a Class in a different shift in order to advance or retake a Subject. Shift and cohort are informal conventions of how a course organizes its Classes, not formally defined academic concepts.

**Prerequisite and co-requisite evaluation** across Curriculum Semesters is based on position:
- All Curriculum Semesters preceding semester N are considered fulfilled for both prerequisite and co-requisite purposes when evaluating eligibility for semester N.
- Classes within semester N itself satisfy only co-requisite requirements for other Classes in that same semester.
- Credit Entries (see below) are also considered fulfilled, according to when they were granted.

If a Student has ingress information recorded (course, ingress year, and ingress Year Semester), each Curriculum Semester can be associated with a **Year Semester label** (e.g. "2024/1"), derived from the semester's position in the sequence and the ingress information.

A Curriculum Semester has no pass/fail state. It captures intended enrollment, not academic outcomes.

A Curriculum Semester is considered **valid** when it contains no Schedule Conflicts (see below). A Curriculum Semester with conflicts is still a meaningful planning artifact — a student may intentionally hold conflicting Classes while weighing their options.

---

### Credit Entry (Aproveitamento)
A Credit Entry (Aproveitamento) is the formal recognition that a Student has already mastered the content of a Subject — typically because they completed equivalent coursework in a previous program before joining their current course at UFES. The university reviews the prior work and officially credits the Subject, exempting the Student from taking it again.

A Credit Entry is associated with a point in the Student's academic timeline: either before they began the course, or during a specific Curriculum Semester. This matters because the credit only counts as fulfilled from that point onward — a credit granted mid-course was not available to satisfy requisites in earlier semesters.

The Subject must belong to the Student's Course Curriculum. No information about the external institution or the original Subject is recorded — the Student simply identifies which curriculum Subject was credited and when.

---

### Schedule Conflict (Conflito de Horário)
A Schedule Conflict (Conflito de Horário) occurs when two or more Classes in the same Curriculum Semester have overlapping weekly sessions — that is, at least one session of one Class occupies the same day and overlaps in time with at least one session of another Class.

A student may hold Classes with Schedule Conflicts in the same Curriculum Semester while deciding which ones to keep. A Curriculum Semester with no Schedule Conflicts is considered **valid**.