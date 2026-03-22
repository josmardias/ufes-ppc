# Use Cases

This document describes the use cases of the UFES course planning system. Use cases describe user goals and the interaction flow between the user and the system, independent of any specific UI or implementation decisions.

Domain terms follow the same convention as `DOMAIN.md`: English name with PT-BR name in parentheses where relevant.

---

## Profile Management

### UC-01 — View Student Profile List

**Actor:** User

**Goal:** See all existing Student profiles in order to choose one to work with.

**Main Flow:**
1. The user opens the system.
2. The system presents the list of all stored Student profiles.

**Alternative Flow — No profiles exist:**
- The system informs the user that no profiles exist and offers the option to create or import one.

---

### UC-02 — Create Student Profile

**Actor:** User

**Goal:** Register a new Student profile so that planning data can be stored and retrieved across sessions.

**Main Flow:**
1. The user requests to create a new profile.
2. The system asks for the Student's name.
3. The user provides the name and confirms.
4. The system creates and persists the new Student profile.
5. The system makes the new profile the active Student.

**Validation:**
- The Student's name must not be empty.

**Alternative Flow — User cancels:**
- No profile is created.

---

### UC-03 — Select Student Profile

**Actor:** User

**Goal:** Set an existing Student profile as active so that its planning data can be viewed and edited.

**Preconditions:**
- At least one Student profile exists.

**Main Flow:**
1. The user selects a Student profile from the list.
2. The system loads that profile as the active Student.

---

### UC-04 — Clone Student Profile

**Actor:** User

**Goal:** Create a copy of an existing Student profile, including all its planning data, under a new name.

**Preconditions:**
- At least one Student profile exists.

**Main Flow:**
1. The user selects a Student profile and requests to clone it.
2. The system asks for a name for the new profile.
3. The user provides the name and confirms.
4. The system creates and persists the cloned profile under the new name.

**Validation:**
- The new name must not be empty.
- The new name must differ from all existing profile names.

**Alternative Flow — User cancels:**
- No profile is created.

---

### UC-05 — Delete Student Profile

**Actor:** User

**Goal:** Permanently remove a Student profile and all its associated planning data.

**Preconditions:**
- At least one Student profile exists.

**Main Flow:**
1. The user selects a Student profile and requests to delete it.
2. The system asks the user to confirm the deletion.
3. The user confirms.
4. The system removes the profile and all its data from storage.

**Alternative Flow — User cancels:**
- No changes are made.

---

### UC-06 — Import Student Profile

**Actor:** User

**Goal:** Bring a previously exported Student profile into the system.

**Preconditions:**
- The user has a valid exported profile file available.

**Main Flow:**
1. The user requests to import a profile and provides a file.
2. The system reads, parses, and validates the file.
3. The system persists the imported profile.

**Alternative Flow — File is invalid:**
- The system rejects the file and does not save anything.

**Alternative Flow — Profile name already exists:**
- The system asks the user whether to overwrite the existing profile or cancel.

---

### UC-07 — Export Student Profile

**Actor:** User

**Goal:** Save a Student profile to a file so it can be backed up or transferred to another device.

**Preconditions:**
- At least one Student profile exists.

**Main Flow:**
1. The user selects a Student profile and requests to export it.
2. The system serializes the profile data and delivers it to the user as a file.

---

### UC-08 — Rename Student Profile

**Actor:** User

**Goal:** Change the name of an existing Student profile.

**Preconditions:**
- At least one Student profile exists.

**Main Flow:**
1. The user selects a Student profile and requests to rename it.
2. The system asks for a new name.
3. The user provides the new name and confirms.
4. The system updates the profile name and persists the change.

**Validation:**
- The new name must not be empty.
- The new name must differ from all existing profile names.

**Alternative Flow — User cancels:**
- No changes are made.

---

## Schedule Planner

### UC-09 — View Schedule Planner

**Actor:** User

**Goal:** Access the planning workspace for the active Student, where past and current Planned Semesters and their Classes can be reviewed, and where any Schedule Conflicts in the selected Planned Semester are visible.

**Preconditions:**
- An active Student profile has been selected or created.

**Main Flow:**
1. The system loads the planning data for the active Student.
2. The system presents the list of the Student's Planned Semesters.
3. The system presents the Classes assigned to the selected Planned Semester.
4. If the selected Planned Semester contains Schedule Conflicts, the system highlights the conflicting Classes and indicates the semester is not yet valid.

**Alternative Flow — No Planned Semesters exist:**
- The system informs the user that no Planned Semesters exist and offers the option to add the first one.

---

### UC-10 — Select a Planned Semester

**Actor:** User

**Goal:** View the Classes planned for a specific Planned Semester.

**Preconditions:**
- The Schedule Planner is open.
- At least one Planned Semester exists in the Student's plan.

**Main Flow:**
1. The user selects a Planned Semester from the list.
2. The system presents the Classes assigned to that Planned Semester.
3. If the selected Planned Semester contains Schedule Conflicts, the system highlights the conflicting Classes and indicates the semester is not yet valid.

---

### UC-11 — Add a New Planned Semester

**Actor:** User

**Goal:** Add the next Planned Semester to the plan, pre-populated with a suggested set of Classes the Student is eligible to enroll in.

**Preconditions:**
- The Schedule Planner is open.

**Main Flow:**
1. The user requests to add a new Planned Semester.
2. If no Course information is recorded for this Student yet, the system asks for:
   - The Course (and its Course Curriculum) the Student is enrolled in.
   - Whether the Student ingressed in the 1st or 2nd Year Semester.
   The system persists this information to the Student profile before proceeding.
