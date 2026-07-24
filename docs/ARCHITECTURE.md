# Architecture

This document records the technical and structural decisions for the UFES course enrollment planner web application. It is the authoritative reference for how the app is built and organised — complementing `DOMAIN.md` (what the concepts are) and `USE_CASES.md` (what users want to accomplish).

---

## Technology Stack

| Concern          | Decision                                  |
| ---------------- | ----------------------------------------- |
| Language         | JavaScript (no TypeScript)                |
| UI framework     | React                                     |
| Build tool       | Vite                                      |
| State management | Zustand                                   |
| Routing          | wouter                                    |
| Styling          | Tailwind CSS (v4), no component library   |
| Unit tests       | Vitest                                    |
| End-to-end tests | Playwright                                |
| Persistence      | Browser localStorage                      |
| Hosting          | GitHub Pages, deployed via GitHub Actions |

No server, no database, no network requests at runtime. The application is entirely client-side.

### Language and types

The project uses plain JavaScript. The canonical data shapes — the persisted shapes (`ProfileRecord`, `PlannedSemester`, `PlannedSection`, `CreditEntry`, `CustomSection`) and the dataset shapes (PPC, offerings snapshot, Section) — are defined once as JSDoc `@typedef`s in `src/domain` and referenced from function signatures (`@param {ProfileRecord} profile`). This is documentation-grade typing: editors get autocomplete and hover docs, but there is no `// @ts-check` enforcement and no `tsc` step in CI. Runtime safety lives where it matters: domain validation functions (e.g. `validateImportedProfile`) and the storage layer's handling of malformed data.

---

## Project Structure

```
src/
  domain/     # Pure domain logic — no framework, no storage, no UI concerns
  storage/    # localStorage read/write and migrations — the only place that touches persistence
  store/      # The Zustand store — single owner of in-memory app state
  data/       # Static datasets — committed PPCs and build-time generated Offerings
  components/ # React components
  pages/      # Top-level page components, one per screen
  hooks/      # Custom React hooks — thin selector wrappers over the store
scripts/      # Offline data-generation scripts — turn official documents (scripts/input)
              # into the static datasets in src/data, precomputing derived fields (e.g. shift)
```

### `src/domain`

Contains pure JavaScript functions that implement domain rules — prerequisite evaluation, schedule conflict detection, equivalence resolution, profile and semester operations, etc. Functions here have no knowledge of React, localStorage, or any other infrastructure. They take plain objects and return plain objects. All domain logic must live here. This is also where the JSDoc `@typedef`s for the canonical shapes are defined.

### `src/storage`

Contains all read and write operations against localStorage, plus the schema migrations (see Persistence). This is the only layer allowed to call `localStorage`, and it is called only by the store. It is responsible for serialising and deserialising the envelope, and for handling storage errors. It calls domain validation functions (e.g. `validateImportedProfile`) where appropriate, but contains no domain logic of its own.

### `src/store`

The Zustand store — the single owner of in-memory app state. On startup it loads the envelope through `src/storage`; every mutation is a store action that updates state and writes through to storage. Components and hooks subscribe to exactly the slice they render via selectors, so unrelated mutations do not trigger unrelated re-renders. The cross-tab `storage` event listener (see Persistence) also lives here. **Only the store calls `src/storage`.**

### `src/components`

Reusable React components with no direct storage or store-internal access. Components receive data and callbacks as props or via hooks. Overlays (modals, confirm dialogs) use native platform primitives — `<dialog>`, popover — styled with Tailwind, rather than a component library. Modal dialogs must be **centered in the viewport** with a dimmed backdrop; note that Tailwind's preflight resets the user-agent `margin: auto` that normally centers an open `<dialog>`, so the centering styles must be applied explicitly (e.g. a shared dialog wrapper/class) — otherwise dialogs render at the top-left of the screen.

### `src/pages`

Top-level components that correspond to the main screens of the application. They compose components and coordinate hooks.

### `src/hooks`

Custom React hooks that connect the store to the UI: thin wrappers over store selectors and actions. Hooks do not touch `src/storage` directly.

### `src/data`

Static datasets bundled with the application — no network requests, no user uploads. Two subfolders:

