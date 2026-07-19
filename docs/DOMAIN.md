# Domain

This document describes the key concepts (entities) that participate in the UFES course enrollment and planning domain.

Throughout this document, each concept is presented with its English name followed by its Portuguese (PT-BR) name in parentheses — for example, **Subject (Disciplina)**. The PT-BR terms are the ones used in the actual UFES systems and official documents.

---

## Translation Dictionary

| English | PT-BR |
|---|---|
| Course Curriculum | Projeto Pedagógico de Curso (PPC) |
| Subject | Disciplina |
| Required / Optional / Elective | Obrigatória / Optativa / Eletiva |
| Prerequisite | Pré-requisito |
| Co-requisite | Co-requisito |
| Suggested Semester | Período Sugerido |
| Department | Departamento |
| Year Semester | Semestre |
| Offering | Oferta |
| Section | Turma |
| Enrollment Scope | Escopo |
| Enrollment Period | Etapa de Matrícula |
| First / Second Enrollment Period | Primeira / Segunda Etapa |
| Student | Aluno |
| Academic Transcript | Histórico Escolar |
| Equivalence | Equivalência |
| Planned Semester | Período |
| Credit Entry | Aproveitamento |
| Failed Mark | Reprovação |
| Schedule Conflict | Conflito de Horário |
| Unmet Requisite | Requisito não atendido |
| Duplicate Subject | Disciplina Duplicada |
| Redundant Enrollment | Matrícula Redundante |
| Warning / Error (planning signal severity) | Aviso / Erro |
| Custom Section | Turma Personalizada |
| Audit Mark (attend as listener) | Ouvinte |
| Shift | Turno |
| Day / Morning / Afternoon (shifts) | Integral / Manhã / Tarde |

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
- **Optional (Optativa)** — part of the PPC and subject to the same prerequisite, co-requisite, and scope rules as Required Subjects, but the student is not obliged to take it. Optional Subjects count toward the student's curriculum when taken.
- **Elective (Eletiva)** — taken by a student outside of their own PPC, with no curriculum obligation (consequence of enrolling in a Scope 3 Section).

> **Note:** Electives are described here for context only. In this tool, planning is restricted to Subjects of the Student's own PPC — a real-world elective can be represented as a Custom Section (see below).

### Suggested Semester (Período Sugerido)
A Suggested Semester (Período Sugerido) is an optional attribute of a Subject within a PPC. It indicates the semester of the program in which that Subject is typically expected to be taken — the 1st, 2nd, 3rd, and so on. It is a recommendation to help students plan their academic path, not a rule or constraint.

Not all Subjects have a Suggested Semester. Optional and elective Subjects, for example, often carry no suggestion.

### Department (Departamento)
A Department (Departamento) is the academic unit responsible for a subject area (e.g. Mathematics Department, Physics Department). It owns a set of Subjects and is responsible for publishing Offerings each Year Semester, deciding which Classes to open and for which courses.

### Year Semester (Semestre)
A Year Semester (Semestre) is the calendar position within the academic year: either the **1st** or the **2nd** semester of the year.

### Offering (Oferta)
A Department publishes Offerings for a given Year Semester. An Offering (Oferta) groups one or more Sections for a given Subject. Within an Offering, there is typically one Section per course that has that Subject in its PPC.

Offerings for a given Subject tend to repeat on the same Year Semester each year. The set of Subjects and Sections offered in a given Year Semester remains largely stable from one year to the next — because the same cohorts, progressing through the same subjects, generate the same demand. This is why past Offerings from the same Year Semester are used to infer which Subjects and Sections are likely to be available in a future Year Semester.

### Section (Turma)
A Section (Turma) is a specific group of students enrolled in a Subject for a given Year Semester. It is assigned to one or more professors and has a defined schedule — composed of one or more weekly sessions, each specifying a day of the week and a start and end time. A Section typically meets on the same days and hours every week throughout the semester.

Each Section has a **target course** and an **Enrollment Scope (Escopo)** that together control who is eligible to enroll:

- **Scope 1** — Only students of the target course may enroll. The target course is meaningful here.
- **Scope 2** — Students of any course that includes that Subject in their Course Curriculum (PPC) may enroll. The target course is no longer a restriction.
- **Scope 3** — Any UFES student may enroll, even if the Subject is not part of their curriculum. In this case the Subject is taken as an **Elective (Eletiva)**. The target course is not a restriction.

The Enrollment Scope of a Section may change between Enrollment Periods. It is common for a Section to open at Scope 1 during the First Enrollment Period and expand to Scope 2 during the Second Enrollment Period.

> **Note:** Enrollment Scopes and target courses are described here for context only. This tool does not model or enforce enrollment eligibility.

