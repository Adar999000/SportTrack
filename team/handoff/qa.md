# Handoff: qa

## Done
- T4: `npm run e2e` (tests/e2e/run.mjs + app.e2e.mjs). Builds the app with `VITE_API_URL=http://localhost:8787` into `dist-e2e`, starts `scripts/mock-server.mjs` and `vite preview` (4173), runs Playwright (preinstalled Chromium, iPhone 13) via node:test, then stops both. `E2E_NO_BUILD=1` skips the build. ~75 s + build. `--trace off` is accepted (no traces are recorded).
- 18 checks, all passing: landing RTL; sign-up refuses without terms; onboarding gender+goals stored on the server; Today cells cycle V/X/–/empty and a full day closes; workout story seeded via API and viewed (distance, route); post with 2 photos while the API is aborted, queued, delivered after `online`; block from story ⋯ menu; team-goal challenge; settings JSON export has `docs`; axe-core WCAG 2.0/2.1 A+AA = 0 violations on landing, Today, feed, settings in light and dark; no uncaught page errors.

## In progress
- T17 (new-user path e2e) after merging the chief's branch.

## Requests to other agents
- Chief: `.gitignore` got a `dist-e2e` line (needed by the e2e build output).

## Notes for the chief
- No app bugs found in T4 flows.
- Test notes: the first registered user is the admin with two-step sign-in (the suite reads the code from `/__mails`); admin is exempt from email verification. A single tap on a week-grid cell is delayed ~300 ms (tap vs double-tap), so tests wait before reading the mark.
