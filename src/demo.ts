/**
 * Sample data for the preview build only. Clearly flagged in the UI and
 * removed automatically before the user imports real data.
 */
import { addDays, sundayOf, todayISO, dayIndex } from './dates';
import { kvGet, kvSet } from './db';
import { emptyWeek, sportFromLabel, sportMark } from './model';
import { allWeeks, replaceAll } from './store';
import type { Mark, Week } from './types';

const FLAG = 'demoData';
let active = false;

export const isDemoActive = () => active;

function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

export function sampleWeeks(today = todayISO()): Week[] {
  const r = rng(42);
  const thisSunday = sundayOf(today);
  const N = 26;
  const out: Week[] = [];
  const plan = ['ריצה (3 ק"מ)', 'אימון כוח (שעה)', 'קיקבוקס (שעה)', 'חד"כ (שעה)', 'הליכה (5 ק"מ)', 'ריצה (4 ק"מ)'];
  let weight = 97.4;
  for (let k = N - 1; k >= 0; k--) {
    const sunday = addDays(thisSunday, -7 * k);
    if (k === 17) continue; // a missing week, to show gaps
    const w = emptyWeek(sunday);
    weight += -0.35 + r() * 0.5;
    if (r() > 0.25 || k === 0) w.startWeight = Math.round(weight * 10) / 10;
    const vacation = k === 9;
    for (let i = 0; i < 7; i++) {
      const date = addDays(sunday, i);
      if (date > today || (date === today && dayIndex(today) > 0)) continue;
      const d = w.days[i];
      const pick = (pv: number, pdash: number): Mark => (r() < pdash ? '-' : r() < pv ? 'V' : 'X');
      d.breakfast = pick(0.6, 0.35);
      d.lunch = pick(0.85, 0.05);
      d.dinner = pick(0.45, 0.1);
      if (vacation) d.sport = sportFromLabel('חופשה באילת');
      else if (i % 2 === 1) d.sport = r() < 0.8 ? sportFromLabel(plan[Math.floor(r() * plan.length)]) : sportMark('X');
      else d.sport = sportMark('-');
      d.smoked = r() < 0.15 ? true : false;
    }
    if (k === 3) w.note = 'שבוע עמוס בעבודה';
    out.push(w);
  }
  return out;
}

export async function seedDemoIfEmpty(): Promise<void> {
  const flag = await kvGet<boolean>(FLAG).catch(() => undefined);
  if (allWeeks().length && !flag) return;
  if (!allWeeks().length) {
    replaceAll(sampleWeeks());
    await kvSet(FLAG, true).catch(() => {});
  }
  active = true;
}

/** Remove the sample weeks (before importing real data, or on request). */
export async function clearDemo(): Promise<void> {
  if (!active) return;
  active = false;
  await kvSet(FLAG, false).catch(() => {});
  replaceAll([]);
}
