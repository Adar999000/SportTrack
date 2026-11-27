# Backlog (owned by pm, approved by chief)

Priority: P1 now, P2 next, P3 later. Status is mirrored on the office dashboard.

| id | P | Task | Owner | Status |
|---|---|---|---|---|
| T1 | P1 | Prioritized backlog with acceptance criteria + new-user UX review of the code paths (onboarding → Today → first week) | pm | todo |
| T2 | P1 | Ready-made training plans ("5 km in 8 weeks", "home strength 3×/week"): pick a plan, today's session appears on Today, marking it fills the sport row | frontend | todo |
| T3 | P1 | Supabase migration prep: `backend/supabase/schema.sql` (tables + RLS mirroring the Sheets), Edge Function skeletons for auth/weeks/feed, and a transport adapter in `src/api.ts` behind a flag. No keys, no live calls | backend | todo |
| T4 | P1 | Playwright e2e suite in `tests/e2e/` against the mock server: sign-up+consent, Today marking, workout story, post with photos offline→online, block user, challenge, settings export. `npm run e2e` | qa | todo |
| T5 | P2 | Six more team post cards (weekly tips series) as webp + a reproducible generator script in `scripts/team-cards/` | design | todo |
| T6 | P2 | Copy review: English quality in `src/i18n-en.ts`, missing feminine forms (list for `src/i18n-fem.ts`), help page content `docs/help.md` | content | todo |
| T7 | P2 | Launch kit `docs/growth.md`: invite messages (WhatsApp/Instagram/SMS), SEO keywords, Search Console steps, first-20-users plan | growth | todo |

## Owns (areas)
- frontend: `src/ui/*` (except admin/legal), `src/styles.css`
- backend: `apps-script/*`, `backend/*`, `src/api.ts`, `src/sync.ts`, `scripts/load-test.mjs`
- qa: `tests/e2e/*`, `playwright.config.*`, `package.json` scripts (`e2e` only)
- design: `public/team/*`, `public/shots/*`, `scripts/team-cards/*`
- content: `src/i18n-en.ts`, `src/i18n-fem.ts`, `docs/help.md`
- growth: `docs/growth.md`, landing copy proposals (as text in the handoff; the chief applies them)
- pm: `team/backlog.md`, `team/specs/*`
