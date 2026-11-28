import { describe, expect, it } from 'vitest';
import { formatHours, funnelRows, type FunnelResponse } from '../src/funnel';

const base: FunnelResponse = {
  days: 30, from: '2026-10-28', to: '2026-11-27',
  visitors: { landing: 200, signupOpen: 40 },
  cohort: { signedUp: 20, onboarded: 18, firstMark: 16, firstFullDay: 10, day3Eligible: 16, day3Returned: 8, day7Eligible: 10, day7Returned: 4, invitedAny: 6, invitedConverted: 3 },
  weeks: [], medianHoursToFirstMark: 0.1,
};
const row = (r: ReturnType<typeof funnelRows>, k: string) => r.find((x) => x.key === k)!;

describe('admin funnel rows', () => {
  it('has the nine steps in order', () => {
    expect(funnelRows(base).map((r) => r.key)).toEqual(['landing', 'signupOpen', 'signedUp', 'onboarded', 'firstMark', 'firstFullDay', 'day3', 'day7', 'invited']);
  });

  it('computes % of signed-up and % of previous step', () => {
    const r = funnelRows(base);
    expect(row(r, 'landing')).toMatchObject({ count: 200, ofSignedUp: null, ofPrev: null, tooFew: false });
    expect(row(r, 'signupOpen')).toMatchObject({ ofSignedUp: null, ofPrev: 20 });
    expect(row(r, 'signedUp')).toMatchObject({ ofSignedUp: 100, ofPrev: 50 });
    expect(row(r, 'onboarded')).toMatchObject({ ofSignedUp: 90, ofPrev: 90 });
    expect(row(r, 'firstFullDay')).toMatchObject({ ofSignedUp: 50, ofPrev: 63 });
  });

  it('uses the eligible users for day-3 and day-7 returns', () => {
    const r = funnelRows(base);
    expect(row(r, 'day3')).toMatchObject({ count: 8, base: 16, ofSignedUp: 50 });
    expect(row(r, 'day7')).toMatchObject({ count: 4, base: 10, ofSignedUp: 40 });
  });

  it('hides percentages when the denominator is under 5', () => {
    const r = funnelRows({ ...base, cohort: { ...base.cohort, signedUp: 4, onboarded: 3, day7Eligible: 2, day7Returned: 1 } });
    expect(row(r, 'onboarded')).toMatchObject({ ofSignedUp: null, ofPrev: null, tooFew: true });
    expect(row(r, 'day7')).toMatchObject({ ofSignedUp: null, tooFew: true });
    // the sign-up row itself still shows its count
    expect(row(r, 'signedUp')).toMatchObject({ count: 4, ofSignedUp: 100 });
  });

  it('handles an empty period', () => {
    const z = { ...base, visitors: { landing: 0, signupOpen: 0 }, cohort: Object.fromEntries(Object.keys(base.cohort).map((k) => [k, 0])) as FunnelResponse['cohort'] };
    const r = funnelRows(z);
    expect(r.every((x) => x.count === 0)).toBe(true);
    expect(row(r, 'signedUp').ofSignedUp).toBeNull();
  });
});

