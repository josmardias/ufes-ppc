# AGENTS.md — project continuity guide

This file is the **main entry point** for agents and developers to understand the repo state and continue work.

---

## Session startup

At the start of every session, read documentation files before doing any work:

- `docs/ARCHITECTURE.md` — system architecture and technical decisions
- `docs/DOMAIN.md` — domain model and business rules
- `docs/USE_CASES.md` — supported use cases

---


## Checklist before large changes

- [ ] Added/changed domain functions? → add/update tests, run `npm test`
- [ ] UI string? → use pt-BR. Code comment/doc? → use English
