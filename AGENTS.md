# AGENTS.md — project continuity guide

This file is the **main entry point** for agents and developers to understand the repo state and continue work.

---

## Overview

React static webapp for curriculum planning at UFES Electrical Engineering. Deployed to GitHub Pages. UI is in pt-BR; code, comments and docs are in English.

---

## Repository structure

```
ufes-ppc/
├── scripts/
│   ├── input/                  ← input files (D2, PDFs)
│   ├── processar-ppc.mjs       ← permanent: D2 → src/data/ppc-2022.json
│   ├── processar-equivalencias.mjs ← permanent: PDF → src/data/equivalencias.json
│   └── processar-oferta.mjs    ← permanent: PDF → src/data/oferta-semestre-N.json
├── src/
│   ├── data/                   ← JSON files bundled into the webapp
│   │   ├── ppc-2022.json
│   │   ├── equivalencias.json
│   │   ├── oferta-semestre-1.json
│   │   └── oferta-semestre-2.json
│   ├── domain/                 ← pure domain logic (no React, no Node)
│   │   ├── planning.js         ← semester generation, pre/co-requisites
│   │   ├── calendar.js         ← turmas, slots, conflicts
│   │   └── __tests__/
│   │       ├── planning.test.js
│   │       └── calendar.test.js
│   ├── lib/                    ← generic utilities (no domain knowledge)
│   │   └── time.js
│   ├── hooks/
│   │   └── usePlanning.js      ← React hook + localStorage persistence
│   ├── components/
│   │   └── WeekCalendar.jsx    ← weekly schedule grid (presentation only)
│   ├── pages/
│   │   ├── PlanejamentoPage.jsx
│   │   ├── PpcPage.jsx
│   │   ├── OfertaPage.jsx
│   │   └── StudentSelect.jsx
│   ├── App.jsx                 ← layout, tabs, PlanningContext
│   ├── index.css
│   └── main.jsx
├── public/
├── index.html
├── vite.config.js
├── package.json
└── .github/workflows/deploy.yaml
```

---

## Quick start

```sh
# Dev server (run manually — do NOT start/kill from agent tools)
npx vite

# Run tests
npm test
npm run test:watch

# Production build
npm run build   # outputs to dist/
```

Deploy is automatic via GitHub Actions on every push to `main`.

---

## Data pipeline scripts

Run these when the PPC or offer PDFs change:

```sh
# Generate PPC JSON from D2
node scripts/processar-ppc.mjs scripts/input/eletrica-obrigatorias.d2
# fixed output: src/data/ppc-2022.json

# Extract legacy→current code equivalences from the UFES equivalences PDF
node scripts/processar-equivalencias.mjs
# fixed output: src/data/equivalencias.json
# Run this whenever EquivalenciasporCurso.pdf is updated.

# Generate offer JSON from PDFs (uses equivalencias.json automatically)
node scripts/processar-oferta.mjs --pdf scripts/input/<offer-1st-semester>.pdf --semestre 1
node scripts/processar-oferta.mjs --pdf scripts/input/<offer-2nd-semester>.pdf --semestre 2
# fixed output: src/data/oferta-semestre-1.json, src/data/oferta-semestre-2.json
```

---

## Architecture decisions

| Decision | Detail |
|---|---|
| **Planning storage** | `localStorage` per student profile (`ppc_alunos`) |
| **PPC + offer data** | Bundled JSON in `src/data/` — part of the build |
| **Code aliases** | `src/data/equivalencias.json` — legacy offer codes mapped to current PPC codes; loaded automatically by `processar-oferta.mjs`. Only 1-to-1 aliases are applied; 1-to-many are skipped (require manual handling via custom offer). |
| **Semester generation** | Always uses PPC only (semOferta: true); offer used only for turma enrichment |
| **State management** | `useState` + `useContext` only — no Redux/Zustand |
| **Routing** | Simple tab state — no React Router |
| **TypeScript** | Not used — `.jsx` only |
| **Language** | Code/docs in English; UI strings in pt-BR |

---

## Domain model

```
Student
  └── Planning (persisted in localStorage)
        └── PlanningRow[]
              ├── semestre_curso: "1" | "2" | ... | "_" (waiver)
              ├── semestre_oferta: "1" | "2"
              ├── codigo, nome, periodo, carga_horaria
              ├── pre_requisitos: string[]
              ├── co_requisitos: string[]
              └── turmas: Turma[]
                    ├── codigo, docente
                    └── horarios: { dia, inicio, fim }[]
```

**Key invariants:**
- A discipline appears at most once per numeric `semestre_curso`.
- `semestre_curso === "_"` = waiver (counts as completed for prerequisites).
- `fim` must be strictly greater than `inicio` on the same day.

---

## Domain layer (`src/domain/`)

Pure functions — no side effects, no React, no Node.

### `planning.js`
- `inferNextSemester(rows, anoInicio, scInicio, semestreIngresso)` — infers next semester number and offer semester
- `gerarSemestre(params)` — selects eligible disciplines from PPC using fixpoint algorithm
- `enrichRowsWithOferta(rows, s1, s2, turno)` — fills turma horarios from offer JSON
- `upsertSemester`, `deleteSemester`, `groupUnique`, `calcDisponiveisParaAdicionar`

### `calendar.js`
- `turmaSlots(turma)` — converts turma horarios to validated time intervals
- `turmasConflitam(a, b)` — two turmas conflict if they share a 1h slot on the same day
- `turmaTemConflito(turma, all)` — does this turma conflict with any other?
- `motivosBloqueio(rows)` — returns blocking issues (multiple turmas, conflicts)
- `resolverTurmaVencedora(disciplina, turma, rows)` — elects winner, removes conflicting turmas
- `todosConflitosDeHorario(rows)` — all conflicting slots in a period
- `conflitosDoSlot(dia, hora, rows)` — turmas occupying a specific 1h slot

---

## Presentation layer

### `WeekCalendar.jsx`
- Hybrid: `<table>` for the background grid, `position: absolute` cards for events
- Colors assigned by insertion order (no collisions up to 12 disciplines)
- Conflict = red; multiple turmas = yellow; normal = palette color
- Clicking any block opens conflict resolution or turma selection modal

### `usePlanning.js`
- Manages multiple student profiles in localStorage
- Key operations: `setRows`, `upsertRows` (functional, avoids stale closure), `withCurrentRows` (read latest without mutation), `setRowsAndTurno`
- Student data shape: `{ aluno, rows, turno, semestreIngresso }`

---

## Testing

Tests live in `src/domain/__tests__/`. All new pure functions in `src/domain/` must have tests.

```sh
npm test          # run once
npm run test:watch  # watch mode
```

**Current coverage:** 85 tests across `calendar.test.js` and `planning.test.js`.

---

## Checklist before large changes

- [ ] Changed planning schema? → update "Domain model" section above
- [ ] Added a new page? → register in `TABS` in `App.jsx`
- [ ] Updated `src/data/*.json`? → run `processar-ppc.mjs` / `processar-oferta.mjs`
- [ ] Added/changed domain functions? → add/update tests, run `npm test`
- [ ] UI string? → use pt-BR. Code comment/doc? → use English