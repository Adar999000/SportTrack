import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const day = (o: any = {}) => ({ breakfast: null, lunch: null, dinner: null, sport: { status: null, countsAsWorkout: false }, smoked: null, ...o });
const full = (workout = false) =>
  day({ breakfast: 'V', lunch: 'V', dinner: 'X', sport: workout ? { status: 'V', label: 'ריצה', countsAsWorkout: true } : { status: '-', countsAsWorkout: false } });
const wk = (sunday: string, days: any[], weight?: number) => ({
  sundayDate: sunday, updatedAt: Date.now(),
  data: { sundayDate: sunday, days, ...(weight !== undefined ? { startWeight: weight } : {}) },
  summary: {},
});

// "today" is Wednesday 2026-12-09; rewards start on the first call (that day)
const NOW = '2026-12-09T10:00:00Z';

/** Pretend every user registered before the rewards start (new users otherwise start on their signup day). */
function backdate(be: any) {
  be.sheets.Users.data.slice(1).forEach((r: any[]) => (r[6] = '2026-11-01T08:00:00.000Z'));
}

function setup(now = NOW) {
  const be = createBackend({ now });
  const admin = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אדר' });
  be.properties.set('REWARDS_START', '2026-12-06');
  backdate(be);
  return { be, t: admin.token, admin };
}

