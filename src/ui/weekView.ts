import { isRTL, lang, t, tr } from '../i18n';
import { DAY_NAMES, addDays, dayIndex, formatShort, sundayOf, todayISO, weekRangeLabel } from '../dates';
import { cycleMark, cycleSmoked, sportShort } from '../model';
import { allWeeks, editWeek, getSettings, getWeek, setLock, subscribe } from '../store';
import { lunchStreak, workoutsInWeek } from '../stats';
import type { Day, Mark, MealKey, Week } from '../types';
import { h, openSheet } from './dom';
import { icon } from './icons';
import { openSportSheet } from './sportSheet';
import { openCellText, tapOrDoubleTap } from './cellTextSheet';
import { call, hasBackend } from '../api';
import { currentUser, photoUrl, rememberPhoto } from '../session';
import { fileToDataUrl, pickImage } from '../image';
import { setPhotoLocal } from '../store';
import { toast } from './dom';
import { HASH, navigate } from './router';
import { listTrackers, mainCfg } from '../trackers';
import { openMainEditor, openTrackerEditor } from './trackerEditor';
import { trackerBar } from './trackerView';
import { valueCell } from './valueCell';
import { track } from '../analytics';
import { gx } from '../gender';

const BASE_ROWS: { key: MealKey; full: string; short: string }[] = [
  { key: 'breakfast', full: t('ארוחת בוקר בריאה'), short: t('בוקר') },
  { key: 'lunch', full: t('ארוחת צהריים בריאה'), short: t('צהריים') },
  { key: 'dinner', full: t('ארוחת ערב בריאה'), short: t('ערב') },
];
/** Meal rows with the user's own names, if they renamed them. */
const mealRows = () => { const l = mainCfg().labels ?? {}; return BASE_ROWS.map((r) => (l[r.key] ? { ...r, full: l[r.key]!, short: l[r.key]! } : r)); };
const rowName = (k: 'sport' | 'smoked', full: string, short: string) => { const v = mainCfg().labels?.[k]; return v ? { full: v, short: v } : { full, short }; };

const DAY_LETTERS = lang === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];
const MARK_TEXT: Record<string, string> = { V: t('בוצע'), X: t('לא בוצע'), '-': t('לא רלוונטי') };
const markClass = (m: Mark | null) => (m === 'V' ? 'mark-V' : m === 'X' ? 'mark-X' : m === '-' ? 'mark-dash' : 'mark-empty');
const smokeText = (s: boolean | null | undefined) => (s === true ? t('כן') : s === false ? t('לא') : '');

/** The cell just tapped: it "pops" after the redraw. */
let justSet = '';
const popKey = (sunday: string, i: number, key: string) => `${sunday}|${i}|${key}`;
function tapped(k: string) {
  justSet = k;
  navigator.vibrate?.(8);
  setTimeout(() => { if (justSet === k) justSet = ''; }, 400);
}
const pop = (k: string) => (justSet === k ? ' pop' : '');
let ringDrawn = false;

function cycleMeal(sunday: string, i: number, key: MealKey) {
  track('mark:meal');
  tapped(popKey(sunday, i, key));
  editWeek(sunday, (w) => (w.days[i][key] = cycleMark(w.days[i][key])));
}
function cycleSmoke(sunday: string, i: number) {
  tapped(popKey(sunday, i, 'smoked'));
  editWeek(sunday, (w) => (w.days[i].smoked = cycleSmoked(w.days[i].smoked)));
}

function label(full: string, short: string, key?: string) {
  void key;
  return [
    h('span', { class: 'lbl-full' }, full), h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, short)];
}

/** How much of a day is filled in (meals + sport), 0–4. */
const dayDone = (d: Day) => (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] || d.text?.[k]).length + (d.sport.status ? 1 : 0);

/** Every task marked as done (V), not just filled in. */
const perfectDay = (d: Day) => d.breakfast === 'V' && d.lunch === 'V' && d.dinner === 'V' && d.sport.status === 'V';

