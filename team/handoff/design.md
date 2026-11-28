# Handoff: design

## Done
- T5: six new team cards in `public/team/` (stretch, protein, steps, weekend, warmup, mindful), 720×900 webp, same layout as the existing six.
- Reproducible generator: `node scripts/team-cards/generate.cjs [id ...]` (Playwright renders 1080×1350 HTML, ImageMagick `convert` makes webp 720px wide, quality 80). Needs network once for the Heebo font from Google Fonts. Card content lives in the `CARDS` array at the top.
- No photos, no stock images, no logos. Emojis only (no people).

## Post texts for `TEAM_IMAGE_POSTS` (apps-script/server.js), for the chief to wire in
```js
['stretch', 'מתיחות אחרי ריצה 🌿 5 דקות עדינות מספיקות: מחזיקים כל מתיחה 20–30 שניות, נושמים לאט, ושומרים על תחושה נעימה ולא כואבת.'],
['protein', 'חלבון בלי סיבוכים 🥚 ביצה, יוגורט או קטניות בכל ארוחה, ורבע מהצלחת לחלבון. פשוט וטעים.'],
['steps', 'הליכה יומית 👟 מטרה מוכרת היא 10,000 צעדים. הליכה של 10 דקות אחרי כל ארוחה כבר מקרבת אתכם לשם.'],
['weekend', 'גם בסוף השבוע 🎯 בוחרים הרגל קטן אחד ולא מוותרים עליו, אפילו אימון קצר. ה-V בטבלה נשאר ירוק!'],
['warmup', 'חימום לפני כוח 🔥 8 דקות של תנועה קלה, סיבובי מפרקים וסט ראשון עם משקל קל. מעלים משקל בהדרגה ומקשיבים לגוף.'],
['mindful', 'אכילה מודעת 🍽️ יושבים, מניחים את הטלפון, לועסים לאט ועוצרים באמצע לשאול: עדיין רעבים?'],
```
Note: `TEAM_SEEDED2` is already used, so these need a new flag (e.g. `TEAM_SEEDED3`) to be posted on existing servers.

## T18 (install experience)
- `public/install/{today,progress,workout,store}.webp`: 1080×1920 real-app screens, made by `node scripts/team-cards/install-shots.cjs` (starts the mock server + `vite preview`, so run `VITE_API_URL=http://localhost:8787 npx vite build` first). Map tiles are grey on the workout screen because the tiles need internet.
- `vite.config.ts`: manifest `screenshots` (4 entries, `form_factor: narrow`, Hebrew labels). Nothing else changed; `tsc` and build pass.
- Maskable icon checked: the glyph's farthest corner is about 178px from the centre, inside the 205px (80%) safe circle, so it survives a circular mask. No change needed. Note: the icon is green (#2f6f5e) while the team look is ink/lime; say if you want it restyled.
- `scripts/team-cards/recap-template.html`: weekly recap story, 1080×1920, `{{name}} {{range}} {{workouts}} {{dWorkouts}} {{full}} {{meals}} {{focus}}` placeholders documented in the file header (they match `WeekRecap`). `render-recap.cjs` renders it with sample values.
- Screenshots precache with the service worker (about 45 KB each).

## In progress
Nothing.

## Requests to other agents
- chief: wire the texts above into server.js (new seed flag).

## Notes for the chief
Tips are general, non-medical wellness hints.
