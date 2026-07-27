# Use Cases

## Purpose & Scope

**Problem:** Each semester, UFES students must decide which Sections (Turmas) to enroll in — navigating prerequisites, co-requisites, equivalences, schedule conflicts, and offerings that vary by Year Semester — with no official tool to simulate plans ahead of time.

**Target user:** UFES undergraduate students planning their path through their course, semester by semester. Initial data covers Electrical Engineering; more courses will be added.

**Goals:**

- Simulate an academic path semester by semester, using past Offerings to predict which Sections will likely be available.
- Surface planning signals — Schedule Conflicts, Duplicate Subjects, Redundant Enrollments, Unmet Requisites (see `DOMAIN.md`) — as information, never as hard blocks.
- Work entirely client-side: profiles persist in the browser and can be exported/imported as files.

**Non-goals:**

- No connection to official UFES systems — a plan here is a simulation, not an enrollment.
- No accounts, no server, no network requests.
- No grade or transcript tracking — the plan assumes planned Subjects are passed unless the user marks a Section as failed (UC-22); no other academic outcome is recorded.
- No degree-progress auditing — the tool does not track required Subjects remaining, optional credit-hour minimums, or total workload toward graduation. It is a schedule planner, not a degree auditor.
- No enrollment eligibility modeling — Enrollment Scopes and Periods are domain context only (see `DOMAIN.md`).
- No semester-level history management — the plan simulates what lies **ahead**. Completed semesters are recorded as Credit Entries seeded at profile creation (UC-02) and corrected at credit level (UC-15, UC-16), not reconstructed as Planned Semesters. (Working assumption, under evaluation: users come here to simulate, not to manage past records.)

---

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

**Goal:** Register a new Student profile so that planning data can be stored and retrieved across sessions, with the Student's completed history recorded from the start.

**Main Flow:**

1. The user requests to create a new profile.
2. The system asks for:
   - The Student's name.
   - The ingress year, and whether the Student ingressed in the 1st or 2nd Year Semester.
   - The Student's shift (Day, Morning, or Afternoon).
   - The Student's **course**, and then the **Course Curriculum (PPC)** version of that course. Each of the two fields is pre-filled when only one option exists; with several options it starts empty and requires an explicit choice — an empty value can never be submitted.
   - The **last completed semester**: an integer counting the semesters the Student has fully completed (0 for none). The input steps in whole integers, defaults to the number of semesters fully elapsed between the ingress information and the current date, and is capped at that number — completed history cannot extend into the future. Lower values are meaningful (interrupted studies). This step is skipped when the derived cap is 0. Suggested UI phrasing: `Último período concluído?`, with a helper noting that the recommended Subjects up to it will be recorded as Credit Entries.
3. The user provides the information and confirms.
4. The system creates the profile and seeds its history: a Credit Entry (UC-15 semantics) for every **Required** Subject of the chosen PPC whose Suggested Semester is at or before the last completed semester. Optional Subjects and Subjects without a Suggested Semester are never seeded. The completed count is persisted on the profile, and Planned Semesters start right after it (UC-11).
5. The system persists the new Student profile and makes it the active Student.

**Validation:**

- The Student's name must not be empty.
- The Student's name must differ from all existing profile names.
- The course and the PPC must be chosen — pre-filled or explicitly; never empty.
- The last completed semester must be an integer between 0 and the derived cap.

**Notes:**

- The seeded Credit Entries are ordinary Credit Entries — the user reviews and corrects them with UC-15/UC-16 (e.g. removing the credit for a Subject that was actually failed or skipped). Completed history is credit-level by design — see Purpose & Scope.

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

**Notes:**

- The active selection is persisted with the stored data: after a reload the system returns to the last active Student without reselecting. Deleting the active profile (UC-05) clears the selection.

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
2. The system reads and parses the file, migrates it to the current data format when it was exported by an older version of the system, and validates it.
3. The system persists the imported profile.

**Alternative Flow — File is invalid:**

- The system rejects the file and does not save anything.

**Alternative Flow — Unknown Course Curriculum:**

- The profile references a Course Curriculum (PPC) that does not exist in the system's datasets. The system rejects the file with a clear message and does not save anything — profiles are never imported in a degraded state.

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

**Notes:**

- The exported file records the data format version, so files exported by older versions of the system remain importable (UC-06).

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

