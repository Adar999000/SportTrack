import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const here = dirname(fileURLToPath(import.meta.url));
const AXE = readFileSync(resolve(here, '../../node_modules/axe-core/axe.min.js'), 'utf8');
const BASE = process.env.E2E_BASE ?? 'http://localhost:4173';
const API = process.env.E2E_API ?? 'http://localhost:8787';
const PASS = 'password123';
const stamp = Date.now();
const me = { name: 'דנה', email: `dana${stamp}@example.com` };
const omer = { name: 'עומר', email: `omer${stamp}@example.com` };

let browser, ctx, page;
const errors = [];

const api = async (action, body = {}, token) => (await fetch(API, { method: 'POST', body: JSON.stringify({ action, token, ...body }) })).json();

async function login(u) {
  let r = await api('login', { email: u.email, password: PASS });
  if (r.needCode) { // the first account is the admin and has two-step sign-in: read the code from the mock mailbox
    const mails = await (await fetch(API + '/__mails')).json();
    const m = [...mails].reverse().find((x) => JSON.stringify(x).includes('קוד כניסה'));
    r = await api('login2fa', { challenge: r.challenge, code: JSON.stringify(m).match(/\b(\d{6})\b/)[1] });
  }
  return r.token;
}

/** Close the welcome dialog and any page tours (they re-appear per page the first time). */
async function dismiss() {
  // the welcome dialog and each page's tour start ~700 ms after a render, so look a few times
  for (let pass = 0; pass < 2; pass++) {
    await page.waitForTimeout(900);
    for (let i = 0; i < 8; i++) {
      const btn = page.locator('.welcome .link-btn, .tour-tip .link-btn').first();
      if (!(await btn.count())) break;
      await btn.click({ timeout: 2000 }).catch(() => {});
      await page.waitForTimeout(150);
    }
  }
}
async function go(hash) {
  await page.goto(`${BASE}/${hash}`);
  await page.waitForLoadState('domcontentloaded');
  await page.waitForTimeout(500);
  await dismiss();
}

