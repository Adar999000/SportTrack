import { t } from '../i18n';
type Child = Node | string | number | null | undefined | false;
type Attrs = Record<string, any>;

/** Tiny hyperscript: h('button', { class: 'x', onclick }, 'text') */
export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  attrs: Attrs | null = null,
  ...children: (Child | Child[])[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);
  if (attrs) {
    for (const [k, v] of Object.entries(attrs)) {
      if (v === undefined || v === null || v === false) continue;
      if (k.startsWith('on') && typeof v === 'function') el.addEventListener(k.slice(2), v);
      else if (k === 'class') el.className = v;
      else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
      else if (k in el && k !== 'list' && typeof v !== 'string') (el as any)[k] = v;
      else el.setAttribute(k, v === true ? '' : String(v));
    }
  }
  for (const c of children.flat()) {
    if (c === null || c === undefined || c === false) continue;
    el.append(c instanceof Node ? c : String(c));
  }
  return el;
}

const SVG_NS = 'http://www.w3.org/2000/svg';
export function s(tag: string, attrs: Attrs = {}, ...children: (Node | string)[]): SVGElement {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) if (v !== undefined && v !== null) el.setAttribute(k, String(v));
  el.append(...children);
  return el;
}

export function toast(msg: string): void {
  const el = h('div', { class: 'toast', role: 'status' }, msg);
  document.body.append(el);
  setTimeout(() => el.classList.add('show'), 10);
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 300);
  }, 2600);
}

/** Bottom sheet / modal. Returns a close function. */
export function openSheet(title: string, body: Node, opts: { full?: boolean } = {}): () => void {
  const prevFocus = document.activeElement as HTMLElement | null;
  let closing = false;
  const close = () => {
    if (closing) return;
    closing = true;
    document.removeEventListener('keydown', onKey);
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');
    backdrop.classList.add('closing');
    setTimeout(() => { backdrop.remove(); prevFocus?.focus?.(); }, still ? 0 : 200);
  };
  const onKey = (e: KeyboardEvent) => e.key === 'Escape' && close();
  const sheet = h(
    'div',
    { class: 'sheet' + (opts.full ? ' sheet-full' : ''), role: 'dialog', 'aria-modal': 'true', 'aria-label': title },
    h('div', { class: 'sheet-head' },
      h('h2', null, title),
      h('button', { class: 'icon-btn', 'aria-label': t('סגור'), onclick: close }, '✕'),
    ),
    h('div', { class: 'sheet-body' }, body),
  );
  const backdrop = h('div', { class: 'backdrop', onclick: (e: Event) => e.target === backdrop && close() }, sheet);
  document.body.append(backdrop);
  document.addEventListener('keydown', onKey);
  (sheet.querySelector('button, input') as HTMLElement | null)?.focus();
  return close;
}

export function fmtPct(p: number | null): string {
  return p === null ? '—' : `${Math.round(p)}%`;
}

export function fmtKg(n: number | null | undefined, digits = 1): string {
  return n === null || n === undefined ? '—' : n.toFixed(digits);
}

/**
 * A button that asks for a second tap instead of a browser confirm() dialog
 * (which embedded viewers block).
 */
export function confirmButton(label: string, confirmLabel: string, onConfirm: () => void, cls = 'btn'): HTMLButtonElement {
  let armed = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  const b = h('button', { class: cls, type: 'button' }, label);
  b.addEventListener('click', () => {
    if (armed) {
      clearTimeout(timer);
      onConfirm();
      return;
    }
    armed = true;
    b.textContent = confirmLabel;
    b.classList.add('is-armed');
    timer = setTimeout(() => {
      armed = false;
      b.textContent = label;
      b.classList.remove('is-armed');
    }, 4000);
  });
  return b;
}

/** Animate a number in an element from 0 to its value (skipped when motion is reduced). */
export function countUp(el: HTMLElement, to: number, ms = 700): HTMLElement {
  const fmt = (n: number) => Math.round(n).toLocaleString('en-US');
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion') || to === 0) { el.textContent = fmt(to); return el; }
  const t0 = performance.now();
  const step = (now: number) => {
    const p = Math.min(1, (now - t0) / ms);
    el.textContent = fmt(to * (1 - Math.pow(1 - p, 3)));
    if (p < 1 && el.isConnected) requestAnimationFrame(step);
  };
  el.textContent = '0';
  requestAnimationFrame(step);
  return el;
}
