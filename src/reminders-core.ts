import { t } from './i18n';
/**
 * Pure reminder decision logic, shared by the page and the service worker.
 */
import { dayIndex, sundayOf } from './dates';
import type { Settings, Week } from './types';

export interface ReminderLog {
  daily?: string; // ISO date last notified
  weekly?: string;
}

export interface Reminder {
  kind: 'daily' | 'weekly';
  title: string;
  body: string;
}

function minutesOf(hhmm: string): number {
  const [h, m] = hhmm.split(':').map(Number);
  return (h || 0) * 60 + (m || 0);
}

function todayFilled(week: Week | undefined, idx: number, settings: Settings): boolean {
  const d = week?.days[idx];
  if (!d) return false;
  const base = !!(d.breakfast && d.lunch && d.dinner && d.sport.status);
  return settings.showSmoking ? base && typeof d.smoked === 'boolean' : base;
}

/** Which reminders are due right now (at most once per day each). */
export function dueReminders(
  now: Date,
  today: string,
  settings: Settings,
  weeks: Record<string, Week>,
  log: ReminderLog,
): Reminder[] {
  const out: Reminder[] = [];
  const nowMin = now.getHours() * 60 + now.getMinutes();
  if (nowMin < minutesOf(settings.reminderTime)) return out;
  const week = weeks[sundayOf(today)];

  if (settings.dailyReminder && log.daily !== today && !todayFilled(week, dayIndex(today), settings)) {
    out.push({ kind: 'daily', title: t('משמעת אישית'), body: t('עדכן את היום') });
  }
  if (
    settings.weeklyWeightReminder &&
    dayIndex(today) === 0 &&
    log.weekly !== today &&
    typeof week?.startWeight !== 'number'
  ) {
    out.push({ kind: 'weekly', title: t('משמעת אישית'), body: t('שבוע חדש — הזן משקל התחלתי') });
  }
  return out;
}
