import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { IS_DEMO } from './env';
import { clearDemo, isDemoActive, seedDemoIfEmpty } from './demo';
import { hasBackend } from './api';
import { sundayOf, todayISO } from './dates';
import { checkReminders } from './reminders';
import { currentUser, isAdmin, loadSession, onSession, refreshUser } from './session';
import { allWeeks, dirtyCount, flush, getSettings, loadStore, setOwner, subscribe, weeksOwner } from './store';
import { getSyncState, onSync, resetPullCursor, scheduleSync, syncNow } from './sync';
import { renderAdmin, renderAdminUser } from './ui/adminView';
import { renderAuth } from './ui/authView';
import { renderChat } from './ui/chatView';
import { h, openSheet } from './ui/dom';
import { renderHistory } from './ui/historyView';
import { renderProfile, renderProfileForm } from './ui/profileView';
import { HASH, parseRoute, type Route } from './ui/router';
import { renderSettings } from './ui/settingsView';
import { renderStats } from './ui/statsView';
import { renderWeek } from './ui/weekView';

interface Tab { names: Route['name'][]; hash: string; label: string; icon: string }

function tabs(): Tab[] {
  if (!hasBackend()) {
    return [
      { names: ['week'], hash: HASH.week(), label: 'שבוע', icon: '▦' },
      { names: ['history'], hash: HASH.history, label: 'היסטוריה', icon: '☰' },
      { names: ['stats'], hash: HASH.stats, label: 'סטטיסטיקה', icon: '◔' },
      { names: ['settings'], hash: HASH.settings, label: 'הגדרות', icon: '⚙' },
    ];
  }
  const t: Tab[] = [
    { names: ['week'], hash: HASH.week(), label: 'שבוע', icon: '▦' },
    { names: ['history'], hash: HASH.history, label: 'היסטוריה', icon: '☰' },
    { names: ['chat'], hash: HASH.chat, label: 'עוזר', icon: '✦' },
    { names: ['profile', 'stats', 'settings'], hash: HASH.profile, label: 'פרופיל', icon: '◉' },
  ];
  if (isAdmin()) t.push({ names: ['admin', 'adminUser'], hash: HASH.admin, label: 'ניהול', icon: '★' });
  return t;
}

const main = h('main', { id: 'main', class: 'content' });
const nav = h('nav', { class: 'tabbar', 'aria-label': 'ניווט ראשי' });
const syncBadge = h('span', { class: 'sync-badge', 'aria-live': 'polite' });
let lastRoute = '';

function applyTheme() {
  const t = getSettings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function drawSyncBadge() {
  if (!hasBackend() || !currentUser()) return void (syncBadge.textContent = '');
  const { state } = getSyncState();
  const pending = dirtyCount();
  syncBadge.textContent =
    state === 'syncing' ? 'מסתנכרן…'
      : state === 'offline' ? `לא מחובר${pending ? ` · ${pending} ממתינים` : ''}`
      : state === 'error' ? 'שגיאת סנכרון'
      : pending ? `${pending} ממתינים לסנכרון` : '';
  syncBadge.dataset.state = state;
}

function render() {
  applyTheme();
  drawSyncBadge();
  const route = parseRoute(location.hash);

  if (hasBackend() && !currentUser()) {
    nav.hidden = true;
    if (!main.querySelector('.auth-card')) renderAuth(main);
    return;
  }
  if (hasBackend() && !currentUser()!.profile?.completed) {
    nav.hidden = true;
    if (!main.querySelector('form')) renderProfileForm(main, true);
    return;
  }
  // Keep in-progress forms (chat, profile edit) from being wiped by background updates.
  const key = location.hash;
  if (key === lastRoute && (route.name === 'chat' || (route.name === 'profile' && route.edit) || route.name === 'adminUser' || route.name === 'admin')) return;

  nav.hidden = false;
  nav.replaceChildren(
    ...tabs().map((t) =>
      h('a', { href: t.hash, class: 'tab', 'aria-current': t.names.includes(route.name) ? 'page' : undefined },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon), h('span', null, t.label)),
    ),
  );
  nav.style.gridTemplateColumns = `repeat(${nav.children.length}, 1fr)`;

  switch (route.name) {
    case 'week': renderWeek(main, route.sunday ?? sundayOf(todayISO())); break;
    case 'history': renderHistory(main); break;
    case 'stats': renderStats(main); break;
    case 'settings': renderSettings(main); break;
    case 'profile':
      if (!hasBackend()) renderSettings(main);
      else if (route.edit) renderProfileForm(main, false);
      else renderProfile(main);
      break;
    case 'admin': isAdmin() ? renderAdmin(main) : renderWeek(main, sundayOf(todayISO())); break;
    case 'adminUser': isAdmin() ? renderAdminUser(main, route.userId) : renderWeek(main, sundayOf(todayISO())); break;
    case 'chat':
      if (!hasBackend()) renderWeek(main, sundayOf(todayISO()));
      else renderChat(main, route.scope, route.userId);
      break;
  }
  if (key !== lastRoute) {
    window.scrollTo(0, 0);
    lastRoute = key;
  }
}

