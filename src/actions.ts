/** Actions the assistant asked to perform; applied locally (then synced like any edit). */
import { addDays, formatShort, sundayOf, dayIndex } from './dates';
import { sportFromLabel, sportMark } from './model';
import { editWeek, getWeek } from './store';
import type { Mark, Week } from './types';
import { t, tr } from './i18n';

export interface AgentAction {
  type: 'mark_meal' | 'log_sport' | 'set_weight' | 'set_note' | 'cell_text' | 'open_page';
  date?: string;
  meal?: 'breakfast' | 'lunch' | 'dinner';
  row?: 'breakfast' | 'lunch' | 'dinner';
  mark?: Mark | 'clear';
  status?: Mark | 'clear';
  label?: string;
  kg?: number;
  text?: string;
  page?: string;
}

const MEAL = { breakfast: 'ארוחת בוקר', lunch: 'ארוחת צהריים', dinner: 'ארוחת ערב' } as const;
const PAGES: Record<string, string> = { week: '#week', history: '#history', rewards: '#rewards', share: '#share', profile: '#profile', settings: '#prefs' };

export interface Applied { summary: string[]; undo: () => void }

/** Apply actions; returns human-readable lines and an undo that restores the touched weeks. */
export function applyActions(actions: AgentAction[]): Applied {
  const before = new Map<string, Week>();
  const keep = (sunday: string) => { if (!before.has(sunday)) before.set(sunday, structuredClone(getWeek(sunday))); };
  const summary: string[] = [];
  for (const a of actions) {
    if (a.type === 'open_page') {
      if (a.page && PAGES[a.page]) location.hash = PAGES[a.page];
      continue;
    }
    if (!a.date || !/^\d{4}-\d{2}-\d{2}$/.test(a.date)) continue;
    const sunday = sundayOf(a.date);
    const i = dayIndex(a.date);
    const when = formatShort(a.date);
    keep(sunday);
    if (a.type === 'mark_meal' && a.meal && MEAL[a.meal]) {
      const m = a.mark === 'clear' ? null : (a.mark as Mark);
      editWeek(sunday, (w) => {
        w.days[i][a.meal!] = m;
        if (w.days[i].text?.[a.meal!]) delete w.days[i].text![a.meal!];
      });
      summary.push(tr`${t(MEAL[a.meal])} ${when}: ${m ?? t('נוקה')}`);
    } else if (a.type === 'log_sport') {
      editWeek(sunday, (w) => {
        w.days[i].sport = a.status === 'V' ? (a.label ? sportFromLabel(a.label) : { status: 'V', countsAsWorkout: true }) : sportMark(a.status === 'clear' ? null : (a.status as 'X' | '-'));
      });
      summary.push(tr`ספורט ${when}: ${a.status === 'V' ? a.label || 'V' : a.status === 'clear' ? t('נוקה') : a.status}`);
    } else if (a.type === 'set_weight' && typeof a.kg === 'number') {
      editWeek(sunday, (w) => (w.startWeight = Math.round(a.kg! * 10) / 10));
      summary.push(tr`משקל התחלתי לשבוע ${formatShort(sunday)}: ${a.kg} ק"ג`);
    } else if (a.type === 'set_note' && a.text) {
      editWeek(sunday, (w) => (w.note = a.text));
      summary.push(tr`הערה לשבוע ${formatShort(sunday)}`);
    } else if (a.type === 'cell_text' && a.row && MEAL[a.row] && a.text) {
      editWeek(sunday, (w) => {
        w.days[i][a.row!] = null;
        w.days[i].text = { ...w.days[i].text, [a.row!]: a.text };
      });
      summary.push(tr`${t(MEAL[a.row])} ${when}: "${a.text}"`);
    }
  }
  return {
    summary,
    undo: () => before.forEach((w, sunday) => editWeek(sunday, (cur) => Object.assign(cur, structuredClone(w)))),
  };
}

export const daysAround = (d: string, n: number) => addDays(d, n);