- **`src/data/ppcs`** — Course Curricula (PPCs), one JSON file per PPC version (see PPC dataset below). Each PPC is identified by a **PPC id** (e.g. `engenharia-eletrica-2022`) and carries a display name; profiles reference this id. A PPC file reaches this folder one of two ways: hand-crafted and **committed directly** (the target for most future courses), or produced by `scripts/` and copied in by `scripts/copy-to-data.mjs` — today's case for Engenharia Elétrica, whose PPC is re-extracted from the official PDF rather than hand-authored, so it is **git-ignored** and regenerated on every build instead, same treatment as Offerings below.
- **`src/data/offerings`** — Past Offerings, generated at build time by `scripts/` and copied in by `scripts/copy-to-data.mjs` (**git-ignored**, never committed — see Data Pipeline): a **single curated snapshot per (course, Year Semester)** — the Sections (with schedules and professors) that represent what that Year Semester typically looks like. Anomalies in the source data are fixed by parser exceptions in `scripts/`, not by fallback logic in the app. Each Section records its target course id and name (see Offerings dataset below); Enrollment Scopes and seat counts are not part of the dataset — the tool does not model enrollment eligibility.

Datasets are loaded **eagerly** by `src/data/index.js`: it builds the `ppcs` (keyed by PPC id) and `offerings` (keyed by PPC id, then Year Semester) registries with `import.meta.glob` (eager mode), plus `getPpc(id)` / `getOfferings(ppcId, yearSemester)` lookups — so all data access is synchronous and adding a dataset file requires no registry edits. Adding a course means adding its PPC file, its department PDFs, and one collector config entry in `scripts/` — no changes elsewhere.

Initial coverage: **UFES Electrical Engineering**, both cohorts — 1st Year Semester ingress (morning shift) and 2nd Year Semester ingress (afternoon shift).

---

## Data Model

### PPC dataset

One JSON file per PPC version, produced either by hand or by script-assisted extraction from the official PDF (see `src/data/ppcs` above for which one applies to a given course). PPCs are static once approved, so whichever process produces a course's file, it is validated before use. The d2 graphs in `scripts/input` are an authoring source; a script converts them to JSON, inverting edge direction (the d2 stores _prerequisite → dependent_; the JSON stores each subject's own requisite lists, which is what evaluation wants).

```js
{
  "id": "engenharia-eletrica-2023",
  "name": "Engenharia Elétrica 2023 — Vitória",
  "courseId": "12",                  // official UFES course code — shared by all PPC versions of the course
  "courseName": "Engenharia Elétrica",
  "subjects": [
    {
      "code": "ELE15934",
      "name": "Circuitos Elétricos I",
      "workloadHours": 60,
      "classification": "required",   // "required" | "optional"
      "suggestedSemester": 3,         // or null
      "prerequisites": ["MAT15925"],  // subject codes, AND logic across entries
      "corequisites": [],             // subject codes, AND logic across entries
      "minWorkloadHours": null,       // completed-workload requisite (e.g. 2200 for Estágio)
      "equivalents": []               // codes that satisfy THIS subject (directional, OR logic)
    }
  ]
}
```

- Requisites are **flat AND lists** — UFES requisites are plain conjunctions; OR semantics exist only through equivalences.
- `equivalents` lists the codes (typically old-curriculum or other-course codes, not present in `subjects`) whose completion satisfies this subject — directional, OR logic, PPC-scoped, per `DOMAIN.md`.
- `minWorkloadHours` covers requisites that are thresholds rather than subjects (e.g. Estágio Supervisionado requires 2200h completed).
- `courseId` is the official UFES course code, identical across every PPC version of the same course. It is copied onto the profile when the PPC is chosen and matched against Section target course ids at runtime (see Offerings dataset below) — never used for requisite evaluation.

### Offerings dataset

A snapshot is **year-agnostic**: it represents what a typical Year Semester looks like for a course, built from the most recent source semester available (e.g. sources from 2026/1 fill the Year Semester 1 snapshot). When newer source PDFs are added, they **replace** the corresponding snapshot — the dataset is a snapshot, not an archive.