The planner presents a Planned Semester as a **weekly schedule**: each Section's sessions are placed on a day × time grid, and Sections without sessions (e.g. Estágio) appear in a separate "no schedule" strip alongside it. The list of Planned Semesters stays visible next to the schedule, each entry carrying its status — clean, warnings only, or errors (see `DOMAIN.md`, Planned Semester) — and the semester matching the real-world current date (derived from the ingress information) is discreetly marked. A planning signal always flags a Section as a whole: every session of a flagged Section shows the signal's severity, not just the conflicting one.

**Any** Planned Semester can be edited — Sections added (UC-12, UC-27) or removed (UC-13), Failed Marks (UC-22, UC-23) and Audit Marks (UC-20, UC-21) toggled. Every edit re-evaluates the planning signals for that semester and all later ones, cascading recursively (see `DOMAIN.md`, Unmet Requisite). The typical rhythm: real-world grades arrive, the user marks a Section as failed in the semester where it happened, then sweeps forward through the later semesters resolving the signals that surfaced — re-adding the failed Subject somewhere (UC-12, UC-27), choosing which of the conflicting Sections to keep, or pruning some without electing one (UC-25) — until every semester is clean again. Only the **last** Planned Semester can be deleted (UC-14).

### UC-09 — View Schedule Planner

**Actor:** User

**Goal:** Access the planning workspace for the active Student, where Planned Semesters can be reviewed on a weekly schedule and any planning signals are visible.

**Preconditions:**

- An active Student profile has been selected or created.

**Main Flow:**

1. The system loads the planning data for the active Student.
2. The system presents the list of the Student's Planned Semesters, each with its status — clean, warnings only, or errors — and marks the one corresponding to the real-world current date, when the plan reaches it.
3. The system presents the selected Planned Semester as a weekly schedule: sessions on the day × time grid, session-less Sections in the "no schedule" strip, Failed Marks and Audit Marks indicated.
4. Sections flagged by planning signals are visually distinguished by severity — warning (Schedule Conflict, Duplicate Subject, Redundant Enrollment) or error (Unmet Requisite) — across **all** their sessions.
5. Selecting a session (or a strip chip) emphasizes the sibling sessions of the same Section and opens its details: the resolution flow when the clicked session collides in time or the Section is a Duplicate Subject (UC-25); otherwise the Section's data and its actions — remove (UC-13), Failed Mark (UC-22, UC-23), Audit Mark (UC-20, UC-21), and the Redundant Enrollment resolution when flagged (UC-26). A Section that collides only at other sessions opens its plain details from a collision-free session — the resolution flow is one click away, on the colliding ones.

**Notes:**

- The grid shows Monday–Friday, adding Saturday only when some Section in the semester holds a Saturday session; its time range covers all sessions in the semester.
- The app is designed **mobile-first** (see `ARCHITECTURE.md`, Constraints): the narrow, touch-driven viewport is the primary design target, not an afterthought. On narrow screens the weekly grid is kept, compacted (short Section labels, details in an overlay), rather than switching to a per-day view — the week at a glance is the planner's core surface.

**Alternative Flow — No Planned Semesters exist:**

- The system informs the user that no Planned Semesters exist and offers the option to add the first one. In this state the user may also edit the profile data (UC-24).

---

### UC-10 — Select a Planned Semester

**Actor:** User

**Goal:** View the Sections planned for a specific Planned Semester.

**Preconditions:**

- The Schedule Planner is open.
- At least one Planned Semester exists in the Student's plan.

**Main Flow:**

1. The user selects a Planned Semester from the list.
2. The system presents that Planned Semester on the weekly schedule (see UC-09).
3. If the selected Planned Semester has planning signals, the system highlights the affected Sections by severity, matching the status shown in the semester list.

---

### UC-11 — Add a New Planned Semester

**Actor:** User

**Goal:** Add the next Planned Semester to the plan, selecting the Sections the Student intends to enroll in **before** the semester is created.

**Preconditions:**

- The Schedule Planner is open.

**Main Flow:**