before(async () => {
  browser = await chromium.launch();
  ctx = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL', serviceWorkers: 'block' });
  page = await ctx.newPage(); page.setDefaultTimeout(8000);
  page.on('pageerror', (e) => errors.push(e.message));
});
// On failure, save a screenshot (E2E_SHOTS=dir) so a broken step can be seen.
afterEach(async (t) => {
  if (!t.passed && process.env.E2E_SHOTS) await page?.screenshot({ path: `${process.env.E2E_SHOTS}/${'app'}-${t.name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => {});
});
after(async () => { await browser?.close(); });

test('landing page loads in Hebrew RTL', async () => {
  await page.goto(`${BASE}/`);
  await page.locator('h1:visible').first().waitFor();
  assert.equal(await page.evaluate(() => document.documentElement.dir), 'rtl');
});

test('sign-up requires the terms checkbox, then onboarding saves gender and goals', async () => {
  await go('#signup');
  await page.fill('#reg-name', me.name);
  await page.fill('#auth-email', me.email);
  await page.fill('#auth-pass', PASS);
  await page.click('button[type=submit]');
  // since T11 the consent error sits under its own field (aria-describedby), not at the bottom of the form
  const err = page.locator('#reg-terms-err:not([hidden]), .form-error:not([hidden])').first();
  await err.waitFor();
  assert.match(await err.textContent(), /תנאי השימוש/);
  assert.ok(page.url().includes('#signup'), 'must stay on sign-up without consent');
  await page.check('#reg-terms');
  await page.click('button[type=submit]');
  // first user is the admin; onboarding (profile form) appears
  await page.locator('.goal-chip:has-text("אישה")').waitFor();
  await page.click('.goal-chip:has-text("אישה")');
  await page.click('.goal-chip:has-text("לשפר כושר")');
  await page.click('.goal-chip:has-text("לאכול מסודר")');
  await page.click('button:has-text("שמור והמשך")');
  await page.locator('.today-btn').first().waitFor();
  await dismiss();
  me.token = await login(me);
});

test('profile stored gender + goals on the server', async () => {
  assert.ok(me.token, 'logged in');
  const r = await api('me', {}, me.token);
  assert.ok(r.user, 'me works');
  assert.equal(r.user.name, me.name);
  assert.equal(r.user.profile.gender, 'female');
  assert.deepEqual([...r.user.profile.goals].sort(), ['eat', 'fit']);
});

test('Today: cells cycle V → X → – → empty, and a full day completes', async () => {
  await go('#week');
  const cell = page.locator('.cell').first();
  const mark = async () => (await cell.getAttribute('class')).match(/mark-(\w+)/)[1];
  assert.equal(await mark(), 'empty');
  const seq = [];
  for (let i = 0; i < 4; i++) { await cell.click(); await page.waitForTimeout(450); seq.push(await mark()); } // a single tap is delayed to tell it from a double tap
  assert.deepEqual(seq, ['V', 'X', 'dash', 'empty']);
  // today panel: breakfast, lunch, dinner with V (second row of taps), then sport through its sheet
  const meals = page.locator('.today-btn:not(.today-sport)');
  for (let i = 0; i < 3; i++) await meals.nth(i).click();
  await page.locator('.today-sport').click();
  await page.locator('.backdrop .chip').first().click().catch(() => {});
  await page.locator('.backdrop button.btn-primary').first().click();
  await page.waitForTimeout(500);
  const classes = await page.locator('.today-btn').evaluateAll((els) => els.map((e) => e.className));
  assert.ok(classes.every((c) => c.includes('mark-V')), 'all four today buttons are V: ' + classes.join('|'));
  const body = await page.innerText('body');
  assert.match(body, /היום סגור|יום מלא/, 'day-complete feedback shown');
});

test('workout story: seeded via API, visible in the stories bar', async () => {
  const reg = await api('register', { ...omer, password: PASS, terms: true, invite: '' });
  assert.ok(reg.token, 'omer registered: ' + JSON.stringify(reg));
  omer.token = reg.token;
  await api('sendVerifyCode', {}, omer.token);
  const mails = await (await fetch(API + '/__mails')).json();
  const mail = [...mails].reverse().find((m) => JSON.stringify(m).includes(omer.email));
  const code = JSON.stringify(mail).match(/\b(\d{6})\b/)[1];
  const v = await api('verifyEmail', { code }, omer.token);
  assert.ok(!v.error, 'verified: ' + JSON.stringify(v));
  const st = await api('createPost', { kind: 'story', visibility: 'all', text: 'ריצת בוקר',
    data: { tpl: 'workout', bg: 'lime', type: 'run', distanceM: 5200, durationS: 1680, name: 'ריצה בפארק', route: [[10, 80], [30, 40], [60, 55], [90, 15]] } }, omer.token);
  assert.ok(st.post, 'story created: ' + JSON.stringify(st));
  await go('#feed');
  const bubble = page.locator('.story-bubble', { hasText: omer.name });
  await bubble.waitFor();
  await bubble.click();
  const viewer = page.locator('.story-viewer');
  await viewer.waitFor();
  const txt = await viewer.innerText();
  assert.match(txt, /5\.2|5,2/, 'distance shown: ' + txt);
  assert.match(txt, /ריצה בפארק|ריצת בוקר/);
  assert.ok(await viewer.locator('svg, canvas').count(), 'route drawn');
  await page.click('.story-viewer [aria-label="סגירה"]');
});

test('post with 2 photos while offline is queued, then delivered on "online"', async () => {
  await go('#feed');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAoAAAAKCAYAAACNMs+9AAAAFUlEQVR42mP8z8BQz0AEYBxVSF+FAAhKDveksOjmAAAAAElFTkSuQmCC', 'base64');
  const files = [1, 2].map((i) => ({ name: `p${i}.png`, mimeType: 'image/png', buffer: png }));
  const fc = page.waitForEvent('filechooser');
  await page.click('button:has-text("תמונות")');
  await (await fc).setFiles(files);
  await page.locator('.post-thumb').nth(1).waitFor();
  await page.fill('textarea', 'שתי תמונות בלי רשת ' + stamp);
  // go offline: abort every call to the backend
  await page.route(API + '/**', (r) => r.abort());
  await page.route(API, (r) => r.abort());
  await page.click('button[type=submit]:text-matches("^פרסמ(י)?$")');
  await page.locator('.toast, [role=status]', { hasText: /אין חיבור/ }).first().waitFor({ timeout: 8000 });
  const before = await api('feed', {}, me.token);
  assert.ok(!JSON.stringify(before).includes('שתי תמונות בלי רשת ' + stamp), 'not delivered while offline');
  // back online
  await page.unroute(API + '/**'); await page.unroute(API);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  let found;
  for (let i = 0; i < 20 && !found; i++) {
    await page.waitForTimeout(500);
    const f = await api('feed', {}, me.token);
    found = (f.posts ?? []).find((p) => p.text === 'שתי תמונות בלי רשת ' + stamp);
  }
  assert.ok(found, 'post delivered after online');
  const n = (found.data?.photos ?? [found.photoId]).filter(Boolean).length;
  assert.equal(n, 2, 'both photos delivered');
});

test('block a user from the story ⋯ menu', async () => {
  await api('createPost', { kind: 'story', visibility: 'all', text: 'עוד סטורי', data: { tpl: 'text', bg: 'ink' } }, omer.token);
  await go('#feed');
  await page.locator('.story-bubble', { hasText: omer.name }).click();
  await page.locator('.story-viewer').waitFor();
  await page.click('.story-viewer [aria-label="אפשרויות"]');
  const block = page.locator('button', { hasText: `חסימת ${omer.name}` });
  await block.click();
  await page.locator('button', { hasText: /הק(י)?ש(י)? שוב לחסימה/ }).click();
  await page.waitForTimeout(800);
  const blocks = await api('myBlocks', {}, me.token);
  assert.ok(JSON.stringify(blocks).includes(omer.name), 'blocked on server: ' + JSON.stringify(blocks));
  await go('#feed');
  assert.equal(await page.locator('.story-bubble', { hasText: omer.name }).count(), 0, 'story bubble gone');
});

test('create a team-goal challenge', async () => {
  await go('#duels');
  await page.click('button:has-text("אתגר חדש")');
  await page.click('.seg button:has-text("יעד קבוצתי")');
  await page.click('button:text-matches("^צר(ו|י)? אתגר$|^צור אתגר$")');
  await page.waitForTimeout(1000);
  const d = await api('duels', {}, me.token);
  const team = (d.duels ?? []).find((x) => String(x.metric ?? x.kind ?? JSON.stringify(x)).includes('team') || x.team);
  assert.ok(team, 'team duel exists: ' + JSON.stringify(d).slice(0, 400));
  await page.locator('.team-bar').first().waitFor();
});

test('settings JSON export contains docs', async () => {
  await go('#prefs');
  await page.click('button:has-text("גיבוי וייבוא")').catch(() => {});
  const dl = page.waitForEvent('download');
  await page.click('button:has-text("ייצוא JSON (הכול)")');
  const file = await dl;
  const path = await file.path();
  const json = JSON.parse(readFileSync(path, 'utf8'));
  assert.ok('docs' in json, 'export has docs key: ' + Object.keys(json));
  assert.ok(json.weeks, 'export has weeks');
});

async function axe(label) {
  await page.evaluate(AXE);
  const res = await page.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
  const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`);
  assert.deepEqual(v, [], `${label}: ${v.join('\n')}`);
}
for (const scheme of ['light', 'dark']) {
  for (const [name, hash, signedOut] of [['landing', '', true], ['today', '#week'], ['feed', '#feed'], ['settings', '#prefs']]) {
    test(`axe WCAG A/AA: ${name} (${scheme})`, async () => {
      await page.emulateMedia({ colorScheme: scheme, reducedMotion: 'reduce' });
      if (signedOut) {
        const c2 = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL', serviceWorkers: 'block', colorScheme: scheme });
        const p2 = await c2.newPage();
        await p2.goto(`${BASE}/${hash}`); await p2.locator('h1:visible').first().waitFor(); await p2.waitForTimeout(500);
        await p2.evaluate(AXE);
        const res = await p2.evaluate(() => window.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'] } }));
        await c2.close();
        const v = res.violations.map((x) => `${x.id} (${x.nodes.length}): ${x.nodes.slice(0, 2).map((n) => n.target.join(' ')).join(' ; ')}`);
        assert.deepEqual(v, [], `${name}/${scheme}: ${v.join('\n')}`);
      } else {
        await go(hash);
        await axe(`${name}/${scheme}`);
      }
    });
  }
}

test('no uncaught page errors during the run', () => { assert.deepEqual(errors, []); });
