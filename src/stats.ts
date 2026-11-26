import { t } from './i18n';
import { addDays, daysBetween, monthKey, quarterKey, sundayOf } from './dates';
import { isWorkout } from './model';
import { MEALS, type Day, type MealKey, type Week } from './types';

export interface Ratio {
  hit: number;
  total: number;
  /** 0–100, or null when there is nothing to measure. */
  pct: number | null;
}

const ratio = (hit: number, total: number): Ratio => ({
  hit,
  total,
  pct: total ? Math.round((hit / total) * 1000) / 10 : null,
});

/** Workouts in a week. Vacation / rest entries ("חופשה", "מנוחה") don't count. */
export function workoutsInWeek(w: Week): number {
  return w.days.filter((d) => isWorkout(d.sport)).length;
}

export function countWorkouts(weeks: Week[]): number {
  return weeks.reduce((s, w) => s + workoutsInWeek(w), 0);
}

/** V% for one meal over a list of days — only V and X cells count; "-" and empty are ignored. */
export function mealRatio(days: Day[], meal: MealKey): Ratio {
  let v = 0, x = 0;
  for (const d of days) {
    if (d[meal] === 'V') v++;
    else if (d[meal] === 'X') x++;
  }
  return ratio(v, v + x);
}

/** Combined V% over all three meals. */
export function allMealsRatio(days: Day[]): Ratio {
  let hit = 0, total = 0;
  for (const m of MEALS) {
    const r = mealRatio(days, m);
    hit += r.hit;
    total += r.total;
  }
  return ratio(hit, total);
}

export function smokingRatio(days: Day[]): Ratio {
  let yes = 0, no = 0;
  for (const d of days) {
    if (d.smoked === true) yes++;
    else if (d.smoked === false) no++;
  }
  return ratio(yes, yes + no);
}

/** Every day with its date, optionally only up to (and including) `until`. */
export function datedDays(weeks: Week[], until?: string): { date: string; day: Day }[] {
  const out: { date: string; day: Day }[] = [];
  for (const w of weeks) {
    w.days.forEach((day, i) => {
      const date = addDays(w.sundayDate, i);
      if (!until || date <= until) out.push({ date, day });
    });
  }
  return out;
}

// ---------------------------------------------------------------- weight

export interface WeightPoint {
  date: string;
  weight: number;
}

export function weightPoints(weeks: Week[]): WeightPoint[] {
  return weeks
    .filter((w) => typeof w.startWeight === 'number')
    .map((w) => ({ date: w.sundayDate, weight: w.startWeight! }))
    .sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * Split weight points into line segments. Two points are connected only if they
 * are consecutive weeks; a week without a weigh-in leaves a gap (no interpolation).
 */
export function weightSegments(points: WeightPoint[]): WeightPoint[][] {
  const segs: WeightPoint[][] = [];
  let cur: WeightPoint[] = [];
  for (const p of points) {
    if (cur.length && daysBetween(cur[cur.length - 1].date, p.date) !== 7) {
      segs.push(cur);
      cur = [];
    }
    cur.push(p);
  }
  if (cur.length) segs.push(cur);
  return segs;
}

export interface WeightSummary {
  first: WeightPoint;
  current: WeightPoint;
  min: WeightPoint;
  max: WeightPoint;
  /** current − first, rounded to 0.1 kg */
  change: number;
}

export function weightSummary(points: WeightPoint[]): WeightSummary | null {
  if (!points.length) return null;
  let min = points[0], max = points[0];
  for (const p of points) {
    if (p.weight < min.weight) min = p;
    if (p.weight > max.weight) max = p;
  }
  const first = points[0], current = points[points.length - 1];
  return { first, current, min, max, change: round1(current.weight - first.weight) };
}

export const round1 = (n: number) => Math.round(n * 10) / 10;

// ---------------------------------------------------------------- monthly

export interface MonthStats {
  key: string; // YYYY-MM
  avgWeight: number | null;
  weighIns: number;
  trackedDays: number;
  sportDays: number;
  workoutsPerWeek: number | null;
  breakfast: Ratio;
  lunch: Ratio;
  dinner: Ratio;
  smoking: Ratio;
}

/**
 * Per calendar month. Days are assigned by their own date (a week can span two
 * months); weights by the week's Sunday. Days after `today` are excluded.
 */
export function monthlyStats(weeks: Week[], today: string): MonthStats[] {
  const days = new Map<string, Day[]>();
  for (const { date, day } of datedDays(weeks, today)) {
    const k = monthKey(date);
    if (!days.has(k)) days.set(k, []);
    days.get(k)!.push(day);
  }
  const weights = new Map<string, number[]>();
  for (const p of weightPoints(weeks)) {
    const k = monthKey(p.date);
    if (!weights.has(k)) weights.set(k, []);
    weights.get(k)!.push(p.weight);
  }
  const keys = [...new Set([...days.keys(), ...weights.keys()])].sort();
  return keys.map((key) => {
    const ds = days.get(key) ?? [];
    const ws = weights.get(key) ?? [];
    const sportDays = ds.filter((d) => isWorkout(d.sport)).length;
    return {
      key,
      avgWeight: ws.length ? round1(ws.reduce((a, b) => a + b, 0) / ws.length) : null,
      weighIns: ws.length,
      trackedDays: ds.length,
      sportDays,
      workoutsPerWeek: ds.length ? round1((sportDays / ds.length) * 7) : null,
      breakfast: mealRatio(ds, 'breakfast'),
      lunch: mealRatio(ds, 'lunch'),
      dinner: mealRatio(ds, 'dinner'),
      smoking: smokingRatio(ds),
    };
  });
}

// ---------------------------------------------------------------- phases

export interface QuarterTrend {
  key: string; // YYYY-Qn
  n: number;
  startDate: string;
  endDate: string;
  startFit: number;
  endFit: number;
  /** kg per week from a least-squares line */
  slopePerWeek: number;
  /** fitted change over the quarter's weigh-ins */
  change: number;
}

/** A least-squares trend line of the weekly weights within each calendar quarter. */
export function quarterTrends(points: WeightPoint[]): QuarterTrend[] {
  const groups = new Map<string, WeightPoint[]>();
  for (const p of points) {
    const k = quarterKey(p.date);
    if (!groups.has(k)) groups.set(k, []);
    groups.get(k)!.push(p);
  }
  const out: QuarterTrend[] = [];
  for (const [key, ps] of [...groups].sort((a, b) => a[0].localeCompare(b[0]))) {
    if (ps.length < 2) continue;
    const x0 = ps[0].date;
    const xs = ps.map((p) => daysBetween(x0, p.date) / 7);
    const ys = ps.map((p) => p.weight);
    const n = ps.length;
    const mx = xs.reduce((a, b) => a + b, 0) / n;
    const my = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0, den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - mx) * (ys[i] - my);
      den += (xs[i] - mx) ** 2;
    }
    const slope = den ? num / den : 0;
    const fit = (x: number) => my + slope * (x - mx);
    const startFit = fit(xs[0]);
    const endFit = fit(xs[n - 1]);
    out.push({
      key,
      n,
      startDate: ps[0].date,
      endDate: ps[n - 1].date,
      startFit,
      endFit,
      slopePerWeek: Math.round(slope * 100) / 100,
      change: round1(endFit - startFit),
    });
  }
  return out;
}

