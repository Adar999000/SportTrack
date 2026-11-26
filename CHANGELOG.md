# Changelog

## 2.0.0 (2026-11-26)
- Rewards, computed on the server from each user's data: coins for full days (5), workouts (10), weekly weigh-ins (5), 7-day lunch streaks (20), 4-week workout streaks (50), weekly/monthly/yearly challenges (30/100/500), each kg toward the goal weight (20, at most one a week), reaching the goal (200), keeping it (10), and friends who join (50 + 50). One-time opening bonus for earlier history (max 500).
- Named levels from lifetime coins (spending doesn't lower your level).
- Store: freeze a day (lunch streak) or a week (workout streak), 10 extra assistant messages, special colors (gold, turquoise, red).
- Badges, leaderboard (week / month / all time), recent coin activity.
- Invite page: personal invite link (`#join-CODE` pre-fills the code), share to WhatsApp, Telegram, email, LinkedIn, Facebook, X, SMS or the system share sheet. Every user can invite up to 5 friends.
- Needs the updated `apps-script/Code.gs` (new `Ledger` tab, `extra` and `createdBy` columns).

## 1.3.0 (2026-11-26)
- App color picker in Settings (green, blue, purple, orange, rose, slate), each with light and dark variants checked for contrast. The logo and browser bar follow the chosen color.

## 1.2.0 (2026-11-26)
- Password reset by email: "Forgot password" on the sign-in screen emails a 6-digit code (valid 15 minutes, 5 attempts, at most one email a minute). Needs the updated `apps-script/Code.gs` and the mail permission (run `setup` again).

## 1.1.0 (2026-11-26)
- Double-tap a table cell to write free text (e.g. "חופשה"). Text cells are ignored in V%.
- The "Smoked?" row is hidden by default and can be turned on in Settings.
- Fixed side navigation on wide screens (right in Hebrew, left in English), icon set and app logo.
- Quick light/dark toggle in the header.
- Hebrew and English UI (Settings → Language). The AI assistant answers in the chosen language.
- App version and an in-app "What's new" in Settings; a notice after updates.
- Service worker applies updates immediately.

## 1.0.0 (2026-11-25)
- Accounts with a Google Sheets / Drive backend (Apps Script), invite-only signup.
- Profile with photo and personal analysis, admin panel, weekly photo, AI assistant (OpenAI).
- Weekly table, history, statistics, Word/JSON import, JSON/CSV export, reminders, offline PWA.
