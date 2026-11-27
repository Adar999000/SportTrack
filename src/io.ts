import { addDays, DAY_NAMES } from './dates';
import { normalizeWeek } from './model';
import type { Settings, Week } from './types';

export const APP_ID = 'mishmaat-ishit';

export interface Backup {
  app: typeof APP_ID;
  version: 1 | 2;
  exportedAt: string;
  settings: Settings;
  weeks: Week[];
  docs?: Record<string, unknown>;
  profile?: unknown;
}

/** Everything on this device: weeks, settings, and synced documents (GPS workouts, custom trackers, table setup), plus profile and goals when signed in. */
export function toBackup(weeks: Week[], settings: Settings, extra: { docs?: [string, unknown][]; profile?: unknown } = {}): Backup {
  return { app: APP_ID, version: 2, exportedAt: new Date().toISOString(), settings, weeks, ...(extra.docs ? { docs: Object.fromEntries(extra.docs) } : {}), ...(extra.profile ? { profile: extra.profile } : {}) };
}

/** Accepts a backup object (or a bare array of weeks). Throws a Hebrew message if invalid. */
export function parseBackup(text: string): { weeks: Week[]; settings?: Partial<Settings>; skipped: number; docs?: Record<string, unknown> } {
  let data: any;
  try {
    data = JSON.parse(text);
  } catch {
    throw new Error('הקובץ אינו JSON תקין');
  }
  const rawWeeks = Array.isArray(data) ? data : data?.weeks;
  if (!Array.isArray(rawWeeks)) throw new Error('לא נמצאו שבועות בקובץ הגיבוי');
  const weeks: Week[] = [];
  let skipped = 0;
  for (const r of rawWeeks) {
    const w = normalizeWeek(r);
    if (w) weeks.push(w);
    else skipped++;
  }
  const docs = !Array.isArray(data) && data.docs && typeof data.docs === 'object' ? Object.fromEntries(Object.entries(data.docs).filter(([k]) => /^[\w:.-]{1,80}$/.test(k))) : undefined;
  return { weeks, settings: Array.isArray(data) ? undefined : data.settings, skipped, docs };
}

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? '' : String(v);
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** One row per day. Starts with a BOM so Excel shows Hebrew correctly. */
export function toCSV(weeks: Week[]): string {
  const header = [
    'week_sunday', 'date', 'weekday', 'start_weight', 'breakfast', 'lunch', 'dinner',
    'sport_status', 'sport_label', 'counts_as_workout', 'smoked', 'cell_text', 'week_note',
  ];
  const lines = [header.join(',')];
  for (const w of weeks) {
    w.days.forEach((d, i) => {
      lines.push(
        [
          w.sundayDate,
          addDays(w.sundayDate, i),
          DAY_NAMES[i],
          i === 0 ? w.startWeight ?? '' : '',
          d.breakfast ?? '',
          d.lunch ?? '',
          d.dinner ?? '',
          d.sport.status ?? '',
          d.sport.label ?? '',
          d.sport.status === 'V' ? (d.sport.countsAsWorkout ? 'yes' : 'no') : '',
          d.smoked === true ? 'כן' : d.smoked === false ? 'לא' : '',
          d.text ? Object.entries(d.text).map(([k, v]) => `${k}: ${v}`).join('; ') : '',
          i === 0 ? w.note ?? '' : '',
        ]
          .map(csvCell)
          .join(','),
      );
    });
  }
  return '﻿' + lines.join('\r\n');
}

export function download(filename: string, content: string, type: string): void {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