// ---------------------------------------------------------------- streaks

export interface Streak {
  current: number;
  best: number;
}

/**
 * Consecutive days with lunch = V. "-" is neutral (neither counts nor breaks);
 * X, empty or a missing week breaks the streak. Today being still empty
 * does not break the current streak.
 */
export function lunchStreak(weeks: Week[], today: string, frozen: Set<string> = new Set()): Streak {
  if (!weeks.length) return { current: 0, best: 0 };
  const map = new Map(datedDays(weeks, today).map((d) => [d.date, d.day.lunch]));
  let run = 0, best = 0;
  for (let d = weeks[0].sundayDate; d <= today; d = addDays(d, 1)) {
    const m = map.get(d) ?? null;
    if (m === 'V') run++;
    else if (m === '-' || frozen.has(d)) continue;
    else if (d === today && m === null) continue;
    else run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

/**
 * Consecutive weeks with at least `min` workouts. A missing week breaks it;
 * the current week (still in progress) only extends, never breaks.
 */
export function workoutWeekStreak(weeks: Week[], today: string, min = 3, frozen: Set<string> = new Set()): Streak {
  if (!weeks.length) return { current: 0, best: 0 };
  const byDate = new Map(weeks.map((w) => [w.sundayDate, w]));
  const thisSunday = sundayOf(today);
  let run = 0, best = 0;
  for (let s = weeks[0].sundayDate; s <= thisSunday; s = addDays(s, 7)) {
    const w = byDate.get(s);
    const n = w ? workoutsInWeek(w) : 0;
    if (n >= min || frozen.has(s)) run++;
    else if (s !== thisSunday) run = 0;
    best = Math.max(best, run);
  }
  return { current: run, best };
}

// ---------------------------------------------------------------- warnings

function dayHasData(d: Day): boolean {
  return !!(d.breakfast || d.lunch || d.dinner || d.sport.status || typeof d.smoked === 'boolean');
}

/** Plain factual warnings, no judgement. */
export function warnings(weeks: Week[], today: string): string[] {
  const out: string[] = [];
  if (!weeks.length) return out;
  const thisSunday = sundayOf(today);

  const pts = weightPoints(weeks);
  if (!pts.length) {
    out.push(t('עדיין לא הוזן משקל'));
  } else {
    const n = Math.floor(daysBetween(pts[pts.length - 1].date, thisSunday) / 7);
    if (n >= 2) out.push(t('אין שקילה כבר {n} שבועות', { n }));
  }

  const from = addDays(today, -13);
  const recent = datedDays(weeks, today).filter((d) => d.date >= from);
  const tracked = recent.filter((d) => dayHasData(d.day));
  if (tracked.length >= 7 && !recent.some((d) => isWorkout(d.day.sport))) {
    out.push(t('0 אימונים ב-2 השבועות האחרונים'));
  }

  const lastData = datedDays(weeks, today).filter((d) => dayHasData(d.day)).pop();
  if (lastData) {
    const gap = daysBetween(lastData.date, today);
    if (gap >= 3) out.push(t('לא עודכנו נתונים כבר {n} ימים', { n: gap }));
  }
  return out;
}
