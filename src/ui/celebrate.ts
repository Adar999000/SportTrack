import { t } from '../i18n';
import { burst } from './confetti';

type Kind = 'day' | 'week' | 'level' | 'badge';
let showing = false;
const queue: (() => void)[] = [];
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');

function art(kind: Kind, icon?: string, num?: number): HTMLElement {
  const el = document.createElement('div');
  el.className = 'cel-art cel-' + kind;
  if (kind === 'day') {
    el.innerHTML = '<svg viewBox="0 0 80 80" width="88" height="88" aria-hidden="true"><circle cx="40" cy="40" r="34" class="cel-ring"/><path d="M24 41l11 11 22-24" class="cel-check"/></svg>';
  } else if (kind === 'level') {
    el.innerHTML = `<div class="cel-level"><small>${t('רמה')}</small><b>${num ?? ''}</b></div>`;
  } else {
    el.innerHTML = `<div class="cel-emoji">${icon ?? (kind === 'week' ? '🏆' : '🏅')}</div>`;
  }
  return el;
}

/** A short, elegant overlay for a moment worth marking. Tap or wait to close. */
export function celebrate(kind: Kind, title: string, sub = '', opts: { icon?: string; num?: number } = {}): void {
  const run = () => {
    showing = true;
    const layer = document.createElement('div');
    layer.className = 'cel-layer';
    layer.setAttribute('role', 'status');
    layer.setAttribute('aria-live', 'polite');
    const card = document.createElement('div');
    card.className = 'cel-card';
    const h = document.createElement('strong'); h.textContent = title;
    const p = document.createElement('span'); p.textContent = sub;
    card.append(art(kind, opts.icon, opts.num), h, p);
    layer.append(card);
    document.body.append(layer);
    if (kind !== 'day') burst(true, kind === 'week' ? 'fireworks' : 'stars');
    else burst();
    navigator.vibrate?.(kind === 'day' ? [12, 60, 12] : [20, 80, 20, 80, 30]);
    let done = false;
    const close = () => {
      if (done) return;
      done = true;
      layer.classList.add('cel-out');
      setTimeout(() => { layer.remove(); showing = false; queue.shift()?.(); }, reduced() ? 0 : 260);
    };
    layer.addEventListener('click', close);
    setTimeout(close, kind === 'day' ? 2200 : 3200);
  };
  if (showing) queue.push(run); else run();
}
