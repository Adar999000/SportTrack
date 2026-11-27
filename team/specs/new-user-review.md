# New-user journey review (T1)

Author: pm. Method: code walk only (no live run). Path: landing → sign-up → onboarding → Today → first-week quest → community.
Severity: **High** = likely drop-off or broken promise, **Med** = confusion, **Low** = polish.
Owner tags refer to the team table; the chief decides who picks each up.

## Summary
The product promise is strong, but the first 5 minutes ask too much before showing value: a long sign-up (consent + a privacy paragraph), a 6-field profile form, a 4-slide welcome, then a quest card that pushes the real Today screen down. The three biggest wins: (1) make Today the first thing a new user sees and let one tap succeed, (2) make the quest steps tappable and consistent with what onboarding collects, (3) remove dead ends around email verification and an empty community.

## Friction points

### F1. Landing: 10 feature cards and ~9 sections before the first "how it works" — Med
- `src/ui/landingView.ts:152-166` (10 features), `:200-207` (3 steps come after features, coins, peek, install).
- Why: a first-time visitor must scroll past a feature wall (Spotify, Strava, AI, leagues) to learn the 3-step core. The simple habit loop gets buried.
- Fix: move "איך מתחילים" (steps) directly under the hero; collapse features to the 4 core (weekly table, stats, community, offline) with "more" for the rest. Owner: frontend (copy: growth).

### F2. Landing: the hero promise is wider than what a new user gets on day 1 — Low
- `landingView.ts:128` ("מקליטים ריצה עם GPS… עוזר AI… ליגות") vs. an empty account.
- Why: sets expectations the empty state can't meet; the product's actual hook ("30 seconds a day") appears only in the tour (`tour.ts:83`).
- Fix: lead the lead-paragraph with the 30-second habit loop; push GPS/AI/leagues to a second line. Owner: growth proposes text, chief applies.

### F3. Landing "peek" video and mock use fake sample data (520 coins, "עומר" story, "ליגת זהב · מקום 2") — Low (policy)
- `landingView.ts:138,140,142-143`.
- Why: decisions.md says "no fake users or fake activity". A named person's story in a hero mock reads as real activity.
- Fix: label the mock "דוגמה" / "Example", and use a generic name. Owner: frontend.

### F4. Sign-up: consent block + privacy paragraph + invite field all on one screen — High
- `src/ui/authView.ts:90-99` (name, email, password, invite, consent checkbox, long privacy hint, submit).
- Why: 7 elements and a 40-word privacy paragraph before the button; the privacy text duplicates the linked policy. The consent checkbox uses `required` but the form is `novalidate`, so the only feedback is the generic error at `:119-123` far from the checkbox.
- Fix: collapse the invite code behind "יש לי קוד הזמנה" (auto-open when `inviteCode` is set); shorten the privacy hint to one line + link; show the consent error next to the checkbox and set `aria-describedby`. Owner: frontend.

### F5. Sign-up: password rules are inconsistent and not shown until failure — Med
- `authView.ts:41` (reset says "8 תווים לפחות" but input has `minlength: 6`), `:93` (register `minlength: 8`), `novalidate` on forms means native `minlength` never fires.
- Why: the reset form's attribute contradicts its label; server rejection text is the first time users learn the rule.
- Fix: align reset `minlength` to 8; validate client-side with an inline message under the field; add a show-password toggle. Owner: frontend (server rule check: backend).

### F6. Sign-up: first user becomes admin and sees different copy — Low
- `authView.ts:109-113`.
- Why: a status call on every sign-up render; on a network failure it silently falls through (`.catch(() => {})`), so a real first user would see the invite field and think they need a code.
- Fix: acceptable for beta; note in QA e2e. No change needed beyond a test. Owner: qa.

### F7. Email verification is a dead end for community — High
- Gate lives in `src/ui/profileView.ts:26-48` (verify card on Profile only); posting is blocked server-side, and `feedView.ts` composer (`:197+`) has no inline verify prompt (grep shows no `emailVerified` in feed UI).
- Why: a new user taps Community, writes a post, and gets an error toast; they must discover the card on a different page. This is the most likely "community is broken" moment.
- Fix: in the feed, when `emailVerified === false`, replace the composer with the same verify card (reuse `verifyCard`) and a one-line reason; after success return to the feed. Owner: frontend (export `verifyCard`).

### F8. Onboarding form: 6+ fields, all optional, one of them duplicated — High
- `profileView.ts:62-92`: gender, goal chips, photo, name (already typed at sign-up), birth date, height, goal weight, free-text goal.
- Why: asks for the name twice, and "goal weight" + chips + free-text goal overlap. Heading says "אפשר לדלג על כל שדה" (`:128`) but there is no Skip button, just "שמור והמשך".
- Fix: step 1 = gender + goal chips only ("שמור והמשך"); everything else moves to Profile edit with a gentle "complete your profile" card later. Prefill and hide the name; add an explicit "דלג" button. Owner: frontend.

