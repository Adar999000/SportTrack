# משמעת אישית — Personal Discipline

A mobile-first, Hebrew (RTL) Progressive Web App for tracking weekly habits and weight. It copies the paper-style Word tracker: one table per week, Sunday to Saturday, with healthy breakfast, lunch and dinner, sport activity, and an optional smoking row.

- No backend and no login. All data stays on the device in IndexedDB and works offline.
- Installable as a PWA (manifest + service worker), with light and dark mode.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (vitest)
npm run build      # type-check + production build into dist/
npm run preview    # serve the production build (service worker active) at http://localhost:4173
```

Requires Node 18+.

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