/** "Good morning, Dana" by the time of day. */
function greeting(): string {
  const hr = new Date().getHours();
  const name = currentUser()?.name?.split(' ')[0];
  const g = hr < 5 ? t('לילה טוב') : hr < 12 ? t('בוקר טוב') : hr < 17 ? t('צהריים טובים') : hr < 21 ? t('ערב טוב') : t('לילה טוב');
  return name ? `${g}, ${name}` : g;
}

/** What to mark next, by the time of day and what's still empty. */
function nextTask(d: Day): string {
  const hr = new Date().getHours();
  const missing = (['breakfast', 'lunch', 'dinner'] as const).filter((k) => !d[k] && !d.text?.[k]);
  const label = { breakfast: t('ארוחת בוקר'), lunch: t('ארוחת צהריים'), dinner: t('ארוחת ערב') };
  const due = missing.filter((k) => (k === 'breakfast') || (k === 'lunch' && hr >= 12) || (k === 'dinner' && hr >= 18));
  if (due.length) return tr`הבא בתור: ${label[due[0]]}`;
  if (!d.sport.status && hr >= 16) return t('הבא בתור: ספורט');
  const left = missing.length + (d.sport.status ? 0 : 1);
  return left === 1 ? t('עוד משימה אחת ליום מלא') : tr`עוד ${left} משימות ליום מלא`;
}

/** Small live facts: streak, this week's workouts. */
function smartChips(sunday: string): HTMLElement | '' {
  const weeks = allWeeks();
  const today = todayISO();
  const ls = lunchStreak(weeks, today);
  const wo = workoutsInWeek(getWeek(sunday));
  const chips: string[] = [];
  if (ls.current >= 2) chips.push(tr`🔥 ${ls.current} ימים ברצף`);
  chips.push(wo >= 3 ? tr`✓ ${wo} אימונים השבוע` : tr`${wo}/3 אימונים השבוע`);
  return h('div', { class: 'smart-chips' }, chips.map((c) => h('span', { class: 'smart-chip' }, c)));
}

/** Three activity rings: meals today, sport today, full days this week. */
function activityRings(d: Day, w: Week): HTMLElement {
  const meals = (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] === 'V').length;
  const sport = d.sport.status === 'V' ? 1 : 0;
  const fullDays = w.days.filter((x) => dayDone(x) >= 4).length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'rings' + (ringDrawn ? '' : ' ring-intro')); svg.setAttribute('aria-hidden', 'true');
  const rings: [number, number, string][] = [[42, meals / 3, 'r-meals'], [31, sport, 'r-sport'], [20, fullDays / 7, 'r-week']];
  svg.innerHTML = rings.map(([r, p, cls]) => {
    const c = 2 * Math.PI * r;
    return `<circle cx="50" cy="50" r="${r}" class="ring-track ${cls}"/><circle cx="50" cy="50" r="${r}" class="ring-val ${cls}" style="--c:${c}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, p))}" transform="rotate(-90 50 50)"/>`;
  }).join('');
  ringDrawn = true;
  return h('div', { class: 'rings-box', role: 'img', 'aria-label': tr`ארוחות ${meals}/3, ספורט ${sport}/1, ימים מלאים השבוע ${fullDays}/7` },
    svg,
    h('ul', { class: 'rings-legend', 'aria-hidden': 'true' },
      h('li', { class: 'r-meals' }, h('b', null, `${meals}/3`), t('ארוחות')),
      h('li', { class: 'r-sport' }, h('b', null, `${sport}/1`), t('ספורט')),
      h('li', { class: 'r-week' }, h('b', null, `${fullDays}/7`), t('השבוע'))));
}


