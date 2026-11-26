# Changelog

## 4.1.0 (2026-11-26)
- Server updates without the Apps Script API (which a default Apps Script project can't call): `Code.gs` is now a stable loader that fetches `apps-script/server.js` from GitHub, caches it 10 minutes, keeps the last good copy in Drive and runs it in its own scope. A broken or unreachable file never replaces working code. "Update now" refreshes at once. The API-based self-update was removed.

## 4.0.4 (2026-11-26)
- Self-update catch-up works even when the code was installed by an older server (newest version read from the project).

## 4.0.3 (2026-11-26)
- App points at the new deployment URL.
- Self-update moves every web-app deployment to the new version (not one hard-coded ID), and on later runs catches up any deployment that lags behind.

## 4.0.2 (2026-11-26)
- Top bar: the profile picture sits next to the level/coins chip; the app logo is back beside the name.

## 4.0.1 (2026-11-26)
- Top bar: the signed-in user's profile picture (with their frame) replaces the app logo and opens the Me screen; visitors still see the logo.

## 4.0.0 (2026-11-26)
**Simple mode** (feedback: "as little as possible").
- 3 tabs: Today · Progress · Me (admin moved into Me).
- Today: today ring + the table only. Note, photo and "Customize" (edit table / new tracker) are small links under the table; the tracker bar appears only once you have a tracker; no quote, no daily progress row.
- Progress: stats + history on one screen.
- Me: one menu (coins & store, community & challenges, AI assistant, contact the admin, invite friends, settings, admin), details and account folded; back link to Me on pages opened from it.
- Floating AI button off by default (Settings toggle; still shown for visitors and when an admin reply is unread). Flatter visuals, smaller accessibility button, shorter tours.

## 3.9.0 (2026-11-26)
- Server self-update: hourly trigger (and Admin → Server → "Update now") pulls `apps-script/Code.gs` + `appsscript.json` from GitHub, updates the project through the Apps Script API, creates a version and redeploys the existing deployment (same URL). Sanity checks before installing; `status` returns `serverVersion`. One-time setup in `apps-script/README.md` (enable the Apps Script API, explicit manifest scopes).

## 3.8.0 (2026-11-26)
- Friend challenges (Community → Challenges): metric (workouts, runs, healthy meals, full days, coins), 3–30 days, invite friends or share a code/link (`#duel-CODE`). Scores are computed on the server from each member's own data; finished challenges settle once and the winner(s) get 100 coins (ledger `duel:<id>`). Endpoints `duels`, `createDuel`, `respondDuel`, `joinDuel`, `leaveDuel`, `friends`.
- Admin usage analytics: batched client event counts (`track`), aggregated per day in the `Analytics` sheet (counts + distinct users, no content); admin dashboard with DAU/WAU/MAU, daily active chart, top features and screens (7/30/90 days). Privacy policy updated. Removed with the account.
- Store redesign: hero with wallet, category tabs, "new"/"popular" ribbons, owned tags, "try" preview for colors/backgrounds/confetti, "only what I can afford" filter, shortfall shown on the button.
- Table polish: row icons, today column highlight, gradient marks, daily progress row; today panel ring + motivation quote; stats tables with zebra rows, mini bars and colored trends.
- Needs the updated `apps-script/Code.gs`.

## 3.7.0 (2026-11-26)
- Custom trackers: by-day (rows × Sunday–Saturday, saved per week) or free grid (your own rows and columns). Per-row cell types: V/X/-, check, mood emoji, 1–5 stars, number with unit, text. Templates, icon, corner title, reorder/delete. Synced as small documents (`Docs` sheet, `getDocs`/`putDocs`).
- Main table: rename rows and the corner title, add your own extra rows (stored in `week.extra`; coins and stats unchanged).
- Community tab: posts with photo, likes, comments, per-post visibility (everyone / friends = invite relations), report (3 reports hide a post), admin moderation queue.
- Achievement sharing: in-app post and a 1080×1350 image through the device share sheet (Instagram, WhatsApp…) or download.
- Competitions: users suggest, the admin approves/adds (`Events` sheet). No external feed yet (no reliable open API for Israeli events).
- Needs the updated `apps-script/Code.gs`.

## 3.6.0 (2026-11-26)
- Assistant characters: lion, robot, dog and panda are free; 12 more (cat, frog, tiger, fox, bear, koala, monkey, penguin, owl, weightlifter, unicorn, dragon) are store items (`mascot` kind).
- Assistant styles (`acc` kind): glowing auras behind the character (mint, ocean, sunset, gold, galaxy, flames, rainbow) and a corner badge (heart, flame, party, star, medal, trophy). Level 3 now also gives the mint aura.
- Needs the updated `apps-script/Code.gs` for the new store items.

## 3.5.0 (2026-11-26)
- 3D assistant characters (Microsoft Fluent Emoji 3D, MIT): lion (default), tiger, fox, panda, bear, dog, owl, weightlifter, plus the drawn robot. Picker in Settings → "Assistant character"; changes everywhere at once. Images are local WebP (~7 KB each), cached for offline.

## 3.4.0 (2026-11-26)
- Original animated AI mascot (round robot: blinks, floats, waves, glowing antenna) for the floating button, chat replies and the empty-chat hero.
- Livelier chat panel: aurora background, pop-in panel/bubbles/suggestions, colorful typing dots, sparkles, input glow. All motion stops with reduced motion / the accessibility "stop animations" option.

## 3.3.0 (2026-11-26)
- Weight chart: time runs left→right, range filter (3m / 6m / 1y / 2y / all, remembered), emoji markers (🚩 start, 🏆 lowest, ⛰️ highest, 📍 now), 🎯 goal line, 🏖️ vacation weeks, in-range summary.
- 15 levels (up to 32,000 lifetime coins, then a ⭐ per 10,000) with server-enforced perks: extra daily assistant messages, free items, 10/20/30% store discounts, everything free at level 15.
- Rewards page: levels-and-perks table, earning table and a "what it means" section.
- Store by category: app colors (+indigo, coral, olive, plum), backgrounds (sand, ocean, forest, blush, midnight), profile frames shown on the leaderboard (silver, gold, fire, rainbow, diamond) and a confetti effect when today's row is complete.
- Full pre-join history counts toward coins and level once the admin approves it (admin user page toggle); the admin is auto-approved. Otherwise the capped 500 starting bonus stays.
- New endpoints `setFrame`, `approveHistory`; `spend` accepts `cosmetic`. Needs the updated `apps-script/Code.gs`.

## 3.2.0 (2026-11-26)
- Landing page: top menu with section links (☰ menu on phones), light/dark toggle, sign-in/sign-up in the header.
- Visitor support assistant (signed-out): app-only questions via `publicChat` (no user data, 15 questions/day per visitor, 200/day overall) and a "Contact the admin" tab using the public contact form.
- Account deletion by the user (password + typed confirmation): deletes weeks, ledger, messages, personal invite codes, photos and the user row. The only admin can't delete themselves.
- Admin panel → "Site settings, AI budget and backups": accessibility coordinator (shown in the accessibility statement), a monthly AI budget cap (real cost from OpenAI `usage`, default $5; the assistant stops at the cap), and daily automatic spreadsheet backups into Drive/"גיבויים" (keeps 14) plus "Back up now".
- Needs the updated `apps-script/Code.gs`; run `setup` once more to install the daily backup trigger.

## 3.1.0 (2026-11-26)
**Security (layered)**
- Sign-in lockout: 5 wrong passwords lock the account for 15 minutes; failures are logged.
- Two-step sign-in by emailed code (on by default for admins, optional for users; changing it needs the password).
- Password hashes v2 (5,000 SHA-256 rounds, constant-time compare); legacy hashes upgrade on the next sign-in. Minimum 8 characters, common passwords refused.
- Session tokens carry a per-user version: changing the password or "sign out of all devices" revokes every other session. New signing key (`TOKEN_SECRET_V2`), token lifetime 60 days.
- Limits: 30 sign-ups an hour, field lengths, 20 KB per week, profile fields whitelisted.
- `Audit` tab: sign-ins, failures, lockouts, 2FA, password changes and resets, admin views, role changes; viewable in the admin panel.
- Content-Security-Policy (scripts from the site only; network only to the backend and Google Fonts) and a strict referrer policy.
- Verified: the spreadsheet and Drive folders are shared with the owner only.

**Accessibility**
- Accessibility menu (wheelchair button) on every page: text size, high contrast, highlighted links, readable font, text spacing, stop animations (saved per device).
- "Skip to main content" link; accessible names for progress bars; contrast fixes. axe-core (WCAG 2 A/AA rules) reports no violations on the landing, accessibility, sign-up, onboarding, week, coins, profile, settings and admin screens.
- Accessibility statement (`#accessibility`) and privacy policy (`#privacy`) with a public contact form (rate-limited) that reaches the admin inbox.

Needs the updated `apps-script/Code.gs`. After deploying it, everyone signs in once more (new signing key).

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
