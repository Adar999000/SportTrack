import { DAY_NAMES, addDays, dayIndex, formatShort, sundayOf, todayISO, weekRangeLabel } from '../dates';
import { cycleMark, cycleSmoked, sportShort } from '../model';
import { editWeek, getSettings, getWeek } from '../store';
import type { Day, Mark, MealKey } from '../types';
import { h } from './dom';
import { openSportSheet } from './sportSheet';
import { HASH, navigate } from './router';

const MEAL_ROWS: { key: MealKey; full: string; short: string }[] = [
  { key: 'breakfast', full: 'ארוחת בוקר בריאה', short: 'בוקר' },
  { key: 'lunch', full: 'ארוחת צהריים בריאה', short: 'צהריים' },
  { key: 'dinner', full: 'ארוחת ערב בריאה', short: 'ערב' },
];

const DAY_LETTERS = ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const MARK_TEXT: Record<string, string> = { V: 'בוצע', X: 'לא בוצע', '-': 'לא רלוונטי' };
const markClass = (m: Mark | null) => (m === 'V' ? 'mark-V' : m === 'X' ? 'mark-X' : m === '-' ? 'mark-dash' : 'mark-empty');
const smokeText = (s: boolean | null | undefined) => (s === true ? 'כן' : s === false ? 'לא' : '');

function cycleMeal(sunday: string, i: number, key: MealKey) {
  editWeek(sunday, (w) => (w.days[i][key] = cycleMark(w.days[i][key])));
}
function cycleSmoke(sunday: string, i: number) {
  editWeek(sunday, (w) => (w.days[i].smoked = cycleSmoked(w.days[i].smoked)));
}

function label(full: string, short: string) {
  return [h('span', { class: 'lbl-full' }, full), h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, short)];
}

/** Big buttons for today's tasks. */
function todayPanel(today: string): HTMLElement {
  const sunday = sundayOf(today);
  const i = dayIndex(today);
  const d: Day = getWeek(sunday).days[i];
  const settings = getSettings();
  const btn = (title: string, value: string, cls: string, onclick: () => void, aria: string) =>
    h('button', { class: `today-btn ${cls}`, type: 'button', onclick, 'aria-label': `${title}: ${aria}` },
      h('span', { class: 'today-title' }, title),
      value ? h('span', { class: 'today-val' }, value) : h('span', { class: 'today-empty' }, 'לא סומן'),
    );
  return h('section', { class: 'card today', 'aria-label': 'היום' },
    h('h2', { class: 'card-title' }, `היום · יום ${DAY_NAMES[i]} ${formatShort(today)}`),
    h('div', { class: 'today-grid' },
      MEAL_ROWS.map((r) =>
        btn(r.short, d[r.key] ?? '', markClass(d[r.key]), () => cycleMeal(sunday, i, r.key), d[r.key] ? MARK_TEXT[d[r.key]!] : 'ריק'),
      ),
      btn('ספורט', sportShort(d.sport), markClass(d.sport.status) + ' today-sport', () => openSportSheet(sunday, i), sportShort(d.sport) || 'ריק'),
      settings.showSmoking &&
        btn('מעשן?', smokeText(d.smoked), d.smoked === true ? 'mark-X' : d.smoked === false ? 'mark-V' : 'mark-empty', () => cycleSmoke(sunday, i), smokeText(d.smoked) || 'ריק'),
    ),
  );
}