Each Section also has a **Shift (Turno)** classification, derived from its weekly sessions: **morning** if all sessions end at or before 13:00, **afternoon** if all sessions start at or after 13:00, and **day** otherwise. In this tool the classification is precomputed when the static datasets are generated, not derived at runtime.

### Enrollment Period (Etapa de Matrícula)
Each Year Semester has two Enrollment Periods (Etapas de Matrícula) during which students can enroll in Classes:

- **First Enrollment Period (Primeira Etapa)** — Sections are typically opened with Scope 1, giving priority to students of the target course.
- **Second Enrollment Period (Segunda Etapa)** — Sections may expand their Scope (e.g. from Scope 1 to Scope 3) to fill remaining seats with students from other courses.

> **Note:** Enrollment Periods are described here for context only. This tool does not model them.

### Student (Aluno)
A Student (Aluno) is enrolled in a single course at UFES and follows one version of that course's Course Curriculum (PPC). They progress through the program by passing Subjects in whichever order their prerequisites and co-requisites allow. Key attributes include:

- The **course** they are enrolled in.
- The **curriculum version** (PPC) they are following.
- The **ingress Year Semester and year** — when they started the program.

A student may enroll in Sections from other courses if the Enrollment Scope of those Sections allows it.

In this tool, the profile references one specific PPC. It is chosen when the first Planned Semester is created (from a flat list of the available PPCs) and can only be changed while the plan has no Planned Semesters. Because Credit Entries reference PPC Subjects, they must also be deleted before switching to a different PPC.

### Academic Transcript (Histórico Escolar)
An Academic Transcript (Histórico Escolar) is the official record of a student's academic history. It lists all Sections the student has attempted, including grades and professor information. For prerequisite and co-requisite purposes, only the Subjects the student has passed are relevant.

> **Note:** This tool does not read, import, or export Academic Transcripts. The concept is described here for context only.

### Equivalence (Equivalência)
An Equivalence (Equivalência) defines a directional relationship between Subjects, scoped to a specific Course Curriculum (PPC). It states that completing **any one** of a set of equivalent Subjects satisfies the requirement for a target Subject within that curriculum.

For example, if Subject **A** (the target) has equivalents **B**, **C**, and **D**, then a student who has passed B, C, or D will be treated as having passed A — for prerequisite, co-requisite, and curriculum fulfillment purposes.

Key properties:
- **Directional** — B satisfies A, but A does not necessarily satisfy B.
- **OR logic** — completing any single equivalent is sufficient; there is no case where multiple equivalents must all be completed together.
- **PPC-scoped** — equivalences are defined in the context of a specific Course Curriculum, and may be maintained in a separate document from the PPC itself.

Equivalences are especially relevant when a PPC is updated or when students from different courses share overlapping subjects with different codes.

In this tool, Equivalences are part of the PPC dataset: each Subject lists the codes that satisfy it. Sections offered under an equivalent code are listed among the available Sections when planning, and a planned Section under an equivalent code fulfills the target Subject for prerequisite, co-requisite, and curriculum fulfillment purposes. The resolution from equivalent code to target Subject happens at evaluation time and is never persisted.

---

### Planned Semester (Período)
A Planned Semester (Período) is a slot in a Student's academic timeline, representing one Year Semester's worth of intended enrollment. It holds the set of Sections the Student intends to attend during that Year Semester.

A Student's Planned Semesters form an ordered sequence — their 1st, 2nd, 3rd semester in the program, and so on. This sequence reflects the student's own progression and is independent of the Suggested Semesters assigned to Subjects in the PPC.

Planned Semesters can represent any point in a student's timeline: semesters that have already taken place, the semester currently underway, or future semesters the student wishes to anticipate. The nature of a Planned Semester — past, present, or future — is understood from the student's ingress information and the current calendar date.

It is common for a course to accept new students in both Year Semesters. When that happens, the course typically organizes Sections at different shifts (morning, afternoon, or night) to accommodate both groups simultaneously. For example, at UFES Electrical Engineering, students who ingress in Year Semester 1 tend to attend morning Sections, while students who ingress in Year Semester 2 tend to attend afternoon Sections. This gives students flexibility to attend a Section in a different shift in order to advance or retake a Subject. Shift and cohort are informal conventions of how a course organizes its Sections, not formally defined academic concepts. In this tool, the Student provides their shift (Day, Morning, or Afternoon) when creating their profile; it serves as the default Shift filter when listing available Sections, and the Student may override it at any time with a persisted toggle (morning, afternoon, or whole day — day-shift Sections appear under every option). The toggle is cleared when the last Planned Semester is deleted.

**Prerequisite and co-requisite evaluation** across Planned Semesters is based on position:
- Sections in Planned Semesters preceding semester N are considered fulfilled for both prerequisite and co-requisite purposes when evaluating eligibility for semester N — except Sections carrying a Failed Mark (see below), which confer nothing forward.
- Sections within semester N itself satisfy only co-requisite requirements for other Sections in that same semester — including Sections later marked as failed.
- Credit Entries (see below) are always considered fulfilled, from the very start of the timeline.

