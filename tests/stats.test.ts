import { describe, expect, it } from 'vitest';
import { isNonWorkoutLabel } from '../src/model';
import {
  allMealsRatio, countWorkouts, lunchStreak, mealRatio, monthlyStats, quarterTrends, smokingRatio,
  warnings, weightPoints, weightSegments, weightSummary, workoutsInWeek, workoutWeekStreak,
} from '../src/stats';
import { week } from './helpers';

describe('workout counting', () => {
  it('counts V sport days but excludes vacation and rest', () => {
    const w = week('2024-01-07', {
      sport: ['ריצה (3 ק"מ)', 'חופשה ביוון', 'מנוחה', 'X', '-', 'אימון כוח (שעה)', 'מנוחת קעקוע'],
    });
    expect(workoutsInWeek(w)).toBe(2);
  });

  it('recognizes non-workout labels', () => {
    expect(isNonWorkoutLabel('חופשה')).toBe(true);
    expect(isNonWorkoutLabel('חופשה בברלין')).toBe(true);
    expect(isNonWorkoutLabel('מנוחה')).toBe(true);
    expect(isNonWorkoutLabel('ריצה')).toBe(false);
    expect(isNonWorkoutLabel('אימון בוקר')).toBe(false);
  });

  it('sums across weeks', () => {
    const a = week('2024-01-07', { sport: ['ריצה', null, 'ריצה', null, null, null, null] });
    const b = week('2024-01-14', { sport: ['חד"כ', 'חופשה', null, null, null, null, null] });
    expect(countWorkouts([a, b])).toBe(3);
  });
});

describe('V% calculation', () => {
  it('uses only V and X cells, ignoring "-" and empty', () => {
    const w = week('2024-01-07', { l: 'VVX--..' });
    expect(mealRatio(w.days, 'lunch')).toEqual({ hit: 2, total: 3, pct: 66.7 });
  });

  it('returns null when nothing is measurable', () => {
    const w = week('2024-01-07', { b: '---....' });
    expect(mealRatio(w.days, 'breakfast').pct).toBeNull();
  });

  it('combines all meals', () => {
    const w = week('2024-01-07', { b: 'V......', l: 'VX.....', d: 'X-.....' });
    expect(allMealsRatio(w.days)).toEqual({ hit: 2, total: 4, pct: 50 });
  });

  it('computes smoking yes%', () => {
    const w = week('2024-01-07', { smoke: 'yyyn...' });
    expect(smokingRatio(w.days).pct).toBe(75);
  });
});

describe('weight', () => {
  const weeks = [
    week('2024-01-07', { weight: 100 }),
    week('2024-01-14', { weight: 99.4 }),
    week('2024-01-21'), // no weigh-in
    week('2024-01-28', { weight: 98.2 }),
    week('2024-02-04', { weight: 101.1 }),
  ];

  it('computes total change, min, max, current', () => {
    const s = weightSummary(weightPoints(weeks))!;
    expect(s.change).toBe(1.1);
    expect(s.min.weight).toBe(98.2);
    expect(s.max.weight).toBe(101.1);
    expect(s.current).toEqual({ date: '2024-02-04', weight: 101.1 });
  });

  it('rounds the change to 0.1 kg', () => {
    const s = weightSummary(weightPoints([week('2024-01-07', { weight: 108.4 }), week('2024-01-14', { weight: 104.2 })]))!;
    expect(s.change).toBe(-4.2);
  });

  it('breaks the line on weeks without a weigh-in instead of interpolating', () => {
    const segs = weightSegments(weightPoints(weeks));
    expect(segs.map((s) => s.map((p) => p.weight))).toEqual([[100, 99.4], [98.2, 101.1]]);
  });

  it('returns null with no weights', () => {
    expect(weightSummary([])).toBeNull();
  });

  it('fits a trend per quarter', () => {
    const q = quarterTrends([
      { date: '2024-01-07', weight: 100 },
      { date: '2024-01-14', weight: 99 },
      { date: '2024-01-21', weight: 98 },
      { date: '2024-04-07', weight: 90 }, // alone in Q2 → skipped
    ]);
    expect(q).toHaveLength(1);
    expect(q[0].key).toBe('2024-Q1');
    expect(q[0].slopePerWeek).toBe(-1);
    expect(q[0].change).toBe(-2);
  });
});

