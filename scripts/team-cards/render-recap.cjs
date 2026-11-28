// Fills recap-template.html with sample values and renders it (preview / reference for the frontend).
// Usage: node scripts/team-cards/render-recap.cjs [out.png]
const { chromium } = require('playwright');
const fs = require('fs');
const path = require('path');
const SAMPLE = { name: 'דנה', range: '22/11 – 28/11', workouts: '4', dWorkouts: '+1', full: '5', meals: '82', focus: 'שבוע הבא: 5 ימים מלאים' };
(async () => {
  let html = fs.readFileSync(path.join(__dirname, 'recap-template.html'), 'utf8');
  for (const [k, v] of Object.entries(SAMPLE)) html = html.split('{{' + k + '}}').join(v);
  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 1080, height: 1920 } });
  await page.setContent(html, { waitUntil: 'networkidle' });
  await page.evaluate(() => document.fonts.ready);
  const out = process.argv[2] || 'recap-sample.png';
  await page.screenshot({ path: out });
  await browser.close();
  console.log('wrote ' + out);
})();
