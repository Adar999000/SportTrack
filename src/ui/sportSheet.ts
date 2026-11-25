import { DAY_NAMES, addDays, formatShort } from '../dates';
import { BUILTIN_SPORT_TYPES, isNonWorkoutLabel, sportFromLabel, sportMark } from '../model';
import { addCustomSportType, editWeek, getSettings, getWeek } from '../store';
import { h, openSheet } from './dom';

export function openSportSheet(sunday: string, dayIdx: number): void {
  const cell = getWeek(sunday).days[dayIdx].sport;
  let selected: string | null = null;
  let countsTouched = false;

  const detail = h('input', {
    type: 'text', class: 'input', placeholder: 'מרחק / משך (לא חובה), למשל: 3 ק"מ, שעה',
    'aria-label': 'מרחק או משך',
  });
  const free = h('input', {
    type: 'text', class: 'input', placeholder: 'או טקסט חופשי', 'aria-label': 'טקסט חופשי',
    value: cell.status === 'V' ? cell.label ?? '' : '',
  });
  const counts = h('input', { type: 'checkbox', checked: cell.status === 'V' ? cell.countsAsWorkout : true });
  counts.addEventListener('change', () => (countsTouched = true));

  const currentLabel = () => {
    if (selected) return [selected, detail.value.trim()].filter(Boolean).join(' ');
    return free.value.trim();
  };
  const syncCounts = () => {
    if (!countsTouched) counts.checked = !isNonWorkoutLabel(currentLabel());
  };
  detail.addEventListener('input', syncCounts);
  free.addEventListener('input', () => {
    if (free.value.trim()) selectChip(null);
    syncCounts();
  });

  const chips = h('div', { class: 'chips', role: 'group', 'aria-label': 'סוג פעילות' });
  const newInput = h('input', { type: 'text', class: 'input', id: 'new-sport-type', placeholder: 'שם הסוג, למשל: שחייה', 'aria-label': 'שם סוג פעילות חדש' });
  const addNew = () => {
    const t = newInput.value.trim();
    if (!t) return newInput.focus();
    addCustomSportType(t);
    newInput.value = '';
    newRow.hidden = true;
    renderChips();
    selectChip(t);
  };
  newInput.addEventListener('keydown', (e) => e.key === 'Enter' && addNew());
  const newRow = h('div', { class: 'inline-form', hidden: true },
    newInput, h('button', { class: 'btn', type: 'button', onclick: addNew }, 'הוסף'));
  const chipEls: HTMLButtonElement[] = [];
  function selectChip(t: string | null) {
    selected = t;
    chipEls.forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.type === t)));
    if (t) free.value = '';
    syncCounts();
  }
  function renderChips() {
    chips.replaceChildren();
    chipEls.length = 0;
    for (const t of [...BUILTIN_SPORT_TYPES, ...getSettings().customSportTypes]) {
      const c = h('button', { class: 'chip', type: 'button', 'aria-pressed': 'false', onclick: () => selectChip(selected === t ? null : t) }, t);
      c.dataset.type = t;
      chipEls.push(c);
      chips.append(c);
    }
    chips.append(
      h('button', {
        class: 'chip chip-add', type: 'button', 'aria-expanded': String(!newRow.hidden),
        onclick: () => {
          newRow.hidden = !newRow.hidden;
          if (!newRow.hidden) newInput.focus();
        },
      }, '+ סוג חדש'),
    );
  }
  renderChips();

  const save = (fn: () => void) => {
    fn();
    close();
  };
  const body = h('div', { class: 'stack' },
    chips,
    newRow,
    detail,
    free,
    h('label', { class: 'check' }, counts, ' נחשב כאימון'),
    h('p', { class: 'hint' }, 'חופשה ומנוחה לא נספרות כאימון.'),
    h('button', {
      class: 'btn btn-primary', type: 'button',
      onclick: () => {
        const label = currentLabel();
        if (!label) return free.focus();
        save(() => editWeek(sunday, (w) => {
          w.days[dayIdx].sport = { ...sportFromLabel(label), countsAsWorkout: counts.checked };
        }));
      },
    }, 'שמור'),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn mark-X', type: 'button', onclick: () => save(() => editWeek(sunday, (w) => (w.days[dayIdx].sport = sportMark('X')))) }, 'X לא בוצע'),
      h('button', { class: 'btn mark-dash', type: 'button', onclick: () => save(() => editWeek(sunday, (w) => (w.days[dayIdx].sport = sportMark('-')))) }, '- לא רלוונטי'),
      h('button', { class: 'btn', type: 'button', onclick: () => save(() => editWeek(sunday, (w) => (w.days[dayIdx].sport = sportMark(null)))) }, 'נקה'),
    ),
  );
  const close = openSheet(`פעילות ספורט · ${DAY_NAMES[dayIdx]} ${formatShort(addDays(sunday, dayIdx))}`, body);
}