3. The system determines the label (Year Semester) and number (Curriculum Semester position) for the new Planned Semester based on the Student's ingress information and existing Planned Semesters.
4. The system evaluates all Subjects in the Course Curriculum that do not yet appear in any Planned Semester, and identifies those whose prerequisites are satisfied by Classes in past Planned Semesters (considering Equivalences).
5. For each eligible Subject, the system identifies available Classes from past Offerings of the same Year Semester.
6. The system creates the new Planned Semester pre-populated with the suggested Classes and persists it.
7. The user iterates — adding and removing Classes (UC-12, UC-13) — until the semester is valid (no Schedule Conflicts).

**Alternative Flow — No eligible Classes found:**
- The system creates the new Planned Semester empty and informs the user.

**Alternative Flow — User cancels:**
- No changes are made.

---

### UC-12 — Add a Class to a Planned Semester

**Actor:** User

**Goal:** Add a Class to a Planned Semester being worked on.

**Preconditions:**
- The Schedule Planner is open.
- At least one Planned Semester exists.

**Main Flow:**
1. The user requests to add a Class to the selected Planned Semester.
2. The system presents the Classes available for that Year Semester whose Subject prerequisites are satisfied by past Planned Semesters, and whose Subject co-requisites are satisfied by past or current Planned Semesters (considering Equivalences).
3. The user selects a Class.
4. The system adds the Class to the Planned Semester and persists the change.
5. If the added Class creates a Schedule Conflict with any existing Class in the semester, the system highlights the conflict.

**Notes:**
- The system does not prevent adding a Class that causes a Schedule Conflict. Conflicts are surfaced as information, not as a hard block.

**Alternative Flow — User cancels:**
- No changes are made.

---

### UC-13 — Remove a Class from a Planned Semester

**Actor:** User

**Goal:** Remove a Class from a Planned Semester.

**Preconditions:**
- The Schedule Planner is open.
- The selected Planned Semester contains at least one Class.

**Main Flow:**
1. The user selects a Class in the Planned Semester and requests to remove it.
2. The system removes the Class from the Planned Semester and persists the change.
3. The system re-evaluates Schedule Conflicts for the semester and updates the validity indicator.

**Notes:**
- Removing a Class may eliminate a Schedule Conflict, making the semester valid.
- Removing a Class whose Subject is a co-requisite for another Class remaining in the same semester will surface a new co-requisite violation. The system highlights this but does not block the removal.

**Alternative Flow — User cancels:**
- No changes are made.

---

### UC-14 — Delete a Planned Semester

**Actor:** User

**Goal:** Remove an entire Planned Semester and all its Classes from the Student's plan.

**Preconditions:**
- The Schedule Planner is open.
- At least one Planned Semester exists.

**Main Flow:**
1. The user selects a Planned Semester and requests to delete it.
2. The system asks the user to confirm the deletion.
3. The user confirms.
4. The system removes the Planned Semester and all its Classes from the plan and persists the change.

**Notes:**
- Deleting a past Planned Semester may cause prerequisite violations in later semesters. The system does not block the deletion but should surface any resulting violations.

**Alternative Flow — User cancels:**
- No changes are made.

---

## Credit Entries

### UC-15 — Add a Credit Entry

**Actor:** User

**Goal:** Record a Subject from the Course Curriculum as formally credited to the Student, so that it counts as fulfilled for requisite evaluation from a given point in the plan onward.

**Preconditions:**
- An active Student profile has been selected.
- The Student has a Course Curriculum recorded on their profile.

**Main Flow:**
1. The user requests to add a Credit Entry.
2. The system presents the list of Subjects from the Student's Course Curriculum that do not already have a Credit Entry.
3. The user selects a Subject.
4. The system asks at which point the credit was granted:
   - Before the course started (position 0), or
   - During a specific Planned Semester (by plan index).
5. The user confirms.
6. The system persists the Credit Entry on the Student profile.

**Validation:**
- The selected Subject must exist in the Student's Course Curriculum.
- A Subject may not have more than one Credit Entry.

**Alternative Flow — User cancels:**
- No changes are made.

---

### UC-16 — Remove a Credit Entry

**Actor:** User

**Goal:** Remove a previously recorded Credit Entry from the Student's profile.

**Preconditions:**
- An active Student profile has been selected.
- At least one Credit Entry exists on the profile.

**Main Flow:**
1. The user selects a Credit Entry and requests to remove it.
2. The system asks the user to confirm the removal.
3. The user confirms.
4. The system removes the Credit Entry from the Student profile and persists the change.

**Notes:**
- Removing a Credit Entry may cause prerequisite violations in Planned Semesters that relied on it. The system does not block the removal but should surface any resulting violations.

**Alternative Flow — User cancels:**
- No changes are made.

---

## TODO

### UC-17 — Edit a Past Planned Semester

> **TODO:** This use case is not yet fully specified. The interaction flow and validation rules need to be defined before implementation.

**Actor:** User

**Goal:** Modify the Classes in a Planned Semester that has already been superseded by later semesters in the plan.

**Preconditions:**
- The Schedule Planner is open.
- At least two Planned Semesters exist (i.e. there is at least one semester that is not the last).

**Known constraints:**
- Only Classes and Credit Entries whose grant position is ≤ the plan index of the semester being edited are available as fulfilled subjects during that edit. Credits granted at a later position were not yet available at that point in the plan.
- Editing a past Planned Semester may cause prerequisite violations in later semesters. The system should surface these but not block the edit.

**Alternative Flow — User cancels:**
- No changes are made.