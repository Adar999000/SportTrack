import { call, hasBackend } from '../api';
import { currentUser, isAdmin } from '../session';
import { chatPanel, supportPanel } from './chatPanel';
import { contactForm } from './legalPages';
import { h } from './dom';
import { aiMark, icon } from './icons';
import { mascot } from './mascot';
import { t } from '../i18n';

/** Floating assistant button on every signed-in screen: AI chat + messages to the admin. */
export function mountFloatingChat(): { refresh: () => void } {
  const badge = h('span', { class: 'fab-badge', hidden: true });
  const fab = h('button', { class: 'fab', type: 'button', 'data-track': 'fab:open', 'aria-label': t('עוזר AI ופנייה למנהל'), title: t('עוזר AI') }, mascot(50, 'fab-mascot'), h('span', { class: 'fab-ring', 'aria-hidden': 'true' }), badge);
  const panel = h('div', { class: 'fab-panel', role: 'dialog', 'aria-label': t('עוזר AI'), hidden: true });
  document.body.append(fab, panel);

  let tab: 'ai' | 'support' = 'ai';
  let unread = 0;
  let lastCheck = 0;
  let aiEl: HTMLElement | null = null;
  let aiOwner = '';
  const setUnread = (n: number) => { unread = n; badge.hidden = !n; badge.textContent = String(n); };

  function draw() {
    const guest = !currentUser();
    const tabs = h('div', { class: 'seg fab-tabs', role: 'group', 'aria-label': t('עוזר AI') },
      h('button', { type: 'button', 'aria-pressed': String(tab === 'ai'), onclick: () => { tab = 'ai'; draw(); } }, aiMark(14), ' ', guest ? t('שאלות') : t('עוזר AI')),
      h('button', { type: 'button', 'aria-pressed': String(tab === 'support'), onclick: () => { tab = 'support'; draw(); } },
        icon('info', 14), ' ', t('פנייה למנהל'), unread ? h('span', { class: 'fab-badge inline' }, String(unread)) : ''),
    );
    // Keep the conversation alive between open/close (so "undo" still works); reload support each time.
    const user = currentUser()?.userId ?? '';
    if (!aiEl || aiOwner !== user) { aiEl = chatPanel(guest ? 'guest' : 'me'); aiOwner = user; }
    panel.replaceChildren(
      h('div', { class: 'fab-head' }, tabs, h('button', { class: 'icon-btn', type: 'button', 'aria-label': t('סגור'), onclick: close }, '✕')),
      tab === 'ai' ? aiEl
        : guest ? h('div', { class: 'support-panel stack guest-contact' }, h('p', { class: 'muted' }, t('שאלה, תקלה או בקשה? כתבו למנהל האפליקציה ונחזור אליכם במייל.')), contactForm('תמיכה'))
        : supportPanel(setUnread),
    );
    (panel.querySelector('textarea') as HTMLElement | null)?.focus();
  }
  function open() { panel.hidden = false; fab.setAttribute('aria-expanded', 'true'); draw(); }
  function close() { panel.hidden = true; fab.setAttribute('aria-expanded', 'false'); fab.focus(); }
  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && !panel.hidden) close(); });

  const refresh = () => {
    const signedIn = !!currentUser();
    const show = hasBackend() && !/^#chat/.test(location.hash) && (!signedIn || !!currentUser()?.profile?.completed);
    if ((signedIn ? currentUser()!.userId : '') !== aiOwner) aiEl = null; // signed in/out: start a fresh conversation
    fab.hidden = !show;
    if (!show) panel.hidden = true;
    if (show && signedIn && !isAdmin() && Date.now() - lastCheck > 60_000) {
      lastCheck = Date.now();
      call<{ unread: number }>('unreadCount').then((r) => setUnread(r.unread)).catch(() => {});
    }
  };
  return { refresh };
}