1. The user requests to add a new Planned Semester.
2. If the last Planned Semester has any planning signal, the system warns that eligibility for the new semester will be computed as if all flagged Sections are kept, and asks whether to continue (a soft gate — never a block).
3. The system determines the label (Year Semester) and number (position in the plan) for the new Planned Semester based on the Student's ingress information, the completed-semester count recorded at profile creation (UC-02), and existing Planned Semesters — the first Planned Semester takes the position right after the completed count.
4. The system presents a review screen listing every available **Required** Section for that Year Semester, grouped by Subject, with **nothing selected**: Sections from the curated Offering snapshot (including ones under equivalent codes) of Required Subjects not yet fulfilled — or whose fulfillment carries an open Audit Mark (UC-20) — and whose prerequisites are satisfied at that point in the plan. Subjects with no known classification count as Required. Optional Subjects are never listed here — they are added after creation via UC-27. Custom Sections (UC-17) with matching applicability are included — linked ones under the same rules, unlinked ones unconditionally.
5. The listing is split into two tiers, both fully visible and selectable: a **likely enrollment** tier — Subjects whose Suggested Semester is at or before the semester being planned, or that have none — and an **others** tier below it, for Subjects suggested for a later semester (taking Subjects ahead of the suggested path). Tier assignment is Subject-level; within any Subject group, Sections targeted at another course stay listed, badged with their target course (see `DOMAIN.md`, Section).
6. Subject groups are **collapsible** and start **collapsed**: a collapsed group shows the Subject and a selection summary (e.g. "2/5 turmas"); expanding it reveals the individual Sections. Collapse state is ephemeral — it resets every time the screen opens.
7. The only filter is the effective **shift filter** — the persisted toggle if set, the profile shift otherwise; the user may change it at any time and the system persists the change on the profile (see UC-12). Day-shift Sections appear under every shift filter option.
8. A Subject with co-requisites is listed only when each co-requisite is either already fulfilled at that point in the plan or itself available — in this listing or in the optional pool (UC-27, excluding hidden Subjects, UC-28) — since selecting it could otherwise only produce an Unmet Requisite. Exclusions **cascade**: a Subject removed by this rule may remove Subjects that co-required it, until the list is stable. The rule is evaluated against the shift-filtered pool, so changing the filter re-runs it — hiding a co-requisite's Sections also hides its dependents. It prunes the _listing_ only; the user remains free to deselect a listed co-requisite while keeping its dependent selected (surfacing the error after creation).
9. As the user builds the selection, the system continuously indicates the signals the current selection would produce — Duplicate Subjects (several Sections selected under one Subject group) and Schedule Conflicts among selected Sections.
10. The user confirms.
11. The system creates the new Planned Semester containing exactly the selected, currently visible Sections and persists it. Nothing is persisted before this point.
12. The user iterates on the weekly schedule — adding and removing Sections (UC-12, UC-13, UC-27), resolving signals (UC-25, UC-26) — until the semester is clean.

**Filter and selection rules:**

- The shift filter defines the visible pool; the selection **in effect** is always the selected Sections currently visible — nothing outside the visible pool is ever included in the created semester.
- Selection state is **remembered, not dropped**, across filter changes within the screen session: if Section A is selected and B is not, switching the shift filter away (hiding both) and back restores A selected and B not. The memory lasts until the screen closes.
- Nothing is ever auto-selected — not when the screen opens, and not when a filter change reveals Sections.
- Filter changes also re-run the co-requisite look-ahead rule (step 8), which may add or remove whole Subject groups beyond the filter's direct effect.

**Notes:**

- A Subject is fulfilled when an earlier Planned Semester holds a non-failed Section for it, or a Credit Entry covers it (considering Equivalences); an open Audit Mark re-includes the Subject (see `DOMAIN.md`, Audit Mark).

**Alternative Flow — No eligible Sections found:**

- The review screen is empty and says so; confirming creates the new Planned Semester empty. (Confirming with nothing selected likewise creates it empty.)

**Alternative Flow — User cancels:**

- No changes are made — no Planned Semester is created and no Sections are stored.

---

### UC-12 — Add a Section to a Planned Semester

**Actor:** User

