// Generates the official team post cards: HTML -> PNG (Playwright) -> webp 720px (ImageMagick).
// Usage: node scripts/team-cards/generate.cjs [id ...]   (no ids = all cards)
// Output: public/team/<id>.webp
const { chromium } = require('playwright');
const { execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const OUT = path.join(__dirname, '..', '..', 'public', 'team');

// bg: [from, to], accent = number/index color, rule = line color
const CARDS = [
  { id: 'stretch', emoji: '🌿', kicker: 'טיפים מהצוות', title: 'מתיחות אחרי ריצה', num: '5', unit: 'דקות מספיקות',
    bg: ['#2b1b4d', '#12082b'], accent: '#d9b8ff',
    tips: ['מתחילים כשהדופק יורד מעט', 'מחזיקים כל מתיחה 20–30 שניות', 'נושמים לאט, בלי קפיצות', 'מתיחה עדינה: מרגישים, לא כואב', 'רגליים, ירכיים ותחתית הגב'] },
  { id: 'protein', emoji: '🥚', kicker: 'תזונה פשוטה', title: 'חלבון בלי סיבוכים', num: '3', unit: 'ארוחות עם חלבון',
    bg: ['#7a3b12', '#2e1405'], accent: '#ffc47a',
    tips: ['ביצים, גבינה, יוגורט או טחינה בבוקר', 'קטניות, טופו או עוף בצהריים', 'רבע מהצלחת הוא חלבון', 'חטיף: קוטג’, חומוס או אגוזים'] },
  { id: 'steps', emoji: '👟', kicker: 'הרגל קטן', title: 'הליכה יומית', num: '10K', unit: 'צעדים ביום',
    bg: ['#0f5a46', '#06241d'], accent: '#7dffc9',
    tips: ['הולכים ברגל ליעדים קצרים', 'הליכה של 10 דקות אחרי כל ארוחה', 'שיחת טלפון? קמים ומסתובבים', 'מדרגות במקום מעלית'] },
  { id: 'weekend', emoji: '🎯', kicker: 'סוף שבוע', title: 'גם בסוף השבוע', num: '1', unit: 'הרגל קטן ביום',
    bg: ['#14160f', '#14160f'], accent: '#c6f432',
    tips: ['בוחרים הרגל אחד ולא מוותרים עליו', 'קובעים שעה לאימון מראש', 'אימון קצר עדיף על אין אימון', 'מזמינים חבר להצטרף', 'ה-V בטבלה נשאר ירוק'] },
  { id: 'warmup', emoji: '🔥', kicker: 'לפני כוח', title: 'חימום לפני כוח', num: '8', unit: 'דקות חימום',
    bg: ['#7a1d1d', '#260808'], accent: '#ffb199',
    tips: ['מתחילים בהליכה או אופניים קלים', 'מסובבים כתפיים, ירכיים וקרסוליים', 'סט ראשון עם משקל קל', 'מעלים משקל בהדרגה', 'לא מרגישים טוב? מורידים עומס'] },
  { id: 'mindful', emoji: '🍽️', kicker: 'אוכלים בתשומת לב', title: 'אכילה מודעת', num: '20', unit: 'דקות לארוחה',
    bg: ['#1f4d2b', '#0a2010'], accent: '#c6f432',
    tips: ['יושבים ומניחים את הטלפון בצד', 'לועסים לאט ונהנים מהטעם', 'עוצרים באמצע ושואלים: עדיין רעבים?', 'צלחת אחת, בלי לאכול מהשקית'] },
];

function html(c) {
  const rows = c.tips.map((t, i) => `<div class="row"><span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${t}</span></div>`).join('');
  return `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8">
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Heebo:wght@800;900&display=swap">
<style>
*{box-sizing:border-box;margin:0}
body{width:1080px;height:1350px;font-family:'Heebo',Arial,sans-serif;color:#f3f2ec;
 background:repeating-linear-gradient(-60deg,rgba(255,255,255,.035) 0 2px,transparent 2px 22px),linear-gradient(160deg,${c.bg[0]},${c.bg[1]});
 padding:90px 84px 84px;position:relative;font-weight:800}
.emoji{position:absolute;left:84px;top:84px;font-size:130px;line-height:1;font-family:'Noto Color Emoji'}
.kicker{font-size:34px;font-weight:800;color:${c.accent};text-align:right}
.title{font-size:84px;font-weight:900;line-height:1.1;margin-top:26px;text-align:right}
.big{display:flex;align-items:flex-end;gap:30px;margin-top:40px;height:270px}
.num{font-size:330px;font-weight:900;line-height:.82;color:${c.accent}}
.unit{font-size:42px;font-weight:800;padding-bottom:28px}
.list{margin-top:44px}
.row{display:flex;align-items:center;gap:26px;height:108px;border-top:2px solid rgba(243,242,236,.9);font-size:46px}
.n{color:${c.accent};font-size:44px;font-weight:900;min-width:56px}
.foot{position:absolute;right:84px;left:84px;bottom:84px;border-top:3px dashed rgba(243,242,236,.55);padding-top:36px;display:flex;justify-content:space-between;font-size:34px}
.brand{display:flex;align-items:center;gap:16px}
.chk{width:54px;height:54px;border-radius:14px;background:${c.accent};color:#14160f;display:grid;place-items:center;font-size:36px;font-weight:900}
.tag{opacity:.8;direction:rtl}
</style></head><body>
<div class="emoji">${c.emoji}</div>
<div class="kicker">${c.kicker}</div><div class="title">${c.title}</div>
<div class="big"><div class="num">${c.num}</div><div class="unit">${c.unit}</div></div>
<div class="list">${rows}</div>
<div class="foot"><div class="brand"><span class="chk">✓</span><span>צוות משמעת אישית</span></div><div class="tag">#משמעת_אישית</div></div>
</body></html>`;
}

(async () => {
  const want = process.argv.slice(2);
  const cards = want.length ? CARDS.filter((c) => want.includes(c.id)) : CARDS;
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'team-cards-'));
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1350 }, deviceScaleFactor: 1 });
  for (const c of cards) {
    await page.setContent(html(c), { waitUntil: 'networkidle' });
    await page.evaluate(() => document.fonts.ready);
    const png = path.join(tmp, c.id + '.png');
    await page.screenshot({ path: png });
    execFileSync('convert', [png, '-resize', '720x', '-quality', '80', path.join(OUT, c.id + '.webp')]);
    console.log('wrote public/team/' + c.id + '.webp');
  }
  await browser.close();
  fs.rmSync(tmp, { recursive: true, force: true });
})();
