/**
 * Ready-made training plans. The chosen plan is a synced document (`plan:active`),
 * so it follows the user to every device. Sessions are done in order: missing a day
 * doesn't skip a session, the next one simply waits for the next training day.
 */
import { getDoc, putDoc } from './docs';
import { addDays, dayIndex } from './dates';
import { t } from './i18n';

export type PlanId = 'run5k' | 'home3';
export type PlanKind = 'run' | 'strength';

export interface PlanSession {
  kind: PlanKind;
  /** Written in the sport row when the session is marked done. */
  label: string;
  /** One line for the Today card. */
  headline: string;
  steps: string[];
  minutes: number;
}

export interface PlanDef {
  id: PlanId;
  kind: PlanKind;
  icon: string;
  weeks: number;
  perWeek: number;
  name: () => string;
  desc: () => string;
  /** Session by its 0-based index in the plan. */
  session: (i: number) => PlanSession;
}

export interface ActivePlan {
  planId: PlanId;
  /** ISO date the plan was started. */
  startedAt: string;
  /** Training weekdays, 0 = Sunday. */
  days: number[];
  /** Date each session was done, in order (session i was done on done[i]). */
  done: string[];
}

/** Walk-run intervals per week: [rounds, run minutes, walk minutes]; rounds 1 = continuous run. */
const RUN_WEEKS: [number, number, number][] = [
  [8, 1, 1.5], [6, 2, 2], [5, 3, 2], [4, 5, 2], [3, 8, 2], [2, 12, 2], [1, 20, 0], [1, 25, 0],
];

function runSession(i: number): PlanSession {
  const w = Math.floor(i / 3), s = i % 3;
  const [rounds, run, walk] = RUN_WEEKS[w];
  const last = w === 7 && s === 2;
  const main = last
    ? t('ריצת 5 ק"מ. בקצב נוח, המטרה רק לסיים')
    : rounds === 1
      ? t('ריצה רצופה {r} דק׳ בקצב שאפשר לדבר בו', { r: run + (w === 7 ? s * 2 : 0) })
      : t('{n} סבבים: ריצה {r} דק׳, הליכה {w} דק׳', { n: rounds, r: run, w: walk });
  return {
    kind: 'run',
    label: t('ריצה: שבוע {w}, אימון {s}', { w: w + 1, s: s + 1 }),
    headline: main,
    steps: [t('חימום: 5 דקות הליכה מהירה'), main, t('שחרור: 5 דקות הליכה ומתיחות')],
    minutes: last ? 45 : Math.round(10 + (rounds === 1 ? run : rounds * (run + walk))),
  };
}

/** Home strength: three rotating workouts, more rounds and reps as the weeks go by. */
const STR_ROUNDS = [2, 2, 3, 3, 3, 4, 4, 4];
const STR_REPS = [8, 10, 10, 12, 12, 12, 14, 15];

function strengthSession(i: number): PlanSession {
  const w = Math.floor(i / 3), s = i % 3;
  const reps = STR_REPS[w], rounds = STR_ROUNDS[w], sec = 20 + w * 5;
  const x = (name: string) => t('{name}: {n} חזרות', { name, n: reps });
  const hold = (name: string) => t('{name}: {n} שניות', { name, n: sec });
  const sets: string[][] = [
    [x(t('סקוואט')), x(t('שכיבות סמיכה (אפשר על הברכיים)')), x(t('גשר ישבן')), hold(t('פלאנק'))],
    [x(t('לאנג׳ים לכל רגל')), x(t('דיפס על כיסא')), x(t('סופרמן')), hold(t('פלאנק צד לכל צד'))],
    [x(t('עליות על מדרגה לכל רגל')), x(t('שכיבות סמיכה')), x(t('כפיפות בטן')), hold(t('מטפס הרים'))],
  ];
  const head = t('{n} סבבים, דקה מנוחה בין סבבים', { n: rounds });
  return {
    kind: 'strength',
    label: t('כוח בבית: שבוע {w}, אימון {s}', { w: w + 1, s: s + 1 }),
    headline: head,
    steps: [t('חימום: 3 דקות קפיצות במקום וסיבובי ידיים'), head, ...sets[s]],
    minutes: 10 + rounds * 6,
  };
}

