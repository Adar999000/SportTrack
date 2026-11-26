# משמעת אישית — Personal Discipline

A mobile-first, Hebrew (RTL) Progressive Web App for tracking weekly habits and weight. It copies the paper-style Word tracker: one table per week, Sunday to Saturday, with healthy breakfast, lunch and dinner, sport activity, and an optional smoking row.

- Works offline. Data is saved on the device first (IndexedDB).
- **Optional accounts:** with the Google Apps Script backend in [`apps-script/`](apps-script/README.md), users sign in and their data syncs to a spreadsheet in the owner's Drive. That adds profiles with photos, a weekly photo, an admin panel across all users, and an AI assistant (OpenAI). Without the backend URL, the app runs local-only with no login.
- Installable as a PWA (manifest + service worker), with light and dark mode.

Releases are listed in [CHANGELOG.md](CHANGELOG.md). The version comes from `package.json`, is shown in Settings, and the in-app "What's new" list lives in `src/version.ts`.

The UI is available in Hebrew and English. Hebrew strings are the keys; English lives in `src/i18n-en.ts`. Run `node scripts/i18n-keys.mjs --missing` to find untranslated strings; a test fails if any are missing.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active) at http://localhost:4173
```

Requires Node 18+.

`npm run build:artifact` builds a single self-contained HTML preview (no service worker, sample data flagged in the UI) into `dist-artifact/mishmaat-ishit.html`.

## Live site

Every push to the default branch runs the tests, builds, and deploys to GitHub Pages
(`.github/workflows/deploy.yml`): **https://adar999000.github.io/SportTrack/**

One-time setup: repository **Settings → Pages → Build and deployment → Source: GitHub Actions**,
then re-run the workflow (Actions tab → *Deploy to GitHub Pages* → *Run workflow*).

The site only contains the app's code. Your entries live in your own browser's storage on each device,
so nobody who opens the URL can see them.

## Install as an app

The service worker only runs over **HTTPS** (or `localhost`). Deploy `dist/` to any static host, such as GitHub Pages, Netlify or Cloudflare Pages. All paths are relative, so a sub-folder works too.

- **Android / Chrome:** open the site, then menu → *Install app* / *Add to Home screen*.
- **iPhone / Safari:** Share → *Add to Home Screen*. Notifications on iOS need iOS 16.4+ and the app installed to the home screen.
- **Desktop Chrome/Edge:** use the install icon in the address bar.

## Using it

- **שבוע (Week):** the current week opens automatically. The panel at the top has big buttons for today. Below it is the full week table, with today's column highlighted.
  - Meal cells cycle on tap: empty → V → X → - → empty.
  - Sport cells open a sheet. Pick a type, add a distance or duration, or type free text. You can also mark X or -, and add your own types.
  - Entries starting with חופשה / מנוחה / צימר are logged but **don't count as workouts**. You can override this with the "נחשב כאימון" checkbox.
  - Change weeks with the arrows or by swiping.
- **היסטוריה (History):** every week with its weight, workout count and meal V%. Missing weeks show as gaps with an "add" link. You can open any date's week.
- **סטטיסטיקה (Stats):** weight chart (weeks with no weigh-in are gaps, not interpolated) with a dashed trend line per quarter. Also min/max/current/total change, streaks, a monthly table, a quarterly "phases" table, and plain factual warnings.
- **הגדרות (Settings):** smoking row on/off, theme, custom sport types, reminders, JSON/CSV export, JSON backup import, and Word import.

## Security

Layered, mostly on the server (`apps-script/Code.gs`):
1. **Passwords:** salted, 5,000-round SHA-256 (v2), constant-time comparison, minimum 8 characters, common passwords refused.
2. **Brute force:** 5 failed sign-ins lock the email for 15 minutes; password-reset codes allow 5 tries and one email a minute.
3. **Two-step sign-in** by emailed code: always on for admins unless they turn it off, optional for users.
4. **Sessions:** HMAC-signed tokens with expiry and a per-user version, so a password change or "sign out of all devices" revokes the others.
5. **Authorization:** users read only their own data; admins get aggregates only (`userSummary`), never raw weeks, notes or weekly photos; assistant actions are validated server-side and never run on other users' data.
6. **Abuse limits:** sign-ups per hour, messages per day, assistant messages per user/day, payload sizes.
7. **Audit log** (`Audit` tab) for security events, never passwords or codes.
8. **Browser:** Content-Security-Policy, strict referrer policy, no `innerHTML` with user data.
9. **Storage:** the spreadsheet and photos folder are private to the owner's Drive. The OpenAI key lives only in script properties.

## Accessibility

Built to Israeli Standard 5568 / WCAG 2.0 AA: keyboard navigation, visible focus, a skip link, labels, announced errors, reduced motion, and an accessibility menu. `#accessibility` holds the accessibility statement and a contact form. Automated checks use axe-core, but have the site reviewed by an accessibility expert too: automated tools don't catch everything.

