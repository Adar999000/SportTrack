import { t, tr } from '../i18n';
import { formatShort, monthLabel, quarterLabel, todayISO } from '../dates';
import {
  lunchStreak, monthlyStats, quarterTrends, warnings, weightPoints, weightSummary, workoutWeekStreak, countWorkouts,
} from '../stats';
import { allWeeks, getSettings } from '../store';
import type { Week } from '../types';
import { weightChart } from './chart';
import { fmtKg, fmtPct, h } from './dom';

const signed = (n: number, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);

function tile(label: string, value: string, sub?: string) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub && h('div', { class: 'tile-sub' }, sub));
}

/** Stats sections for a list of weeks (the current user's by default). */
/** Sundays of weeks that include a vacation entry in the sport row. */
function vacationWeeks(weeks: Week[]): string[] {
  return weeks.filter((w) => w.days.some((d) => d.sport.status === 'V' && !d.sport.countsAsWorkout && /חופש|vacation|holiday/i.test(d.sport.label ?? ''))).map((w) => w.sundayDate);
}

/** A table cell with a small progress bar under the number. */
function barTd(text: string, pct: number | null, kind = ''): HTMLElement {
  const td = h('td', { class: 'bar-td' + (kind ? ' bar-' + kind : '') }, h('span', null, text));
  if (pct !== null) td.style.setProperty('--p', Math.round(pct) + '%');
  else td.classList.add('no-bar');
  return td;
}

export function statsSections(weeks: Week[] = allWeeks(), frozen: { days?: string[]; weeks?: string[]; goal?: number } = {}): (Node | string)[] {
  const today = todayISO();
  if (!weeks.length) return [h('section', { class: 'card empty-state' },
    h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '📈'),
    h('h2', { class: 'empty-title' }, t('כאן יופיעו הגרפים שלך')),
    h('p', { class: 'muted' }, t('אחרי כמה ימים של סימון תראו כאן משקל לאורך זמן, אחוז ארוחות בריאות, אימונים ורצפים.')),
    h('a', { class: 'btn btn-primary', href: '#week' }, t('לסמן את היום')))];
  const pts = weightPoints(weeks);
  const ws = weightSummary(pts);
  const warn = warnings(weeks, today);
  const lunch = lunchStreak(weeks, today, new Set(frozen.days ?? []));
  const wk = workoutWeekStreak(weeks, today, 3, new Set(frozen.weeks ?? []));
  const months = monthlyStats(weeks, today).reverse();
  const quarters = quarterTrends(pts).reverse();
  const showSmoke = getSettings().showSmoking;

  return [
    warn.length
      ? h('section', { class: 'card warnings', 'aria-label': t('התראות') }, h('ul', null, warn.map((w) => h('li', null, w))))
      : '',

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('משקל')),
      ws
        ? h('div', { class: 'tiles' },
            tile(t('נוכחי'), fmtKg(ws.current.weight), formatShort(ws.current.date)),
            tile(t('שינוי כולל'), signed(ws.change), tr`מאז ${formatShort(ws.first.date)}`),
            tile(t('מינימום'), fmtKg(ws.min.weight), formatShort(ws.min.date)),
            tile(t('מקסימום'), fmtKg(ws.max.weight), formatShort(ws.max.date)),
          )
        : h('p', { class: 'muted' }, t('אין שקילות.')),
      weightChart(pts, { goal: frozen.goal, vacations: vacationWeeks(weeks) }),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('רצפים')),
      h('div', { class: 'tiles' },
        tile(t('ימים רצופים עם צהריים V'), String(lunch.current), tr`שיא: ${lunch.best}`),
        tile(t('שבועות רצופים עם 3+ אימונים'), String(wk.current), tr`שיא: ${wk.best}`),
        tile(t('סה"כ אימונים'), String(countWorkouts(weeks)), tr`${weeks.length} שבועות`),
      ),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('לפי חודש')),
      h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('טבלה') },
        h('table', { class: 'data-table' },
          h('thead', null, h('tr', null,
            [t('חודש'), t('משקל ממוצע'), t('אימונים לשבוע'), t('ימי ספורט'), t('בוקר V%'), t('צהריים V%'), t('ערב V%'), showSmoke && t('עישון כן%')]
              .filter(Boolean).map((c) => h('th', { scope: 'col' }, c as string)),
          )),
          h('tbody', null, months.map((mo) => h('tr', null,
            h('th', { scope: 'row' }, monthLabel(mo.key)),
            h('td', null, fmtKg(mo.avgWeight)),
            barTd(mo.workoutsPerWeek === null ? '—' : mo.workoutsPerWeek.toFixed(1), mo.workoutsPerWeek === null ? null : Math.min(100, (mo.workoutsPerWeek / 4) * 100), 'sport'),
            h('td', null, mo.sportDays),
            barTd(fmtPct(mo.breakfast.pct), mo.breakfast.pct),
            barTd(fmtPct(mo.lunch.pct), mo.lunch.pct),
            barTd(fmtPct(mo.dinner.pct), mo.dinner.pct),
            showSmoke && barTd(fmtPct(mo.smoking.pct), mo.smoking.pct, 'smoke'),
          ))),
        ),
      ),
      h('p', { class: 'hint' }, t('אחוז V מחושב רק מתוך תאים שסומנו V או X. אימונים לא כוללים חופשה ומנוחה.')),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('שלבים (מגמה לפי רבעון)')),
      quarters.length
        ? h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('טבלה') },
            h('table', { class: 'data-table' },
              h('thead', null, h('tr', null, [t('רבעון'), t('שקילות'), t('שינוי במגמה'), t('ק"ג לשבוע')].map((c) => h('th', { scope: 'col' }, c)))),
              h('tbody', null, quarters.map((q) => h('tr', null,
                h('th', { scope: 'row' }, quarterLabel(q.key)),
                h('td', null, q.n),
                h('td', { class: q.change < 0 ? 'good' : q.change > 0 ? 'bad' : '' }, (q.change < 0 ? '▼ ' : q.change > 0 ? '▲ ' : '') + signed(q.change)),
                h('td', { class: q.slopePerWeek < 0 ? 'good' : q.slopePerWeek > 0 ? 'bad' : '' }, signed(q.slopePerWeek, 2)),
              ))),
            ),
          )
        : h('p', { class: 'muted' }, t('צריך לפחות שתי שקילות ברבעון.')),
    ),
  ];
}

export function renderStats(root: HTMLElement): void {
  root.replaceChildren(...statsSections());
}
