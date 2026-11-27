#!/usr/bin/env node
/**
 * Load test for the Apps Script backend. Simulates N people using the app at the same time
 * (sign up, mark the week, open the feed, stories, league, rewards) and reports response times
 * and errors. Test accounts are deleted at the end.
 *
 *   node scripts/load-test.mjs --url <TEST deployment /exec URL> --users 30 --minutes 3
 *
 * Run it ONLY against a copy (a separate spreadsheet + script deployment), never the live app:
 * it creates real accounts and uses the daily quotas of the account that owns the script.
 */
import { readFileSync } from 'node:fs';
const DEPLOYED = (/DEPLOYED\s*=\s*'([^']+)'/.exec(readFileSync(new URL('../src/config.ts', import.meta.url), 'utf8')) || [])[1];

const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const URL_ = arg('url');
const USERS = Number(arg('users', 20));
const MINUTES = Number(arg('minutes', 2));
if (!URL_) { console.error('Missing --url (a TEST deployment).'); process.exit(1); }
if (URL_ === DEPLOYED && !process.argv.includes('--yes-live')) { console.error('This is the LIVE server. Use a test copy (or pass --yes-live if you really mean it).'); process.exit(1); }

const stats = new Map(); // action -> { n, errs, ms[] }
const rec = (a, ms, ok, err) => { const s = stats.get(a) ?? { n: 0, errs: 0, ms: [], last: '' }; s.n++; if (!ok) { s.errs++; s.last = err; } s.ms.push(ms); stats.set(a, s); };
async function call(action, body = {}) {
  const t0 = Date.now();
  try {
    const r = await fetch(URL_, { method: 'POST', body: JSON.stringify({ action, ...body }), redirect: 'follow' });
    const j = await r.json();
    rec(action, Date.now() - t0, !j.error, j.error);
    return j;
  } catch (e) { rec(action, Date.now() - t0, false, String(e)); return {}; }
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const iso = (d) => d.toISOString().slice(0, 10);

async function vuser(i, until) {
  const email = `loadtest+${Date.now().toString(36)}-${i}@example.test`;
  const reg = await call('register', { email, password: 'LoadTest!2345', name: 'בדיקת עומס ' + i, terms: true });
  if (!reg.token) return;
  const token = reg.token;
  await call('updateProfile', { token, profile: { completed: true } });
  const sun = new Date(); sun.setUTCDate(sun.getUTCDate() - sun.getUTCDay());
  while (Date.now() < until) {
    const day = { breakfast: 'V', lunch: Math.random() > 0.3 ? 'V' : 'X', dinner: 'V', sport: { status: 'V', label: 'ריצה', countsAsWorkout: true } };
    await call('putWeeks', { token, weeks: [{ sundayDate: iso(sun), updatedAt: Date.now(), data: { sundayDate: iso(sun), startWeight: 80, days: [day, day, day, {}, {}, {}, {}] }, summary: {} }] });
    await call('feed', { token });
    await call('stories', { token });
    await call('rewards', { token });
    if (Math.random() < 0.3) await call('league', { token });
    await sleep(3000 + Math.random() * 4000); // a person thinks between taps
  }
  await call('deleteAccount', { token, password: 'LoadTest!2345' });
}

const until = Date.now() + MINUTES * 60_000;
console.log(`Load test: ${USERS} people for ${MINUTES} min against ${URL_.slice(0, 60)}…`);
await Promise.all(Array.from({ length: USERS }, (_, i) => sleep(i * 300).then(() => vuser(i, until))));
const pct = (a, p) => { const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * p))] ?? 0; };
console.log('\naction        calls  errors   p50ms   p95ms   max');
let worst = 0;
for (const [a, s] of stats) {
  worst = Math.max(worst, pct(s.ms, 0.95));
  console.log(`${a.padEnd(13)} ${String(s.n).padStart(5)} ${String(s.errs).padStart(7)} ${String(pct(s.ms, 0.5)).padStart(7)} ${String(pct(s.ms, 0.95)).padStart(7)} ${String(Math.max(...s.ms)).padStart(7)}${s.errs ? '  ← ' + String(s.last).slice(0, 60) : ''}`);
}
console.log(worst > 8000 ? '\nResult: too slow for this many people. Time to move off Google Sheets (see docs/SCALING.md).' : '\nResult: OK for this load.');
