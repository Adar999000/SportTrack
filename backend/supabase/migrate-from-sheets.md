# Moving from Google Sheets to Supabase

This is the runbook for docs/SCALING.md steps 1–5. Nothing here touches the live Sheet. Until the
switch, the app keeps using Apps Script; Supabase is used only by a build made with `VITE_BACKEND=supabase`.

## What is in `backend/supabase/`

| File | What it is |
|---|---|
| `schema.sql` | Tables, indexes, SQL functions (`put_weeks`, `put_docs`, `bump_counter`), row-level security, the `photos` bucket. Safe to re-run. |
| `functions/api/index.ts` | One Edge Function answering the same `call(action, payload)` requests as `server.js` (same names, same JSON, same `AUTH:` / `VERIFY:` errors). |
| `functions/_shared/logic.ts` | Rules ported 1:1 from `server.js` (rewards, store, quest, league, stories, post checks, password rules). No imports, so the vitest suite checks them against the Apps Script server (`tests/supabase-logic.test.ts`). |
| `functions/_shared/{auth,sync,rewards,feed}.ts` | Data access for each area. |
| `functions/_shared/ctx.ts` | Clients, the signed-in caller, rate limits, settings, mail (Resend), photos (Storage), audit. |
| `config.toml` | Supabase CLI settings (`verify_jwt = false` for `api`). |
| `migrate-from-sheets.mjs` | The one-time export (below). |

### Ported vs. not yet
Ported: sign-up/sign-in/2FA/reset/verify, profile, change password, log out everywhere, delete account,
weeks, docs, week photos, getPhoto, rewards, store, frames, leaderboard, league, first-week quest,
personal invite code, feed, stories, posts, likes, comments, reports, meetups, blocking, friends,
status, siteConfig, clientError, track, publicContact.

Not yet (answer "הפעולה עוד לא זמינה בשרת החדש"; listed in `NOT_PORTED` in `functions/api/index.ts`):
duels and duel chat (+ nightly settle), events, support messages, moderation and admin screens,
the AI chat and publicChat, Strava, the team content calendar (`dripTeamPost`, 6.2.0).
`backupNow`/`serverUpdate` have no equivalent (Supabase backups; deploys by CLI).

## Mapping Sheets → Postgres

| Sheet | Table(s) | Notes |
|---|---|---|
| Users | `auth.users` + `profiles` (+ `legacy_passwords`, `blocks`, `strava_tokens`) | `extra` JSON becomes columns: invited_by, email_verified, two_factor, history_approved, frame, chat_credits, consent. User ids become UUIDs; the old id is kept in `profiles.legacy_id`. |
| Weeks | `weeks` | PK (user, sunday). `put_weeks` keeps "newer updatedAt wins". |
| Docs | `docs` | PK (user, docId). |
| Posts | `posts`, `post_likes`, `post_comments`, `post_reports`, `story_views`, `meetup_going` | The JSON cells become rows. Team posts: `team = true`, `author_id = null`; the API still sends `author.userId = 'team'`. |
| Duels | `duels`, `duel_members` | |
| DuelChat | `duel_chat` | |
| Ledger | `ledger` | Unique (user, ref) except `chat10`: a prize or purchase can't be paid twice. |
| Events | `events` | |
| Messages | `messages` | `guest:<email>` rows → `guest_email`. |
| Errors, Audit | `errors`, `audit` | Not copied (diagnostics). |
| Analytics | `analytics`, `analytics_users` | |
| Invites | `invites` | |
| CacheService | `counters`, `auth_codes` | Rate limits and emailed codes. |
| Script properties | `settings` + function secrets | `REWARDS_START`, `VERIFY_POSTING`, `SITE_CONFIG`; keys go to secrets. |
| Drive photos | Storage bucket `photos` | Paths `<userId>/...`; migrated files at `migrated/<driveFileId>.jpg`. |

Passwords: Supabase stores bcrypt hashes, so old hashes can't be loaded directly. The script creates each
user with a random password and copies the old hash to `legacy_passwords`. On the first sign-in the
function checks the old hash, sets it as the real password and deletes the old one. Nobody has to reset.

## Steps

1. **Owner creates the accounts** (free tiers): a Supabase project (region Frankfurt, close to Israel) and
   a Resend account with the sending domain verified (SPF + DKIM).
2. **Schema**: Supabase dashboard → SQL editor → paste `schema.sql` → Run.
   Authentication → Providers → Email: on; "Confirm email": off (the app sends its own codes).
3. **Secrets** (Dashboard → Edge Functions → Secrets, or `supabase secrets set`), names only here:
   `RESEND_API_KEY`, `MAIL_FROM`, `ALLOWED_ORIGINS` (the app's URL), optional `MAIL_DAILY_LIMIT`.
   Later: `OPENAI_API_KEY`, `OPENAI_MODEL`, `STRAVA_CLIENT_ID`, `STRAVA_CLIENT_SECRET`.
   `SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` are provided by Supabase.
4. **Deploy**: `supabase link --project-ref <ref>` then `supabase functions deploy api --no-verify-jwt`.
5. **Try it with no real data**: build the app with
   `VITE_BACKEND=supabase VITE_SUPABASE_URL=https://<ref>.supabase.co VITE_SUPABASE_ANON_KEY=<anon key> npm run build`
   (the anon key is public by design). Sign up, fill a week, post, see the feed.
6. **Export the Sheet**: File → Download → CSV, once per tab (Users, Weeks, Docs, Posts, Duels, DuelChat,
   Ledger, Events, Messages, Analytics, Invites), into one folder named `<Tab>.csv`. Note the Script
   properties `REWARDS_START` and `VERIFY_SINCE`. Keep the folder off GitHub (it has personal data).
7. **Dry run**: `node backend/supabase/migrate-from-sheets.mjs --csv <folder> --rewards-start <REWARDS_START> --verify-since <VERIFY_SINCE>`
   and read `migration-out/data.sql`.
8. **Create users** (on the owner's computer; the key stays in the shell):
   `SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node backend/supabase/migrate-from-sheets.mjs --csv <folder> --rewards-start ... --verify-since ... --create-users`
   It is re-runnable (keeps `migration-out/id-map.json`).
9. **Load data**: run `migration-out/data.sql` in the SQL editor (or `psql`).
10. **Photos** (TODO script): for each Drive file id in the photo columns, download from the photos folder
    and upload to bucket `photos` as `migrated/<id>.jpg` (Drive "Download folder" + `supabase storage cp`).
11. **Check**: for a few users compare `rewards` balance/level on both servers (they use the same rules;
    `tests/supabase-logic.test.ts` proves it on test data), feed and weeks.
12. **Dual run → switch**: new build with `VITE_BACKEND=supabase` for testers, then everyone. Keep the
    Sheet read-only for 30 days. Port the "not yet" areas before switching the whole audience.

## Checked so far (without any account)
- `schema.sql` applied twice to a local Postgres 16 with small stand-ins for `auth`/`storage`; RLS tried
  as different users: friends-only posts, hidden posts, blocking both ways, story-reply privacy,
  no self-promotion to admin, no forged ledger rows or team posts, `put_weeks` rejects older data.
- The export script on CSVs made from the test Sheet (quotes, commas, line breaks, Hebrew), loaded into
  that database: all rows and links arrive.
- `deno check` and `deno lint` on the functions.