**Goal:** Add a **Required** Section to any Planned Semester — the one being worked on, or an earlier one being corrected to reflect real life. (Optional Sections are added via UC-27, this use case's optional-only twin.)

**Preconditions:**

- The Schedule Planner is open.
- At least one Planned Semester exists.

**Main Flow:**

1. The user requests to add a Section to the selected Planned Semester.
2. The system presents the Sections available for that semester's Year Semester (from the curated Offering snapshot) of **Required** Subjects — Subjects with no known classification count as Required — whose prerequisites are satisfied by non-failed Sections in earlier Planned Semesters or Credit Entries, and whose co-requisites pass the shared look-ahead rule (see "Co-requisite rule" below). Subjects already fulfilled at that point in the plan — a non-failed Section in an earlier Planned Semester or a Credit Entry — are excluded, unless their fulfillment carries an Audit Mark still open at the selected semester (UC-20). The Student's Custom Sections with matching applicability are also presented — linked ones under the same requisite rules, unlinked ones unconditionally. Sections already present, as-is, in the selected Planned Semester are also excluded — an offering Section matched by Subject code and turma, a Custom Section by its name and sessions; a Subject disappears from the list once every one of its Sections is excluded this way.
3. The listing follows UC-11's presentation: split into the same two tiers (likely enrollment — Suggested Semester at or before the selected semester's position, or none — and others below), grouped by Subject, groups collapsible and starting collapsed, other-course Sections badged with their target course. The only filter is the effective shift filter — the profile's shift by default, or the persisted toggle (morning, afternoon, or whole day) once the user sets it; day-shift Sections appear under every filter option; the user may change the toggle at any time and the system persists it on the profile.
4. While browsing, the user can preview a candidate: the system shows the candidate's sessions in place on the weekly schedule, so fits and collisions are visible before adding.
5. The user selects a Section.
6. The system adds the Section to the Planned Semester and persists the change. Adding a Custom Section creates an independent copy inside the semester — later catalog edits do not affect it.
7. The system re-evaluates planning signals for this semester and all later ones and updates the indicators.

**Co-requisite rule (shared by UC-12 and UC-27):**

A Subject with co-requisites is listed when each co-requisite is either:

- already fulfilled at that point in the plan (considering Equivalences), or
- already planned in the selected Planned Semester, or
- itself available in the **combined** candidate pool — this listing plus its twin's (UC-12's required pool ∪ UC-27's optional pool, excluding hidden Subjects, UC-28) — under the current shift filter.

Exclusions cascade to a fixpoint, as in UC-11 step 8. The rule prunes the listing only: adding the dependent first is allowed and surfaces a temporary Unmet Requisite until the co-requisite is added — information, never a block.

**Notes:**

- The system does not prevent adding a Section that causes a planning signal — Schedule Conflict, Duplicate Subject, or Redundant Enrollment. Signals are surfaced as information, not as a hard block.
- Other Sections (turmas) of an already-planned Subject remain listed — adding one surfaces a Duplicate Subject warning as usual; only the literally identical Section is hidden (step 2).
- The available list includes Sections offered under an **equivalent** code of a PPC Subject (see `DOMAIN.md`, Equivalence). Adding one fulfills the corresponding PPC Subject exactly as a Section under the Subject's own code would.
- Adding a Section to an earlier Planned Semester is the natural fix for an Unmet Requisite in a later one — the cascade re-evaluates automatically.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-27 — Add an Optional Section to a Planned Semester

**Actor:** User

**Goal:** Add a Section of an **Optional** Subject (Optativa) to any Planned Semester.

**Preconditions:**

- The Schedule Planner is open.
- At least one Planned Semester exists.

**Main Flow:**

1. The user requests to add an Optional Section to the selected Planned Semester.
2. The system presents the Sections available for that semester's Year Semester exactly as in UC-12 — same eligibility (prerequisites, fulfillment and open Audit Marks, Equivalences, already-planned exclusion), same shared co-requisite rule, same two-tier presentation, collapsible groups, shift filter, and preview — restricted to **Optional** Subjects. Differences from UC-12:
   - **Hidden Subjects (UC-28) are excluded** from the listing.
   - Custom Sections are **not** listed here — the Student's own catalog lives in UC-12.
   - Each Subject group carries a **hide** action (UC-28).
3. The user selects a Section; the system adds it, persists the change, and re-evaluates planning signals for this semester and all later ones — as in UC-12.

**Notes:**

- Since most Optional Subjects carry no Suggested Semester, they typically land in the likely-enrollment tier (no suggestion means "at or before" trivially holds).

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-28 — Hide / Restore an Optional Subject

**Actor:** User

**Goal:** Mark an Optional Subject as "not interested", so its Sections stop being offered when planning — and undo that later.

**Preconditions:**

- The Schedule Planner is open, with the Add Optional Section listing (UC-27) visible.

**Main Flow (hide):**

1. The user activates the hide action on an Optional Subject group (suggested UI label: `Ocultar`).
2. The system records the hidden Subject on the Student profile and persists it, and the Subject disappears from the UC-27 listing.

**Main Flow (restore):**

