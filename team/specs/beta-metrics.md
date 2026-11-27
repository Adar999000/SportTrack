# Beta success metrics and funnel (T19)

Author: pm. Based on: `src/analytics.ts`, every `track(` call in `src`, and `track` / `adminAnalytics` / `questStatus` in `apps-script/server.js`.

## 0. What the current analytics can and cannot do
- **Client `track(name)`** (`src/analytics.ts:13`) only runs when signed in (`hasBackend() && currentUser()`). So **landing visits and sign-up attempts by anonymous visitors are not measured at all.**
- Names are lower-cased, limited to `[a-z0-9:_-]`, max 40 chars. Events are batched every 30 s and flushed on tab hide.
- **Server `track`** (`server.js:2521`) stores one row per day+event: total count and the list of distinct user ids. It de-duplicates per day, so "did user X do event E on day D" is answerable; "first time ever" is not (unless derived from the earliest day).
- **`adminAnalytics`** (`server.js:2550`) returns daily active users, WAU/MAU, total users and per-event count/users for 7 and N days. It has no per-user cohort view, no funnel, and its de-duplication window means counts are not "per signup cohort".
- **Users sheet** has `created` and `seen` (last seen only, `server.js:28`); there is no login history, so "returned on day 3 / day 7" can only come from Analytics presence on those days.
- Existing relevant events: `screen:<route>` (every route change, `main.ts:233`), `mark:meal`, `mark:sport`, `workout:save`, `post:like`, `post:comment`, `duel:invite`, `duel:create`, `share:outside`, `share:achievement`, `story:post:*`, `store:buy`, `strava:connect`.

## 1. The funnel

| # | Step | Definition (one user, one account) |
|---|---|---|
| 1 | Landing visit | A browser opens the landing page while signed out |
| 2 | Sign-up started | Opens the sign-up form |
| 3 | Sign-up completed | Account created (`Users.created`) |
| 4 | Onboarding done | `profile.completed === true` (saved or skipped from the onboarding form) |
| 5 | First mark | First V/X/– on any meal or sport cell, or a weight entry |
| 6 | First full day | A day with 3 meals and sport filled (same rule as quest step 4, `done(d) >= 4`) |
| 7 | Day-3 return | Active on a day between `created+3` and `created+4` (a calendar-day window, see 4) |
| 8 | Day-7 return | Active on a day between `created+7` and `created+9` |
| 9 | First invite | Shares the invite link, or someone signs up with the user's code |

Conversion = users who reached step N ÷ users who reached step 3 (steps 1–2 are visitor counts, shown as absolute plus a rate to step 3).

## 2. Measuring each step: what exists and what is missing

Principle: **derive milestones server-side from stored data wherever possible** (offline marks sync later and a client event would be lost or late); use client events only for things that have no stored trace.

| # | Existing source | Gap | Proposed event / computation |
|---|---|---|---|
| 1 | none (track needs sign-in) | **Missing** | New anonymous action `landing` that increments a per-day counter (no user id, no IP, no cookie), called once per session from `renderLanding`. Event name: `landing:view`. Also `landing:cta` (click on the sign-up button, via `data-track`) |
| 2 | none | **Missing** | Anonymous `landing:signup-open` fired from `renderAuth(root, 'register')`. Same anonymous counter, no user data |
| 3 | `Users.created` | none | Count users with `created` in the period |
| 4 | `Users.profile` JSON (`completed`) | no event | Computed from `profile.completed`. Also add client event `onboarding:done` and `onboarding:skip` (from `profileView.ts` submit / the new "דלג" button in T10) to tell saved from skipped |
| 5 | `Weeks.data` (any non-empty mark, `startWeight`) and `mark:meal` / `mark:sport` events | event is per day, not "first" | Computed from Weeks: earliest day with any mark. `mark:meal` / `mark:sport` stay as the activity signal. Add `mark:weight` (in the week weight input) so weight-only users are visible |
| 6 | `questStatus.steps.full` logic (`server.js:1295`) | no event | Computed server-side with the same `done(d) >= 4` rule. Add client `day:full` when the Today panel shows the "day closed" state, only as a UX signal |
| 7, 8 | Analytics rows (distinct users per day) | any event counts as activity, including the auto `screen:*` fired on load | Computed: user is "returned on day N" if their id appears in any Analytics row on `created+N .. created+N+1 (day 3)` or `created+7 .. created+9 (day 7)`. Needs no new event. Caveat: `screen:*` fires on open, which is the right definition of a return (opened the app) |
| 9 | `Users.extra.invitedBy` (someone signed up with their code), `duel:invite`, `share:outside` | no event for copying/sending the invite link | New client event `invite:share` (copy button, share buttons in `shareView.ts`). Computed server-side: `invitedBy` count = **invites that converted**. Report both: sent (event) and converted (data) |