### F9. Onboarding collects goal weight but not the current weight that the quest needs — Med
- `profileView.ts:84` (goalWeight) vs `questCard.ts:185` (quest step 2 needs `startWeight`, which is only entered in the week table, `tour.ts:18`).
- Why: user has just typed a goal weight, then is told on Today to "enter starting weight" as a separate chore.
- Fix: add an optional "משקל נוכחי" field at the end of onboarding that writes this week's `startWeight` (completes quest step 2 immediately, giving a quick win). Owner: frontend (storage already exists in store).

### F10. Welcome + tour stack: 4 slides, then 4 spotlight steps on the very first Today — Med
- `tour.ts:66-77` (welcome, then `week` tour at 700ms), `:82-87` slides, `:15-21` steps.
- Why: 8 consecutive overlays before the user touches anything; welcome slide 1 ("שלושה צעדים") repeats the landing page; skipping is per overlay, so users hit "דלג" twice. Tour step 4 points at the AI FAB which isn't part of the core loop.
- Fix: merge into a single 2-slide welcome (mark / weigh), drop the AI step from the first tour, and make one "דלג" skip everything. Don't start the week tour until the user has tapped one cell (or after the first visit). Owner: frontend.

### F11. Quest card sits above Today and pushes the main task down — High
- `src/ui/weekView.ts:417-418`: `questCard()` renders before `todayPanel(today)`.
- Why: on a phone the first thing under the header is a 4-item checklist, so the V/X buttons (the core action) are below the fold on small screens. The quest also competes with `monthlySummaryCard()||weeklySummaryCard()` above it.
- Fix: render the Today panel first and the quest card after it (or as a compact one-line progress strip that expands on tap). Owner: frontend.

### F12. Quest steps are not tappable and "full day" step is hard to understand — Med
- `questCard.ts:194-195`: list items are static text. Step 4 ("לסגור יום מלא") requires 3 meals + sport (`done(d) >= 4`, `:173,187`); but the Today panel hides the sport row's meaning for non-sporty users.
- Why: users see a checklist but no path to complete it; "full day" silently needs sport, so a rest-day user can never finish today.
- Fix: each unfinished step becomes a button that scrolls/focuses the relevant control (meal row, `#start-weight`, sport sheet); step 4 text becomes "ארוחות + ספורט ביום אחד" and allows a "-" (not relevant) sport mark to count. Owner: frontend (rule change: needs chief+backend since the server re-checks before paying, `questCard.ts:160`).

### F13. Quest dependence on a 14-day window is invisible and the card can vanish unclaimed — Med
- `questCard.ts:179-180` hides the card 14 days after `createdAt`; nothing tells the user a deadline exists.
- Why: a user who completes 3/4 and returns on day 15 loses the 100 coins with no explanation. `localStorage` flag (`:178`) also means a second device re-shows a claimed quest until the server refuses.
- Fix: show "נשארו N ימים" on the card; at day 12 show a banner; for the second-device case, ask the server (`claimQuest` result `paid:false` → hide). Owner: frontend (+ backend for a `questStatus` field on the user object).

### F14. Quest claim: 100 coins promised but no explanation of what coins do — Low
- `questCard.ts:190` and landing "מטבעות" section; the Today screen never says what coins buy.
- Fix: one sentence under the claim button ("מטבעות קונים סקינים וצבעים בחנות") linking to Rewards. Owner: content (copy), frontend (link).

### F15. Empty community: first-time user sees "no posts" and a composer — Med
- `feedView.ts:197-203` (empty states: "עוד אין פוסטים. היו הראשונים…"), and official team posts exist only if the admin published them.
- Why: with a small beta the feed is empty most of the time; the call to action is "be first to post", which is the highest-effort action for a new user. No prompt to invite a friend, which is the actual driver of retention.
- Fix: empty state offers 2 buttons: "הזמן חבר (50 מטבעות)" → share page, and "שתף את האימון הראשון" once a workout exists. Keep official team cards (T5) as the default content so the feed is never blank. Owner: frontend (+ design for cards, T5).

### F16. Navigation: community, rewards, music, goals live under "אני"; new users don't find them — Low
- `tour.ts:86` ("באזור 'אני' יש קהילה, מוזיקה וחנות") and `main.ts:197` (`fromMe` list).
- Fix: after the quest is done, show a one-time "next steps" card (invite a friend / join a challenge). Owner: frontend.

## What works well (keep)
- Landing is accessible (labelled controls, reduced-motion handling, pausable video).
- Interactive Today mock on the landing page teaches the V/X/– loop (`landingView.ts:79-110`).
- Quest design (4 small steps, server re-check) is a good activation device.
- Offline-first post queue (`feedView.ts` composer) is a real strength.

## Suggested metrics (for backend/qa to confirm instrumentation exists via `src/analytics.ts`)
sign-up started → completed; onboarding completed vs skipped; first mark within 24h; quest steps 1-4; email verified; first post; first invite sent.
