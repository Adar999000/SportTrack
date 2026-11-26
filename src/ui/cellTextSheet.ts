import { DAY_NAMES, addDays, formatShort } from '../dates';
import { sportFromLabel, sportMark } from '../model';
import { editWeek, getWeek } from '../store';
import type { TextCellKey } from '../types';
import { h, openSheet } from './dom';
import { t } from '../i18n';

export type TextTarget = TextCellKey | 'sport';

const QUICK = [t('חופשה'), t('מנוחה'), t('חולה'), t('אירוע'), t('צום')];

/** Write free text in a table cell (opened by double-tapping it). */
export function openCellText(sunday: string, dayIdx: number, target: TextTarget, rowLabel: string): void {
  const day = getWeek(sunday).days[dayIdx];
  const current = target === 'sport' ? (day.sport.status === 'V' ? day.sport.label ?? '' : '') : day.text?.[target] ?? '';
  const input = h('input', { id: 'cell-text', type: 'text', class: 'input', value: current, maxlength: 60, placeholder: t('למשל: חופשה'), 'aria-label': t('טקסט לתא') });

  const save = (text: string) => {
    const v = text.trim();
    editWeek(sunday, (w) => {
      const d = w.days[dayIdx];
      if (target === 'sport') {
        d.sport = v ? sportFromLabel(v) : sportMark(null);
        return;
      }
      const rest = { ...d.text };
      if (v) {
        rest[target] = v;
        if (target === 'smoked') d.smoked = null;
        else d[target] = null;
      } else delete rest[target];
      d.text = Object.keys(rest).length ? rest : undefined;
      if (!d.text) delete d.text;
    });
    close();
  };
  input.addEventListener('keydown', (e) => e.key === 'Enter' && save(input.value));

  const body = h('div', { class: 'stack' },
    input,
    h('div', { class: 'chips' }, QUICK.map((q) => h('button', { class: 'chip', type: 'button', onclick: () => save(t(q)) }, t(q)))),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: () => save(input.value) }, t('שמור')),
    current && h('button', { class: 'btn', type: 'button', onclick: () => save('') }, t('נקה טקסט')),
    h('p', { class: 'hint' }, target === 'sport' ? t('חופשה ומנוחה לא נספרות כאימון.') : t('תא עם טקסט לא נספר באחוזי ה-V.')),
  );
  const close = openSheet(`${rowLabel} · ${t(DAY_NAMES[dayIdx])} ${formatShort(addDays(sunday, dayIdx))}`, body);
  input.select();
}

/**
 * Distinguish a single tap (cycle the mark) from a double tap (write text)
 * without the browser's double-tap zoom.
 */
let pending: { key: string; timer: ReturnType<typeof setTimeout>; single: () => void } | null = null;
export function tapOrDoubleTap(key: string, single: () => void, double: () => void): void {
  if (pending && pending.key === key) {
    clearTimeout(pending.timer);
    pending = null;
    double();
    return;
  }
  if (pending) {
    clearTimeout(pending.timer);
    const prev = pending.single;
    pending = null;
    prev();
  }
  pending = { key, single, timer: setTimeout(() => { pending = null; single(); }, 260) };
}