### Missing events (exact names)
`landing:view`, `landing:cta`, `landing:signup-open` (anonymous counters), `onboarding:done`, `onboarding:skip`, `mark:weight`, `day:full`, `invite:share`, `verify:done` (email verified, the community gate, see F7 in `new-user-review.md`), `quest:claim`.

### Privacy rules (keep)
Only event names and counts; no content, no free text, no IP, no device id. Anonymous counters carry no user id at all. `adminAnalytics` stays admin-only. The funnel card shows counts and percentages, never a list of named users (cohort rows are by sign-up week, not by person).

## 3. Admin "Funnel" card

**Where:** admin screen, above the event list (`src/ui/adminView.ts`, near the existing analytics block at `:132`).

**Controls:** period selector 7 / 30 / 90 days (same as the existing `adminAnalytics(days)`), default 30. The period selects **users who signed up in that period** (a cohort), not events in that period.

**New server action** `adminFunnel(days)` (admin only) in `apps-script/server.js`, returning:
```
{
  days, from, to,
  visitors:   { landing, signupOpen },            // anonymous counters in the period
  cohort:     { signedUp, onboarded, firstMark, firstFullDay,
                day3Eligible, day3Returned, day7Eligible, day7Returned,
                invitedAny, invitedConverted },
  weeks:      [ { weekStart, signedUp, firstMark, day7Returned } ],   // last up to 8 sign-up weeks
  medianHoursToFirstMark: number | null
}
```

**How computed (all from sheets, no per-person output):**
- `signedUp`: Users rows with `created` in `[from, to]`.
- `onboarded`: of those, `profile.completed`.
- `firstMark`: of those, at least one Weeks row (user id match) whose `data` has any meal/sport mark or a `startWeight`.
- `firstFullDay`: of those, any day with `done(d) >= 4` (reuse the helper inside `questStatus`).
- `day3Returned`: of users who are old enough (`created + 4 days <= today`, that is the **eligible** denominator), those whose id is in an Analytics row dated `created+3 .. created+4`. `day7Returned` likewise with `created+7 .. created+9`. Show the rate as returned ÷ eligible, and hide the percentage when eligible is under 5 (show the raw count with "too few").
- `invitedAny`: of those, users with the `invite:share` event on any day, plus users who have at least one other user whose `extra.invitedBy` equals them; `invitedConverted`: users with at least one converted sign-up.
- `visitors.*`: sum of the anonymous counters for the period.
- `medianHoursToFirstMark`: median of (first mark timestamp − `created`), using `Weeks.updated` of the earliest week row as the approximation.
- Cost: one pass over `Users`, `Weeks`, `Analytics`. For 20 users this is cheap; cache the result for 10 min (`CacheService`, like the leaderboard) so reloads don't re-scan.

**Display:** a horizontal funnel list, each row `label · count · % of signed-up · % of previous step`; a small sign-up-weeks table beneath; each row has an accessible text value (not colour only), and an "i" note explaining day-3/day-7 eligibility. Hebrew and English strings through `src/i18n-en.ts`.

## 4. Beta success targets (first 20 users)

With 20 users, one person is 5%, so use counts and read rates as direction only. A "good enough to widen the beta" bar:

| Metric | Target (of 20 sign-ups) | Floor (investigate if below) |
|---|---|---|
| Onboarding done | 18 (90%) | 14 |
| First mark within 24 h of sign-up | 16 (80%) | 12 |
| First full day within 7 days | 10 (50%) | 6 |
| Day-3 return | 10 (50%) | 7 |
| Day-7 return | 8 (40%) | 5 |
| Quest claimed within 14 days | 6 (30%) | 3 |
| Email verified | 12 (60%) | 8 |
| First invite shared | 6 (30%) | 3 |
| Invited friend signed up | 4 users bring ≥ 1 friend | 2 |
| Median time to first mark | under 5 minutes | under 30 minutes |
| Support messages per user | ≤ 1 (and each answered in 24 h) | n/a |

Rules for reading the numbers:
- Decide **widen / fix first / pause** at 20 users or 3 weeks, whichever comes first.
- If day-7 return is below the floor, fix retention (reminders, plans, T2) before any growth work. If first mark is below the floor, fix onboarding (T10, T8) first.
- Qualitative check on top: talk to 5 of the 20 (outside the app) about why they stopped; the metrics say where, not why.
- Exclude the admin, test accounts and the team from all cohort counts (needs a user flag, see backlog T22).

## 5. Open questions (chief decides)
1. Anonymous landing counters: do we accept a counter with no cookie and no user id? (Proposed default: yes, one hit per session using `sessionStorage`.)
2. `Weeks.updated` as the timestamp of the first mark is an approximation. Exact time would need a `firstMarkAt` stored on the user (backend option).