1. The user toggles the "show hidden" reveal in the UC-27 listing (suggested UI label: `Mostrar ocultas`).
2. The system shows the hidden Subjects in place, de-emphasized, each with a restore action (suggested UI label: `Restaurar`).
3. The user restores a Subject; the system removes it from the hidden list, persists the change, and the Subject is offered normally again.

**Notes:**

- Hiding is a lasting, per-profile preference: it survives reloads, is exported and imported with the profile (UC-06, UC-07), and is copied on clone (UC-04).
- Hiding affects **listing only** — the UC-27 pool and, through it, the combined co-requisite pool (UC-11 step 8, UC-12): hiding a Subject that others co-require can cascade-prune those dependents from the listings. It never removes Sections already planned and never changes planning-signal evaluation.
- Hidden entries whose Subject code does not resolve in the current PPC (after a PPC switch, UC-24) are kept and simply inert — same "kept, ignored" treatment as stale Custom Sections — so switching back loses nothing.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-13 — Remove a Section from a Planned Semester

**Actor:** User

**Goal:** Remove a Section from any Planned Semester — while working on it, or to correct an earlier one to reflect real life.

**Preconditions:**

- The Schedule Planner is open.
- The selected Planned Semester contains at least one Section.

**Main Flow:**

1. The user selects a Section in the Planned Semester and requests to remove it.
2. The system removes the Section from the Planned Semester and persists the change.
3. The system re-evaluates planning signals — for this semester and all later ones — and updates the status indicators.

**Notes:**

- Removing a Section may clear signals — e.g. eliminate a Schedule Conflict or a Duplicate Subject — making the semester clean.
- Removing a Section whose Subject is a co-requisite for another Section remaining in the same semester will surface a new Unmet Requisite. The system highlights this but does not block the removal.
- Removing a Section from an earlier Planned Semester may surface Unmet Requisites in later semesters, cascading recursively through Sections that depended on it. These are surfaced as information, never as a block.
- Removing a Section also removes any Failed Mark or Audit Mark it carries.
- A Section can also be removed from inside the resolution flow (UC-25) — same semantics, applied immediately to one Section at a time.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-14 — Delete the Last Planned Semester

**Actor:** User

**Goal:** Remove the last Planned Semester and all its contents from the Student's plan.

**Preconditions:**

- The Schedule Planner is open.
- At least one Planned Semester exists.

**Main Flow:**

1. The user selects the last Planned Semester and requests to delete it.
2. The system asks the user to confirm the deletion.
3. The user confirms.
4. The system removes the Planned Semester and all its contents — Sections, applied Custom Section copies, and any Failed Marks or Audit Marks they carry — and persists the change.
5. If no Planned Semesters remain, the system also clears the persisted shift filter toggle (see UC-12). All other profile data — PPC, completed-semester count, Credit Entries, hidden Subjects, the Custom Section catalog — is kept, and profile data becomes editable (UC-24).

**Validation:**

- Only the **last** Planned Semester in the plan may be deleted. Deleting a middle semester is not allowed, because every later semester is anchored to its plan position: positions would shift and Year Semester labels would flip parity, invalidating the Offerings the Sections were drawn from. To remove an earlier semester, the user must delete later semesters first.
- Deletion stops at the plan's start — the position right after the completed-semester count (UC-02). The completed history below it is credit-level (Credit Entries), not Planned Semesters, so there is nothing to delete there.

**Notes:**

- Deleting the last Planned Semester cannot cause Unmet Requisites, since no later semesters depend on it.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-25 — Resolve Conflicting Sections

**Actor:** User

**Goal:** Starting from a clicked session, act on the set of mutually exclusive Sections it participates in — electing one Section to keep in one confirmation, pruning individual Sections immediately without committing to a keeper, or combining both.

**Preconditions:**

- The Schedule Planner is open.
- In the selected Planned Semester, the clicked session overlaps another Section's session in time, or the clicked Section is flagged as a Duplicate Subject.

**Main Flow:**

1. The user selects a session of a Section (or its strip chip).
2. The system determines the resolution pass, one signal type at a time, in priority order — and with it the **anchor** and the **resolution set**:
   - **Schedule Conflict pass** — when the clicked session overlaps other Sections' sessions in time. The anchor is the clicked session's time window (day and time range, captured at that moment); the set is every Section with a session overlapping that window. Sections colliding with the clicked Section only at other times are **not** included — each collision is resolved from its own session.
   - **Duplicate Subject pass** — otherwise, when the Section is flagged as a Duplicate Subject. The anchor is the Subject; the set is every Section fulfilling that Subject in the semester.
   - Otherwise no resolution pass applies: the Section's plain details open instead (UC-09 step 5), even if the Section is flagged for collisions at other sessions.
