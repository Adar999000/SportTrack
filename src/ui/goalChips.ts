import { h } from './dom';
import { t } from '../i18n';
import { GOALS } from '../goals';

/** Multi-select chips. Returns the element and a getter for the picked ids. */
export function goalChips(selected: string[] = []): { el: HTMLElement; value: () => string[] } {
  const picked = new Set(selected);
  const el = h('div', { class: 'goal-chips', role: 'group', 'aria-label': t('המטרות שלי') },
    GOALS.map((g) => {
      const b = h('button', { type: 'button', class: 'goal-chip', 'aria-pressed': String(picked.has(g.id)) },
        h('span', { class: 'goal-emoji', 'aria-hidden': 'true' }, g.emoji), t(g.label));
      b.addEventListener('click', () => {
        picked.has(g.id) ? picked.delete(g.id) : picked.add(g.id);
        b.setAttribute('aria-pressed', String(picked.has(g.id)));
        navigator.vibrate?.(8);
      });
      return b;
    }));
  return { el, value: () => GOALS.map((g) => g.id).filter((id) => picked.has(id)) };
}