describe('median time format', () => {
  it('picks minutes, hours or days', () => {
    expect(formatHours(null)).toBeNull();
    expect(formatHours(0.1)).toEqual({ n: 6, unit: 'min' });
    expect(formatHours(3.46)).toEqual({ n: 3.5, unit: 'h' });
    expect(formatHours(72)).toEqual({ n: 3, unit: 'd' });
/**
 * T24: tests for the admin funnel (`adminFunnel`, T22; spec: team/specs/beta-metrics.md §3).
 * A fixed cohort is built on the mock backend with a movable clock, so every step has a known count.
 * The funnel tests skip themselves until the backend implements `adminFunnel`; the fixture checks always run.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const DAY = 864e5;
const D0 = Date.UTC(2026, 9, 1, 9, 0, 0); // 2026-10-01 09:00 UTC
const TODAY = 12; // "now" is D0 + 12 days
const sundayOf = (d: number) => { const t = new Date(D0 + d * DAY); t.setUTCDate(t.getUTCDate() - t.getUTCDay()); return t.toISOString().slice(0, 10); };

const markedWeek = (d: number, full: boolean) => {
  const sunday = sundayOf(d);
  const idx = new Date(D0 + d * DAY).getUTCDay();
  const days = Array.from({ length: 7 }, () => ({ sport: { status: null, label: '', countsAsWorkout: false } })) as any[];
  days[idx] = { breakfast: 'V', ...(full ? { lunch: 'V', dinner: 'V', sport: { status: 'V', label: 'ריצה', countsAsWorkout: true } } : {}), sport: full ? { status: 'V', label: 'ריצה', countsAsWorkout: true } : { status: null, label: '', countsAsWorkout: false } };
  return { sundayDate: sunday, updatedAt: D0 + d * DAY, data: { sundayDate: sunday, days }, summary: { workouts: full ? 1 : 0, mealsPct: 10 } };
};

interface Cohort { be: any; admin: { token: string }; tokens: Record<string, string>; setDay: (d: number) => void }

/** Cohort (day = sign-up day offset, age = TODAY - day):
 *  A d0  age12 onboarded, mark, FULL day, active +3 +7, invited X-> converted
 *  B d0  age12 onboarded, mark,           active +3
 *  C d0  age12 nothing at all
 *  X d1  age11 (A's invite) mark,         active +4 +8
 *  G d5  age 7 onboarded,                 active +8   (day-3 eligible, NOT day-7 eligible)
 *  D d9  age 3 onboarded                  (too young for both)
 *  E d11 age 1                            (too young for both)
 *  admin d0 marks everything; must be excluded.
 */
function buildCohort(): Cohort {
  let day = 0;
  const be = createBackend({ now: () => D0 + day * DAY });
  const setDay = (d: number) => { day = d; };
  const tokens: Record<string, string> = {};
  const reg = (key: string, at: number, extra: Record<string, unknown> = {}) => {
    setDay(at);
    const r = be.post({ action: 'register', email: `${key.toLowerCase()}@example.com`, password: 'secret12', name: `שם-${key}`, terms: true, ...extra });
    if (r.error) throw new Error(`register ${key}: ${r.error}`);
    tokens[key] = r.token;
    return r;
  };
  const act = (key: string, d: number) => { setDay(d); be.post({ action: 'track', token: tokens[key], events: { 'screen:week': 1 } }); };
  const done = (key: string) => be.post({ action: 'updateProfile', token: tokens[key], profile: { completed: true } });
  const marks = (key: string, d: number, full: boolean) => { setDay(d); be.post({ action: 'putWeeks', token: tokens[key], weeks: [markedWeek(d, full)] }); };

  const admin = reg('admin', 0);
  marks('admin', 0, true); done('admin');
  reg('A', 0); done('A'); marks('A', 0, true); act('A', 3); act('A', 7);
  reg('B', 0); done('B'); marks('B', 0, false); act('B', 3);
  reg('C', 0);
  setDay(1);
  const code = be.post({ action: 'myInvite', token: tokens.A }).code;
  reg('X', 1, { invite: code }); marks('X', 1, false); act('X', 4); act('X', 8);
  reg('G', 5); done('G'); act('G', 8);
  reg('D', 9); done('D');
  reg('E', 11);
  setDay(TODAY);
  return { be, admin, tokens, setDay };
}

const probe = createBackend();
const first = probe.post({ action: 'register', email: 'p@example.com', password: 'secret12', name: 'p', terms: true });
const implemented = !/פעולה לא מוכרת/.test(probe.post({ action: 'adminFunnel', token: first.token, days: 30 }).error ?? '');

describe('funnel fixture (always runs)', () => {
  it('builds the known cohort: 8 accounts, 7 non-admin sign-ups, A invited X', () => {
    const c = buildCohort();
    const users = c.be.post({ action: 'listUsers', token: c.admin.token }).users;
    expect(users).toHaveLength(8);
    expect(users.filter((u: any) => u.role === 'admin')).toHaveLength(1);
    const me = c.be.post({ action: 'me', token: c.tokens.A });
    expect(me.user.profile.completed).toBe(true);
    const q = (k: string) => c.be.post({ action: 'questStatus', token: c.tokens[k] }).steps;
    expect(q('A')).toMatchObject({ meal: true, full: true });
    expect(q('B')).toMatchObject({ meal: true, full: false });
    expect(q('C')).toMatchObject({ meal: false, full: false });
    expect(c.be.post({ action: 'me', token: c.tokens.X }).user.profile.completed).toBeFalsy();
    const an = c.be.post({ action: 'adminAnalytics', token: c.admin.token, days: 30 });
    expect(JSON.stringify(an)).toContain('screen:week');
  });
});

describe.skipIf(!implemented)('adminFunnel (T22)', () => {
  const funnel = (c: Cohort, days = 30, token = c.admin.token) => c.be.post({ action: 'adminFunnel', token, days });

  it('known cohort gives the expected count for every step (admin excluded)', () => {
    const c = buildCohort();
    const f = funnel(c);
    expect(f.error).toBeUndefined();
    expect(f.cohort).toMatchObject({
      signedUp: 7,
      onboarded: 4,      // A B G D
      firstMark: 3,      // A B X
      firstFullDay: 1,   // A
      day3Eligible: 5,   // A B C X G
      day3Returned: 4,   // A B X G
      day7Eligible: 4,   // A B C X
      day7Returned: 2,   // A X
      invitedConverted: 1, // A
    });
    expect(f.cohort.invitedAny).toBeGreaterThanOrEqual(1);
    expect(f.days).toBe(30);
  });

  it('users younger than 4 / 8 days are not counted as non-returners', () => {
    const c = buildCohort();
    const f = funnel(c).cohort;
    // D (age 3) and E (age 1) are in neither denominator; G (age 7) only in day 3
    expect(f.day3Eligible).toBe(5);
    expect(f.day7Eligible).toBe(4);
    expect(f.signedUp - f.day3Eligible).toBe(2);
    expect(f.signedUp - f.day7Eligible).toBe(3);
    // a day later D becomes day-3 eligible (age 4) and now counts as a non-returner
    c.setDay(TODAY + 1);
    const later = funnel(c).cohort;
    expect(later.day3Eligible).toBe(6);
    expect(later.day3Returned).toBe(4);
  });

  it('period selects the sign-up cohort: 7 days keeps only recent sign-ups', () => {
    const c = buildCohort();
    const f = funnel(c, 7).cohort; // D0+5..D0+12: G, D, E
    expect(f.signedUp).toBe(3);
    expect(f.onboarded).toBe(2);
    expect(f.firstMark).toBe(0);
  });

  it('is admin-only', () => {
    const c = buildCohort();
    expect(funnel(c, 30, c.tokens.A).error).toBeTruthy();
    expect(c.be.post({ action: 'adminFunnel', days: 30 }).error).toBeTruthy();
  });

  it('contains counts only: no names, emails, user ids or tokens', () => {
    const c = buildCohort();
    const f = funnel(c);
    const text = JSON.stringify(f);
    for (const key of Object.keys(c.tokens)) {
      expect(text).not.toContain(`${key.toLowerCase()}@example.com`);
      expect(text).not.toContain(`שם-${key}`);
      expect(text).not.toContain(c.tokens[key]);
    }
    const ids = c.be.post({ action: 'listUsers', token: c.admin.token }).users.map((u: any) => u.userId);
    ids.forEach((id: string) => expect(text).not.toContain(id));
    expect(text).not.toMatch(/email|userId|token|name"/i);
    expect(Object.keys(f).sort()).toEqual(['cohort', 'days', 'from', 'medianHoursToFirstMark', 'to', 'visitors', 'weeks']);
    const walk = (v: unknown) => { if (v && typeof v === 'object') Object.values(v).forEach(walk); else expect(['number', 'string', 'object'].includes(typeof v)).toBe(true); };
    walk(f);
  });
});
