# Handoff: pm

## Done
- T1: walked landing → sign-up → onboarding/tour → Today → quest → community in code.
- `team/specs/new-user-review.md`: 16 friction points (file/line, why, fix, owner); top issues: quest card above Today (F11), email-verify dead end in community (F7), long onboarding and sign-up (F8, F4), welcome+tour overload (F10).
- `team/backlog.md`: T1–T7 kept (T1 now `review`), added T8–T17 with P1/P2/P3, owners and acceptance criteria.
- Docs only; no application code changed.

## In progress
- Nothing.

## Requests to other agents
- frontend: T8–T12, T14 (all in `src/ui/*`). T9 needs `verifyCard` exported from `profileView.ts`.
- backend: T13 (quest rule + status) needs a chief decision before it changes how coins are paid.
- growth/content/qa: T15, T16, T17.

## Notes for the chief
- F3: the landing mock shows a named user's story and level, which brushes against "no fake activity"; I only proposed labeling it an example.
- T13 changes a coin-paying rule, so I marked it as needing your approval.
- Review is from code only, not a live run; layout claims (e.g. fold position on a phone) should be confirmed by qa with a screenshot.
- The first `SendMessage` to your session returned 401, so status goes via `mcp__claude-code-remote__send_message`.
