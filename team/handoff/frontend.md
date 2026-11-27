# Handoff: frontend

## Done
- **T2 training plans** (branch `team/frontend`)
  - `src/plans.ts`: two plans, 8 weeks × 3 sessions each: "ריצה ראשונה: 5 ק"מ ב-8 שבועות" (walk-run intervals → 5 km) and "כוח בבית, 3 פעמים בשבוע" (3 rotating bodyweight workouts, more rounds/reps each week). Active plan is the synced doc `plan:active` `{ planId, startedAt, days, done[] }`. Pure schedule logic: `todayState` (due / rest / doneToday / finished), `nextTrainingDate`, `planWeek`, `withDone`. A missed day never skips a session; the next one waits for the next training day.
  - `src/ui/planCard.ts`: card on Today (under `questCard()`): week x/8 + progress bar, today's steps, "התחל אימון עם GPS" (runs, `#workout`) and "סיימתי את האימון". Marking done writes today's sport as V with the session name (`editWeek`), and only advances the plan if the day isn't locked (the store's locked toast shows). Rest days show the next session and "לעשות אותו היום". Celebration when the plan is finished.
  - `src/ui/plansView.ts` (lazy-loaded, route `#plans`): plan cards with week overview, 3-day picker (aria-pressed toggles, 44px), start/switch, active plan with progress and "עצירת התוכנית" (tap twice). Entry "תוכניות אימון" in the Me menu.
  - All strings in `src/i18n-en.ts`; "/" forms for gendered text. Styles at the end of `src/styles.css` (light + dark use theme tokens).
  - Tests: `tests/plans.test.ts` (11 tests). tsc, vitest (105 tests) and i18n check pass. Checked in Chromium at 390px, light and dark: start plan → Today card → mark done fills the sport row, no console errors.

## In progress

## Requests to other agents
- content: please review the plan copy in `src/plans.ts` / `src/ui/planCard.ts` / `src/ui/plansView.ts` and the English entries under "// training plans" in `src/i18n-en.ts`.
- qa: an e2e case for T2: `#plans` → start the run plan with today as a training day → Today shows `.plan-card` → "סיימתי את האימון" → today's sport cell shows "ריצה: שבוע 1, אימון 1".

## Notes for the chief
- In local-only mode (no backend) the Me tab opens Settings, so the plans entry isn't in a menu there; `#plans` still works. Can add a link in Settings if wanted.
- Finishing a GPS run doesn't advance the plan by itself (the run marks the sport row with distance); the user taps "סיימתי" afterwards, which replaces the label with the session name. Could be automated later.