function weekTable(sunday: string, today: string): HTMLElement {
  const week = getWeek(sunday);
  const settings = getSettings();
  const todayIdx = sundayOf(today) === sunday ? dayIndex(today) : -1;
  const colCls = (i: number) => (i === todayIdx ? 'is-today' : '');

  const head = h('tr', null,
    h('th', { class: 'corner', scope: 'col' }, 'משימה'),
    DAY_NAMES.map((n, i) =>
      h('th', { scope: 'col', class: colCls(i), 'aria-current': i === todayIdx ? 'date' : undefined },
        h('span', { class: 'lbl-full' }, n),
        h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, DAY_LETTERS[i]),
        h('span', { class: 'th-date' }, formatShort(addDays(sunday, i)).slice(0, 5)),
      ),
    ),
  );

  const rows: HTMLElement[] = MEAL_ROWS.map((r) =>
    h('tr', null,
      h('th', { scope: 'row' }, label(r.full, r.short)),
      week.days.map((d, i) =>
        h('td', { class: colCls(i) },
          h('button', {
            class: `cell ${markClass(d[r.key])}`, type: 'button',
            'aria-label': `${r.full}, ${DAY_NAMES[i]}: ${d[r.key] ? MARK_TEXT[d[r.key]!] : 'ריק'}`,
            onclick: () => cycleMeal(sunday, i, r.key),
          }, d[r.key] ?? ''),
        ),
      ),
    ),
  );

  rows.push(
    h('tr', { class: 'sport-row' },
      h('th', { scope: 'row' }, label('פעילות ספורט', 'ספורט')),
      week.days.map((d, i) => {
        const txt = sportShort(d.sport);
        const rest = d.sport.status === 'V' && !d.sport.countsAsWorkout;
        return h('td', { class: colCls(i) },
          h('button', {
            class: `cell cell-sport ${markClass(d.sport.status)}${rest ? ' is-rest' : ''}`, type: 'button',
            'aria-label': `פעילות ספורט, ${DAY_NAMES[i]}: ${txt || 'ריק'}`,
            onclick: () => openSportSheet(sunday, i),
          }, h('span', { class: 'clamp' }, txt)),
        );
      }),
    ),
  );

  if (settings.showSmoking) {
    rows.push(
      h('tr', null,
        h('th', { scope: 'row' }, label('מעשן?', 'מעשן?')),
        week.days.map((d, i) =>
          h('td', { class: colCls(i) },
            h('button', {
              class: `cell cell-smoke ${d.smoked === true ? 'smoke-yes' : d.smoked === false ? 'smoke-no' : 'mark-empty'}`,
              type: 'button',
              'aria-label': `מעשן, ${DAY_NAMES[i]}: ${smokeText(d.smoked) || 'ריק'}`,
              onclick: () => cycleSmoke(sunday, i),
            }, smokeText(d.smoked)),
          ),
        ),
      ),
    );
  }

  return h('div', { class: 'table-wrap' },
    h('table', { class: 'week-table' }, h('caption', { class: 'sr-only' }, `טבלת משימות לשבוע ${weekRangeLabel(sunday)}`), h('thead', null, head), h('tbody', null, rows)),
  );
}

export function renderWeek(root: HTMLElement, sunday: string): void {
  const today = todayISO();
  const thisSunday = sundayOf(today);
  const isCurrent = sunday === thisSunday;
  const week = getWeek(sunday);
  const go = (n: number) => navigate(HASH.week(addDays(sunday, 7 * n)));

  const weight = h('input', {
    type: 'number', inputmode: 'decimal', step: '0.1', min: '20', max: '400', class: 'input input-weight',
    id: 'start-weight', value: week.startWeight ?? '', placeholder: '—',
  });
  weight.addEventListener('change', () => {
    const v = parseFloat(weight.value.replace(',', '.'));
    editWeek(sunday, (w) => {
      if (Number.isFinite(v) && v > 0) w.startWeight = Math.round(v * 100) / 100;
      else delete w.startWeight;
    });
  });

  const note = h('textarea', { class: 'input note', rows: 2, placeholder: 'הערה לשבוע (לא חובה)', 'aria-label': 'הערה לשבוע' });
  note.value = week.note ?? '';
  note.addEventListener('change', () => editWeek(sunday, (w) => {
    if (note.value.trim()) w.note = note.value;
    else delete w.note;
  }));

  const sundayNoWeight = isCurrent && dayIndex(today) === 0 && week.startWeight === undefined && getSettings().weeklyWeightReminder;

  const weekCard = h('section', { class: 'card week-card', 'aria-label': 'טבלת השבוע' },
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': 'שבוע קודם', onclick: () => go(-1) }, '→'),
      h('div', { class: 'week-title' },
        h('h2', null, `תאריך ${weekRangeLabel(sunday)}`),
        !isCurrent && h('button', { class: 'link-btn', onclick: () => navigate(HASH.week()) }, 'חזרה לשבוע הנוכחי'),
      ),
      h('button', { class: 'icon-btn', 'aria-label': 'שבוע הבא', onclick: () => go(1) }, '←'),
    ),
    h('div', { class: 'weight-row' },
      h('label', { for: 'start-weight' }, 'משקל התחלתי:'), weight, h('span', null, 'ק"ג'),
    ),
    weekTable(sunday, today),
    note,
  );

  // Swipe between weeks (finger right → newer week, as pages turn in RTL).
  let sx = 0, sy = 0;
  weekCard.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  weekCard.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) go(dx > 0 ? 1 : -1);
  }, { passive: true });

  root.replaceChildren(
    isCurrent ? todayPanel(today) : '',
    sundayNoWeight ? h('div', { class: 'banner' }, 'שבוע חדש — אפשר להזין משקל התחלתי', h('button', { class: 'link-btn', onclick: () => weight.focus() }, 'הזן')) : '',
    weekCard,
  );
}
