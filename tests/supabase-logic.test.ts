/**
 * Parity tests for the Supabase port: the pure rules in backend/supabase/functions/_shared/logic.ts
 * must give exactly what apps-script/server.js gives for the same data.
 */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';
import {
  checkLegacyPassword, cleanStory, gz, leagueFor, passwordProblem, planPost, type RewardsInput, rewardsFor, sortLeaders, spendPlan, todayStr,
} from '../backend/supabase/functions/_shared/logic';

const NOW = '2026-12-09T10:00:00Z'; // Wednesday
const TODAY = '2026-12-09';

const day = (o: any = {}) => ({ breakfast: null, lunch: null, dinner: null, sport: { status: null, countsAsWorkout: false }, ...o });
const good = (workout = false) =>
  day({ breakfast: 'V', lunch: 'V', dinner: 'V', sport: workout ? { status: 'V', label: 'ריצה', countsAsWorkout: true } : { status: '-', countsAsWorkout: false } });
const mixed = (workout = false) =>
  day({ breakfast: 'V', lunch: 'V', dinner: 'X', sport: workout ? { status: 'V', label: 'כוח', countsAsWorkout: true } : { status: '-', countsAsWorkout: false } });
const wk = (sunday: string, days: any[], weight?: number) => ({
  sundayDate: sunday, updatedAt: 1000,
  data: { sundayDate: sunday, days, ...(weight !== undefined ? { startWeight: weight } : {}) },
  summary: {},
});

/** Build the port's input from the mock Sheet, the way migrate-from-sheets maps the columns. */
function inputFromSheets(be: any, uid: string): RewardsInput {
  const users: any[][] = be.sheets.Users.data.slice(1);
  const extra = (r: any[]) => JSON.parse(String(r[10] || '{}'));
  const u = users.find((r) => r[0] === uid)!;
  const weeksOf = (id: string) => be.sheets.Weeks.data.slice(1).filter((r: any[]) => r[0] === id).map((r: any[]) => ({ sunday: String(r[1]), data: r[7] }));
  const ledger = (be.sheets.Ledger?.data.slice(1) || []).filter((r: any[]) => r[0] === uid)
    .map((r: any[]) => ({ at: String(r[1]), amount: Number(r[2]), ref: String(r[3]), label: String(r[4]) }));
  return {
    user: {
      id: uid, createdAt: String(u[6]), role: u[3], historyApproved: extra(u).historyApproved === true, profile: JSON.parse(String(u[9] || '{}')),
      invitedBy: extra(u).invitedBy || null, frame: extra(u).frame || '', chatCredits: Number(extra(u).chatCredits) || 0,
    },
    weeks: weeksOf(uid),
    ledger,
    invitees: users.filter((r) => extra(r).invitedBy === uid).map((r) => ({ id: r[0], name: r[2], createdAt: String(r[6]), weeks: weeksOf(r[0]) })),
    rewardsStart: be.properties.get('REWARDS_START'),
    today: TODAY,
  };
}

function world() {
  const be = createBackend({ now: NOW });
  const admin = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אדר' });
  const { code } = be.post({ action: 'myInvite', token: admin.token });
  const user = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בת', invite: code });
  be.properties.set('REWARDS_START', '2026-12-06');
  // the friend joined in November, before the rewards start (so history counts as an opening bonus)
  be.sheets.Users.data[2][6] = '2026-11-01T08:00:00.000Z';
  return { be, admin, user };
}

