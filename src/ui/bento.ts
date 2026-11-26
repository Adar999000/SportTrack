import { t, tr } from '../i18n';
import { allWeeks } from '../store';
import { addDays, todayISO } from '../dates';
import { allMealsRatio, datedDays, round1, weightPoints, weightSummary, workoutWeekStreak } from '../stats';
import { listWorkouts } from '../workouts';
import { h } from './dom';

/** A small line of the last weigh-ins. */
function spark(values: number[]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 120 36'); svg.setAttribute('class', 'spark'); svg.setAttribute('aria-hidden', 'true');
  if (values.length > 1) {
    const min = Math.min(...values), max = Math.max(...values), span = max - min || 1;
    const d = values.map((v, i) => `${i ? 'L' : 'M'}${(i / (values.length - 1)) * 116 + 2},${32 - ((v - min) / span) * 28}`).join('');
    const p = document.createElementNS(NS, 'path'); p.setAttribute('d', d); svg.append(p);
  }
  return svg;
}

/** Bento grid of the numbers that matter, at the top of Progress. */
export function progressBento(): HTMLElement | '' {
  const weeks = allWeeks();
  if (!weeks.length) return '';
  const today = todayISO();
  const pts = weightPoints(weeks);
  const ws = weightSummary(pts);
  const since30 = addDays(today, -29);
  const last30 = datedDays(weeks, today).filter((d) => d.date >= since30);
  const meals = allMealsRatio(last30.map((d) => d.day)).pct;
  const workouts30 = last30.filter((d) => d.day.sport.status === 'V' && d.day.sport.countsAsWorkout).length;
  const full30 = last30.filter((d) => (d.day.breakfast || d.day.text?.breakfast) && (d.day.lunch || d.day.text?.lunch) && (d.day.dinner || d.day.text?.dinner) && d.day.sport.status).length;
  const streak = workoutWeekStreak(weeks, today);
  const km = listWorkouts().filter((w) => w.start >= Date.now() - 30 * 864e5).reduce((s, w) => s + w.distanceM, 0) / 1000;
  const tile = (cls: string, label: string, value: string, sub = '', extra?: Node) =>
    h('div', { class: 'bento-tile ' + cls }, h('span', { class: 'bento-label' }, label), h('b', { class: 'bento-value' }, value), sub ? h('span', { class: 'bento-sub' }, sub) : '', extra ?? '');
  return h('section', { class: 'bento', 'aria-label': t('תמונת מצב') },
    ws ? tile('wide w-weight', t('משקל'), ws.current.weight.toFixed(1), (ws.change <= 0 ? '▼ ' : '▲ ') + tr`${Math.abs(round1(ws.change)).toFixed(1)} ק"ג מההתחלה`, spark(pts.slice(-16).map((p) => p.weight))) : '',
    tile('w-workouts', t('אימונים ב-30 יום'), String(workouts30), tr`${(workouts30 / 4.3).toFixed(1)} בשבוע`),
    tile('w-meals', t('ארוחות בריאות'), meals === null ? '—' : Math.round(meals) + '%', t('30 יום אחרונים')),
    tile('w-full', t('ימים מלאים'), String(full30), t('30 יום אחרונים')),
    tile('w-streak', t('רצף שבועות'), String(streak.current), tr`שיא: ${streak.best}`),
    km > 0 ? tile('wide w-km', t('ק"מ מתועדים ב-30 יום'), km.toFixed(1), t('מאימוני GPS ו-Strava')) : '',
  );
}