A Section is included in a course's snapshot when its subject code belongs to the course's PPC **or** appears in some PPC subject's `equivalents` list. Sections under equivalent codes are planned like any other and fulfill the target subject at evaluation time (see `DOMAIN.md`, Equivalence).

Each Section in the dataset carries a **shift** (`morning` | `afternoon` | `day`), **precomputed by the generation scripts** (not derived at runtime): `morning` when all sessions end at or before 13:00, `afternoon` when all sessions start at or after 13:00, `day` otherwise.

Each Section also carries its **target course** — `targetCourseId` and `targetCourseName`, taken from the source PDF's "Curso" cell. The id is **normalized at generation time**: official documents sometimes attach an entry-semester/cohort marker to the course code (e.g. `12 B`); the marker is stripped — `targetCourseId` identifies the course only, never a cohort. Whether a Section is _own-course_ is resolved **at runtime**, by comparing `targetCourseId` with the profile's `courseId` (see `ProfileRecord`): matching is course-level and PPC-version-agnostic — every PPC version of a course is the same course for Section-scope purposes. This powers the course toggle when listing available Sections (UC-11, UC-12); it is presentation/filtering data only — the tool still does not model enrollment eligibility, and Enrollment Scopes and seat counts remain excluded from the dataset.

---

## State Management and Routing

State flows one way: components → hooks (selectors) → store → storage/domain. The store holds the deserialized envelope as the single source of truth; every action writes through to storage synchronously. There is no other stateful layer.

Routing uses wouter with static routes:

- `/` — profile list (UC-01), the app's home screen
- `/plan` — the planner for the active profile

The profile id is **not** in the URL. `/plan` resolves the active profile from the persisted `activeProfileId`; if it is null or dangling, the route redirects to `/`. Because the app is served from a GitHub Pages subpath, Vite's `base` and wouter's base path are both configured accordingly.

---

## Persistence

All data is persisted in **localStorage** under a **single key** holding one envelope:

```js
{
  schemaVersion: number,     // integer, bumped on breaking shape changes
  activeProfileId: string|null,
  profiles: ProfileRecord[], // each carries a generated stable `id`
}
```

`activeProfileId` records the selected profile (UC-03) so a reload returns to the planner; it is null on fresh installs and after the active profile is deleted.

### Migrations

On load, the storage layer compares `schemaVersion` with the current version and applies **sequential migration functions** (`migrateV1toV2`, …) — pure, individually tested functions living in `src/storage`. Stored data is never silently discarded: users build their plans over weeks, and losing them on upgrade is the one failure this app must never have. Malformed data that cannot be migrated or validated is surfaced as an error, not wiped.

### Concurrent tabs

The store listens to the `storage` event. When another tab writes the envelope, the app shows a warning ("changed in another tab") and offers a reload. There is no cross-tab state merging; each write is a full serialized envelope, so data stays structurally valid regardless.

### `ProfileRecord`

```js
{
  id: string,                // generated, internal — never taken from imports
  name: string,
  ppcId: string|null,
  courseId: string|null,
  ingressYear: number,
  ingressYearSemester: 1|2,
  shift: "day"|"morning"|"afternoon",
  shiftFilter: "morning"|"afternoon"|"day"|null,
  semesters: PlannedSemester[],
  creditEntries: CreditEntry[],
  customSections: CustomSection[],
}
```

`name`, `ingressYear`, `ingressYearSemester`, and `shift` are provided by the user at profile creation (UC-02) and are never null. `ppcId` identifies the Course Curriculum the student follows in `src/data`; it is recorded when the first Planned Semester is created (UC-11) and is null until then — features that need the Course Curriculum, such as Credit Entries (UC-15), become available from that point on. `courseId` is the official UFES course code, copied from the chosen PPC dataset whenever `ppcId` is set (and kept in sync if the PPC changes, UC-24); it is null while `ppcId` is null. The profile thus records course (`courseId`), curriculum version (`ppcId`), and ingress (`ingressYear` + `ingressYearSemester`) as separate facts: all PPC versions of a course share the same `courseId`, which is what Section target course ids are matched against (see Offerings dataset). Adding `courseId` is a schema change — bump `schemaVersion` and migrate existing profiles by deriving it from the PPC dataset referenced by `ppcId`. While the profile has no Planned Semesters, profile data (including the PPC) is editable; switching to a different PPC additionally requires the profile to have no Credit Entries.

