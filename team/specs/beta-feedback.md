# Beta feedback loop (T25)

Author: pm. Builds on `team/specs/beta-metrics.md` (funnel, `adminFunnel`) and the existing support flow (`contactAdmin` → `createMessage`, `adminInbox` / `adminReply` in `apps-script/server.js`; UI in `chatPanel.ts` `supportPanel` and `adminView.ts` `inboxCard`).

Goal: hear from beta users at the two moments that matter (day 3 = did we get them started, day 7 = is it worth coming back), with almost no effort for them and almost none for us.

## 1. In-app micro-survey (day 3 and day 7)

### 1.1 Questions (max 2 each: one 1–5 scale, one optional text)
| Survey | Scale question (1–5) | Optional text |
|---|---|---|
| `d3` (day 3) | "כמה קל היה להתחיל?" · How easy was it to get started? (1 = hard, 5 = very easy) | "מה הכי הפריע או בלבל?" · What got in the way or confused you? |
| `d7` (day 7) | "כמה האפליקציה עוזרת לך להתמיד?" · How much does the app help you stay consistent? (1 = not at all, 5 = a lot) | "מה הדבר האחד שהיית רוצה שנוסיף או נתקן?" · The one thing you'd add or fix? |

Rules: no personal questions, no more than these two fields, scale answered by tapping one of five labelled buttons (not a slider), text max 500 chars, text never required. A "אפשר לחזור אליי" checkbox appears only when text is entered.

### 1.2 When it appears
- **Eligibility (server decides):** user's age in days ≥ 3 for `d3`, ≥ 7 for `d7`; and the user has been active on at least 2 distinct days (Analytics presence) — we do not ask people who never really started; they are covered by the funnel numbers and by the quest/onboarding fixes.
- `d7` is only offered if `d3` was answered or dismissed; never both in one session; never within 24 h of the previous prompt.
- Window: `d3` is offered from day 3 to day 9; `d7` from day 7 to day 14. After the window, the survey is closed for that user.
- Never during onboarding, a workout recording, or while a sheet or dialog is open.

### 1.3 Where and how
- A dismissible **card on the Today screen, below the Today panel** (the quest card order is fixed by T8: Today first), using the existing `.card` style; heading "שתי שאלות קצרות", the scale as five buttons in a `role="radiogroup"` with visible labels, then the optional text field and "שליחה".
- Not a modal, not a toast, no focus stealing; it is announced politely (`aria-live="polite"`) only when the user lands on Today.
- **Dismissal:** "לא עכשיו" hides it and snoozes 2 days (max 2 snoozes per survey); "✕ לא להציג שוב" closes it permanently for that survey. After the second snooze it closes on its own. Both are keyboard accessible.
- **After sending:** the card is replaced by "תודה! זה עוזר לנו" for the session, then disappears; no coins are given (rewards would bias the scores).
- State (answered / dismissed / snoozed-until) is stored **server-side per user**, so a second device doesn't show it again. Offline: the answer is queued with the existing outbox and sent when online (same pattern as posts).

### 1.4 How answers reach the admin
Reuse what exists, add as little as possible:
- **Store:** a new lazy sheet `Feedback` (`userId, at, survey, score, text, wantsReply`), written by a new `submitSurvey` action. Scores are not put into `Messages`, so the support inbox stays for real questions and the daily mail quota (about 100, `safeMail`) is not spent on survey answers. **No email is sent for a survey answer.**
- **Replies:** only when the user ticked "אפשר לחזור אליי" and wrote text, the server also calls the existing `createMessage` with subject `משוב יום 3` / `משוב יום 7`, so it shows in the existing inbox and the admin can use the existing `adminReply`. This path inherits the 10-per-day limit and one admin email, which is fine at beta volume.
- **Admin view:** a "Feedback" card (next to the Funnel card) with, per survey: answers count, average score, distribution 1–5, and the latest text answers (newest first, with the user's first name only and the day-of-use, no email); a link from each "wants reply" item to its thread in the inbox.
- Privacy: text answers are visible to the admin only, never to other users; the average is hidden when there are fewer than 5 answers (show the count and the raw scores instead); exports of user data (`settings → export`) include the user's own answers.

## 2. Weekly review ritual (chief, 30 minutes, same day each week)

Read in this order, all in the admin screen, and write the decision in `team/decisions.md` (one line per decision).

| # | Where | What to read | Decision it drives |
|---|---|---|---|
| 1 | Funnel card (T23), period 30 days | sign-ups, onboarding done, first mark, first full day, day-3 and day-7 return, invites vs targets in `beta-metrics.md` §4 | The weakest step becomes this week's single P1 theme (e.g. low first mark → onboarding work; low day-7 → retention work such as plans/reminders) |
| 2 | Feedback card | day-3 average and day-7 average; the top 5 text answers; count of "wants reply" | Day-3 average under 3.5 → fix onboarding before anything else. Day-7 average under 3.5 → fix value/retention before growth. Repeated text themes (2+ users) become backlog items for the pm |
| 3 | Inbox (`inboxCard`) | unanswered threads, oldest first | Answer all within 24 h; a topic raised by 3+ users is a product bug, not a support issue |
| 4 | Analytics tiles + event list (`adminAnalytics`) | DAU/WAU, % active this week; which features are used (`mark:*`, `workout:save`, `post:*`, `duel:*`, `invite:share`) and which are never used | A feature with zero users for 3 weeks is a candidate to hide or simplify; the most used feature gets polish first |
| 5 | Errors (`adminErrors`) and mail status (`mailStatus`: quota left, skipped today) | new client errors, skipped emails | Any error affecting 2+ users → P1 fix this week; skipped mail → codes at risk, reduce non-critical mail |
| 6 | Users list | users inactive 7+ days after signing up (names only as the admin already sees today) | Pick up to 3 to contact personally (outside the app) to learn why they stopped |

Close the review with: **widen / fix first / pause** (the beta rule in `beta-metrics.md` §4), the one P1 theme for the coming week, and what we are not doing. The pm updates `team/backlog.md` from that within a day.

## 3. Open questions (chief)
1. Survey answers are linked to the user id in `Feedback` (needed for dedupe and the reply link). The alternative, fully anonymous answers, would block replies. Proposed default: linked, visible to the admin only, deleted with the account.
2. Is the "active on 2 distinct days" eligibility rule acceptable, or should every user be asked on day 3 regardless?