3. The system presents the details of the involved Sections, marking the clicked one as the entry point. Everything outside the set is de-emphasized. The set stays derived from the **anchor** — not from the clicked Section — for as long as the flow is open.
4. The user acts, combining the two actions freely:
   - **Prune:** the user removes an individual Section — any member, including the clicked one. The removal is immediate, with UC-13 semantics: persisted at once, Failed and Audit Marks dropped, planning signals re-evaluated for this semester and all later ones. The set re-derives from the anchor and the flow continues.
   - **Elect a keeper:** the user chooses which Section to keep — staged, changeable freely, nothing persisted while deciding — and confirms. The system removes, among the members, exactly those in conflict with the keeper **within the anchor**: in a Schedule Conflict pass, the members whose window-overlapping sessions overlap the keeper's window-overlapping sessions; in a Duplicate Subject pass, all other members. The system persists the change and re-evaluates planning signals for this semester and all later ones.
5. The flow ends when the anchor no longer holds a conflict — after a keeper confirmation, or once pruning leaves no overlapping pair inside the window (or a single Section of the Subject).

**Notes:**

- Removal is keeper-relative and anchor-scoped: a member that does not conflict with the keeper inside the anchor survives. Example — inside the window, A overlaps B and B overlaps C, but A and C don't touch: keeping A removes only B, and C remains.
- Consequences are local to the anchor: conflicts among surviving members at **other** times — including with the keeper — stay flagged on the schedule and are resolved by clicking those sessions, where the user may still decide differently.
- Anchoring to the time window or Subject, rather than to the clicked Section, makes pruning the clicked Section itself unremarkable — the flow stays open while the anchor still holds a conflict.
- A Section flagged with several signal types is resolved in successive passes — Schedule Conflicts first, then Duplicate Subjects.
- Resolution is never mandatory: the user may close the flow and keep the conflicting Sections while weighing options (see `DOMAIN.md`, Planned Semester).

**Alternative Flow — User cancels:**

- The staged keeper election is discarded. Prunes already performed persist — each was an explicit, immediate removal (UC-13).

---

### UC-26 — Resolve a Redundant Enrollment

**Actor:** User

**Goal:** Act on a Section flagged as a Redundant Enrollment — its Subject is already fulfilled earlier in the plan, with no open Audit Mark legitimizing a re-take.

**Preconditions:**

- The Schedule Planner is open.
- The selected Planned Semester contains a Section flagged as a Redundant Enrollment.

**Main Flow:**

1. The user selects the flagged Section.
2. The system explains the flag and identifies the fulfillment source — the earlier Section or Credit Entry that already covers the Subject.
3. The system offers the two resolutions: remove the Section (UC-13), or mark the fulfillment source for Audit (UC-20), which legitimizes the re-take and clears the flag.
4. The user chooses one; the system applies it, persists the change, and re-evaluates planning signals.

**Alternative Flow — User cancels:**

- No changes are made.

---

## Credit Entries

### UC-15 — Add a Credit Entry

**Actor:** User

**Goal:** Record a Subject from the Course Curriculum as formally credited to the Student, so that it counts as fulfilled for requisite evaluation throughout the entire plan.

**Preconditions:**

- An active Student profile has been selected. (Every profile has a Course Curriculum — it is chosen at creation, UC-02.)

**Main Flow:**

1. The user requests to add a Credit Entry.
2. The system presents the list of Subjects from the Student's Course Curriculum that do not already have a Credit Entry.
3. The user selects a Subject and confirms.
4. The system persists the Credit Entry on the Student profile.

**Validation:**

- The selected Subject must exist in the Student's Course Curriculum.
- A Subject may not have more than one Credit Entry.

**Notes:**

- Credit Entries are timeless: the credited Subject counts as fulfilled from the very start of the timeline, for every Planned Semester (see `DOMAIN.md`).
- Profile creation (UC-02) seeds Credit Entries for the suggested path of the completed semesters — they are ordinary Credit Entries, reviewed and corrected here and in UC-16.
- Adding a Credit Entry for a Subject already planned in some Planned Semester surfaces a Redundant Enrollment warning on that Section (UC-26).

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

