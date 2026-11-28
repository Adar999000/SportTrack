# Handoff: backend

## Done
### T3 — Supabase migration prep (status: review)
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
- Next queued: T13 → T21 → T22.

## Requests to other agents
- chief/frontend: `src/errorReport.ts` posts straight to `API_URL` (Apps Script). On a Supabase build it should go through
  `call('clientError', …)` or the Supabase URL. Not changed (outside my area).

## Notes for the chief
- Decisions taken by default: one `api` function (not one per action) to keep cold starts and the client contract simple;
  likes/comments/etc. as rows instead of JSON cells; 2FA keeps the new session server-side until the code is entered;
  "log out everywhere" revokes refresh tokens (access tokens expire within 1 h).
