# Agent notes

Start with `docs/ARCHITECTURE.md`, `docs/DOMAIN.md`, and `docs/USE_CASES.md`. This file only covers things specific to working as an AI agent in this repo — see `README.md` for how to install, run, and test the project.

## Installing the Playwright browser without sudo

`npm run test:e2e` (see `README.md`, "Testing") needs a Chromium binary. Try the no-root install first:

```sh
npx playwright install chromium
```

If Chromium then fails to launch with a missing shared-library error, that's what `--with-deps` would have installed. Ask the user to run that form themselves rather than invoking `sudo` on their behalf.

## `playwright-cli` is a different tool than the e2e suite

The `playwright-cli` skill drives a real browser interactively — useful for manually verifying a UI change or taking a screenshot. It is **not** related to `npm run test:e2e`, which runs the committed spec files under `e2e/*.spec.js` against a production build. Don't run `npx playwright install --with-deps` just to use `playwright-cli`; the plain install above is enough. Also note `playwright-cli`'s default browser channel is `chrome` (not installed here), so pass it explicitly:

```sh
npx playwright cli open --browser=chromium http://localhost:5173/ufes-ppc/
```

Clean up afterwards: `npx playwright cli close`, stop any dev server you started, and delete any `.playwright-cli/` snapshot or screenshot artifacts before finishing — they're scratch output, not part of the repo.