Fulfillment is code-agnostic: a Section planned under an equivalent code (see Equivalence) and a Custom Section copy linked to a Subject (see Custom Section) both fulfill the target Subject exactly as a regular Section of it would.

Each Planned Semester is associated with a **Year Semester label** (e.g. "2024/1"), derived from the semester's position in the sequence and the Student's ingress information (provided at profile creation).

A Planned Semester captures intended enrollment, not grades or academic outcomes. The one outcome it does record is the **Failed Mark** (see below), so that requisite evaluation can reflect a Subject that must be retaken.

Any Planned Semester can be **edited** at any time — Sections added or removed, Failed Marks and Audit Marks toggled — whether it lies in the past, present, or future of the student's real timeline. This is how the plan is kept aligned with reality: grades come in, a failure is recorded in the semester where it happened, and the semesters after it are replanned. Every edit re-evaluates the planning signals of that semester and of all later ones (see Unmet Requisite). Only the **last** Planned Semester can be deleted, because every semester is anchored to its position in the plan.

Four derived **planning signals** can flag Sections in a Planned Semester: Schedule Conflict, Duplicate Subject, and Redundant Enrollment are **warnings (Avisos)**; Unmet Requisite is an **error (Erro)**. Severity reflects reach — a warning stays contained in its own semester (the fulfillment conferred to later semesters is unaffected), while an error means the flagged Section confers nothing forward, breaking whatever depended on it, however far down the plan. A signal always flags the Section as a whole, not an individual session of it. A Planned Semester's **status** summarizes its signals: **clean** (no signals), **warnings only**, or **errors** (at least one error, regardless of warnings). A flagged Planned Semester is still a meaningful planning artifact — a student may intentionally hold conflicting or blocked Sections while weighing their options. Nothing is ever forbidden or hidden; signals are information, not hard blocks.

---

### Failed Mark (Reprovação)
A Failed Mark records that the Student did not pass a Section in a Planned Semester. It is the Student's way of making the plan reflect a real-life failure without deleting the historical record.

Effects of a failed Section:
- **No fulfillment forward** — it confers nothing to later semesters: neither prerequisite nor co-requisite satisfaction, nor curriculum fulfillment. The Subject reappears among suggested and available Sections when planning later Planned Semesters.
- **Same-semester co-requisites still count** — within its own Planned Semester, a failed Section still satisfies co-requisite requirements for sibling Sections. The concurrent enrollment really happened; the failure came after.
- **Schedule unaffected** — the Section still occupies its time slots and participates in Schedule Conflict detection within its own semester.

---

### Unmet Requisite (Requisito não atendido)
An Unmet Requisite flags a Section in a Planned Semester whose Subject's prerequisites or co-requisites are not satisfied at that point in the plan — because a supporting Section was marked as failed, removed, or never planned.

Unmet Requisites are **derived, never stored**. They are computed from the sequence of Planned Semesters: the fulfillment set is built semester by semester, excluding failed Sections; a Section whose requisites are not met is flagged and contributes nothing to the fulfillment set itself — so the flagging **cascades recursively** to every Section that depended on it, however far down the plan. Any edit to a past Planned Semester (marking a Section as failed, removing or adding a Section) propagates automatically through this recomputation.

An Unmet Requisite is an **error** (see Planned Semester) — the one signal whose effect is not contained in its own semester. This also makes it fixable from elsewhere: adding the missing requisite to an earlier Planned Semester, or recording a Credit Entry for it, clears the flag through the same recomputation.

---

### Credit Entry (Aproveitamento)
A Credit Entry (Aproveitamento) is the formal recognition that a Student has already mastered the content of a Subject — typically because they completed equivalent coursework in a previous program before joining their current course at UFES. The university reviews the prior work and officially credits the Subject, exempting the Student from taking it again.

A Credit Entry belongs to the Student's profile and is **timeless**: the credited Subject counts as fulfilled from the very start of the timeline, for every Planned Semester. No information about when the credit was granted is recorded.

The Subject must belong to the Student's Course Curriculum. No information about the external institution or the original Subject is recorded — the Student simply identifies which curriculum Subject was credited. Because Credit Entries reference PPC Subjects, they must be deleted before the profile can switch to a different PPC.

A Credit Entry may carry an **Audit Mark** (see below).

---

### Schedule Conflict (Conflito de Horário)
A Schedule Conflict (Conflito de Horário) occurs when two or more Sections in the same Planned Semester have overlapping weekly sessions — that is, at least one session of one Section occupies the same day and overlaps in time with at least one session of another Section.

