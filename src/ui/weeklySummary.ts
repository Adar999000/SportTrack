/**
 * Weekly recap: from Saturday evening until Monday, a card on Today with the week's result,
 * a comparison with the week before, one focus for next week, and "share as story".
 */
import { lang, t, tr } from '../i18n';
import { addDays, sundayOf, todayISO } from '../dates';
import { allWeeks, getWeek } from '../store';
import { allMealsRatio, datedDays, mealRatio, workoutsInWeek } from '../stats';
import type { Day, MealKey, Week } from '../types';
import { currentUser } from '../session';
import { hasBackend } from '../api';
import { h } from './dom';
import { icon } from './icons';
import { openStoryComposer } from './storiesView';

const done = (d: Day) => (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] || d.text?.[k]).length + (d.sport.status ? 1 : 0);
const MEAL_NAME: Record<MealKey, string> = { breakfast: 'ארוחת בוקר', lunch: 'צהריים', dinner: 'ערב' };

export interface WeekRecap { sunday: string; workouts: number; full: number; meals: number | null; weight: number | null; dWorkouts: number; dFull: number; dWeight: number | null; focus: string }

export function recap(w: Week, prev: Week, next?: Week): WeekRecap {
  const full = w.days.filter((d) => done(d) >= 4).length;
  const pFull = prev.days.filter((d) => done(d) >= 4).length;
  const wo = workoutsInWeek(w), pWo = workoutsInWeek(prev);
  const weightNow = next?.startWeight ?? null;
  const dWeight = typeof w.startWeight === 'number' && typeof weightNow === 'number' ? Math.round((weightNow - w.startWeight) * 10) / 10 : null;
  const worst = (['breakfast', 'lunch', 'dinner'] as MealKey[]).map((m) => ({ m, p: mealRatio(w.days, m).pct ?? 100 })).sort((a, b) => a.p - b.p)[0];
  const focus = wo < 3 ? tr`שבוע הבא: ${Math.max(wo + 1, 3)} אימונים` : worst.p < 70 ? tr`שבוע הבא: ${t(MEAL_NAME[worst.m])} מסודרת כל יום` : full < 5 ? t('שבוע הבא: 5 ימים מלאים') : t('שבוע הבא: לשמור על הקצב');
  return { sunday: w.sundayDate, workouts: wo, full, meals: allMealsRatio(w.days).pct, weight: weightNow, dWorkouts: wo - pWo, dFull: full - pFull, dWeight, focus };
}

const KEY = () => 'recap-dismissed:' + (currentUser()?.userId ?? 'local');

/** Which week to sum up right now, or null when it's not recap time. */
function recapWeek(now = new Date()): string | null {
  const today = todayISO();
  const dow = now.getDay();
  if (dow === 6 && now.getHours() >= 17) return sundayOf(today);
  if (dow === 0 || dow === 1) return addDays(sundayOf(today), -7);
  return null;
}

