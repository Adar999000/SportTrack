import { isRTL, lang, t, tr } from '../i18n';
import { DAY_NAMES, addDays, dayIndex, formatShort, sundayOf, todayISO, weekRangeLabel } from '../dates';
import { getTracker, listTrackers, setGridCell, setTrackerCell, trackerGrid, trackerWeek, type Tracker } from '../trackers';
import { h } from './dom';
import { HASH, navigate } from './router';
import { valueCell } from './valueCell';
import { openMainEditor, openTrackerEditor } from './trackerEditor';
import { getSettings } from '../store';

const DAY_LETTERS = lang === 'en' ? ['S', 'M', 'T', 'W', 'T', 'F', 'S'] : ["א'", "ב'", "ג'", "ד'", "ה'", "ו'", "ש'"];

/** Chips to switch between the main table and the user's trackers. */
export function trackerBar(activeId: string | null): HTMLElement {
  const list = listTrackers();
  return h('nav', { class: 'tracker-bar', 'aria-label': t('המעקבים שלי') },
    h('a', { class: 'chip', href: HASH.week(), 'aria-current': activeId === null ? 'page' : undefined }, '✅ ', t('הטבלה הראשית')),
    ...list.map((x) => h('a', { class: 'chip', href: HASH.tracker(x.id), 'aria-current': activeId === x.id ? 'page' : undefined }, `${x.icon} ${x.name}`)),
    h('button', { class: 'chip chip-add', type: 'button', onclick: () => openTrackerEditor() }, t('+ מעקב חדש')),
    activeId === null && h('button', { class: 'chip', type: 'button', onclick: () => openMainEditor(getSettings().showSmoking) }, '✏️ ', t('עריכת הטבלה')),
  );
}

function weekTable(x: Tracker, sunday: string): HTMLElement {
  const data = trackerWeek(x.id, sunday);
  const today = todayISO();
  const ti = sundayOf(today) === sunday ? dayIndex(today) : -1;
  const col = (i: number) => (i === ti ? 'is-today' : '');
  return h('div', { class: 'table-wrap' }, h('table', { class: 'week-table custom-table' },
    h('caption', { class: 'sr-only' }, `${x.name} · ${weekRangeLabel(sunday)}`),
    h('thead', null, h('tr', null,
      h('th', { class: 'corner', scope: 'col' }, x.corner || t('משימה')),
      DAY_NAMES.map((n, i) => h('th', { scope: 'col', class: col(i), 'aria-current': i === ti ? 'date' : undefined },
        h('span', { class: 'lbl-full' }, t(n)), h('span', { class: 'lbl-short', 'aria-hidden': 'true' }, DAY_LETTERS[i]),
        h('span', { class: 'th-date' }, formatShort(addDays(sunday, i)).slice(0, 5)))))),
    h('tbody', null, x.rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, r.label),
      Array.from({ length: 7 }, (_, i) => h('td', { class: col(i) },
        valueCell(r.type, data[r.id]?.[i] ?? null, `${r.label}, ${t(DAY_NAMES[i])}`, r.unit, (v) => setTrackerCell(x.id, sunday, r.id, i, v)))),
    ))),
  ));
}

function gridTable(x: Tracker): HTMLElement {
  const data = trackerGrid(x.id);
  return h('div', { class: 'table-wrap' }, h('table', { class: 'week-table custom-table grid-table' },
    h('caption', { class: 'sr-only' }, x.name),
    h('thead', null, h('tr', null, h('th', { class: 'corner', scope: 'col' }, x.corner || ''), x.cols.map((c) => h('th', { scope: 'col' }, c.label)))),
    h('tbody', null, x.rows.map((r) => h('tr', null,
      h('th', { scope: 'row' }, r.label),
      x.cols.map((c) => h('td', null, valueCell(r.type, data[`${r.id}|${c.id}`] ?? null, `${r.label}, ${c.label}`, r.unit, (v) => setGridCell(x.id, r.id, c.id, v)))),
    ))),
  ));
}

export function renderTracker(root: HTMLElement, id: string, sunday?: string): void {
  const x = getTracker(id);
  if (!x) {
    root.replaceChildren(trackerBar(null), h('section', { class: 'card' }, h('p', null, t('המעקב לא נמצא. אולי הוא נמחק.'))));
    return;
  }
  const s = sunday ?? sundayOf(todayISO());
  const isCurrent = s === sundayOf(todayISO());
  const go = (n: number) => navigate(HASH.tracker(id, addDays(s, 7 * n)));
  const card = h('section', { class: 'card week-card', 'aria-label': x.name },
    h('div', { class: 'tracker-head' },
      h('h2', null, `${x.icon} ${x.name}`),
      h('button', { class: 'btn', type: 'button', onclick: () => openTrackerEditor(x) }, '✏️ ', t('עריכה')),
    ),
    x.mode === 'week' && h('div', { class: 'week-nav' },
      h('button', { class: 'icon-btn', 'aria-label': t('שבוע קודם'), onclick: () => go(-1) }, isRTL ? '→' : '←'),
      h('div', { class: 'week-title' },
        h('h3', null, weekRangeLabel(s)),
        !isCurrent && h('button', { class: 'link-btn', onclick: () => navigate(HASH.tracker(id)) }, t('חזרה לשבוע הנוכחי'))),
      h('button', { class: 'icon-btn', 'aria-label': t('שבוע הבא'), onclick: () => go(1) }, isRTL ? '←' : '→'),
    ),
    x.mode === 'week' ? weekTable(x, s) : gridTable(x),
    h('p', { class: 'hint' }, x.mode === 'week' ? t('מקישים על תא כדי לסמן. בשורות של מספר או טקסט נפתח חלון כתיבה.') : t('גיליון חופשי: מקישים על תא כדי לסמן או לכתוב.')),
  );
  root.replaceChildren(trackerBar(id), card);
  void tr;
}
