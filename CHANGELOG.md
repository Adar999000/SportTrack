# Changelog

## 3.0.0 (2026-11-26)
- Floating AI assistant on every signed-in screen (replaces the Assistant tab; the tab is now "Coins"). It can perform actions through OpenAI tool calls: mark a meal, log sport, set the weekly weight, write a note or cell text, open a page, contact the admin. The server validates calls (last 60 days, sane values); data changes are applied on the device with an undo, and admin views of other users get no write tools.
- Messages to the admin: users write from the assistant panel (or ask the assistant). Admins get an email and an inbox in the admin panel; replies reach the user in the app and by email. Unread badge on the floating button.
- AI mark (sparkles / "AI" pill) on every AI feature.
- Onboarding: a three-slide welcome for new users, then a guided tour the first time each screen is opened (Settings → Intro guides → Show again).
- Landing page redesign: brand hero with a phone mock-up (table, coins, AI chat), coins/levels band, FAQ, mobile sticky sign-up bar, "Developed by AZ Creative" (also in Settings).
- Needs the updated `apps-script/Code.gs` (new `Messages` tab).

## 2.4.0 (2026-11-26)
- Open sign-up: no invite code needed. A code is optional; joining with one gives the new user 50 coins and the inviter 50 (+50 after the friend's first full week, paid for up to 5 friends).
- Each user has one permanent personal invite code that works for any number of sign-ups (admin-panel codes stay single-use).
- "Install the app" button on the landing page and in Settings: uses the browser's install prompt where available (Android/Chrome/Edge) and shows step-by-step instructions on iPhone.
- Needs the updated `apps-script/Code.gs` (Invites tab gets a `multi` column).

## 2.3.0 (2026-11-26)
- Daily challenge: all three meals V on a day earns 15 coins and a "Perfect day" badge; today's progress is shown with the other challenges.
- The coins page explains when the server hasn't been updated yet instead of loading forever.

## 2.2.0 (2026-11-26)
- Landing page for signed-out visitors: hero with an interactive weekly-table demo, features, how to start, the "you don't drown by falling" quote, privacy note, and sign-in / sign-up buttons. `#login` and `#signup` open the forms directly; invite links still go straight to sign-up.
- Open Graph / Twitter tags and a 1200×630 preview image (`public/og.png`) for shared links.

## 2.1.0 (2026-11-26)
- AI assistant is limited to the app: the user's data and progress, using the app, coins/levels/challenges and the tracked habits. Anything else gets a one-line refusal.
- Admin privacy: admins get aggregates only. That means monthly workouts per week, healthy-meal %, weight change, activity and level. No raw weeks, notes, cell text, weekly photos, birth date, height, goal text or absolute weight. Enforced on the server (`getWeeks`/`rewards` are self-only, new `userSummary`, `listUsers` trimmed, weekly photos owner-only) and in the admin assistant's context.
- Sign-up notice states what the admin can see.

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
