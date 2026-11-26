/** Goals change the app: the smoking row turns on, and matching trackers are added once. */
import { t } from './i18n';
import { TEMPLATES, listTrackers, saveTracker, uid } from './trackers';
import { allWeeks, getSettings, updateSettings } from './store';
import { datedDays } from './stats';
import { todayISO } from './dates';

const BY_GOAL: Record<string, string> = { sleep: 'body', stress: 'body', habit: 'habits', muscle: 'gym' };

/** Returns short descriptions of what changed (for a toast). */
export function applyGoals(goals: string[]): string[] {
  const changed: string[] = [];
  if (goals.includes('smoke') && !getSettings().showSmoking) { updateSettings({ showSmoking: true }); changed.push(t('שורת עישון')); }
  const have = new Set(listTrackers().map((x) => x.name));
  const made = new Set<string>();
  for (const g of goals) {
    const tid = BY_GOAL[g];
    if (!tid || made.has(tid)) continue;
    const tp = TEMPLATES.find((x) => x.id === tid);
    if (!tp) continue;
    const base = tp.make();
    if (have.has(base.name)) continue;
    saveTracker({ ...base, id: uid(), createdAt: Date.now() } as any);
    made.add(tid);
    changed.push(base.name);
  }
  return changed;
}

/** Days in a row without smoking, up to today (an unmarked today doesn't break it). */
export function smokeFreeStreak(): number {
  const today = todayISO();
  const days = datedDays(allWeeks(), today).reverse();
  let n = 0;
  for (const { date, day } of days) {
    if (date === today && day.smoked === undefined) continue;
    if (day.smoked === false) n++; else break;
  }
  return n;
}
