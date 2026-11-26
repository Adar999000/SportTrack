import { DEFAULT_A11Y, getA11y, setA11y, type A11yPrefs } from '../a11y';
import { h } from './dom';
import { t } from '../i18n';

/** International Symbol of Access. */
function wheelchair(size = 26): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="currentColor" aria-hidden="true" focusable="false"><circle cx="12.5" cy="3.6" r="2.1"/><path d="M10.6 7.1c.1-.9 1-1.5 1.9-1.3.8.2 1.3.9 1.2 1.7l-.3 2.6h3.4c.6 0 1 .4 1 1s-.4 1-1 1h-3.6l-.2 1.8h4.4c.5 0 .9.3 1 .8l1.4 5.4c.1.5-.2 1.1-.7 1.2-.5.1-1.1-.2-1.2-.7l-1.2-4.7h-4.9c-.9 0-1.6-.7-1.5-1.6l.5-6.3z"/><path d="M8.1 10.4a.9.9 0 0 1 .5 1.7 4.6 4.6 0 1 0 6.1 5.5.9.9 0 1 1 1.7.6 6.4 6.4 0 1 1-8.3-7.8z"/></svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

const HIDE_KEY = 'mishmaat-a11y-hidden';
let openA11yMenu: () => void = () => {};
let showA11yButton: (on: boolean) => void = () => {};
/** Open the accessibility menu from anywhere (works even when its button is hidden). */
export const openAccessibility = () => openA11yMenu();
export const setA11yButtonVisible = (on: boolean) => showA11yButton(on);
export const a11yButtonVisible = () => { try { return localStorage.getItem(HIDE_KEY) !== '1'; } catch { return true; } };

/** Accessibility menu: a fixed button on every screen (signed in or not). */
export function mountA11yWidget(): void {
  const btn = h('button', { class: 'a11y-btn', type: 'button', 'data-track': 'a11y:open', 'aria-label': t('תפריט נגישות'), title: t('נגישות'), 'aria-expanded': 'false', 'aria-controls': 'a11y-panel' }, wheelchair());
  const panel = h('div', { class: 'a11y-panel', id: 'a11y-panel', role: 'dialog', 'aria-label': t('תפריט נגישות'), hidden: true });
  // a small ✕ hides the floating button (the menu stays available from "Me" / Settings)
  const hide = h('button', { class: 'a11y-hide', type: 'button', 'aria-label': t('הסתר את כפתור הנגישות'), title: t('הסתר'), onclick: () => {
    try { localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ }
    sync();
  } }, '✕');
  const sync = () => {
    let hidden = false;
    try { hidden = localStorage.getItem(HIDE_KEY) === '1'; } catch { /* ignore */ }
    btn.hidden = hide.hidden = hidden;
  };
  document.body.append(btn, hide, panel);
  sync();
  openA11yMenu = () => open();
  showA11yButton = (on: boolean) => { try { if (on) localStorage.removeItem(HIDE_KEY); else localStorage.setItem(HIDE_KEY, '1'); } catch { /* ignore */ } sync(); };

  const draw = () => {
    const p = getA11y();
    const toggle = (key: keyof Omit<A11yPrefs, 'text'>, label: string) =>
      h('button', { class: 'a11y-opt', type: 'button', 'aria-pressed': String(p[key]), onclick: () => { setA11y({ ...p, [key]: !p[key] }); draw(); } }, label);
    panel.replaceChildren(
      h('div', { class: 'a11y-head' },
        h('h2', null, t('נגישות')),
        h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('סגור'), onclick: close }, '✕')),
      h('div', { class: 'a11y-row' },
        h('span', { id: 'a11y-size' }, t('גודל טקסט')),
        h('div', { class: 'a11y-size', role: 'group', 'aria-labelledby': 'a11y-size' },
          h('button', { type: 'button', class: 'a11y-opt', 'aria-label': t('הקטנת טקסט'), disabled: p.text === 0, onclick: () => { setA11y({ ...p, text: Math.max(0, p.text - 1) as A11yPrefs['text'] }); draw(); } }, 'א-'),
          h('span', { 'aria-live': 'polite' }, `${[100, 112, 125, 140][p.text]}%`),
          h('button', { type: 'button', class: 'a11y-opt', 'aria-label': t('הגדלת טקסט'), disabled: p.text === 3, onclick: () => { setA11y({ ...p, text: Math.min(3, p.text + 1) as A11yPrefs['text'] }); draw(); } }, 'א+'),
        ),
      ),
      h('div', { class: 'a11y-grid' },
        toggle('contrast', t('ניגודיות גבוהה')),
        toggle('links', t('הדגשת קישורים וכפתורים')),
        toggle('font', t('גופן קריא')),
        toggle('spacing', t('ריווח טקסט')),
        toggle('motion', t('עצירת אנימציות')),
      ),
      h('div', { class: 'a11y-foot' },
        h('button', { class: 'btn', type: 'button', onclick: () => { setA11y({ ...DEFAULT_A11Y }); draw(); } }, t('איפוס הגדרות')),
        h('a', { class: 'link-btn', href: '#accessibility', onclick: close }, t('הצהרת נגישות')),
      ),
    );
  };
  function open() { panel.hidden = false; btn.setAttribute('aria-expanded', 'true'); draw(); (panel.querySelector('.a11y-opt') as HTMLElement)?.focus(); }
  function close() { panel.hidden = true; btn.setAttribute('aria-expanded', 'false'); if (!btn.hidden) btn.focus(); }
  btn.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });
}