A Schedule Conflict is a **warning** (see Planned Semester): it stays contained in its own semester — both Sections still confer fulfillment forward until the student decides which to keep. A student may hold Sections with Schedule Conflicts in the same Planned Semester while weighing their options.

---

### Duplicate Subject (Disciplina Duplicada)
A student cannot enroll in the same Subject more than once in the same Year Semester. A Duplicate Subject flags two or more Sections in the same Planned Semester that fulfill the same PPC Subject — directly, under an equivalent code (see Equivalence), or through a linked Custom Section copy. Alternative Sections (turmas) of one Subject are mutually exclusive choices, not a set to plan together — even when their schedules do not overlap in time.

A Duplicate Subject is a **warning** (see Planned Semester), derived and never stored: the Subject counts only once toward later semesters regardless of how many Sections of it are held, so the flag stays contained in its own semester. Pruning to one Section per Subject is part of planning.

---

### Redundant Enrollment (Matrícula Redundante)
A student cannot enroll in a Subject they have already passed or been credited for — attending it again is only possible informally, as a listener (see Audit Mark). A Redundant Enrollment flags a Section whose Subject is already fulfilled at that point in the plan — by a non-failed Section in an earlier Planned Semester or by a Credit Entry — when that fulfillment does **not** carry an open Audit Mark. An open Audit Mark is precisely the state that legitimizes planning the Subject again, so it suppresses the flag.

A Section rarely becomes redundant through the planning lists — fulfilled Subjects are excluded there — but it can become redundant after the fact: adding a Credit Entry for a Subject already planned ahead, removing the Failed Mark that had justified a re-take, or adding the Subject to an earlier Planned Semester. A Redundant Enrollment is a **warning** (see Planned Semester), derived and never stored, contained in its own semester. Its resolutions differ from a conflict's: remove the Section, or mark the fulfillment source for Audit to make the re-take legitimate.

---

### Custom Section (Turma Personalizada)
A Custom Section (Turma Personalizada) is a Section defined by the Student themselves, kept in a **catalog** on their profile, rather than coming from Department Offerings. It covers two needs:

1. **Missing data** — a real Section exists but is not covered by the system's Offering data. The Student may link the Custom Section to a Subject in their Course Curriculum; it then behaves like a regular Section of that Subject for prerequisite, co-requisite, and curriculum fulfillment purposes.
2. **Non-academic commitments** — recurring time commitments such as lab work, a side project, or a job. These have no linked Subject and no requisite effect; they only occupy schedule time.

Like a regular Section, a Custom Section has weekly sessions (day of the week, start and end time). The Student chooses its **applicability**: the 1st Year Semester, the 2nd, or both — a semester-bound entry models a real Section missing from the Offering data, while a both-semesters entry models a standing commitment such as work or lab hours. The catalog entry is offered when planning any Planned Semester of a matching Year Semester.

Adding a Custom Section to a Planned Semester creates an **independent copy** inside that semester. Later edits to — or deletion of — the catalog entry never affect copies already applied; the Student manages those within the semesters themselves. Applied copies participate in Schedule Conflict detection like any other Section.

A catalog entry whose Subject link does not resolve in the current PPC (after a PPC switch) is **stale**: it is kept, visually de-emphasized, and behaves as unlinked until edited, deleted, or the original PPC is selected again.

---

### Audit Mark (Ouvinte)
An Audit Mark records the Student's intention to attend a Subject again as a listener (ouvinte) — without actual enrollment — even though the Subject is already fulfilled: "it's enough to unlock requisites, but I still want to retake it." This happens in the real world when a Student already holds the credit (from a previous program, via a Credit Entry) or has already taken the Subject, but wants to sit through the class anyway.

An Audit Mark is a flag on one of two carriers — the fulfillment source being audited:
- a **Section in a Planned Semester**, or
- a **Credit Entry**.

The mark lives and dies with its carrier: deleting the Section (or the Planned Semester holding it) or the Credit Entry removes the mark with it.

Effects:
- **Requisite evaluation is unchanged** — the original fulfillment keeps counting from its position, as usual.
- **Planning treats the Subject as not yet done** — it appears again among suggested and available Sections when planning new Planned Semesters.
- A Section added for an audited Subject occupies schedule time and participates in Schedule Conflict detection like any other, but confers no additional fulfillment.
- The mark persists until the Student removes it (or its carrier is deleted).

An Audit Mark is **open** at a given point in the plan while no re-take Section has been planned since its carrier: the Subject then appears among suggested and available Sections. Planning a re-take **closes** the mark from that semester onward — later semesters treat the Subject as done again, and it stops being offered. Open/closed is **derived, never stored**: deleting the re-take Section re-opens the mark automatically. A re-take planned while the mark is open is never flagged as a Redundant Enrollment (see Redundant Enrollment).