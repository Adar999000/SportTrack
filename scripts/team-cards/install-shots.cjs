// Reproducible install screenshots (manifest `screenshots`) from the real app against the mock backend.
// Usage: VITE_API_URL=http://localhost:8787 npx vite build && node scripts/team-cards/install-shots.cjs
// Output: public/install/{today,progress,workout,store}.webp (1080x1920, narrow form factor)
const { chromium } = require('playwright');
const { spawn, execFileSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..', '..');
const OUT = path.join(ROOT, 'public', 'install');
const SHOTS = [
  ['today', ''],
  ['progress', '#stats'],
  ['workout', '#workout'],
  ['store', '#rewards'],
];

(async () => {
  const procs = [
    spawn('node', ['scripts/mock-server.mjs', '8787'], { cwd: ROOT, stdio: 'ignore' }),
    spawn('npx', ['vite', 'preview', '--port', '4173', '--strictPort'], { cwd: ROOT, stdio: 'ignore' }),
  ];
  try {
    await new Promise((r) => setTimeout(r, 4000));
    const browser = await chromium.launch();
    const ctx = await browser.newContext({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true, locale: 'he-IL', serviceWorkers: 'block' });
    const page = await ctx.newPage();
    await page.goto('http://localhost:4173/#signup');
    await page.fill('#reg-name', 'דנה');
    await page.fill('#auth-email', 'demo@example.com');
    await page.fill('#auth-pass', 'demo-pass-123');
    await page.check('#reg-terms');
    await page.click('form button[type=submit]');
    await page.waitForTimeout(2500);
    // finish onboarding (profile form) with a few goals so the app shows its real screens
    await page.waitForSelector('#pf-height', { timeout: 10000 });
    await page.fill('#pf-height', '170');
    for (const g of ['לשפר כושר', 'לאכול טוב יותר']) await page.getByRole('button', { name: g }).first().click().catch(() => {});
    await page.click('form button[type=submit]');
    await page.waitForTimeout(2500);
    // skip the intro tours (welcome card, then spotlight tour)
    for (let i = 0; i < 3; i++) {
      await page.getByRole('button', { name: 'דלג' }).click({ timeout: 2500 }).catch(() => {});
      await page.waitForTimeout(600);
    }
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'install-shots-'));
    for (const [id, hash] of SHOTS) {
      await page.evaluate((h) => { location.hash = h; }, hash);
      await page.waitForTimeout(1500);
      await page.getByRole('button', { name: 'דלג' }).click({ timeout: 500 }).catch(() => {});
      const png = path.join(tmp, id + '.png');
      await page.screenshot({ path: png });
      execFileSync('convert', [png, '-quality', '82', path.join(OUT, id + '.webp')]);
      console.log('wrote public/install/' + id + '.webp');
    }
    await browser.close();
    fs.rmSync(tmp, { recursive: true, force: true });
  } finally {
    procs.forEach((p) => p.kill());
  }
})();