- Removing a Credit Entry may cause Unmet Requisites in Planned Semesters that relied on it, cascading recursively. The system does not block the removal but surfaces the resulting flags.
- Removing a Credit Entry also removes any Audit Mark it carries (UC-20).
- Credit Entries must be removed before the profile can switch to a different Course Curriculum (UC-24).

**Alternative Flow — User cancels:**

- No changes are made.

---

## Custom Sections

Custom Sections (Turmas Personalizadas) let the Student plan around commitments the system has no data for — a real Section missing from the Offering data, or a non-academic commitment such as lab work or a side project. They live in a catalog on the profile; adding one to a Planned Semester creates an independent copy (UC-12). See `DOMAIN.md` for the concept.

### UC-17 — Add a Custom Section

**Actor:** User

**Goal:** Register a Custom Section in the profile's catalog so it can be added to Planned Semesters.

**Preconditions:**

- An active Student profile has been selected.

**Main Flow:**

1. The user requests to add a Custom Section.
2. The system asks for:
   - A title.
   - Its applicability: the 1st Year Semester, the 2nd, or both. A semester-bound entry models a real Section missing from the Offering data; a both-semesters entry models a standing commitment such as work, a side project, or lab hours.
   - The weekly sessions (day of the week, start and end time).
   - Optionally, a Subject from the Student's Course Curriculum that it stands in for.
3. The user fills in the data and confirms.
4. The system persists the Custom Section in the profile's catalog.
5. The Custom Section becomes available when adding Sections to Planned Semesters of a matching Year Semester (UC-12).

**Validation:**

- The title must not be empty.
- At least one weekly session must be provided, and each session's end time must be after its start time.
- The linked Subject, when provided, must exist in the Student's Course Curriculum.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-18 — Edit a Custom Section

**Actor:** User

**Goal:** Change the title, sessions, applicability, or Subject link of an existing Custom Section in the catalog.

**Preconditions:**

- An active Student profile has been selected.
- At least one Custom Section exists in the catalog.

**Main Flow:**

1. The user selects a Custom Section and requests to edit it.
2. The system presents the current data for modification.
3. The user changes the data and confirms.
4. The system persists the updated Custom Section in the catalog.

**Validation:**

- Same rules as UC-17.

**Notes:**

- Copies already applied to Planned Semesters — including the last one — are never affected: they are independent snapshots taken when added (UC-12). The user manages those inside the semesters themselves (UC-13).
- A catalog entry whose Subject link does not resolve in the current Course Curriculum (after a PPC switch, UC-24) is shown de-emphasized and behaves as unlinked until edited or deleted.

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-19 — Delete a Custom Section

**Actor:** User

**Goal:** Remove a Custom Section from the profile's catalog.

**Preconditions:**

- An active Student profile has been selected.
- At least one Custom Section exists in the catalog.

**Main Flow:**

1. The user selects a Custom Section and requests to delete it.
2. The system asks the user to confirm the deletion.
3. The user confirms.
4. The system removes the Custom Section from the catalog and persists the change.

**Notes:**

- Copies already applied to Planned Semesters are not affected — they are independent snapshots. To remove one from a semester, use UC-13.

**Alternative Flow — User cancels:**

- No changes are made.

---

## Audit Marks

Audit Marks (Ouvinte) let the Student plan to attend an already-fulfilled Subject again as a listener, without enrollment. See `DOMAIN.md` for the concept.

### UC-20 — Mark a Subject for Audit

**Actor:** User

**Goal:** Mark a fulfilled Subject so it appears again when planning new Planned Semesters, while its original fulfillment keeps counting for requisites.

**Preconditions:**

- An active Student profile has been selected.
- The Subject is fulfilled — by a Credit Entry or by a non-failed Section in a Planned Semester.

**Main Flow:**

1. The user selects the fulfillment carrier — a Credit Entry, or a Section in a Planned Semester — and requests to mark it for Audit.
2. The system records the Audit Mark on that carrier and persists it.
3. While the mark is **open**, the Subject is included among suggested and available Sections when planning Planned Semesters after the carrier (UC-11, UC-12, UC-27).

**Validation:**

- A Subject may not have more than one Audit Mark.
- A Section carrying a Failed Mark cannot carry an Audit Mark — a failed Subject already reappears when planning.

**Notes:**

- Planning a re-take Section closes the mark from that semester onward; deleting the re-take re-opens it — open/closed is derived, never stored (see `DOMAIN.md`, Audit Mark). A re-take planned while the mark is open is never flagged as a Redundant Enrollment (UC-26).

