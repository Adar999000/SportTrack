// T17: the new-user journey on a fresh mock backend (run.mjs restarts the mock before this file).
// Steps: first user (admin) → onboarding skip → invited sign-up → unverified feed → verify → quest 0→4 → claim once.
import { test, before, after, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { chromium, devices } = require('playwright');
const BASE = process.env.E2E_BASE ?? 'http://localhost:4173';
const API = process.env.E2E_API ?? 'http://localhost:8787';
const PASS = 'password123';
const stamp = Date.now();
const first = { name: 'ראשון', email: `first${stamp}@example.com` };
const second = { name: 'מוזמנת', email: `invited${stamp}@example.com` };

let browser, ctx, page;
const api = async (action, body = {}, token) => (await fetch(API, { method: 'POST', body: JSON.stringify({ action, token, ...body }) })).json();
const mails = async () => (await fetch(API + '/__mails')).json();
const lastCode = async (subject) => {
  const m = [...(await mails())].reverse().find((x) => JSON.stringify(x).includes(subject));
  return JSON.stringify(m).match(/\b(\d{6})\b/)[1];
};
async function adminToken(u) {
  const r = await api('login', { email: u.email, password: PASS });
  if (!r.needCode) return r.token;
  return (await api('login2fa', { challenge: r.challenge, code: await lastCode('קוד כניסה') })).token;
}
async function dismiss() {
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
/** Run one named step of the journey; a failure says which step broke. */
async function step(n, name, fn) {
  try { await fn(); } catch (e) { e.message = `JOURNEY STEP ${n} BROKE (${name}): ${e.message}`; throw e; }
}
const fresh = async () => { const c = await browser.newContext({ ...devices['iPhone 13'], locale: 'he-IL', serviceWorkers: 'block' }); const p = await c.newPage(); p.setDefaultTimeout(8000); return [c, p]; };

before(async () => {
  browser = await chromium.launch();
  [ctx, page] = await fresh();
});
// On failure, save a screenshot (E2E_SHOTS=dir) so a broken step can be seen.
afterEach(async (t) => {
  if (!t.passed && process.env.E2E_SHOTS) await page?.screenshot({ path: `${process.env.E2E_SHOTS}/${'newuser'}-${t.name.replace(/\W+/g, '_').slice(0, 40)}.png` }).catch(() => {});
});
after(async () => { await browser?.close(); });

test('1. first user: no invite field, becomes admin; onboarding can be skipped with every optional field empty', async () => {
  await step(1, 'first-user sign-up screen', async () => {
    await page.goto(`${BASE}/#signup`);
    await page.locator('#reg-name').waitFor();
    await page.locator('#invite-wrap').waitFor({ state: 'detached' }); // replaced by "you are the first user" once status answers
    assert.match(await page.innerText('.auth-card'), /המשתמש הראשון/);
    assert.equal(await page.locator('#reg-invite').count(), 0);
  });
  await step(2, 'register first user', async () => {
    await page.fill('#reg-name', first.name); await page.fill('#auth-email', first.email); await page.fill('#auth-pass', PASS);
    await page.check('#reg-terms'); await page.click('button[type=submit]');
    await page.locator('button:has-text("שמור והמשך")').waitFor();
  });
  await step(3, 'onboarding skip (nothing chosen)', async () => {
    await page.click('button:has-text("שמור והמשך")');
    await page.locator('.today-btn').first().waitFor();
    assert.ok(page.url().includes('#week'), 'lands on Today: ' + page.url());
    const t = await adminToken(first);
    const me = await api('me', {}, t);
    assert.equal(me.user.role, 'admin', 'first user is admin');
    assert.equal(me.user.profile.completed, true);
    assert.deepEqual(me.user.profile.goals ?? [], []);
    first.token = t;
  });
  await step(4, 'welcome dialog skip persists', async () => {
    await page.waitForTimeout(1000);
    await page.locator('.welcome .link-btn').click(); // "דלג"
    await dismiss();
    await page.reload(); await page.locator('.today-btn').first().waitFor(); await page.waitForTimeout(1500);
    assert.equal(await page.locator('.welcome').count(), 0, 'welcome does not come back after reload');
  });
});

test('2. admin turns on posting verification; invited sign-up prefills the code and gives both sides coins', async () => {
  await step(5, 'admin setSiteConfig verifyPosting', async () => {
    const r = await api('setSiteConfig', { verifyPosting: true }, first.token);
    assert.ok(!r.error, JSON.stringify(r));
  });
  let inviteCode;
  await step(6, 'personal invite code', async () => {
    const r = await api('myInvite', {}, first.token);
    assert.match(r.code ?? '', /^[A-Z0-9]{4,12}$/);
    inviteCode = r.code;
  });
  const [c2, p2] = await fresh();
  page = p2; ctx = c2;
  await step(7, 'invite link prefills the code', async () => {
    await page.goto(`${BASE}/#join-${inviteCode}`);
    await page.locator('#reg-invite').waitFor();
    assert.equal((await page.inputValue('#reg-invite')).toUpperCase(), inviteCode);
  });
  await step(8, 'register invited user', async () => {
    await page.fill('#reg-name', second.name); await page.fill('#auth-email', second.email); await page.fill('#auth-pass', PASS);
    await page.check('#reg-terms'); await page.click('button[type=submit]');
    await page.locator('button:has-text("שמור והמשך")').waitFor();
    await page.click('button:has-text("שמור והמשך")');
    await page.locator('.today-btn').first().waitFor();
    const t = (await api('login', { email: second.email, password: PASS })).token;
    assert.ok(t, 'second user can log in');
    second.token = t;
    const me = await api('me', {}, t);
    assert.equal(me.user.role, 'user');
    assert.equal(me.user.emailVerified, false, 'invited user starts unverified');
    const coins = JSON.stringify(await api('rewards', {}, t));
    assert.match(coins, /50/, 'invite bonus visible: ' + coins.slice(0, 200));
  });
});

test('3. unverified email: the feed offers verification instead of the composer; the API refuses posts; verifying unlocks posting', async () => {
  await step(9, 'unverified feed shows the verify card, no composer', async () => {
    await page.goto(`${BASE}/#feed`);
    await page.locator('.verify-card').waitFor();
    assert.equal(await page.locator('textarea').count(), 0, 'no composer while unverified');
    const r = await api('createPost', { text: 'פוסט ראשון ' + stamp, visibility: 'all' }, second.token);
    assert.match(r.error ?? '', /אימות|לאמת/, 'server refuses unverified posts: ' + JSON.stringify(r));
  });
  await step(10, 'verify email from the feed card', async () => {
    await dismiss();
    await page.locator('.verify-card button').first().click(); // "שליחת קוד למייל"
    await page.locator('.verify-card input').waitFor();
    await page.fill('.verify-card input', await lastCode('קוד אימות'));
    await page.locator('.verify-card button[type=submit]').click();
    await page.locator('textarea').waitFor(); // the composer replaces the card
    assert.equal((await api('me', {}, second.token)).user.emailVerified, true);
  });
  await step(11, 'post after verifying', async () => {
    await page.fill('textarea', 'פוסט אחרי אימות ' + stamp);
    await page.locator('button[type=submit].btn-primary').first().click();
    let ok = false;
    for (let i = 0; i < 10 && !ok; i++) { await page.waitForTimeout(400); ok = JSON.stringify(await api('feed', {}, second.token)).includes('פוסט אחרי אימות ' + stamp); }
    assert.ok(ok, 'verified user can post');
  });
});

test('4. first-week quest 0→4, claim pays 100 once', async () => {
  await step(12, 'quest card shows 0/4', async () => {
    await page.goto(`${BASE}/#week`);
    await page.locator('.quest').waitFor();
    await dismiss();
    assert.equal((await page.textContent('.quest-count')).trim(), '0/4');
    assert.ok(await page.locator('.quest .btn-primary').isDisabled(), 'claim disabled at 0/4');
  });
  const count = async () => (await page.textContent('.quest-count')).trim();
  await step(13, 'quest step 1: first meal', async () => {
    await page.locator('.today-btn:not(.today-sport)').first().click();
    await page.waitForTimeout(600);
    assert.equal(await count(), '1/4');
  });
  await step(14, 'quest step 2: starting weight', async () => {
    await page.fill('#start-weight', '72.5'); await page.locator('#start-weight').blur();
    await page.waitForTimeout(800);
    assert.equal(await count(), '2/4');
  });
  await step(15, 'quest step 3: first workout', async () => {
    await page.locator('.today-sport').click();
    await page.locator('.backdrop .chip').first().click().catch(() => {});
    await page.locator('.backdrop button.btn-primary').first().click();
    await page.waitForTimeout(800);
    assert.equal(await count(), '3/4');
  });
  await step(16, 'quest step 4: a full day', async () => {
    const meals = page.locator('.today-btn:not(.today-sport)');
    for (let i = 1; i < 3; i++) await meals.nth(i).click();
    await page.waitForTimeout(800);
    assert.equal(await count(), '4/4');
  });
  await step(17, 'claim +100 once', async () => {
    const coinsBefore = JSON.stringify(await api('rewards', {}, second.token));
    await page.locator('.quest .btn-primary:not([disabled])').click();
    await page.locator('.quest').waitFor({ state: 'detached' });
    const q = await api('questStatus', {}, second.token);
    assert.equal(q.paid, true);
    const again = await api('claimQuest', {}, second.token); // a second claim must not pay again
    assert.equal(again.paid, true);
    const after = JSON.stringify(await api('rewards', {}, second.token));
    const total = (s) => Number((s.match(/"(?:coins|balance|total)":\s*(\d+)/) ?? [])[1] ?? NaN);
    assert.equal(total(after) - total(coinsBefore) >= 100, true, `coins grew by 100: ${coinsBefore.slice(0, 120)} → ${after.slice(0, 120)}`);
    const third = await api('claimQuest', {}, second.token);
    assert.equal(total(JSON.stringify(await api('rewards', {}, second.token))), total(after), 'no second payout: ' + JSON.stringify(third));
    await page.reload(); await page.locator('.today-btn').first().waitFor(); await page.waitForTimeout(500);
    assert.equal(await page.locator('.quest').count(), 0, 'quest card stays gone after reload');
  });
});
