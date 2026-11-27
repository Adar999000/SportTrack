# Scaling plan: from Google Sheets to a real backend

## Where we are
- Backend: Google Apps Script web app reading and writing a Google Sheet; photos in Drive; email via MailApp.
- Good for: up to a few hundred active users, a few dozen at the same time.
- Hard limits of a free Google account (approximate, they change):
  - ~30 simultaneous script executions; requests beyond that wait or fail.
  - 6 minutes per execution; daily totals for UrlFetch and triggers.
  - ~100 emails a day (MailApp).
  - Every request reads whole sheets. Feed/stories now read only the newest rows, but Users/Weeks still grow linearly.
  - No push notifications when the app is closed (Web Push needs crypto Apps Script doesn't have).

## Warning signs (watch in Admin)
- Load test p95 above ~5 s at the expected peak (`node scripts/load-test.mjs --url <test copy> --users 50`).
- "Mails left today" hitting the reserve often.
- Errors card showing timeouts / "Service invoked too many times".
- More than ~300 weekly active users, or ~50 people active in the same hour.

## Target architecture (recommended: Supabase)
| Need | Today | Target |
|---|---|---|
| Database | Sheets | Postgres (Supabase), row-level security per user |
| Auth | own tokens + email codes | Supabase Auth (email OTP, Google / Apple sign-in) |
| Photos | Drive | Supabase Storage (public CDN for team images, signed URLs for private) |
| Email | MailApp (~100/day) | Resend / Postmark (thousands/day, SPF+DKIM, no spam folder) |
| Push | none | Web Push (VAPID) from an Edge Function, iOS 16.4+ when installed |
| Server logic | server.js | Edge Functions (TypeScript) – rewards, duels, leagues, AI |
| Realtime | polling every 8 s | Supabase Realtime channels (duel chat, stories) |
| Cron | Apps Script triggers | pg_cron / scheduled Edge Functions (backups, settle duels) |

Why Supabase over Firebase: relational data (weeks, duels, leagues, ledger) fits SQL; free tier is enough to start; open source, no lock-in; Postgres backups.

## Migration steps (no downtime)
1. Owner creates a Supabase project and a Resend account (free); keys go into project secrets, never into chat or code.
2. Add a backend adapter in the client (`api.ts` already funnels every call through `call(action, payload)`): same action names, new transport.
3. Port actions one area at a time with the existing test suite (tests/*.test.ts) as the contract: auth → weeks/docs → rewards → feed/stories → duels/leagues → admin.
4. One-time export script: Sheets → Postgres (users keep passwords via a "set new password" email, or keep the same hash format).
5. Dual-run: new sign-ups on Supabase behind a flag, compare, then switch everyone; keep the Sheet read-only for 30 days.
6. Add push notifications and realtime chat once on the new backend.

Estimated effort with the current codebase and tests: 3–5 focused working days.