export const PLANS: PlanDef[] = [
  {
    id: 'run5k', kind: 'run', icon: '🏃', weeks: 8, perWeek: 3,
    name: () => t('ריצה ראשונה: 5 ק"מ ב-8 שבועות'),
    desc: () => t('מתחילים בהליכה וריצה לסירוגין, ובסוף רצים 5 ק"מ ברצף. כ-30 דקות לאימון.'),
    session: runSession,
  },
  {
    id: 'home3', kind: 'strength', icon: '💪', weeks: 8, perWeek: 3,
    name: () => t('כוח בבית, 3 פעמים בשבוע'),
    desc: () => t('בלי ציוד, רק משקל גוף. שלושה אימונים מתחלפים שנעשים קשים יותר בהדרגה.'),
    session: strengthSession,
  },
];

export const DEFAULT_DAYS = [0, 2, 4];
export const planDef = (id: string): PlanDef | undefined => PLANS.find((p) => p.id === id);
export const totalSessions = (p: PlanDef) => p.weeks * p.perWeek;

// ---------------------------------------------------------------- schedule logic (pure)

export function newPlan(planId: PlanId, today: string, days: number[] = DEFAULT_DAYS): ActivePlan {
  return { planId, startedAt: today, days: [...new Set(days)].sort(), done: [] };
}

/** Index of the next session to do (== number of sessions done). */
export const nextIndex = (a: ActivePlan) => a.done.length;

/** Plan week the user is in, 1-based, never past the last week. */
export function planWeek(a: ActivePlan, p: PlanDef): number {
  const i = Math.min(nextIndex(a), totalSessions(p) - 1);
  return Math.floor(i / p.perWeek) + 1;
}

export type TodayState =
  | { state: 'due'; index: number }
  | { state: 'rest'; index: number; nextDate: string }
  | { state: 'doneToday'; index: number; nextDate: string | null }
  | { state: 'finished' };

/** The next training day after `from` (exclusive), or null when no days are chosen. */
export function nextTrainingDate(a: ActivePlan, from: string): string | null {
  if (!a.days.length) return null;
  for (let k = 1; k <= 7; k++) { const d = addDays(from, k); if (a.days.includes(dayIndex(d))) return d; }
  return null;
}

/** What Today should show for the plan. */
export function todayState(a: ActivePlan, p: PlanDef, today: string): TodayState {
  const total = totalSessions(p);
  const doneIdx = a.done.indexOf(today);
  if (doneIdx >= 0) return { state: 'doneToday', index: doneIdx, nextDate: nextIndex(a) >= total ? null : nextTrainingDate(a, today) };
  if (nextIndex(a) >= total) return { state: 'finished' };
  if (a.days.includes(dayIndex(today)) || !a.days.length) return { state: 'due', index: nextIndex(a) };
  return { state: 'rest', index: nextIndex(a), nextDate: nextTrainingDate(a, today)! };
}

/** Record the next session as done today (once per day, never past the end). */
export function withDone(a: ActivePlan, p: PlanDef, today: string): ActivePlan {
  if (a.done.includes(today) || nextIndex(a) >= totalSessions(p)) return a;
  return { ...a, done: [...a.done, today] };
}

// ---------------------------------------------------------------- storage

const DOC = 'plan:active';
export function activePlan(): ActivePlan | null {
  const a = getDoc<ActivePlan>(DOC);
  return a && planDef(a.planId) ? a : null;
}
export const saveActivePlan = (a: ActivePlan) => putDoc(DOC, a);
export const stopPlan = () => putDoc(DOC, null);