export function weeklySummaryCard(): HTMLElement | '' {
  const sunday = recapWeek();
  if (!sunday) return '';
  try { if (localStorage.getItem(KEY()) === sunday) return ''; } catch { /* ignore */ }
  const w = getWeek(sunday);
  if (!w.days.some((d) => done(d) > 0)) return '';
  const r = recap(w, getWeek(addDays(sunday, -7)), getWeek(addDays(sunday, 7)));
  const delta = (n: number) => (n > 0 ? h('span', { class: 'rc-up' }, `▲${n}`) : n < 0 ? h('span', { class: 'rc-down' }, `▼${-n}`) : h('span', { class: 'rc-same' }, '='));
  const stat = (v: string, label: string, d?: HTMLElement) => h('div', { class: 'rc-stat' }, h('b', null, v, d ? [' ', d] : ''), h('span', null, label));
  const card = h('section', { class: 'card recap', 'aria-label': t('סיכום השבוע') },
    h('div', { class: 'row-between' },
      h('h2', { class: 'card-title' }, t('סיכום השבוע')),
      h('button', { class: 'link-btn', type: 'button', 'aria-label': t('הסתר את הסיכום'), onclick: () => { try { localStorage.setItem(KEY(), sunday); } catch { /* ignore */ } card.remove(); } }, '✕')),
    h('div', { class: 'rc-stats' },
      stat(String(r.workouts), t('אימונים'), delta(r.dWorkouts)),
      stat(`${r.full}/7`, t('ימים מלאים'), delta(r.dFull)),
      stat(r.meals === null ? '—' : r.meals + '%', t('ארוחות')),
      r.dWeight !== null ? stat((r.dWeight > 0 ? '+' : '') + r.dWeight, t('ק"ג')) : ''),
    h('p', { class: 'rc-focus' }, '🎯 ', r.focus),
    hasBackend() && currentUser() ? h('button', { class: 'btn', type: 'button', onclick: () => openStoryComposer({ tpl: 'week', bg: 'lime', workouts: r.workouts, full: r.full, meals: r.meals ?? 0 } as any) }, icon('story'), ' ', t('שיתוף כסטורי')) : '',
  );
  return card;
}

/** Monthly recap: on the 1st–3rd of the month, the month before in numbers. */
export function monthlySummaryCard(now = new Date()): HTMLElement | '' {
  if (now.getDate() > 3) return '';
  const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last = new Date(now.getFullYear(), now.getMonth(), 0);
  const iso = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const from = iso(first), to = iso(last);
  const mkey = 'recap-month:' + (currentUser()?.userId ?? 'local');
  try { if (localStorage.getItem(mkey) === from) return ''; } catch { /* ignore */ }
  const days = datedDays(allWeeks(), to).filter((x) => x.date >= from && x.date <= to);
  if (!days.some((x) => done(x.day) > 0)) return '';
  const workouts = days.filter((x) => x.day.sport.status === 'V' && x.day.sport.countsAsWorkout !== false).length;
  const full = days.filter((x) => done(x.day) >= 4).length;
  const meals = allMealsRatio(days.map((x) => x.day)).pct;
  const ws = allWeeks().filter((w) => w.sundayDate >= addDays(from, -6) && w.sundayDate <= to && typeof w.startWeight === 'number');
  const dW = ws.length > 1 ? Math.round((ws[ws.length - 1].startWeight! - ws[0].startWeight!) * 10) / 10 : null;
  const month = first.toLocaleDateString(lang === 'he' ? 'he-IL' : 'en-GB', { month: 'long' });
  const stat = (v: string, label: string) => h('div', { class: 'rc-stat' }, h('b', null, v), h('span', null, label));
  const card = h('section', { class: 'card recap recap-month', 'aria-label': tr`סיכום ${month}` },
    h('div', { class: 'row-between' },
      h('h2', { class: 'card-title' }, tr`סיכום ${month}`),
      h('button', { class: 'link-btn', type: 'button', 'aria-label': t('הסתר את הסיכום'), onclick: () => { try { localStorage.setItem(mkey, from); } catch { /* ignore */ } card.remove(); } }, '✕')),
    h('div', { class: 'rc-stats' },
      stat(String(workouts), t('אימונים')), stat(String(full), t('ימים מלאים')), stat(meals === null ? '—' : meals + '%', t('ארוחות')),
      dW !== null ? stat((dW > 0 ? '+' : '') + dW, t('ק"ג')) : ''),
    h('p', { class: 'rc-focus' }, workouts >= 12 ? t('🔥 חודש חזק. ממשיכים ככה!') : t('🎯 החודש: לפחות 3 אימונים בכל שבוע')),
    hasBackend() && currentUser() ? h('button', { class: 'btn', type: 'button', onclick: () => openStoryComposer({ tpl: 'week', bg: 'sunset', workouts, full, meals: meals ?? 0, label: month } as any) }, icon('story'), ' ', t('שיתוף כסטורי')) : '',
  );
  return card;
}
