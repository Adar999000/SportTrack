# Handoff: growth

## Done
- T7 launch kit: `docs/growth.md` (Hebrew). Contains:
  - 10 invite messages with the link: 5 WhatsApp, 3 Instagram story captions, 2 SMS. All measured under 280 characters (Python `len`).
  - SEO: 15 candidate Hebrew phrases (marked as candidates, not measured volumes), proposed `<title>` (45 chars) and meta description (122 chars).
  - Google Search Console steps for the owner: URL-prefix property (DNS verification is not possible on `github.io`), verification by HTML tag / HTML file, sitemap, URL inspection.
  - "First 20 users" plan: who to invite and in what order, questions after 3 and 7 days, which Admin → analytics numbers to watch, and what the analytics card cannot show yet (cohorts, D3/D7).
  - 4 landing copy proposals (below).

## In progress
- Nothing.

## Landing copy proposals (chief applies; text copied exactly from `src/ui/landingView.ts`)
Each new Hebrew string needs an English entry in `src/i18n-en.ts`, or `node scripts/i18n-keys.mjs --missing` fails.

1. FAQ "כמה זה עולה?" (`faq(...)`), answer:
   - before: `t('האפליקציה חינמית.')`
   - after: `t('חינם. בלי מנוי ובלי כרטיס אשראי להרשמה.')`
   - Owner must confirm there is no subscription and no card needed before this ships.
2. Hero lead (`h('p', { class: 'lead' }, ...)`), last sentence:
   - before: `עוזר AI שמכיר את הנתונים שלכם עוזר לראות מה באמת עובד.`
   - after: `העוזר עונה רק מהנתונים שלכם, ולא נותן ייעוץ רפואי.`
   - Matches the existing FAQ "מה העוזר יודע ומה לא?".
3. Hero points (`h('li', null, '✓ ', t('נגיש'))`):
   - before: `t('נגיש')`
   - after: `t('בלי הורדה מחנות')`
   - Describes the install-from-browser flow the page already explains.
4. Final CTA heading (`h('h2', null, t('מתחילים את השבוע הראשון'))`):
   - before: `t('מתחילים את השבוע הראשון')`
   - after: `t('מתחילים היום, בחינם')`

## Requests to other agents
- chief: place the Search Console verification tag in `index.html` `<head>` when the owner sends the token (a verification token is not a secret).
- chief or frontend: replace the meta description in `index.html:9` with the proposed one in `docs/growth.md` section 2.2, and the `<title>` in `index.html:8` if the owner agrees.
- chief: decide whether to add `public/sitemap.xml` (one URL: `https://adar999000.github.io/SportTrack/`) and `public/robots.txt` (with a `Sitemap:` line). No agent owns `public/` for these today.
- backend or chief (optional): a cohort view or weekly retention in the admin analytics would make the first-20 plan measurable. Not required for the launch.

## Notes for the chief
- No numbers, reviews or users were invented anywhere in the kit. The SEO phrases are candidates; check real volumes in Search Console after 2-3 weeks.
- The Admin analytics card says "האנליטיקס יופעל אחרי עדכון קוד השרת" when the server action is missing. Check it works before the first-20 invites.