`shiftFilter` is the persisted Section-list filter override: null means "use the profile's `shift`". It is reset to null when the last Planned Semester is deleted. The course toggle on the same lists (own course vs. all courses, UC-11/UC-12) is deliberately **not** persisted — it resets to own-course each time, so the toggle state adds no `ProfileRecord` field (the `courseId` it matches against is a separate, persisted fact — see above).

A `PlannedSemester` is the container for everything planned in it:

```js
{
  sections: PlannedSection[],  // offering Sections + applied Custom Section copies
}
```

Each `PlannedSection` carries its own flags: `failed: boolean` (Failed Mark, see `DOMAIN.md`) and `audit: boolean` (Audit Mark). It stores the subject code it was offered under; when that code is an equivalent, resolution to the PPC subject happens at evaluation time and is never persisted. Applied Custom Sections are independent copies embedded in the semester — they do not reference the catalog. Deleting a Planned Semester deletes its contents with it.

`creditEntries` stores the student's Credit Entries (see `DOMAIN.md`): profile-level and timeless, each referencing a Subject code of the current PPC, with an `audit: boolean` flag for the Audit Mark.

`customSections` is the student's Custom Section **catalog** (see `DOMAIN.md`). Each entry declares its applicability (Year Semester 1, 2, or both), its sessions, and an optional Subject link — a linked entry fulfills that Subject like a regular Section when applied to a Planned Semester. Entries whose Subject link does not resolve in the current PPC are kept as stale and rendered de-emphasized.

Planning signals — Unmet Requisites, Schedule Conflicts, Duplicate Subjects, Redundant Enrollments — and the open/closed state of Audit Marks are never persisted: they are recomputed from the semester sequence by `src/domain` functions on every evaluation (see `DOMAIN.md`, Planned Semester).

### Export / import

Export (UC-07) produces a JSON file containing a single profile: `{ schemaVersion, profile }`. The internal `id` is stripped on export. The filename derives from the profile name and date.

Import (UC-06) runs the same migration pipeline as storage (so old exported files import cleanly forever), then `validateImportedProfile`, then assigns a fresh internal `id` and appends to the profile list. A profile whose `ppcId` does not resolve in `src/data` is rejected with a clear message — never imported in a degraded state.

---

## Data Pipeline (`scripts/`)

Offline generation runs in Node (plain JavaScript) at deploy time, writing intermediate files to `scripts/output` (git-ignored). Inputs are the committed official PDFs in `scripts/input`. The pipeline has four stages, each its own standalone script (runnable directly, e.g. `node scripts/validate-data.mjs`); `scripts/build-data.mjs` runs all of them in order and is the one exposed as `npm run build-data`:

```
Stage 1: department PDF ──parser────▶ department JSON       (one parser per department; per source semester)
         PPC PDF        ──parser────▶ subjects JSON + equivalences JSON, merged (one per PPC version)
Stage 2: department JSONs ──collector──▶ course Offerings snapshots (one per Year Semester per course)
         subjects JSON     ──assemble───▶ course PPC dataset          (one per PPC version)
Stage 3: assembled PPC + Offerings JSONs ──validate──▶ pass/fail      (schema + referential integrity)
Stage 4: validated JSONs ──copy──▶ src/data/ppcs, src/data/offerings
```