describe('monthly stats', () => {
  it('assigns days by their own date and excludes the future', () => {
    // Week of Sun 28/01/24 spans Jan 28–31 and Feb 1–3.
    const w = week('2024-01-28', { l: 'VVVVXXX', sport: ['ריצה', null, null, null, 'ריצה', 'חופשה', null], weight: 90 });
    const m = monthlyStats([w], '2024-02-02');
    const jan = m.find((x) => x.key === '2024-01')!;
    const feb = m.find((x) => x.key === '2024-02')!;
    expect(jan.lunch.pct).toBe(100);
    expect(jan.avgWeight).toBe(90);
    expect(feb.trackedDays).toBe(2); // Sat 3/2 is in the future
    expect(feb.sportDays).toBe(1); // vacation excluded
    expect(feb.lunch.pct).toBe(0);
  });
});

describe('streaks', () => {
  it('counts consecutive lunch V days; "-" is neutral, X breaks', () => {
    const a = week('2024-01-07', { l: 'VVXVV-V' });
    const b = week('2024-01-14', { l: 'VV.....' });
    expect(lunchStreak([a, b], '2024-01-16')).toEqual({ current: 5, best: 5 });
  });

  it('does not break the current streak because today is still empty', () => {
    const a = week('2024-01-07', { l: 'VVV....' });
    expect(lunchStreak([a], '2024-01-10').current).toBe(3);
    expect(lunchStreak([a], '2024-01-11').current).toBe(0);
  });

  it('counts consecutive weeks with ≥3 workouts; the week in progress cannot break it', () => {
    const three = ['ריצה', 'ריצה', 'ריצה', null, null, null, null];
    const weeks = [
      week('2024-01-07', { sport: three }),
      week('2024-01-14', { sport: ['ריצה', 'חופשה', 'מנוחה', 'ריצה', null, null, null] }), // 2 → breaks
      week('2024-01-21', { sport: three }),
      week('2024-01-28', { sport: three }),
      week('2024-02-04', { sport: ['ריצה', null, null, null, null, null, null] }), // current week
    ];
    expect(workoutWeekStreak(weeks, '2024-02-05')).toEqual({ current: 2, best: 2 });
  });

  it('a missing week breaks the weekly streak', () => {
    const three = ['ריצה', 'ריצה', 'ריצה', null, null, null, null];
    const weeks = [week('2024-01-07', { sport: three }), week('2024-01-21', { sport: three })];
    expect(workoutWeekStreak(weeks, '2024-01-27')).toEqual({ current: 1, best: 1 });
  });
});

describe('warnings', () => {
  it('reports weeks without weigh-in and no workouts', () => {
    const weeks = [
      week('2024-01-07', { weight: 95, l: 'VVVVVVV', sport: ['X', 'X', 'X', 'X', 'X', 'X', 'X'] }),
      week('2024-01-14', { l: 'VVVVVVV', sport: ['X', 'X', 'X', 'X', 'X', 'X', 'X'] }),
      week('2024-01-21', { l: 'VVV....', sport: ['X', 'X', 'X', null, null, null, null] }),
    ];
    const w = warnings(weeks, '2024-01-23');
    expect(w).toContain('אין שקילה כבר 2 שבועות');
    expect(w).toContain('0 אימונים ב-2 השבועות האחרונים');
  });

  it('is silent when things are up to date', () => {
    const weeks = [week('2024-01-07', { weight: 95, l: 'VVV....', sport: ['ריצה', null, null, null, null, null, null] })];
    expect(warnings(weeks, '2024-01-09')).toEqual([]);
  });
});
