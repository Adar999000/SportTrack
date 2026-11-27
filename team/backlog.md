# Backlog (owned by pm, approved by chief)

Priority: P1 now, P2 next, P3 later. Status is mirrored on the office dashboard.

| id | P | Task | Owner | Status |
|---|---|---|---|---|
| T1 | P1 | Prioritized backlog with acceptance criteria + new-user UX review of the code paths (onboarding → Today → first week) | pm | review |
| T2 | P1 | Ready-made training plans ("5 km in 8 weeks", "home strength 3×/week"): pick a plan, today's session appears on Today, marking it fills the sport row | frontend | todo |
| T3 | P1 | Supabase migration prep: `backend/supabase/schema.sql` (tables + RLS mirroring the Sheets), Edge Function skeletons for auth/weeks/feed, and a transport adapter in `src/api.ts` behind a flag. No keys, no live calls | backend | todo |
| T4 | P1 | Playwright e2e suite in `tests/e2e/` against the mock server: sign-up+consent, Today marking, workout story, post with photos offline→online, block user, challenge, settings export. `npm run e2e` | qa | todo |
| T5 | P2 | Six more team post cards (weekly tips series) as webp + a reproducible generator script in `scripts/team-cards/` | design | todo |
| T6 | P2 | Copy review: English quality in `src/i18n-en.ts`, missing feminine forms (list for `src/i18n-fem.ts`), help page content `docs/help.md` | content | todo |
| T7 | P2 | Launch kit `docs/growth.md`: invite messages (WhatsApp/Instagram/SMS), SEO keywords, Search Console steps, first-20-users plan | growth | todo |

## New items from the new-user review (`team/specs/new-user-review.md`)

| id | P | Task | Owner | Status |
|---|---|---|---|---|
| T8 | P1 | Today first: move the quest card below the Today panel (or make it a compact strip) and make each quest step tappable (F11, F12) | frontend | todo |
| T9 | P1 | Verify-email prompt inside the community feed instead of a dead end (F7) | frontend | todo |
| T10 | P1 | Shorter onboarding: step 1 = gender + goal chips + explicit "דלג"; the rest moves to Profile edit; optional current weight fills quest step 2 (F8, F9) | frontend | todo |
| T11 | P1 | Lighter sign-up: invite code collapsed, one-line privacy hint, inline consent/password errors, password rule aligned to 8 (F4, F5) | frontend | todo |
| T12 | P2 | One welcome, one skip: merge welcome + first tour into 2 slides, drop the AI step, a single "דלג" ends all (F10) | frontend | todo |
| T13 | P2 | Quest rules and deadline: allow a "-" sport mark to count for a full day, show days left, rule change only; the client switches to the existing `questStatus` call (F12, F13) | backend | todo |
| T14 | P2 | Empty community state with "invite a friend" and "share your first workout" actions (F15) | frontend | todo |
| T15 | P2 | Landing restructure proposal: steps right under the hero, 4 core features first, lead paragraph about the 30-second habit, mark the mock as an example (F1, F2, F3) | growth | todo |
| T16 | P3 | Copy for onboarding and quest: coin explanation line, quest step labels, English and feminine forms (F14) | content | todo |
| T17 | P3 | e2e coverage for the new-user path: first-user vs invited sign-up, onboarding skip, quest 0→4 claim, unverified-email feed (F6) | qa | todo |

### Acceptance criteria

**T8** (frontend)
- On a 360×640 viewport the Today meal buttons are visible without scrolling for a user with an open quest.
- Tapping an unfinished quest step scrolls to and focuses the related control (meal row, `#start-weight`, sport row).
- Completed steps keep the check mark and the `sr-only` status text; claiming still works.
- `npx tsc --noEmit && npx vitest run && node scripts/i18n-keys.mjs --missing` pass.

**T9** (frontend)
- A signed-in user with `emailVerified === false` sees a verify card in place of the composer on the posts tab, with a one-line reason.
- After a correct code the composer appears without a page reload and a toast confirms.
- Wrong code and resend show an error/confirmation message (no silent failure); the card is keyboard- and screen-reader-accessible.

**T10** (frontend)
- Onboarding shows only gender and goal chips plus "שמור והמשך" and a visible "דלג"; skipping still marks the profile complete.
- Name, birth date, height, goal weight and goal text remain editable in Profile edit.
- An optional current-weight field, when filled, sets this week's start weight and quest step 2 shows done on Today.
- Name is not asked twice (pre-filled from sign-up or hidden).

**T11** (frontend)
- The invite field is collapsed unless an invite code is present in the link; the privacy hint is at most one line plus the existing links.
- Consent and password errors appear next to their fields, with `aria-describedby` and focus moved to the first invalid field.
- The reset-password input's `minlength` matches the "8 characters" label.
- A show/hide password button is keyboard accessible and labelled in both languages.

**T12** (frontend)
- The welcome has at most 2 slides; the first Today tour has no AI-assistant step.
- A single "דלג" on the welcome marks the first tour as seen as well.
- The tour does not auto-start while a sheet or dialog is open and respects reduced motion (existing behavior unchanged).

