import { describe, expect, it } from 'vitest';
import { PLANS, newPlan, nextTrainingDate, planDef, planWeek, todayState, totalSessions, withDone } from '../src/plans';

const run = planDef('run5k')!;
const str = planDef('home3')!;
// 2026-11-29 is a Sunday
const SUN = '2026-11-29', MON = '2026-11-30', TUE = '2026-12-01', THU = '2026-12-03', SAT = '2026-12-05';

describe('training plan definitions', () => {
  it('has 8 weeks × 3 sessions with content for every session', () => {
    for (const p of PLANS) {
      expect(totalSessions(p)).toBe(24);
      for (let i = 0; i < 24; i++) {
        const s = p.session(i);
        expect(s.label).toBeTruthy();
        expect(s.steps.length).toBeGreaterThanOrEqual(3);
        expect(s.minutes).toBeGreaterThan(0);
        expect(s.kind).toBe(p.kind);
      }
    }
  });

  it('run plan builds up from walk-run intervals to 5 km', () => {
    expect(run.session(0).headline).toContain('8');
    expect(run.session(0).label).toBe('ריצה: שבוע 1, אימון 1');
    expect(run.session(23).headline).toContain('5 ק"מ');
    expect(run.session(23).label).toBe('ריצה: שבוע 8, אימון 3');
  });

  it('strength plan rotates three workouts and adds rounds', () => {
    expect(str.session(0).steps[2]).not.toBe(str.session(1).steps[2]);
    expect(str.session(0).steps[2]).toBe(str.session(3).steps[2].replace('10', '8'));
    expect(str.session(0).headline).toContain('2');
    expect(str.session(23).headline).toContain('4');
  });

  it('sport row labels are counted as workouts (not rest)', async () => {
    const { isNonWorkoutLabel } = await import('../src/model');
    for (const p of PLANS) expect(isNonWorkoutLabel(p.session(0).label)).toBe(false);
  });
});

describe('plan schedule', () => {
  const a = newPlan('run5k', SUN, [4, 0, 2, 2]);

  it('dedupes and sorts training days', () => {
    expect(a.days).toEqual([0, 2, 4]);
    expect(a.done).toEqual([]);
  });

  it('is due on a training day and rests on other days', () => {
    expect(todayState(a, run, SUN)).toEqual({ state: 'due', index: 0 });
    expect(todayState(a, run, MON)).toEqual({ state: 'rest', index: 0, nextDate: TUE });
    expect(todayState(a, run, SAT)).toEqual({ state: 'rest', index: 0, nextDate: '2026-12-06' });
  });

  it('finds the next training day, wrapping into next week', () => {
    expect(nextTrainingDate(a, SUN)).toBe(TUE);
    expect(nextTrainingDate(a, THU)).toBe('2026-12-06');
    expect(nextTrainingDate({ ...a, days: [] }, THU)).toBeNull();
  });

  it('marks a session done once per day and shows the next date', () => {
    const b = withDone(a, run, SUN);
    expect(b.done).toEqual([SUN]);
    expect(withDone(b, run, SUN)).toBe(b);
    expect(todayState(b, run, SUN)).toEqual({ state: 'doneToday', index: 0, nextDate: TUE });
    expect(todayState(b, run, TUE)).toEqual({ state: 'due', index: 1 });
  });

  it('a missed day does not skip a session', () => {
    // skipped Sunday, so Tuesday still shows session 1 (index 0)
    expect(todayState(a, run, TUE)).toEqual({ state: 'due', index: 0 });
  });

  it('counts weeks by sessions done and caps at the last week', () => {
    let b = a;
    expect(planWeek(b, run)).toBe(1);
    for (let i = 0; i < 3; i++) b = { ...b, done: [...b.done, `2026-01-0${i + 1}`] };
    expect(planWeek(b, run)).toBe(2);
    b = { ...b, done: Array.from({ length: 24 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`) };
    expect(planWeek(b, run)).toBe(8);
  });

  it('finishes after the last session and never goes past it', () => {
    const done = Array.from({ length: 23 }, (_, i) => `2025-01-${String(i + 1).padStart(2, '0')}`);
    const b = withDone({ ...a, done }, run, THU);
    expect(b.done.length).toBe(24);
    expect(todayState(b, run, THU)).toEqual({ state: 'doneToday', index: 23, nextDate: null });
    expect(todayState(b, run, '2026-12-06')).toEqual({ state: 'finished' });
    expect(withDone(b, run, '2026-12-06')).toBe(b);
  });
});
