# Changelog

## 6.10.0 (2026-11-28)
- Backend batch (SERVER_VERSION 6.10.0): T22 `adminFunnel` + `setTestAccount`; T21 anonymous `landing` counters + client `trackLanding`; T13 quest `claimed`/`expiresAt`, `dayDone()`; T26 survey server (`surveyStatus`, `submitSurvey`, `dismissSurvey`, `adminFeedback`, Feedback sheet).

## 6.9.0 (2026-11-28)
- Frontend T14: empty community feed shows an invite link (#share) and, with a saved workout, a share-last-workout story action.

## 6.8.0 (2026-11-28)
- Frontend T12: 2-slide welcome, first Today tour without the AI step, one skip marks both seen. QA T24: `tests/funnel.test.ts` (adminFunnel tests skip until backend T22).

## 6.7.0 (2026-11-28)
- Frontend T23 (admin Funnel card, `src/funnel.ts`), T10 (short onboarding: gender, goals, optional weight that fills this week's start weight; real skip); QA T17 (`tests/e2e/newuser.e2e.mjs`, 4 tests, fresh mock per spec).

## 6.6.0 (2026-11-28)
- Backend T3: `backend/supabase/schema.sql` (all sheets, RLS), one `api` Edge Function with the existing action names (auth, weeks/docs, rewards/store/quest/league, feed/stories; the rest marked NOT_PORTED), `VITE_BACKEND=supabase` transport switch (default unchanged), export script and runbook; 17 new tests. Client error reports go through the normal transport on Supabase.

## 6.5.1 (2026-11-28)
- Spotify search: "Invalid limit" (400) for development-mode apps; search now asks for 10, then 5, then the default.

## 6.5.0 (2026-11-28)
- Merged: frontend T8 (Today first, tappable quest steps), T9 (verify card in the feed), T11 (lighter sign-up, inline errors, show password, 8-char rule), T20 (funnel events, quest card reads questStatus); qa T4 e2e suite (`npm run e2e`, 18 tests, selectors made gender-agnostic); design T18 (install screenshots in the manifest, recap template); pm T25 spec; growth T26 spec; content T27 help Q&A (he/en).

## 6.4.0 (2026-11-27)
- Landing v2 from growth's spec (team/specs/landing-v2.md): 30-second lead, steps right under the hero, four core features with the rest folded under "More features", the mock labeled as an example (no named person), FAQ: cost, no friends needed, missed day.
- Merged pm T19 (beta metrics spec), content T16, growth T15.

## 6.3.0 (2026-11-27)
- Training plans (frontend T2): `src/plans.ts`, `#plans`, Today plan card; synced doc `plan:active`; 11 tests.
- Copy (content T6): 13 English fixes, 54 feminine entries, `docs/help.md`; "חד\"כ" = Gym.

## 6.2.0 (2026-11-27)
- Team work merged: product review and backlog (pm), six new team cards + generator (design), launch kit `docs/growth.md` (growth).
- Team content calendar: one designed tip post every 3 days (`TEAM_DRIP`, `TEAM_DRIP_N/LAST`).

## 6.1.3 (2026-11-27)
- Week actions under the table are icon buttons (note, photo, lock/unlock with pressed state, customize) instead of text links and a lock emoji.

## 6.1.2 (2026-11-27)
- Fix: the floating assistant button jumped to the right after dragging (in RTL, resetting `inset-inline-end` after setting `left` cleared it). No more snapping to a side; a spot the user chose is never auto-tucked.

## 6.1.1 (2026-11-27)
- Landing aligned with the app: interactive Today mock (rings follow taps) instead of the old table + chat, store/levels copy matches the catalog and real level numbers, steps match onboarding, safety section mentions verification/reporting/blocking.
- `#about` (or `#home`) shows the landing page even when signed in; linked from Me.

## 6.1.0 (2026-11-27)
- Terms of use page (`#terms`) with health disclaimer and minimum age 16; consent checkbox at sign-up, stored as `consentAt` on the account.
- Email verification (`sendVerifyCode`, `verifyEmail`, `emailVerified` on the user): posting, comments, challenges and challenge chat need a verified email (`VERIFY_POSTING`, admin toggle); accounts created before the first request of this version are grandfathered (`VERIFY_SINCE`).
- Client error reporting (`clientError`, `adminErrors`, `Errors` sheet capped at 3000 rows, emails masked) with an admin card grouped by message.
- Mail quota: `safeMail` keeps the last 20 daily emails for codes (sign-in, reset, verification); admin sees emails left and skipped.
- Scale: feed/stories read only the newest rows (`tailRows`), registration cap raised to 300/hour (`REG_PER_HOUR`), challenge chat polls only while visible. `scripts/load-test.mjs` and `docs/SCALING.md` (Supabase migration plan).

## 6.0.0 (2026-11-27)
- Landing: new hero copy, six new feature tiles, a 12-second demo video (pausable, no autoplay with reduced motion, plays only in view), new FAQ entries; new `og.jpg` share image, canonical, `og:locale`, JSON-LD WebApplication.
- Offline outbox (`src/outbox.ts`): posts and stories created without a connection are kept in IndexedDB and sent on `online` / next launch (`NetworkError` from `call`).
- Full JSON backup v2 with synced documents (GPS workouts, trackers, table setup) and profile; import restores documents (merge keeps existing).
- Settings quick-jump chips (sticky), clearer empty states (Progress, friends feed).
- axe (WCAG 2 A/AA) clean in light and dark on landing, Today, feed, story viewer, challenges, music, goals, settings and Me.

## 5.9.1 (2026-11-27)
- Six team posts with designed images shipped in `public/team/` (seeded once, `TEAM_SEEDED2`); only team posts may show a `data.image`, and only from `team/*.webp`.

## 5.9.0 (2026-11-27)
- Blocking (`blockUser`, `myBlocks`, `hiddenFor`): hides posts, stories, comments and challenge chat both ways; blocked users can't comment on your posts. Report and block from a story's ⋯; reported stories in the admin queue with their photo.
- First-week quest (`questStatus`, `claimQuest`): meal, weigh-in, workout, full day within 14 days of joining pays 100 coins once, verified on the server.
- Group challenges: metric stored as `team:<metric>:<target>`, total progress bar, everyone who contributed gets 50 coins when the goal is met.
- Monthly recap card (1st–3rd), `week` story template takes a `label`.
- Spotify track search; SVG media controls; floating button stays tucked when it would cover content; admin quick-jump chips; privacy policy sections; sender gender in challenge / event emails.

## 5.8.0 (2026-11-27)
- Posts take up to 4 photos (`photos` array; extra ids in `data.photos`, all trashed on delete, visibility checked for each) with a swipeable gallery.
- Stories from the gallery: a Gallery bubble and a first "Gallery" template, up to 5 photos posted as separate stories, optional stats overlay (`ov`: last workout or today).

## 5.7.0 (2026-11-27)
- Gendered Hebrew: `setGender` + `genderize` in i18n ("סמן/י", "את/ה", "קרוב/ה" resolve to the chosen form, final letters handled) and a feminine dictionary (`src/i18n-fem.ts`) for strings written in the masculine.
- Weekly recap card (Saturday evening to Monday) with deltas vs the previous week, one focus, and a new `week` story template.
- Weekly leagues (`league`): groups of 15 by lifetime coins, ranked by this week's coins, top/bottom 3 move.
- Private story replies (author sees all, others only their own); `peopleIndex` falls back to the Users sheet so new users never show as "—".
- Goals take effect: smoking row + smoke-free streak chip, Body & mind / Habits / Gym trackers added once.
- Floating character tucks to the edge while scrolling; the floating accessibility button is off inside the app by default (menu under Me; landing unchanged).
- Landing: real screenshots and iPhone / Android install steps. Admin, settings, store and invite screens load on demand (main bundle −66 KB).

## 5.6.1 (2026-11-27)
- Gender (male / female / not set) in onboarding and profile edit, stored as `profile.gender` (whitelisted); used for Hebrew wording and passed to the assistant.

## 5.6.0 (2026-11-27)
- Stories (24 h): `createPost` kind `story` with a sanitized template (`rings`, `workout`, `achievement`, `photo`, `text`) and background; `stories` returns live stories grouped by person; `viewStory` counts views (owner sees count and names); high-five reuses `likePost`. Stories are kept out of the feed. Workout routes are reduced to a 0–100 shape on the device, so no coordinates are uploaded.
- Story bar, full-screen viewer (progress bars, tap / keys / hold to pause / swipe down), composer with live preview, "Share as story" on a workout.
- Music: Spotify PKCE sign-in in the browser (client ID set by the admin in Admin → Settings), playlists, now playing and play/pause/next on the user's Spotify device (Premium); Spotify / Apple Music embed for any link; mini player in the GPS recorder.
- Onboarding goals (multi-select, stored in `profile.goals`, whitelisted on the server), a simpler 3-step welcome, and "My goals" under Me.
- Skins "Athletic" and "Premium" (from design.md references), `--signal-ink` so badges stay readable on any skin.
- Landing a11y (lang on English text, accessibility link in the header, live region for the demo table, focus rings, 44px targets); page content clears the floating buttons.

## 5.5.0 (2026-11-27)
- Meetups: posts of kind `meetup` (title, time, place, sport) with RSVP (`rsvpPost`), Google Maps link, .ics with a 1-hour alarm, and an on-device reminder.
- Challenge chat (`duelChat` / `duelSay`, `DuelChat` sheet), members only, refreshes every 8 s while open.
- Team posts: admins can post as "צוות משמעת אישית" (official badge); three welcome posts are written once.
- Mascot peeks: a few times a day the character jumps out of its button with a speech bubble (meetup soon, a good time to work out from your usual hours plus Open-Meteo weather near your last GPS workout, insights, motivation). Tap to continue in the chat; toggle in Settings.
- Fixes: the sticky month column no longer overlaps the scrolled cells; "full day" wording only when every task is V (otherwise "day closed").

## 5.4.1 (2026-11-26)
- Settings → Assistant character lists only owned characters plus a "+N in store" tile that opens the store on the characters tab (no more grid of locked, half-loaded tiles).

## 5.4.0 (2026-11-26)
- Today: three activity rings (meals today, sport today, full days this week) instead of one.
- Progress: a bento grid (weight with sparkline, workouts / healthy meals / full days in 30 days, week streak, km recorded).
- Swipe between tabs follows the finger (rubber band at the ends) and slides the next screen in.
- The floating assistant can be dragged anywhere and snaps to the nearest side (remembered). The accessibility button has a small ✕ to hide it; the menu stays in Me → Accessibility, and Settings can show the button again.
- Invite friends: real network glyphs (Simple Icons, CC0) for WhatsApp, Telegram, Facebook, Messenger, X and Gmail, plus email and SMS, in the app's colours.

## 5.3.0 (2026-11-26)
- Tap a day header in the table: a sheet with that day's big buttons; lock/unlock the day there, or the whole week under the table. Locks live in the week (`locked`, `lockedDays`) and the store refuses edits to locked days (also from the assistant).
- GPS workout recorder (`#workout`): run/walk/hike/ride, live time, distance, pace or speed, estimated steps, Leaflet + OpenStreetMap route map, pause/resume, survives reloads, wake lock; saved as synced docs `wo:<id>`, marks the day's sport cell; history with route thumbnails and per-km splits on the Progress screen.
- Smart watches through Strava: OAuth via the Apps Script web app (`doGet` callback, signed state), token refresh, import of runs/walks/hikes/rides with route polylines. Needs `STRAVA_CLIENT_ID` / `STRAVA_CLIENT_SECRET` script properties.
- Voice input in the chat (Web Speech API, he-IL / en-US) with live transcription into the input.
- Chat on phones is a keyboard-aware bottom sheet with a dimmed backdrop; translucent sticky top bar and tab bar; no overscroll bounce.

## 5.2.0 (2026-11-26)
- Skins (store kind `skin`, level-locked): bubbly (Varela Round, pastel, round), feminine elegant (Bellefair serif, rose gold), stadium (pitch stripes), anime (ink outlines, comic shadows, halftone), retro 80s (Karantina, sunset stripes), neon night, leopard (print background), luxe (black and gold). Light and dark variants (neon and luxe are always dark); try-on in the store; picker in Settings.
- Celebrations: overlay for a full day, closing the week (Saturday), level up and new badges (compared with what was seen last), with confetti/stars/fireworks and haptics.
- Transitions: sheets slide in and out, screen cards rise in sequence.
- Smart Today: greeting by time of day, the next task to mark, live chips (lunch streak, workouts this week).
- Proactive assistant: up to two personal notes a day (morning / afternoon / evening / Saturday summary) built on the device from the user's data, delivered into the assistant chat, with a red unread count on the floating button.

## 5.1.0 (2026-11-26)
- Phones: swipe sideways (outside the week table and other scrollers) to move between Today / Progress / Me, following the tab bar direction; slide transition between tabs, fade between other pages.
- Tactile UI: cells and today buttons have a key-like bottom edge and press down; the cell just marked pops; the today ring draws itself on first view; coins page numbers count up; progress bars animate; realistic coin; soft card shadows in light mode; short vibration on taps where supported. All motion respects reduced-motion.

## 5.0.0 (2026-11-26)
**New visual identity: "sports club"** (feedback: the look felt generic/AI-made).
- Ink + off-white with one signal colour (lime #c6f432); the default accent ("Sport") is this look. Dark mode: lime accent on near-black.
- Heebo 800–900 headings and scoreboard numbers; a lime bar before card titles; sharper corners (8–12px), fewer pills.
- Removed purple gradients, glows, aurora backgrounds and sparkles; decorative emoji in navigation/menus replaced by line icons.
- Landing hero: ink band with track lines, lime call-to-action. `--brand` is always ink.
- Scrollable tables are keyboard-focusable regions.

## 4.2.1 (2026-11-26)
- Phones: the assistant opens as a full-screen sheet sized to the visual viewport (follows the on-screen keyboard), no auto-focus on open, 16px input (no iOS zoom), page scroll locked and floating buttons hidden while open.

## 4.2.0 (2026-11-26)
- Store roughly doubled (95 items): 16 more characters (animals and athletes), 5 auras, 12 sports badges, 4 colors, 5 backgrounds (carbon and northern lights are full dark themes), 5 frames (animated "legendary"), star shower and fireworks effects (choose which one plays on a full day).
- Level-locked items (`ITEM_LEVEL` on the server, enforced in `spend`): shown with a lock, "level N" ribbon and how many coins are left; a "By level" store tab; the levels table lists what each level opens.

## 4.1.2 (2026-11-26)
- Floating assistant is on by default again (Settings toggle turns it off); back in the first-run tour.

## 4.1.1 (2026-11-26)
- App points at the loader deployment.

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
