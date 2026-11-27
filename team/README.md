# The Mishmaat team (how the agents work together)

One **chief agent** (the original session) and specialist agents, each in its own Claude Code session.
The chief assigns work, reviews every change, merges it into the release branch and publishes.

| id | Role | Model | Branch |
|---|---|---|---|
| chief | Chief / tech lead: assigns, reviews, merges, releases | Opus | `claude/personal-discipline-pwa-13qhdk` |
| pm | Product manager: backlog, specs, acceptance criteria, UX review | Sonnet | `team/pm` |
| frontend | Frontend developer: screens, UX, accessibility | Opus | `team/frontend` |
| backend | Backend & infrastructure: server, security, Supabase migration | Opus | `team/backend` |
| qa | QA: automated e2e tests, regression, accessibility checks | Sonnet | `team/qa` |
| design | Designer: team post cards, share images, visual polish | Sonnet | `team/design` |
| content | Content & language: English/Hebrew copy, gendered wording, help pages | Haiku | `team/content` |
| growth | Growth: landing copy, SEO, invite messages, launch kit | Haiku | `team/growth` |

## Rules for every agent
0. **Work autonomously. Never ask the user (the CEO) anything** and never wait for their answer. The chief is your only contact. If something is unclear, pick the sensible default, write the choice under "Notes for the chief" in your handoff, and keep going. If you truly cannot continue, send the chief `STATUS | <id> | <task> | blocked | <question>` and work on the next part meanwhile. Never end a turn with a question to the user.
1. Start by reading `team/README.md`, `team/backlog.md`, `team/decisions.md` and your own `team/handoff/<id>.md`.
2. Work only on your branch (`team/<id>`), created from `claude/personal-discipline-pwa-13qhdk`. Never push to `main` or to the chief's branch, never open pull requests, never force-push.
3. Keep changes inside your area (see "Owns" in backlog). If you need a change in someone else's area, write it under "Requests" in your handoff file.
4. Before pushing code: `npx tsc --noEmit && npx vitest run && node scripts/i18n-keys.mjs --missing` must pass. Every Hebrew UI string needs an English entry in `src/i18n-en.ts`.
5. Never put secrets, API keys or personal data in code, commits or messages.
6. Do not touch real users' data or the live server. Tests run against `scripts/mock-server.mjs` / `tests/gas/mock.mjs`.
7. Commit messages end with the attribution lines your session gives you; no model names in commits.
8. When you start a task and when you finish (or get blocked), send the chief a message with `send_message` to session `session_01CzonFwQXW3T5ABsxCnvj2z`, one line per update:
   `STATUS | <your id> | <task id> | started|review|done|blocked | <one short sentence>`
   and update `team/handoff/<id>.md` on your branch (what you did, what's left, requests).
9. "review" means: pushed to your branch, tests pass, ready for the chief to merge. The chief merges; you don't.
10. Write in plain language; the product is Hebrew-first (RTL), accessible (WCAG AA), and works offline.