- **Stage 1 — parsers.** One parser per department extracts that department's offering PDF into an intermediate JSON, keeping each Section's "Curso" cell — target course code and name — alongside its schedule fields. One parser per PPC PDF extracts its required/optional subjects (`extract-subjects-*.mjs`) and its equivalences document (`extract-equivalencias-*.mjs`), merged into a single subjects JSON (`merge-equivalencias-*.mjs`). Anomalies in the source PDFs are fixed by **hardcoded exceptions inside the parser scripts** — never by fallback logic in the app.
- **Stage 2 — collector / assemble.** `collect-course-offerings.mjs` builds each course's Year Semester Offerings snapshots. Its knowledge is a small per-course config array: the `ppcId` to filter by, the course's official **course id and name** (stamped into the assembled PPC dataset as `courseId`/`courseName`), and which source semester fills which Year Semester slot (e.g. `2026-1 → YS1`, `2026-2 → YS2`). Departments are discovered automatically: the collector reads every department JSON available for the source semester and keeps Sections matching the PPC filter (subject ∈ PPC or ∈ some subject's `equivalents`), keeping each Section's target course as `targetCourseId`/`targetCourseName` (id normalized — any entry-semester/cohort marker stripped) and dropping Enrollment Scope and seat counts. `assemble-ppc.mjs` reshapes each merged subjects JSON into the final PPC dataset shape (see PPC dataset below) — course-agnostic, runs over every subjects JSON found.
- **Stage 3 — validation** (`validate-data.mjs`). Schema checks plus referential integrity (offering subject codes resolve against the matching PPC's own codes or its equivalents, prerequisite/corequisite codes resolve within the PPC, session times parse, shifts recompute correctly, every Section carries a `targetCourseId` free of cohort markers, and each PPC carries its `courseId`). **Any validation error fails the deploy** (non-zero exit). Because generated Offerings are never committed, this is the safety net against silent parser regressions; a committed snapshot fixture for one department is kept under Vitest to catch regressions before deploy.
- **Stage 4 — copy** (`copy-to-data.mjs`). Copies the validated PPC and Offerings JSONs into `src/data/ppcs` and `src/data/offerings` respectively (see `src/data` above). `src/data/offerings` is always git-ignored and rewritten on every build; `src/data/ppcs` is git-ignored per-file for script-generated PPCs (Engenharia Elétrica today) and committed for hand-crafted ones.
- A future hand-crafted course PPC skips Stages 1's PPC parser and Stage 2's assemble step, but still needs a collector config entry and a subjects JSON in the collector's expected (pre-assembly) shape to produce that course's Offerings — today's collector only reads from `scripts/output`, not from `src/data/ppcs` directly.

---

## Testing Policy

| Tier       | Scope                                                                                                                             | Mandatory             |
| ---------- | --------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Domain     | Exhaustive unit tests of all rules (requisites, conflicts, equivalence resolution, cascading recomputation) — pure Vitest, no DOM | Yes                   |
| Storage    | Serialisation, error handling, and **every migration** — Vitest with an in-memory localStorage stub                               | Yes                   |
| Store      | Action logic (mutations, write-through, derived updates) — headless Vitest                                                        | Yes                   |
| Components | None by default. React Testing Library may be added later for a specific screen if it accumulates regressions                     | No                    |
| E2E        | Playwright smoke suite, added once UC-02/11/12 are implemented                                                                    | Yes (from that point) |

The e2e suite is a **smoke suite, not a use-case matrix** — roughly 3–5 scenarios covering the seams unit tests skip: the persistence spine (create profile → plan → reload → intact), the export → delete → import round-trip, the two-tab warning, and one requisite/conflict warning flow through the real UI. All behavioral edge cases stay in domain/store unit tests. E2E runs on CI per PR; with no backend it stays fast.

Specs locate elements by accessible name (`getByRole('button', { name: '…' })`, `getByRole('listitem')`, `getByRole('heading', { name: '…' })`) rather than test ids or CSS selectors. When changing a component those specs touch, keep its accessible names stable — icons must stay `aria-hidden` and paired with visible text, not replace it.

---

## Deployment

GitHub Pages, deployed by GitHub Actions on push to main:

1. install
2. data generation + validation (`npm run build-data`; fails the build on any error)
3. unit tests (domain, storage, store) — some rely on the data generated in step 2 (e.g. `src/data`, `src/storage`)
4. Vite build
5. Playwright smoke suite against the built output
6. deploy to Pages

Pull requests run everything except the deploy step. The app is served from the repository subpath, so Vite `base` and the wouter base path are configured for it.

---

## Constraints

- Domain functions must remain pure and framework-agnostic. They must be independently testable with Vitest without any React or browser setup.
- Storage access must not leak outside `src/storage`; only the store calls `src/storage`.
- UI strings must be written in **pt-BR**, hardcoded inline — there is no i18n catalog or library. Date and weekday formatting goes through `Intl` with `pt-BR`.
- Code comments and documentation must be written in **English**.