---

### UC-21 — Remove an Audit Mark

**Actor:** User

**Goal:** Remove a previously set Audit Mark so the Subject is once again treated as done for planning purposes.

**Preconditions:**

- An active Student profile has been selected.
- At least one Audit Mark exists on the profile.

**Main Flow:**

1. The user selects an Audit Mark and requests to remove it.
2. The system removes the Audit Mark from its carrier and persists the change.

**Notes:**

- The mark is also removed implicitly when its carrier is deleted — the Section (UC-13, UC-14) or the Credit Entry (UC-16).
- Removing the mark does not remove Sections already added to Planned Semesters for that Subject — the user removes those explicitly if desired (UC-13).

---

## Failed Marks

Failed Marks (Reprovação) let the Student make the plan reflect a real-life failure without deleting the historical record. See `DOMAIN.md` for the concept and its exact requisite semantics.

### UC-22 — Mark a Section as Failed

**Actor:** User

**Goal:** Record that a Section in a Planned Semester was not passed, so the Subject stops counting as fulfilled and reappears when planning later semesters.

**Preconditions:**

- The Schedule Planner is open.
- The selected Planned Semester contains at least one Section linked to a Subject.

**Main Flow:**

1. The user selects a Section in a Planned Semester and requests to mark it as failed.
2. The system records the Failed Mark on the Section and persists the change.
3. The system recomputes Unmet Requisites for all later Planned Semesters: Sections that depended on the failed Subject — directly or through the cascade — are flagged.
4. The Subject reappears among suggested and available Sections when planning later Planned Semesters (UC-11, UC-12, UC-27).

**Notes:**

- Within its own Planned Semester, the failed Section still satisfies co-requisites for sibling Sections and still occupies schedule time (see `DOMAIN.md`).
- Unmet Requisites are surfaced as information, never as a block — the user decides how to replan.
- Marking a Section as failed removes any Audit Mark it carries (UC-20).

**Alternative Flow — User cancels:**

- No changes are made.

---

### UC-23 — Remove a Failed Mark

**Actor:** User

**Goal:** Undo a Failed Mark, restoring the Section as a normal fulfillment.

**Preconditions:**

- The Schedule Planner is open.
- At least one Section carries a Failed Mark.

**Main Flow:**

1. The user selects a failed Section and requests to remove the Failed Mark.
2. The system removes the mark and persists the change.
3. The system recomputes planning signals for all later Planned Semesters — flags that existed only because of the failure are cleared.

**Notes:**

- Restoring the fulfillment may make a later re-take Section redundant — the system surfaces a Redundant Enrollment warning on it (UC-26).

---

## Profile Data Editing

### UC-24 — Edit Student Profile Data

**Actor:** User

**Goal:** Change the profile's ingress information, shift, Course Curriculum (PPC), or completed-semester count.

**Preconditions:**

- An active Student profile has been selected.
- The profile has **no Planned Semesters** — either none were ever created, or all were deleted (UC-14). (Renaming is available at any time via UC-08.)

**Main Flow:**

1. The user requests to edit the profile data.
2. The system presents the current ingress year, ingress Year Semester, shift, Course Curriculum (course → PPC, same cascading rules as UC-02), and completed-semester count for modification.
3. The user changes the data and confirms.
4. The system persists the updated profile.

**Validation:**

- Switching to a different PPC requires the profile to have **no Credit Entries** — they reference Subjects of the current PPC and must be removed first (UC-16). Since creation typically seeds Credit Entries (UC-02), switching PPC in practice means clearing the credited history first.
- The completed-semester count follows the same rules as at creation (UC-02): an integer between 0 and the count of semesters fully elapsed since ingress.

**Notes:**

- Switching the PPC also updates the profile's derived course id to the new PPC's course (see `ARCHITECTURE.md`, `ProfileRecord`).
- The Custom Section catalog survives a PPC switch. Entries whose Subject link does not resolve in the new PPC become stale — kept, shown de-emphasized, and treated as unlinked (UC-18). Switching back to the original PPC makes the links functional again. Hidden Subjects (UC-28) get the same treatment — kept, inert until they resolve again.
- Changing ingress information changes the Year Semester labels derived for future Planned Semesters.
- Changing the completed-semester count moves the position where Planned Semesters start (UC-11) — it never touches Credit Entries: the user adjusts those separately (UC-15, UC-16).

**Alternative Flow — User cancels:**

- No changes are made.
