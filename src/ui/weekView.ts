import { isRTL, lang, t, tr } from '../i18n';
import { DAY_NAMES, addDays, dayIndex, formatShort, sundayOf, todayISO, weekRangeLabel } from '../dates';
import { cycleMark, cycleSmoked, sportShort } from '../model';
import { editWeek, getSettings, getWeek } from '../store';
import type { Day, Mark, MealKey } from '../types';
import { h } from './dom';
import { openSportSheet } from './sportSheet';
import { openCellText, tapOrDoubleTap } from './cellTextSheet';
import { call, hasBackend } from '../api';
import { currentUser, photoUrl, rememberPhoto } from '../session';
import { fileToDataUrl, pickImage } from '../image';
import { setPhotoLocal } from '../store';
import { toast } from './dom';
import { HASH, navigate } from './router';
import { mainCfg } from '../trackers';
import { trackerBar } from './trackerView';
import { valueCell } from './valueCell';

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
      value ? h('span', { class: 'today-val' }, value) : h('span', { class: 'today-empty' }, t('לא סומן')),
    );
  return h('section', { class: 'card today', 'aria-label': t('היום') },
    h('h2', { class: 'card-title' }, tr`היום · יום ${t(DAY_NAMES[i])} ${formatShort(today)}`),
    h('div', { class: 'today-grid' },
      mealRows().map((r) =>
        btn(r.short, d[r.key] ?? '', markClass(d[r.key]), () => cycleMeal(sunday, i, r.key), d[r.key] ? MARK_TEXT[d[r.key]!] : t('ריק')),
      ),
      btn(rowName('sport', t('פעילות ספורט'), t('ספורט')).short, sportShort(d.sport), markClass(d.sport.status) + ' today-sport', () => openSportSheet(sunday, i), sportShort(d.sport) || t('ריק')),
      settings.showSmoking &&
        btn(rowName('smoked', t('מעשן?'), t('מעשן?')).short, smokeText(d.smoked), d.smoked === true ? 'mark-X' : d.smoked === false ? 'mark-V' : 'mark-empty', () => cycleSmoke(sunday, i), smokeText(d.smoked) || t('ריק')),
    ),
  );
}

function weekTable(sunday: string, today: string): HTMLElement {
  const week = getWeek(sunday);
  const settings = getSettings();
  const todayIdx = sundayOf(today) === sunday ? dayIndex(today) : -1;
  const colCls = (i: number) => (i === todayIdx ? 'is-today' : '');

  const head = h('tr', null,
    h('th', { class: 'corner', scope: 'col' }, mainCfg().corner || t('משימה')),
    DAY_NAMES.map((n, i) =>
      h('th', { scope: 'col', class: colCls(i), 'aria-current': i === todayIdx ? 'date' : undefined },
        h('span', { class: 'lbl-full' }, t(n)),
        h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, DAY_LETTERS[i]),
        h('span', { class: 'th-date' }, formatShort(addDays(sunday, i)).slice(0, 5)),
      ),
    ),
  );

  const rows: HTMLElement[] = mealRows().map((r) =>
    h('tr', null,
      h('th', { scope: 'row' }, label(r.full, r.short)),
      week.days.map((d, i) => {
        const text = d.text?.[r.key];
        const edit = () => openCellText(sunday, i, r.key, r.full);
        return h('td', { class: colCls(i) },
          h('button', {
            class: `cell ${text ? 'cell-text' : markClass(d[r.key])}`, type: 'button',
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
      h('th', { scope: 'row' }, (() => { const n = rowName('sport', t('פעילות ספורט'), t('ספורט')); return label(n.full, n.short); })()),
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
        h('th', { scope: 'row' }, (() => { const n = rowName('smoked', t('מעשן?'), t('מעשן?')); return label(n.full, n.short); })()),
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
      box.replaceChildren(h('button', { class: 'btn photo-add', type: 'button', onclick: upload }, t('+ הוסף תמונה לשבוע')));
      return;
    }
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

  const note = h('textarea', { class: 'input note', rows: 2, placeholder: t('הערה לשבוע (לא חובה)'), 'aria-label': t('הערה לשבוע') });
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
        h('h2', null, tr`תאריך ${weekRangeLabel(sunday)}`),
        !isCurrent && h('button', { class: 'link-btn', onclick: () => navigate(HASH.week()) }, t('חזרה לשבוע הנוכחי')),
      ),
      h('button', { class: 'icon-btn', 'aria-label': t('שבוע הבא'), onclick: () => go(1) }, isRTL ? '←' : '→'),
    ),
    h('div', { class: 'weight-row' },
      h('label', { for: 'start-weight' }, t('משקל התחלתי:')), weight, h('span', null, t('ק"ג')),
    ),
    weekTable(sunday, today),
    note,
  );

  // Swipe between weeks: in RTL a finger moving right turns to the newer week; mirrored in LTR.
  let sx = 0, sy = 0;
  weekCard.addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; sy = e.touches[0].clientY; }, { passive: true });
  weekCard.addEventListener('touchend', (e) => {
    const dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
    if (Math.abs(dx) > 60 && Math.abs(dy) < 50) go((dx > 0) === isRTL ? 1 : -1);
  }, { passive: true });

  root.replaceChildren(
    trackerBar(null),
    isCurrent ? todayPanel(today) : '',
    sundayNoWeight ? h('div', { class: 'banner' }, t('שבוע חדש — אפשר להזין משקל התחלתי'), h('button', { class: 'link-btn', onclick: () => weight.focus() }, t('הזן'))) : '',
    weekCard,
    weekPhoto(sunday),
  );
}
