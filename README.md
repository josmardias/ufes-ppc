# ufes-ppc

**UFES Course Enrollment Planner** (ppc-ufes) is a tool that helps UFES students simulate their academic path semester by semester.

## Live app

https://josmardias.github.io/ufes-ppc/

## Documentation

- [Use Cases](docs/USE_CASES.md) — purpose & scope, and what users can do
- [Domain](docs/DOMAIN.md) — the concepts and rules (with EN → PT-BR dictionary and [diagram](docs/DOMAIN.svg))
- [Architecture](docs/ARCHITECTURE.md) — tech stack, project structure, persistence
- [AGENTS.md](AGENTS.md) — notes for AI coding agents working in this repo

## Local development

```sh
npm install
npm run dev
```

Regenerating the data (`npm run build-data`) requires [poppler-utils](https://poppler.freedesktop.org/) (`pdftotext`) installed locally, e.g. `apt-get install poppler-utils` or `brew install poppler`.

## Testing

```sh
npm test          # unit tests (domain, storage, store)
npm run test:e2e  # Playwright smoke suite, against a production build
```

`test:e2e` builds the app first and serves it via `vite preview`; fetch the browser once beforehand:

```sh
npx playwright install --with-deps chromium  # installs Chromium + OS deps (needs sudo) — what CI uses
npx playwright install chromium              # Chromium only, no sudo — use on a machine/container without root
```

## Deploy

Automatic deployment via GitHub Actions on every push to `main`.