describe('Supabase port: rewards parity with Apps Script', () => {
  it('gives the same rewards for an admin with history, a goal, freezes and a referral', () => {
    const { be, admin, user } = world();
    be.post({ action: 'updateProfile', token: admin.token, profile: { goalWeight: 80 } });
    be.post({ action: 'putWeeks', token: admin.token, weeks: [
      wk('2026-11-15', [good(true), good(true), mixed(true), good(), good(true), day(), day()], 84),
      wk('2026-11-22', [good(true), mixed(true), good(true), good(true), day(), day(), day()], 82.4),
      wk('2026-11-29', [good(), good(), good(), good(), good(), good(), good()], 80.5),
      wk('2026-12-06', [good(true), mixed(true), good(true), good(), day(), day(), day()], 79.8),
    ] });
    // the friend completes a first full week (pays the admin a referral bonus)
    be.post({ action: 'putWeeks', token: user.token, weeks: [wk('2026-11-22', [mixed(true), mixed(), mixed(true), mixed(), mixed(true), day(), day()], 70)] });
    // spending: freeze a day and a week, buy a frame
    const balance = be.post({ action: 'rewards', token: admin.token }).rewards.balance;
    expect(balance).toBeGreaterThan(200);
    expect(be.post({ action: 'spend', token: admin.token, item: 'freezeDay', date: '2026-12-01' }).error).toBeUndefined();
    expect(be.post({ action: 'spend', token: admin.token, item: 'freezeWeek', date: '2026-11-29' }).error).toBeUndefined();
    expect(be.post({ action: 'spend', token: admin.token, item: 'cosmetic', kind: 'frame', id: 'fire' }).error).toBeUndefined();

    const gas = be.post({ action: 'rewards', token: admin.token }).rewards;
    const port = rewardsFor(inputFromSheets(be, admin.user.userId));
    expect(port).toEqual(gas);
    expect(port.badges.friend).toBe(1);
    expect(port.frozenWeeks).toEqual(['2026-11-29']);
  });

  it('gives the same rewards for a regular user (opening bonus for history before the start)', () => {
    const { be, user } = world();
    be.post({ action: 'putWeeks', token: user.token, weeks: [
      wk('2026-11-22', [good(true), good(true), good(true), mixed(true), day(), day(), day()], 70),
      wk('2026-12-06', [good(true), mixed(true), good(), good(true), day(), day(), day()], 69),
    ] });
    const gas = be.post({ action: 'rewards', token: user.token }).rewards;
    const port = rewardsFor(inputFromSheets(be, user.user.userId));
    expect(port).toEqual(gas);
    expect(port.items.some((x) => x.kind === 'bonus')).toBe(true);
    expect(port.items.some((x) => x.kind === 'referral')).toBe(true); // joined with a code
  });

  it('refuses purchases with the same messages', () => {
    const { be, user } = world();
    const rw = rewardsFor(inputFromSheets(be, user.user.userId));
    const cases = [
      { item: 'freezeDay', date: '2026-10-01' },
      { item: 'freezeWeek', date: '2026-12-08' },
      { item: 'cosmetic', kind: 'skin', id: 'luxe' },
      { item: 'cosmetic', kind: 'frame', id: 'nope' },
      { item: 'other' },
    ];
    for (const c of cases) {
      const gasErr = be.post({ action: 'spend', token: user.token, ...c }).error;
      expect(() => spendPlan(c, rw, TODAY)).toThrow(gasErr);
    }
  });

  it('computes the league from the leaderboard the same way', () => {
    const { be, admin } = world();
    const gas = be.post({ action: 'league', token: admin.token });
    const leaders = be.post({ action: 'leaderboard', token: admin.token, period: 'all' }).leaders;
    expect(leagueFor(sortLeaders(leaders, 'all'), admin.user.userId)).toEqual(gas);
  });
});

describe('Supabase port: auth and posts rules', () => {
  it('accepts migrated Sheet password hashes (v2 format) and rejects wrong passwords', async () => {
    const { be } = world();
    const row = be.sheets.Users.data[1];
    expect(await checkLegacyPassword(String(row[4]), String(row[5]), 'secret12')).toBe('v2');
    expect(await checkLegacyPassword(String(row[4]), String(row[5]), 'secret13')).toBe('');
  });

  it('keeps the password rules and gendered wording', () => {
    expect(passwordProblem('short')).toMatch(/לפחות 8/);
    expect(passwordProblem('12345678')).toMatch(/קלה מדי/);
    expect(passwordProblem('a-good-one')).toBe('');
    expect(gz('הזמין/ה אותך', 'female')).toBe('הזמינה אותך');
    expect(gz('הזמין/ה אותך', 'male')).toBe('הזמין אותך');
    expect(gz('הזמין/ה אותך', '')).toBe('הזמין/ה אותך');
  });

  it('cleans a story exactly like the server', () => {
    const { be, admin } = world();
    const raw = { tpl: 'workout', bg: 'neon!', type: 'swim', distanceM: -5, durationS: 99e9, name: 'x'.repeat(90), route: [[1.234, 200], [3, 4]], views: ['spy'] };
    const post = be.post({ action: 'createPost', token: admin.token, kind: 'story', data: raw }).post;
    const { viewCount, viewers, ...data } = post.data; // author-only fields added by postOut
    expect([viewCount, viewers]).toEqual([0, []]);
    expect(cleanStory(raw)).toEqual(data);
  });

  it('validates posts with the same messages', () => {
    const { be, admin } = world();
    for (const req of [{ kind: 'text' }, { kind: 'meetup', data: { title: '' } }, { kind: 'meetup', data: { title: 'ריצה', when: '2020-01-01T10:00' } }]) {
      const gasErr = be.post({ action: 'createPost', token: admin.token, ...req }).error;
      expect(() => planPost(req, 'u1', true, Date.parse(NOW))).toThrow(gasErr);
    }
    const p = planPost({ kind: 'meetup', text: ' hi ', visibility: 'friends', data: { title: 'ריצה', when: '2026-12-20T07:00', sport: 'run', image: 'x' } }, 'u1', false, Date.parse(NOW));
    expect(p).toMatchObject({ kind: 'meetup', text: 'hi', visibility: 'friends', asTeam: false, data: { title: 'ריצה', going: ['u1'], sport: 'run' } });
    expect(p.data).not.toHaveProperty('image');
  });

  it("uses Israel's calendar day", () => {
    expect(todayStr(new Date('2026-12-09T22:30:00Z'))).toBe('2026-12-10');
    expect(todayStr(new Date('2026-12-09T21:30:00Z'))).toBe('2026-12-09');
  });
});