**T13** (backend, with chief approval for the rule change)
- `claimQuest` counts a "-" sport mark as satisfying the sport part of the "full day" step; unit/mock tests cover it.
- `questStatus` (already exists, `server.js:1295`) also returns `expiresAt`; same "-" rule applies to its `full` step. (Using it in the client is T20.)
- Claiming twice never pays twice (existing guarantee kept, test added).
- No change to the live server data in tests; use `tests/gas/mock.mjs`.

**T14** (frontend)
- With zero posts, the "all" tab shows an invite action (opens the share page) and, when the user has at least one workout, a "share your first workout" action.
- Official team posts (when present) still render first; empty state only appears when nothing exists.
- Both actions have visible labels and work with keyboard only.

**T15** (growth, text only in `docs/growth.md` or the handoff; chief applies)
- A proposed section order and replacement hero lead paragraph, Hebrew and English.
- Keeps every claim true to the current app (no GPS/AI promise stronger than the feature).
- Suggested "example" label wording for the landing mock.

**T16** (content)
- English entries for every new or changed string in T8–T12, T14; feminine forms listed for `src/i18n-fem.ts`.
- One-sentence coin explanation under the quest claim button, max 12 Hebrew words.
- `node scripts/i18n-keys.mjs --missing` clean.

**T17** (qa)
- e2e specs for: invited sign-up with prefilled code, onboarding skip, quest 0→4 then claim (+100 once), unverified-email feed, all against the mock server.
- Each spec runs in `npm run e2e` in under 60 seconds and leaves no state behind.
- A failing assertion prints which step of the journey broke.

## Beta metrics and funnel (`team/specs/beta-metrics.md`)

| id | P | Task | Owner | Status |
|---|---|---|---|---|
| T19 | P1 | Beta success metrics and funnel spec | pm | review |
| T20 | P1 | Client events: `onboarding:done`, `onboarding:skip`, `mark:weight`, `day:full`, `invite:share`, `verify:done`, `quest:claim`; and use the existing `questStatus` call instead of the `localStorage` flag in the quest card | frontend | todo |
| T21 | P1 | Anonymous landing counters (`landing:view`, `landing:cta`, `landing:signup-open`) as a new server action with no user id, plus the client calls | backend | todo |
| T22 | P1 | `adminFunnel(days)` server action: cohort funnel from Users + Weeks + Analytics, cached 10 min, excludes admin/test accounts (new user flag) | backend | todo |
| T23 | P1 | Admin "Funnel" card in `adminView.ts` showing `adminFunnel` (period 7/30/90, funnel rows, sign-up-weeks table, "too few" rule) | frontend | todo |
| T24 | P2 | Tests for the funnel: mock-server data with known cohorts, day-3/day-7 eligibility edge cases, privacy check (no personal fields in the response) | qa | todo |

**T20** (frontend)
- Each listed event fires exactly once per action, via `track()` from `src/analytics.ts`, and names match the spec exactly.
- The quest card reads `questStatus` (`paid`, `open`) from the server; the card stays hidden after a claim on a second device.
- No new personal data is sent; `node scripts/i18n-keys.mjs --missing` and the other checks pass.

**T21** (backend)
- A new unauthenticated action increments a per-day counter per event name from an allow-list of three names; it stores no user id, IP or free text.
- Rate-limited per request source so it cannot flood the sheet; unknown names are ignored.
- Mock-server test covers a call without a token and a call with an unknown name.

**T22** (backend)
- `adminFunnel(days)` (admin only) returns the shape in section 3 of the spec; non-admins get the usual error.
- Day-3 and day-7 rates use the "eligible" denominator; results are cached for 10 minutes.
- Response has counts only, no names, emails or user ids; admin and flagged test accounts are excluded.
- Tested against `tests/gas/mock.mjs` with a fixed cohort.

**T23** (frontend)
- The card shows all nine steps with count, % of signed-up and % of previous step, readable without colour.
- Period selector 7/30/90; percentages hidden with a "too few" note when the denominator is under 5.
- Hebrew and English strings, keyboard and screen-reader accessible, works on a phone width.

**T24** (qa)
- Known-cohort fixtures produce the expected counts for every step.
- Users younger than 4 / 8 days are not counted as non-returners.
- The response is checked to contain no personal fields.

## Owns (areas)
- frontend: `src/ui/*` (except admin/legal), `src/styles.css`
- backend: `apps-script/*`, `backend/*`, `src/api.ts`, `src/sync.ts`, `scripts/load-test.mjs`
- qa: `tests/e2e/*`, `playwright.config.*`, `package.json` scripts (`e2e` only)
- design: `public/team/*`, `public/shots/*`, `scripts/team-cards/*`
- content: `src/i18n-en.ts`, `src/i18n-fem.ts`, `docs/help.md`
- growth: `docs/growth.md`, landing copy proposals (as text in the handoff; the chief applies them)
- pm: `team/backlog.md`, `team/specs/*`