/** Big buttons for today's tasks. */
/** The big buttons for one day (today's panel and the day sheet). */
function dayGrid(date: string): HTMLElement {
  const sunday = sundayOf(date);
  const i = dayIndex(date);
  const d: Day = getWeek(sunday).days[i];
  const settings = getSettings();
  const btn = (title: string, value: string, cls: string, onclick: () => void, aria: string, k = '') =>
    h('button', { class: `today-btn ${cls}${pop(k)}`, type: 'button', onclick, 'aria-label': `${title}: ${aria}` },
      h('span', { class: 'today-title' }, title),
      value ? h('span', { class: 'today-val' }, value) : h('span', { class: 'today-empty' }, t('לא סומן')),
    );
  return h('div', { class: 'today-grid' + (isLocked(sunday, i) ? ' is-locked' : '') },
      mealRows().map((r) =>
        btn(r.short, d[r.key] ?? '', markClass(d[r.key]), () => cycleMeal(sunday, i, r.key), d[r.key] ? MARK_TEXT[d[r.key]!] : t('ריק'), popKey(sunday, i, r.key)),
      ),
      btn(rowName('sport', t('פעילות ספורט'), t('ספורט')).short, sportShort(d.sport), markClass(d.sport.status) + ' today-sport', () => openSportSheet(sunday, i), sportShort(d.sport) || t('ריק')),
      settings.showSmoking &&
        btn(rowName('smoked', t('מעשן?'), t('מעשן?')).short, smokeText(d.smoked), d.smoked === true ? 'mark-X' : d.smoked === false ? 'mark-V' : 'mark-empty', () => cycleSmoke(sunday, i), smokeText(d.smoked) || t('ריק'), popKey(sunday, i, 'smoked')),
  );
}

const isLocked = (sunday: string, i: number) => { const w = getWeek(sunday); return !!w.locked || !!w.lockedDays?.includes(i); };

/** Tap a day in the table: fill it in with the big buttons, or lock it. */
export function openDaySheet(date: string): void {
  const sunday = sundayOf(date), i = dayIndex(date);
  const body = h('div', { class: 'stack day-sheet' });
  const draw = () => {
    const w = getWeek(sunday);
    const dayLocked = !!w.lockedDays?.includes(i);
    body.replaceChildren(
      w.locked ? h('p', { class: 'hint' }, '🔒 ', t('כל השבוע נעול. אפשר לשחרר אותו מתחת לטבלה.')) : '',
      dayGrid(date),
      h('button', { class: 'btn' + (dayLocked ? ' btn-primary' : ''), type: 'button', disabled: !!w.locked, onclick: () => setLock(sunday, i, !dayLocked) },
        dayLocked ? '🔓 ' + t('שחרר את היום') : '🔒 ' + t('נעל את היום')),
      h('p', { class: 'hint' }, t('יום נעול לא משתנה בטעות, גם לא דרך העוזר. אפשר לשחרר בכל רגע.')),
    );
  };
  draw();
  const off = subscribe(() => { if (!body.isConnected) off(); else draw(); });
  openSheet(tr`יום ${t(DAY_NAMES[i])} ${formatShort(date)}`, body);
}

/** Big buttons for today's tasks. */
function todayPanel(today: string): HTMLElement {
  const sunday = sundayOf(today);
  const i = dayIndex(today);
  const d: Day = getWeek(sunday).days[i];
  const done = dayDone(d);
  return h('section', { class: 'card today', 'aria-label': t('היום') },
    h('div', { class: 'today-head' },
      h('div', null,
        h('p', { class: 'greet' }, greeting()),
        h('h2', { class: 'card-title' }, tr`יום ${t(DAY_NAMES[i])} ${formatShort(today)}`),
        h('p', { class: 'today-motto' }, done >= 4 ? (perfectDay(d) ? gx(t('יום מלא. אלוף'), t('יום מלא. אלופה'), t('יום מלא. אלוף/ה')) : t('היום סגור: כל המשימות סומנו')) : nextTask(d)),
        smartChips(sunday),
      ),
      activityRings(d, getWeek(sunday)),
    ),
    dayGrid(today),
    h('a', { class: 'start-wo', href: HASH.workout() }, h('span', { 'aria-hidden': 'true' }, '▶'), t('התחל אימון עם GPS')),
  );
}

