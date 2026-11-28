# Handoff: backend

## Done
### Batch for server 6.10.0 (SERVER_VERSION bumped once): T22, T21, T13, T26 (status: review)
- **T22 `adminFunnel(days)`** (admin): spec §3 shape, counts only, cached 10 min per period+day. New admin action
  `setTestAccount(userId, on)` sets `extra.testAccount` (excluded like admins; clears today's funnel cache).
  Decisions: cohort = sign-up day (Israel calendar) in `[today-days, today]`; day-3 eligible at age ≥ 4, day-7 at age ≥ 8
  (window c+7..c+9); "first mark" = any V/X/- or text on a meal/sport cell, or a weight; median uses the earliest marked week's
  `updatedAt` (spec's approximation). All 5 QA tests in `tests/funnel.test.ts` run and pass; extras in `tests/metrics.test.ts`.
- **T21 `landing {event}`** (no sign-in): allow-list `landing:view`, `landing:cta`, `landing:signup-open`; one Analytics row per
  day+event with users `[]`; nothing else read or stored. Decision: Apps Script can't see IPs, so the "per source" limit is a
  global cap of 2000 per event per hour, and the client sends each name at most once per browser session (`trackLanding` in
  `src/analytics.ts`, called from `renderLanding` and `renderAuth('register')`).
- **T13**: `questStatus`/`claimQuest` return `claimed` (= paid) and `expiresAt` (sign-up + 14 days). The "-" rule already held in
  `done()`; now a shared `dayDone()` and a test lock it in. Pay-once and 14-day close tested. Supabase port mirrors the fields.
- **T26 survey** (spec `team/specs/beta-feedback.md`): `Feedback` sheet; `surveyStatus` → `{survey, snoozedUntil, answers}`;
  `submitSurvey {survey, score, text?, wantsReply?}`; `dismissSurvey {survey, forever?}`; `adminFeedback` (admin).
  Decisions: state in `Users.extra.survey` (any device); an expired d3 window also unblocks d7 (people who started late still get d7);
  the 24 h gap is measured from the d3 answer/dismiss time (the server can't see when a card was shown); answers are accepted
  from the opening day even after the window (offline queue); answers are linked to the user id (spec open question 1, default)
  and the "2 active days" rule is kept (open question 2, default); `createMessage` for reply requests keeps its usual single admin
  notice (spec 1.4 accepts it) — the answer itself never emails; the admin payload has first name, day of use, score, text, time,
  wantsReply, no ids/emails; average only with 5+ answers. Account deletion removes answers; `answers` in `surveyStatus` is for the
  client export.

### T3 — Supabase migration prep (status: merged in 6.6.0)
- `backend/supabase/schema.sql`: every Sheet as a table (profiles, weeks, docs, posts + likes/comments/reports/story views/meetup RSVPs,
  duels + members, duel_chat, ledger, events, messages, errors, analytics, invites, audit) plus `counters`/`auth_codes`/`settings`
  in place of CacheService/Script properties. Indexes, `put_weeks`/`put_docs` (newer wins, one statement, no lock), RLS:
  own rows, feed all/friends, hidden posts, blocking both ways, story replies private, admins. Column grants stop users
  changing role/verified/coins. Re-runnable.
- `backend/supabase/functions/api`: one Edge Function with the same action names/answers as `server.js`.
  Ported: auth (register/login/2FA/refresh/reset/verify/profile/password/logout-all/delete), weeks/docs/photos,
  rewards/store/frame/leaderboard/league/quest/invite, feed/stories/posts/likes/comments/reports/meetups/blocking/friends,
  status/siteConfig/clientError/track/publicContact. Everything else is in `NOT_PORTED` (clear error, TODO).
  Rules in `_shared/logic.ts` are pure and checked against the Apps Script server.
- `src/api.ts`: `VITE_BACKEND=supabase` → `src/backend/supabase.ts` (bearer token, hidden refresh token, one retry
  after refresh). Default (no flag) is exactly the old request. `hasBackend()` follows the selected backend.
- `vite.config.ts`: CSP connect-src also gets `VITE_SUPABASE_URL`'s origin when set (no change otherwise).
- `backend/supabase/migrate-from-sheets.mjs` + `.md`: CSV per tab → auth users (Admin API, only with `--create-users`)
  + `data.sql`. Old passwords keep working (legacy hash checked once, then upgraded).
- Tests: `tests/api-transport.test.ts` (switch, headers, refresh, errors), `tests/supabase-logic.test.ts`
  (rewards deep-equal to Apps Script for an admin with goal/freezes/referral and a regular user; spend and post
  errors; league; story cleaning; legacy hashes). `npx tsc --noEmit && npx vitest run` → 123+ pass.
- Also verified locally (no accounts): schema + RLS on Postgres 16 with auth/storage stand-ins; export script
  round-trip into that DB; `deno check` + `deno lint` on the functions.

## What the owner must create (names only, no values here)
- A Supabase project (free tier, region eu-central / Frankfurt).
- A Resend account with the app's sending domain verified (SPF + DKIM).
- Edge Function secrets: `RESEND_API_KEY`, `MAIL_FROM`, `ALLOWED_ORIGINS`, optional `MAIL_DAILY_LIMIT`;
  later `OPENAI_API_KEY`, `OPENAI_MODEL`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
  (`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` come with the project.)
- Build settings for a Supabase build (public, not secrets): `VITE_BACKEND=supabase`, `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`.
- Full steps: `backend/supabase/migrate-from-sheets.md`.

## In progress / left
- Port the rest: duels (+ nightly settle via pg_cron), events, support messages, moderation/admin, chat/publicChat, Strava, team drip posts.
- Photo copy Drive → Storage script (step 10 in the .md).
- Leaderboard is still computed for all users (cached 5 min) like today; for scale make it a table refreshed by a scheduled job.
- `getPhoto` still returns base64; switch to signed URLs with a small client change.

## Requests to other agents
- frontend (T27): include `surveyStatus().answers` in the JSON export (settings → ייצוא JSON) so users get their own answers.
- frontend/T23/T28: admin cards can call `adminFunnel` and `adminFeedback` (shapes above); `setTestAccount` needs a toggle in the users list.
- chief/frontend: `src/errorReport.ts` posts straight to `API_URL` (Apps Script). On a Supabase build it should go through
  `call('clientError', …)` or the Supabase URL. Not changed (outside my area).

## Notes for the chief
- Decisions taken by default: one `api` function (not one per action) to keep cold starts and the client contract simple;
  likes/comments/etc. as rows instead of JSON cells; 2FA keeps the new session server-side until the code is entered;
  "log out everywhere" revokes refresh tokens (access tokens expire within 1 h).