describe('rewards', () => {
  it('pays for full days and workouts, and counts the weekly challenge', () => {
    const { be, t } = setup();
    // week of Sun 6/12: Sun–Wed filled, 3 workouts
    be.post({ action: 'putWeeks', token: t, weeks: [wk('2026-12-06', [full(true), full(true), full(false), full(true), day(), day(), day()], 100)] });
    const r = be.post({ action: 'rewards', token: t }).rewards;
    // 4 full days ×5 + 3 workouts ×10 + weigh-in 5 + weekly challenge 30 (no day had all 3 meals V)
    expect(r.balance).toBe(20 + 30 + 5 + 30);
    expect(r.challenges[0]).toMatchObject({ id: 'day3', period: 'day', target: 3 });
    expect(r.challenges.find((c: any) => c.id === 'week3')).toMatchObject({ progress: 3, target: 3 });
    expect(r.badges.week3).toBe(1);
    expect(r.level).toMatchObject({ n: 1, name: 'מתחיל' });
  });

  it('regular users get a capped opening bonus for history; approved history counts in full', () => {
    const { be, t } = setup();
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'U' });
    backdate(be);
    const old = Array.from({ length: 120 }, (_, i) => {
      const d = new Date(Date.UTC(2024, 0, 7 + 7 * i)).toISOString().slice(0, 10);
      return wk(d, Array.from({ length: 7 }, () => full(true)), 90);
    });
    be.post({ action: 'putWeeks', token: u.token, weeks: old });
    let r = be.post({ action: 'rewards', token: u.token }).rewards;
    expect(r.fullHistory).toBe(false);
    expect(r.items.find((x: any) => x.kind === 'bonus').amount).toBe(500);
    expect(r.items.filter((x: any) => x.kind === 'workout')).toHaveLength(0);
    // the admin approves the user's history
    expect(be.post({ action: 'approveHistory', token: u.token, userId: u.user.userId, approved: true }).error).toMatch(/מנהל/);
    be.post({ action: 'approveHistory', token: t, userId: u.user.userId, approved: true });
    r = be.post({ action: 'rewards', token: u.token }).rewards;
    expect(r.fullHistory).toBe(true);
    expect(r.items.some((x: any) => x.kind === 'bonus')).toBe(false);
    expect(r.lifetime).toBeGreaterThan(10000);
  });

  it('levels unlock perks: assistant messages, free items and store discounts', () => {
    const { be, t } = setup();
    const many = Array.from({ length: 60 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 0, 1 + 7 * i)).toISOString().slice(0, 10);
      return wk(d, Array.from({ length: 7 }, () => day({ breakfast: 'V', lunch: 'V', dinner: 'V', sport: { status: 'V', label: 'ריצה', countsAsWorkout: true } })), 90);
    });
    be.post({ action: 'putWeeks', token: t, weeks: many });
    const r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.level.n).toBeGreaterThanOrEqual(13);
    expect(r.level.n).toBeLessThan(15);
    expect(r.perks.discount).toBe(30);
    expect(r.perks.chatBonus).toBeGreaterThanOrEqual(20);
    expect(r.unlocked).toEqual(expect.arrayContaining(['frame:silver', 'color:gold', 'color:plum', 'bg:midnight', 'frame:diamond']));
    const ocean = r.catalog.find((c: any) => c.kind === 'bg' && c.id === 'ocean');
    expect(ocean.price).toBe(140); // 200 - 30%
    const before = r.balance;
    const res = be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'bg', id: 'ocean' });
    const after = res.rewards;
    expect(before - after.balance).toBe(140);
    expect(after.unlocked).toContain('bg:ocean');
    expect(be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'bg', id: 'ocean' }).error).toMatch(/כבר/);
    expect(r.levels).toHaveLength(15);
  });

  it('frames: only owned ones can be worn, and others see them on the leaderboard', () => {
    const { be, t } = setup();
    be.post({ action: 'putWeeks', token: t, weeks: [wk('2026-12-06', [full(true), full(true), full(true), full(true), day(), day(), day()], 100)] });
    expect(be.post({ action: 'setFrame', token: t, frame: 'diamond' }).error).toMatch(/לא שלך/);
    be.properties.set('X', '1');
    const r = be.post({ action: 'rewards', token: t }).rewards;
    const silver = r.catalog.find((c: any) => c.id === 'silver');
    expect(silver.price).toBe(120);
    // give coins via a bigger history, then buy and wear
    const lots = Array.from({ length: 10 }, (_, i) => wk(new Date(Date.UTC(2026, 9, 4 + 7 * i)).toISOString().slice(0, 10), Array.from({ length: 7 }, () => full(true)), 100));
    be.post({ action: 'putWeeks', token: t, weeks: lots });
    be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'frame', id: 'fire' });
    expect(be.post({ action: 'setFrame', token: t, frame: 'fire' }).frame).toBe('fire');
    expect(be.post({ action: 'leaderboard', token: t, period: 'all' }).leaders[0].frame).toBe('fire');
  });

  it('some store items open only from a certain level', () => {
    const { be, t } = setup();
    const r = be.post({ action: 'rewards', token: t }).rewards;
    const dragon = r.catalog.find((c: any) => c.kind === 'mascot' && c.id === 'dragon');
    expect(dragon).toMatchObject({ minLevel: 8, locked: true });
    expect(r.catalog.find((c: any) => c.kind === 'mascot' && c.id === 'rabbit')).toMatchObject({ minLevel: 0, locked: false });
    expect(be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'mascot', id: 'dragon' }).error).toMatch(/נפתח ברמה 8/);
  });

  it('assistant characters and accessories are store items', () => {
    const { be, t } = setup();
    const lots = Array.from({ length: 10 }, (_, i) => wk(new Date(Date.UTC(2026, 9, 4 + 7 * i)).toISOString().slice(0, 10), Array.from({ length: 7 }, () => full(true)), 100));
    be.post({ action: 'putWeeks', token: t, weeks: lots });
    const r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.catalog.find((c: any) => c.kind === 'mascot' && c.id === 'dragon').base).toBe(400);
    expect(r.catalog.find((c: any) => c.kind === 'mascot' && c.id === 'lion')).toBeUndefined(); // free, not sold
    const after = be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'mascot', id: 'tiger' }).rewards;
    expect(after.unlocked).toContain('mascot:tiger');
    expect(be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'acc', id: 'galaxy' }).rewards.unlocked).toContain('acc:galaxy');
    expect(be.post({ action: 'spend', token: t, item: 'cosmetic', kind: 'acc', id: 'nope' }).error).toMatch(/לא מוכר/);
  });

  it('rewards weight progress at most one kg per week, then the goal', () => {
    const { be, t } = setup();
    be.post({ action: 'updateProfile', token: t, profile: { goalWeight: 97 } });
    be.post({ action: 'putWeeks', token: t, weeks: [
      wk('2026-11-29', [day()], 100), // baseline (before start)
      wk('2026-12-06', [day()], 97.5), // lost 2.5 kg in a week: only 1 milestone now
    ] });
    let r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.items.filter((x: any) => x.kind === 'weight').map((x: any) => x.amount)).toEqual([20]);
    // a week later at the goal: the next milestone, then the goal bonus
    const { be: be2, admin: a2 } = setup('2026-12-16T10:00:00Z');
    be2.post({ action: 'updateProfile', token: a2.token, profile: { goalWeight: 97 } });
    be2.post({ action: 'putWeeks', token: a2.token, weeks: [wk('2026-11-29', [day()], 100), wk('2026-12-06', [day()], 97.5), wk('2026-12-13', [day()], 97)] });
    r = be2.post({ action: 'rewards', token: a2.token }).rewards;
    expect(r.items.filter((x: any) => x.kind === 'weight').map((x: any) => x.amount).sort()).toEqual([20, 20, 200].sort());
    expect(r.badges.goal).toBe(1);
  });

  it('referral: +50 to both when a friend joins with your code, +50 more after their first full week', () => {
    const { be, t } = setup();
    const inv = be.post({ action: 'myInvite', token: t });
    expect(inv.code).toMatch(/^[A-Z0-9]{6}$/);
    expect(be.post({ action: 'myInvite', token: t }).code).toBe(inv.code); // permanent personal code
    const friend = be.post({ action: 'register', email: 'f@x.com', password: 'secret12', name: 'נועה', invite: inv.code });
    backdate(be);
    let r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.items.filter((x: any) => x.kind === 'referral').map((x: any) => x.amount)).toEqual([50]);
    const fr = be.post({ action: 'rewards', token: friend.token }).rewards;
    expect(fr.items.find((x: any) => x.label === 'הצטרפת עם קוד הזמנה').amount).toBe(50);
    be.post({ action: 'putWeeks', token: friend.token, weeks: [wk('2026-12-06', [full(), full(), full(), full(), full(), day(), day()])] });
    r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.items.filter((x: any) => x.kind === 'referral')).toHaveLength(2);
  });

  it('pays the sender for at most 5 friends, but the code keeps working', () => {
    const { be, t } = setup();
    const { code } = be.post({ action: 'myInvite', token: t });
    for (let i = 0; i < 7; i++) be.post({ action: 'register', email: `f${i}@x.com`, password: 'secret12', name: 'F', invite: code });
    backdate(be);
    const r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.items.filter((x: any) => x.kind === 'referral')).toHaveLength(5);
    expect(be.post({ action: 'myInvite', token: t })).toMatchObject({ used: 7, rewarded: 5 });
  });

  it('spends coins: freeze a day for the lunch streak, buy bot messages, unlock a color', () => {
    const { be, t } = setup();
    be.properties.set('OPENAI_API_KEY', 'sk');
    be.properties.set('CHAT_DAILY_LIMIT', '1');
    const many = [wk('2026-12-06', [full(true), full(true), full(true), full(true), day(), day(), day()], 100)];
    be.post({ action: 'putWeeks', token: t, weeks: many });
    // balance 4×5 + 4×10 + 5 + 30 = 95
    expect(be.post({ action: 'spend', token: t, item: 'color', color: 'gold' }).error).toMatch(/מספיק/);
    let r = be.post({ action: 'spend', token: t, item: 'freezeDay', date: '2026-12-05' }).rewards;
    expect(r.frozenDays).toEqual(['2026-12-05']);
    expect(r.balance).toBe(45);
    expect(be.post({ action: 'spend', token: t, item: 'freezeDay', date: '2026-12-05' }).error).toMatch(/כבר/);
    expect(be.post({ action: 'spend', token: t, item: 'freezeDay', date: '2026-11-01' }).error).toMatch(/14/);
    r = be.post({ action: 'spend', token: t, item: 'chat10' }).rewards;
    expect(r.chatCredits).toBe(10);
    be.post({ action: 'chat', token: t, messages: [] });
    be.post({ action: 'chat', token: t, messages: [] }); // over the daily limit: uses a credit
    r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.chatCredits).toBe(9);
    expect(r.balance).toBe(15);
  });

  it('levels come from lifetime coins, and the leaderboard ranks by period', () => {
    const { be, t } = setup();
    const { code } = be.post({ action: 'createInvite', token: t });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'נועה', invite: code });
    backdate(be);
    be.post({ action: 'putWeeks', token: u.token, weeks: [wk('2026-12-06', [full(true), full(true), full(true), full(true), day(), day(), day()])] });
    const leaders = be.post({ action: 'leaderboard', token: t, period: 'week' }).leaders;
    expect(leaders[0].name).toBe('נועה');
    expect(leaders[0].week).toBeGreaterThan(0);
    expect(Object.keys(leaders[0])).not.toContain('email');
  });

  it('daily challenge: all three meals V pays 15 and counts a "perfect day" badge', () => {
    const { be, t } = setup();
    const perfect = day({ breakfast: 'V', lunch: 'V', dinner: 'V', sport: { status: '-', countsAsWorkout: false } });
    be.post({ action: 'putWeeks', token: t, weeks: [wk('2026-12-06', [perfect, perfect, day(), perfect, day(), day(), day()])] });
    const r = be.post({ action: 'rewards', token: t }).rewards;
    expect(r.items.filter((x: any) => x.label.startsWith('אתגר יומי'))).toHaveLength(3);
    expect(r.badges.day3).toBe(3);
    // today (Wednesday) is perfect → today's challenge shows 3/3
    expect(r.challenges.find((c: any) => c.id === 'day3').progress).toBe(3);
  });
});
