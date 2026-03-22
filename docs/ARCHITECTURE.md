# Architecture

This document records the technical and structural decisions for the UFES course enrollment planner web application. It is the authoritative reference for how the app is built and organised — complementing `DOMAIN.md` (what the concepts are) and `USE_CASES.md` (what users want to accomplish).

---

## Technology Stack

| Concern | Decision |
|---|---|
| UI framework | React |
| Build tool | Vite |
| Test framework | Vitest |
| Styling | Tailwind CSS |
| Persistence | Browser localStorage |

---

## Project Structure

```
src/
  domain/     # Pure domain logic — no framework, no storage, no UI concerns
  storage/    # localStorage read/write — the only place that touches persistence
  components/ # React components
  pages/      # Top-level page components, one per screen
  hooks/      # Custom React hooks — bridge between storage/domain and components
```

### `src/domain`
Contains pure JavaScript functions that implement domain rules — prerequisite evaluation, schedule conflict detection, profile and semester operations, etc. Functions here have no knowledge of React, localStorage, or any other infrastructure. They take plain objects and return plain objects. All domain logic must live here.

### `src/storage`
Contains all read and write operations against localStorage. This is the only layer allowed to call `localStorage`. It is responsible for serialising and deserialising profile data, and for handling storage errors. It calls domain validation functions (e.g. `validateImportedProfile`) where appropriate, but contains no domain logic of its own.

### `src/components`
Reusable React components with no direct storage access. Components receive data and callbacks as props or via hooks.

### `src/pages`
Top-level components that correspond to the main screens of the application. They compose components and coordinate hooks.

### `src/hooks`
Custom React hooks that connect the domain and storage layers to the UI. Hooks may read from storage, call domain functions, and expose state and actions to components.

---

## Persistence

All student profile data is persisted in **localStorage** under a single key. The storage layer is responsible for reading, writing, and handling missing or malformed data gracefully.

No server, no database, no network requests. The application is entirely client-side.

---

## Constraints

- Domain functions must remain pure and framework-agnostic. They must be independently testable with Vitest without any React or browser setup.
- Storage access must not leak into domain or component code.
- UI strings must be written in **pt-BR**.
- Code comments and documentation must be written in **English**.