## Coins, levels and challenges

Rewards are calculated on the server (`rewardsFor` in `apps-script/Code.gs`) from each user's own data, so a modified client can't award itself coins. Spending is recorded in the `Ledger` tab. The rules are listed in [CHANGELOG.md](CHANGELOG.md) under 2.0.0 and in the app under *How do I earn coins?* Rewards count from the day the feature went live, or from signup for newer users. Earlier history gives a one-time bonus capped at 500.

## Stats definitions

| Metric | Definition |
|---|---|
| Workout | Sport cell marked done (V) whose label isn't vacation/rest |
| Meal V% | V ÷ (V + X). Cells with "-" or empty are ignored |
| Monthly figures | Days are grouped by their own date (a week can span two months); weights by the week's Sunday; future days are excluded |
| Workouts / week | Workout days in the month ÷ tracked days × 7 |
| Smoking % | כן ÷ (כן + לא) |
| Lunch streak | Consecutive days with lunch V. "-" neither counts nor breaks it; X, empty or a missing week breaks it; today still being empty doesn't break it |
| ≥3-workout streak | Consecutive weeks with 3+ workouts. A missing week breaks it; the current week can only extend it |
| Phases | Least-squares line through each calendar quarter's weekly weights (2+ weigh-ins) |

## Importing the Word tracker (.docx)

Settings → *ייבוא מקובץ Word*. The file is parsed entirely in the browser: `fflate` unzips it and a small scanner reads `word/document.xml`. A preview lists every week before anything is saved, and weeks that already exist are skipped.

What the parser understands:

- Week headers like `תאריך 22/11/26 עד 28/11/26`. It also accepts `תאריך - 9/4/23 עד ...`, `תאריך -2/4/23 ...`, and 1- or 2-digit day/month with a 2- or 4-digit year.
- `משקל התחלתי: 104.2 ק"ג` on its own line or on the date line. A missing weight is fine.
- A table whose first column is the task name and whose next seven columns are Sunday to Saturday. Columns are mapped from the header row when possible.
- Row labels: `ארוחת בוקר`, `ארוחת צהריים` / `ארוחת צהרים`, `ארוחת ערב`, `פעילות ספורט`, `מעשן?` / `מעשן סיגריה?`.
- Cells: V, X, -, empty, or free text for sport (multi-line text is joined), and כן/לא for smoking.
- A start date that isn't a Sunday is moved to its week's Sunday and flagged in the preview. Duplicate weeks inside the file keep the first one.

## Reminders

- **Daily "עדכן את היום"** at a time you choose. It is only shown if today isn't fully filled in yet.
- **Sunday weight reminder** if the new week has no starting weight. An in-app banner also shows on Sundays.

Limits: browsers can't schedule local notifications at an exact time without a server. Reminders fire whenever the app is open or brought back to the foreground after the chosen time. On Chromium-based browsers with the app **installed**, Periodic Background Sync also lets the browser wake the service worker in the background. The browser decides how often (usually a few times a day at most), so delivery isn't guaranteed.

## Export formats

- **JSON:** `{ app, version, exportedAt, settings, weeks: Week[] }`. It can be imported back by merging (skip existing weeks) or replacing everything.
- **CSV:** one row per day, UTF-8 with a BOM so Excel shows Hebrew correctly.

## Project layout

```
src/
  types.ts, dates.ts, model.ts   data model, date math (DST-safe), cell cycling, sport classification
  db.ts, store.ts                IndexedDB key/value store (shared with the SW) + in-memory state
  stats.ts                       pure stats functions
  docx/                          .docx → blocks → weeks
  io.ts                          JSON/CSV export, JSON import
  reminders*.ts, sw.ts           notifications + service worker (Workbox precache)
  ui/                            vanilla-TS views (week, sport sheet, history, stats/chart, settings, import preview)
tests/                           vitest unit tests for stats and the docx parser
```
