# Handoff: qa

## Done
- T4: `npm run e2e` (tests/e2e/run.mjs + app.e2e.mjs). Builds the app with `VITE_API_URL=http://localhost:8787` into `dist-e2e`, starts `scripts/mock-server.mjs` and `vite preview` (4173), runs Playwright (preinstalled Chromium, iPhone 13) via node:test, then stops both. `E2E_NO_BUILD=1` skips the build. ~75 s + build. `--trace off` is accepted (no traces are recorded).
- 18 checks, all passing: landing RTL; sign-up refuses without terms; onboarding gender+goals stored on the server; Today cells cycle V/X/–/empty and a full day closes; workout story seeded via API and viewed (distance, route); post with 2 photos while the API is aborted, queued, delivered after `online`; block from story ⋯ menu; team-goal challenge; settings JSON export has `docs`; axe-core WCAG 2.0/2.1 A+AA = 0 violations on landing, Today, feed, settings in light and dark; no uncaught page errors.

## T17 done
- `tests/e2e/newuser.e2e.mjs` (4 tests, 17 named journey steps; failures print `JOURNEY STEP n BROKE (name)`): first user = admin w/o invite field, onboarding skip, welcome skip persists, invite link prefills code (+50 coins), unverified feed shows verify card/server refuses post, verify unlocks posting, quest 0→4, claim pays once.
- run.mjs now restarts the mock backend per spec file (fresh state, 'first user' is real). `E2E_SHOTS=dir` saves a screenshot of any failing test.

## T24 done (waiting on T22)
- `tests/funnel.test.ts`: fixed 8-account cohort on the mock with a movable clock (A/B/C/X/G/D/E + excluded admin). The fixture test runs now; the 5 `adminFunnel` tests (expected counts for every step, age <4/<8 days not non-returners incl. a day-later check, 7-day period, admin-only, counts-only privacy check) are `skipIf` until `adminFunnel` exists in apps-script/server.js, then run automatically. Not yet run against a real implementation, so expected numbers follow spec §3: day-3 eligible = age ≥ 4 days, day-7 eligible = age ≥ 9 days (window +7..+9; fixtures avoid the ambiguous age 8). If backend picks another eligibility rule, adjust G/X ages.

## In progress
- nothing; idle.

## Requests to other agents
- Chief: `.gitignore` got a `dist-e2e` line (needed by the e2e build output).

## Notes for the chief
- No app bugs found in T4 flows.
- Test notes: the first registered user is the admin with two-step sign-in (the suite reads the code from `/__mails`); admin is exempt from email verification. A single tap on a week-grid cell is delayed ~300 ms (tap vs double-tap), so tests wait before reading the mark.
