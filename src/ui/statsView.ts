import { formatShort, monthLabel, quarterLabel, todayISO } from '../dates';
import {
  lunchStreak, monthlyStats, quarterTrends, warnings, weightPoints, weightSummary, workoutWeekStreak, countWorkouts,
} from '../stats';
import { allWeeks, getSettings } from '../store';
import { weightChart } from './chart';
import { fmtKg, fmtPct, h } from './dom';

const signed = (n: number, d = 1) => (n > 0 ? '+' : n < 0 ? '−' : '') + Math.abs(n).toFixed(d);

function tile(label: string, value: string, sub?: string) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value), sub && h('div', { class: 'tile-sub' }, sub));
}

export function renderStats(root: HTMLElement): void {
  const weeks = allWeeks();
  const today = todayISO();
  if (!weeks.length) {
    root.replaceChildren(h('section', { class: 'card' }, h('p', { class: 'muted' }, 'אין עדיין נתונים להצגה.')));
    return;
  }
  const pts = weightPoints(weeks);
  const ws = weightSummary(pts);
  const warn = warnings(weeks, today);
  const lunch = lunchStreak(weeks, today);
  const wk = workoutWeekStreak(weeks, today, 3);
  const months = monthlyStats(weeks, today).reverse();
  const quarters = quarterTrends(pts).reverse();
  const showSmoke = getSettings().showSmoking;

  root.replaceChildren(
    warn.length
      ? h('section', { class: 'card warnings', 'aria-label': 'התראות' }, h('ul', null, warn.map((w) => h('li', null, w))))
      : '',

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'משקל'),
      ws
        ? h('div', { class: 'tiles' },
            tile('נוכחי', fmtKg(ws.current.weight), formatShort(ws.current.date)),
            tile('שינוי כולל', signed(ws.change), `מאז ${formatShort(ws.first.date)}`),
            tile('מינימום', fmtKg(ws.min.weight), formatShort(ws.min.date)),
            tile('מקסימום', fmtKg(ws.max.weight), formatShort(ws.max.date)),
          )
        : h('p', { class: 'muted' }, 'אין שקילות.'),
      weightChart(pts),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'רצפים'),
      h('div', { class: 'tiles' },
        tile('ימים רצופים עם צהריים V', String(lunch.current), `שיא: ${lunch.best}`),
        tile('שבועות רצופים עם 3+ אימונים', String(wk.current), `שיא: ${wk.best}`),
        tile('סה"כ אימונים', String(countWorkouts(weeks)), `${weeks.length} שבועות`),
      ),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'לפי חודש'),
      h('div', { class: 'table-scroll' },
        h('table', { class: 'data-table' },
          h('thead', null, h('tr', null,
            ['חודש', 'משקל ממוצע', 'אימונים לשבוע', 'ימי ספורט', 'בוקר V%', 'צהריים V%', 'ערב V%', showSmoke && 'עישון כן%']
              .filter(Boolean).map((t) => h('th', { scope: 'col' }, t as string)),
          )),
          h('tbody', null, months.map((mo) => h('tr', null,
            h('th', { scope: 'row' }, monthLabel(mo.key)),
            h('td', null, fmtKg(mo.avgWeight)),
            h('td', null, mo.workoutsPerWeek === null ? '—' : mo.workoutsPerWeek.toFixed(1)),
            h('td', null, mo.sportDays),
            h('td', null, fmtPct(mo.breakfast.pct)),
            h('td', null, fmtPct(mo.lunch.pct)),
            h('td', null, fmtPct(mo.dinner.pct)),
            showSmoke && h('td', null, fmtPct(mo.smoking.pct)),
          ))),
        ),
      ),
      h('p', { class: 'hint' }, 'אחוז V מחושב רק מתוך תאים שסומנו V או X. אימונים לא כוללים חופשה ומנוחה.'),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'שלבים (מגמה לפי רבעון)'),
      quarters.length
        ? h('div', { class: 'table-scroll' },
            h('table', { class: 'data-table' },
              h('thead', null, h('tr', null, ['רבעון', 'שקילות', 'שינוי במגמה', 'ק"ג לשבוע'].map((t) => h('th', { scope: 'col' }, t)))),
              h('tbody', null, quarters.map((q) => h('tr', null,
                h('th', { scope: 'row' }, quarterLabel(q.key)),
                h('td', null, q.n),
                h('td', null, signed(q.change)),
                h('td', null, signed(q.slopePerWeek, 2)),
              ))),
            ),
          )
        : h('p', { class: 'muted' }, 'צריך לפחות שתי שקילות ברבעון.'),
    ),
  );
}
