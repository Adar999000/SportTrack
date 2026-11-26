import { t, tr } from '../i18n';
import { cycleMark } from '../model';
import type { CellType } from '../trackers';
import { EMOJI_SCALE } from '../trackers';
import type { CellVal, Mark } from '../types';
import { h, openSheet } from './dom';

const MARK_TEXT: Record<string, string> = { V: 'בוצע', X: 'לא בוצע', '-': 'לא רלוונטי' };

export function valueText(type: CellType, v: CellVal, unit?: string): string {
  if (v === null || v === '') return '';
  if (type === 'stars') return '★'.repeat(Number(v));
  if (type === 'number') return unit ? `${v} ${unit}` : String(v);
  return String(v);
}

function spoken(type: CellType, v: CellVal, unit?: string): string {
  if (v === null || v === '') return t('ריק');
  if (type === 'vxd') return t(MARK_TEXT[String(v)] ?? String(v));
  if (type === 'check') return t('בוצע');
  if (type === 'stars') return tr`${v} כוכבים`;
  return valueText(type, v, unit);
}

/** The next value when tapping (for tap types), or undefined if the type needs typing. */
function nextValue(type: CellType, v: CellVal): CellVal | undefined {
  if (type === 'vxd') return cycleMark((v as Mark) ?? null);
  if (type === 'check') return v ? null : '✓';
  if (type === 'emoji') { const i = EMOJI_SCALE.indexOf(String(v)); return i === EMOJI_SCALE.length - 1 ? null : EMOJI_SCALE[i + 1]; }
  if (type === 'stars') { const n = Number(v) || 0; return n >= 5 ? null : n + 1; }
  return undefined;
}

function cls(type: CellType, v: CellVal): string {
  if (v === null || v === '') return 'mark-empty';
  if (type === 'vxd') return v === 'V' ? 'mark-V' : v === 'X' ? 'mark-X' : 'mark-dash';
  if (type === 'check') return 'mark-V';
  if (type === 'stars') return 'cell-stars';
  if (type === 'emoji') return 'cell-emoji';
  return 'cell-text';
}

/** Typing sheet for number/text cells. */
export function editValue(title: string, type: CellType, v: CellVal, unit: string | undefined, save: (v: CellVal) => void): void {
  const input = type === 'text'
    ? h('textarea', { class: 'input', rows: 3, maxlength: 200, 'aria-label': title }) as HTMLTextAreaElement
    : h('input', { class: 'input', type: 'number', inputmode: 'decimal', step: 'any', 'aria-label': title }) as HTMLInputElement;
  input.value = v === null ? '' : String(v);
  const done = (val: CellVal) => { save(val); close(); };
  const form = h('form', { class: 'stack', onsubmit: (e: Event) => {
    e.preventDefault();
    const raw = input.value.trim();
    if (type === 'number') { const n = parseFloat(raw.replace(',', '.')); done(raw && Number.isFinite(n) ? n : null); }
    else done(raw || null);
  } },
    h('div', { class: 'weight-row' }, input, unit ? h('span', null, unit) : ''),
    h('div', { class: 'row-btns' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, t('שמור')),
      h('button', { class: 'btn', type: 'button', onclick: () => done(null) }, t('נקה')),
    ),
  );
  const close = openSheet(title, form);
  setTimeout(() => input.focus(), 50);
}

/** A table cell button for a custom row. */
export function valueCell(type: CellType, v: CellVal, label: string, unit: string | undefined, onChange: (v: CellVal) => void): HTMLElement {
  return h('button', {
    class: `cell ${cls(type, v)}`, type: 'button', 'aria-label': `${label}: ${spoken(type, v, unit)}`,
    'data-track': 'cell:' + type,
    onclick: () => {
      const n = nextValue(type, v);
      if (n !== undefined) onChange(n);
      else editValue(label, type, v, unit, onChange);
    },
  }, type === 'number' && v !== null ? h('span', { class: 'clamp' }, String(v), unit ? h('small', null, ' ' + unit) : '') : h('span', { class: 'clamp' }, valueText(type, v, unit)));
}