function weekTable(sunday: string, today: string): HTMLElement {
  const week = getWeek(sunday);
  const settings = getSettings();
  const todayIdx = sundayOf(today) === sunday ? dayIndex(today) : -1;
  const colCls = (i: number) => (i === todayIdx ? 'is-today' : '') + (isLocked(sunday, i) ? ' locked-col' : '');

  const head = h('tr', null,
    h('th', { class: 'corner', scope: 'col' }, mainCfg().corner || t('משימה')),
    DAY_NAMES.map((n, i) =>
      h('th', { scope: 'col', class: colCls(i) + (isLocked(sunday, i) ? ' is-locked' : ''), 'aria-current': i === todayIdx ? 'date' : undefined },
        h('button', { class: 'day-btn', type: 'button', 'aria-label': tr`פתח את יום ${t(n)}${isLocked(sunday, i) ? ' (' + t('נעול') + ')' : ''}`, onclick: () => openDaySheet(addDays(sunday, i)) },
          h('span', { class: 'lbl-full' }, t(n)),
          h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, DAY_LETTERS[i]),
          h('span', { class: 'th-date' }, isLocked(sunday, i) ? '🔒' : formatShort(addDays(sunday, i)).slice(0, 5)),
        ),
      ),
    ),
  );

  const rows: HTMLElement[] = mealRows().map((r) =>
    h('tr', null,
      h('th', { scope: 'row' }, label(r.full, r.short, r.key)),
      week.days.map((d, i) => {
        const text = d.text?.[r.key];
        const edit = () => openCellText(sunday, i, r.key, r.full);
        return h('td', { class: colCls(i) },
          h('button', {
            class: `cell ${text ? 'cell-text' : markClass(d[r.key])}${pop(popKey(sunday, i, r.key))}`, type: 'button',
            'aria-label': tr`${r.full}, ${t(DAY_NAMES[i])}: ${text ?? (d[r.key] ? MARK_TEXT[d[r.key]!] : t('ריק'))}`,
            title: t('הקשה כפולה: כתיבת טקסט'),
            onclick: () => (text ? edit() : tapOrDoubleTap(`${sunday}-${i}-${r.key}`, () => cycleMeal(sunday, i, r.key), edit)),
          }, text ? h('span', { class: 'clamp' }, text) : d[r.key] ?? ''),
        );
      }),
    ),
  );

  rows.push(
    h('tr', { class: 'sport-row' },
      h('th', { scope: 'row' }, (() => { const n = rowName('sport', t('פעילות ספורט'), t('ספורט')); return label(n.full, n.short, 'sport'); })()),
      week.days.map((d, i) => {
        const txt = sportShort(d.sport);
        const rest = d.sport.status === 'V' && !d.sport.countsAsWorkout;
        return h('td', { class: colCls(i) },
          h('button', {
            class: `cell cell-sport ${markClass(d.sport.status)}${rest ? ' is-rest' : ''}`, type: 'button',
            'aria-label': tr`פעילות ספורט, ${t(DAY_NAMES[i])}: ${txt || t('ריק')}`,
            title: t('הקשה כפולה: כתיבת טקסט'),
            onclick: () => tapOrDoubleTap(`${sunday}-${i}-sport`, () => openSportSheet(sunday, i), () => openCellText(sunday, i, 'sport', t('פעילות ספורט'))),
          }, h('span', { class: 'clamp' }, txt)),
        );
      }),
    ),
  );

  if (settings.showSmoking) {
    rows.push(
      h('tr', null,
        h('th', { scope: 'row' }, (() => { const n = rowName('smoked', t('מעשן?'), t('מעשן?')); return label(n.full, n.short, 'smoked'); })()),
        week.days.map((d, i) => {
          const text = d.text?.smoked;
          const edit = () => openCellText(sunday, i, 'smoked', t('מעשן?'));
          return h('td', { class: colCls(i) },
            h('button', {
              class: `cell cell-smoke ${text ? 'cell-text' : d.smoked === true ? 'smoke-yes' : d.smoked === false ? 'smoke-no' : 'mark-empty'}`,
              type: 'button',
              'aria-label': tr`מעשן, ${t(DAY_NAMES[i])}: ${text ?? (smokeText(d.smoked) || t('ריק'))}`,
              onclick: () => (text ? edit() : tapOrDoubleTap(`${sunday}-${i}-smoked`, () => cycleSmoke(sunday, i), edit)),
            }, text ? h('span', { class: 'clamp' }, text) : smokeText(d.smoked)),
          );
        }),
      ),
    );
  }

  for (const r of mainCfg().extraRows ?? []) {
    rows.push(h('tr', { class: 'extra-row' },
      h('th', { scope: 'row' }, label(r.label, r.label)),
      week.days.map((_, i) => h('td', { class: colCls(i) },
        valueCell(r.type, week.extra?.[r.id]?.[i] ?? null, `${r.label}, ${t(DAY_NAMES[i])}`, r.unit, (v) => editWeek(sunday, (w) => {
          const ex = w.extra ?? (w.extra = {});
          const vals = ex[r.id] ?? (ex[r.id] = Array(7).fill(null));
          vals[i] = v;
        })))),
    ));
  }

  return h('div', { class: 'table-wrap' },
    h('table', { class: 'week-table' }, h('caption', { class: 'sr-only' }, tr`טבלת משימות לשבוע ${weekRangeLabel(sunday)}`), h('thead', null, head), h('tbody', null, rows)),
  );
}

