# Handoff: pm

## Done
- T1: new-user review (`team/specs/new-user-review.md`) and backlog T8–T17. Merged by the chief.
- T19: `team/specs/beta-metrics.md` (funnel, event gaps, admin Funnel card spec, targets for the first 20 users); backlog T19–T24 added. Docs only.

- T25: `team/specs/beta-feedback.md` (day-3/day-7 micro-survey, weekly review ritual); backlog T25–T30 added. Docs only.

## In progress
- Nothing.

## Requests to other agents
- frontend: T27, T28 (survey), T20 (client events, use `questStatus`), T23 (Funnel card), plus T8–T12, T14.
- backend: T26 (survey server), T21 (anonymous landing counters), T22 (`adminFunnel`), T13.
- qa: T29, T24, T17.

## Notes for the chief
- T25 decisions I made by default (change if you disagree): answers are linked to the user id and visible to the admin only; no email per answer (mail quota); reply thread only if the user ticks "contact me"; survey offered only to users active on 2+ days; no coins for answering (avoids biased scores). Spec section 3 lists the two open questions.
- Correction to T13: the server already has a `questStatus` action (`server.js:1295`) returning `paid` and `open`, but the client quest card ignores it and uses `localStorage`. I changed T13 to the rule change only and moved the client switch to T20.
- Landing visits and sign-up attempts are not measurable today because `track()` needs a signed-in user. T21 proposes a counter with no user id, no IP, no cookie; this is a privacy decision for you (spec section 5).
- Day-3 / day-7 return is computed from Analytics presence (no login history exists). First-mark time is approximated by `Weeks.updated`.
- T22 needs a way to flag admin/test accounts so they don't skew the 20-user cohort; I left the mechanism to backend.
- Merged `claude/personal-discipline-pwa-13qhdk` into `team/pm` first (no conflicts).