/** After login: decide what happens to data already on this device. */
async function adoptLocalData(): Promise<void> {
  const user = currentUser();
  if (!user) return;
  const owner = weeksOwner();
  if (owner === user.userId) return;
  const local = allWeeks().length;
  if (owner || !local) {
    // another user's data, or nothing local: start clean from the server
    setOwner(user.userId, false);
    await resetPullCursor(user.userId);
    return;
  }
  await new Promise<void>((resolve) => {
    const done = (keep: boolean) => {
      setOwner(user.userId, keep);
      close();
      resolve();
    };
    const body = h('div', { class: 'stack' },
      h('p', null, `במכשיר שמורים ${local} שבועות מלפני ההתחברות. להוסיף אותם לחשבון שלך?`),
      h('button', { class: 'btn btn-primary', onclick: () => done(true) }, `כן, העלה ${local} שבועות`),
      h('button', { class: 'btn', onclick: () => done(false) }, 'לא, התחל מהנתונים שבחשבון'),
    );
    const close = openSheet('נתונים במכשיר', body);
  });
  await resetPullCursor(user.userId);
}

async function onLogin() {
  await adoptLocalData();
  await syncNow();
}

async function boot() {
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';
  const app = document.getElementById('app')!;
  const demoBar = h('div', { class: 'demo-bar', hidden: true },
    h('span', null, 'אלה נתוני דוגמה. ייבוא קובץ Word בהגדרות יחליף אותם.'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => clearDemo() }, 'נקה'),
  );
  app.replaceChildren(
    h('header', { class: 'topbar' }, h('h1', null, 'משמעת אישית'), syncBadge),
    demoBar,
    main,
    nav,
  );
  await loadStore();
  await loadSession();
  if (IS_DEMO) {
    await seedDemoIfEmpty();
    const sync = () => (demoBar.hidden = !isDemoActive());
    sync();
    subscribe(sync);
  }
  render();
  subscribe(() => {
    render();
    if (dirtyCount()) scheduleSync();
  });
  onSync(drawSyncBadge);
  let wasLoggedIn = !!currentUser();
  onSession(() => {
    const now = !!currentUser();
    main.replaceChildren();
    lastRoute = '';
    if (now && !wasLoggedIn) onLogin();
    if (!now && wasLoggedIn) location.hash = '';
    wasLoggedIn = now;
    render();
  });
  window.addEventListener('hashchange', render);
  window.addEventListener('online', () => syncNow());
  let day = todayISO();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else {
      if (todayISO() !== day) { day = todayISO(); render(); }
      checkReminders();
      syncNow();
    }
  });
  window.addEventListener('pagehide', () => flush());
  if (!IS_DEMO && 'serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
  checkReminders();
  if (currentUser()) {
    refreshUser();
    onLogin();
  }
}

boot();