/** One small menu for customizing, instead of extra buttons on the screen. */
function openWeekMenu(): void {
  const close = openSheet(t('התאמה אישית'), h('div', { class: 'menu-list' },
    menuItem('settings', t('עריכת הטבלה'), t('שמות שורות ושורות נוספות'), () => { close(); openMainEditor(getSettings().showSmoking); }),
    menuItem('week', t('מעקב חדש'), t('טבלה נוספת משלך: שתייה, שינה, חדר כושר…'), () => { close(); openTrackerEditor(); }),
  ));
}

export function menuItem(iconName: string | Node, title: string, sub: string, onclick: () => void): HTMLElement {
  return h('button', { class: 'menu-item', type: 'button', onclick },
    h('span', { class: 'mi-icon', 'aria-hidden': 'true' }, typeof iconName === 'string' && /^[a-z]+$/.test(iconName) ? icon(iconName, 20) : iconName),
    h('span', { class: 'mi-text' }, h('strong', null, title), sub ? h('span', { class: 'muted small' }, sub) : ''),
    h('span', { class: 'mi-chev', 'aria-hidden': 'true' }, isRTL ? '‹' : '›'));
}

function weekPhoto(sunday: string): HTMLElement | '' {
  if (!hasBackend() || !currentUser()) return '';
  const week = getWeek(sunday);
  const box = h('section', { class: 'card week-photo', 'aria-label': t('תמונת השבוע') });
  const busy = (t: string) => box.replaceChildren(h('p', { class: 'muted' }, t));

  const upload = async () => {
    const f = await pickImage();
    if (!f) return;
    try {
      const dataUrl = await fileToDataUrl(f);
      busy(t('מעלה תמונה…'));
      const { photoId } = await call<{ photoId: string | null }>('setWeekPhoto', { sundayDate: sunday, photo: dataUrl, data: getWeek(sunday) });
      if (photoId) rememberPhoto(photoId, dataUrl);
      setPhotoLocal(sunday, photoId ?? undefined);
      toast('התמונה נשמרה');
    } catch (e: any) {
      toast(e.message);
      draw();
    }
  };
  const remove = async () => {
    try {
      busy(t('מסיר…'));
      await call('setWeekPhoto', { sundayDate: sunday, photo: null });
      setPhotoLocal(sunday, undefined);
    } catch (e: any) {
      toast(e.message);
      draw();
    }
  };

  function draw() {
    if (!week.photoId) {
      box.className = 'inline-photo';
      box.replaceChildren(h('button', { class: 'link-btn', type: 'button', onclick: upload }, t('תמונה')));
      return;
    }
    box.className = 'card week-photo';
    const img = h('img', { class: 'week-img', alt: tr`תמונת השבוע ${weekRangeLabel(sunday)}` });
    photoUrl(week.photoId).then((u) => (img.src = u)).catch(() => img.replaceWith(h('p', { class: 'muted' }, t('לא ניתן לטעון את התמונה כרגע'))));
    box.replaceChildren(
      h('h2', { class: 'card-title' }, t('תמונת השבוע')),
      img,
      h('div', { class: 'row-btns two' },
        h('button', { class: 'btn', type: 'button', onclick: upload }, t('החלף')),
        h('button', { class: 'btn btn-danger', type: 'button', onclick: remove }, t('הסר')),
      ),
    );
  }
  draw();
  return box;
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

  const note = h('textarea', { class: 'input note', rows: 2, placeholder: t('הערה לשבוע (לא חובה)'), 'aria-label': t('הערה לשבוע'), hidden: !week.note }) as HTMLTextAreaElement;
  note.value = week.note ?? '';
  note.addEventListener('change', () => editWeek(sunday, (w) => {
    if (note.value.trim()) w.note = note.value;
    else delete w.note;
  }));

  const sundayNoWeight = isCurrent && dayIndex(today) === 0 && week.startWeight === undefined && getSettings().weeklyWeightReminder;

  const weekCard = h('section', { class: 'card week-card', 'aria-label': t('טבלת השבוע') },
    h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': t('שבוע קודם'), onclick: () => go(-1) }, isRTL ? '→' : '←'),
      h('div', { class: 'week-title' },
        h('h2', null, weekRangeLabel(sunday)),
        !isCurrent && h('button', { class: 'link-btn', onclick: () => navigate(HASH.week()) }, t('חזרה לשבוע הנוכחי')),
      ),
      h('button', { class: 'icon-btn', 'aria-label': t('שבוע הבא'), onclick: () => go(1) }, isRTL ? '←' : '→'),
    ),
    h('div', { class: 'weight-row' },
      h('label', { for: 'start-weight' }, t('משקל התחלתי:')), weight, h('span', null, t('ק"ג')),
    ),
    weekTable(sunday, today),
    note,
    h('div', { class: 'mini-actions' },
      !week.note && h('button', { class: 'link-btn', type: 'button', onclick: (e: Event) => { note.hidden = false; note.focus(); (e.currentTarget as HTMLElement).remove(); } }, t('הערה')),
      week.photoId ? '' : weekPhoto(sunday),
      h('button', { class: 'link-btn', type: 'button', onclick: () => setLock(sunday, null, !week.locked) }, week.locked ? '🔓 ' + t('שחרר שבוע') : '🔒 ' + t('נעל שבוע')),
      h('button', { class: 'link-btn', type: 'button', onclick: () => openWeekMenu() }, t('התאמה אישית')),
    ),
  );

  // Swipe between weeks: in RTL a finger moving right turns to the newer week; mirrored in LTR.
  let sx = 0, sy = 0;
  weekCard.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  weekCard.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) go((dx > 0) === isRTL ? 1 : -1);
  }, { passive: true });

  root.replaceChildren(
    listTrackers().length ? trackerBar(null) : '',
    isCurrent ? todayPanel(today) : '',
    sundayNoWeight ? h('div', { class: 'banner' }, t('שבוע חדש — אפשר להזין משקל התחלתי'), h('button', { class: 'link-btn', onclick: () => weight.focus() }, t('הזן'))) : '',
    weekCard,
    week.photoId ? weekPhoto(sunday) : '',
  );
}
