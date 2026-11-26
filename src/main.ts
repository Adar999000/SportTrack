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
import { h, openSheet, toast } from './ui/dom';
import { icon, logo } from './ui/icons';
import { applyDocumentLang, t, tr } from './i18n';
import { APP_VERSION } from './version';
import { updateSettings } from './store';
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
      { names: ['week'], hash: HASH.week(), label: t('שבוע'), icon: 'week' },
      { names: ['history'], hash: HASH.history, label: t('היסטוריה'), icon: 'history' },
      { names: ['stats'], hash: HASH.stats, label: t('סטטיסטיקה'), icon: 'stats' },
      { names: ['settings'], hash: HASH.settings, label: t('הגדרות'), icon: 'settings' },
    ];
  }
  const list: Tab[] = [
    { names: ['week'], hash: HASH.week(), label: t('שבוע'), icon: 'week' },
    { names: ['history'], hash: HASH.history, label: t('היסטוריה'), icon: 'history' },
    { names: ['chat'], hash: HASH.chat, label: t('עוזר'), icon: 'chat' },
    { names: ['profile', 'stats', 'settings'], hash: HASH.profile, label: t('פרופיל'), icon: 'profile' },
  ];
  if (isAdmin()) list.push({ names: ['admin', 'adminUser'], hash: HASH.admin, label: t('ניהול'), icon: 'admin' });
  return list;
}

const main = h('main', { id: 'main', class: 'content' });
const nav = h('nav', { class: 'tabbar', 'aria-label': t('ניווט ראשי') });
const syncBadge = h('span', { class: 'sync-badge', 'aria-live': 'polite' });

function isDark(): boolean {
  const th = getSettings().theme;
  return th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}
const themeBtn = h('button', {
  class: 'icon-btn theme-btn', type: 'button',
  onclick: () => updateSettings({ theme: isDark() ? 'light' : 'dark' }),
});
function drawThemeBtn() {
  const dark = isDark();
  themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 20));
  themeBtn.setAttribute('aria-label', dark ? t('מעבר למצב בהיר') : t('מעבר למצב כהה'));
  themeBtn.title = themeBtn.getAttribute('aria-label')!;
}
let lastRoute = '';

function applyTheme() {
  const { theme: th, accent } = getSettings();
  const root = document.documentElement;
  if (th === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', th);
  if (!accent || accent === 'green') root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  const brand = getComputedStyle(root).getPropertyValue('--brand').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!(m as HTMLMetaElement).media.includes('dark')) m.setAttribute('content', brand || '#2f6f5e');
  });
}

function drawSyncBadge() {
  if (!hasBackend() || !currentUser()) return void (syncBadge.textContent = '');
  const { state } = getSyncState();
  const pending = dirtyCount();
  syncBadge.textContent =
    state === 'syncing' ? t('מסתנכרן…')
      : state === 'offline' ? t('לא מחובר') + (pending ? ' · ' + tr`${pending} ממתינים` : '')
      : state === 'error' ? t('שגיאת סנכרון')
      : pending ? tr`${pending} ממתינים לסנכרון` : '';
  syncBadge.dataset.state = state;
}

function render() {
  applyTheme();
  drawThemeBtn();
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
    h('div', { class: 'nav-brand' }, logo(34), h('span', null, t('משמעת אישית'))),
    ...tabs().map((tab) =>
      h('a', { href: tab.hash, class: 'tab', 'aria-current': tab.names.includes(route.name) ? 'page' : undefined },
        h('span', { class: 'tab-icon' }, icon(tab.icon)), h('span', null, t(tab.label))),
    ),
    h('div', { class: 'nav-version' }, `v${APP_VERSION}`),
  );
  nav.style.setProperty('--tabs', String(tabs().length));

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
      h('p', null, tr`במכשיר שמורים ${local} שבועות מלפני ההתחברות. להוסיף אותם לחשבון שלך?`),
      h('button', { class: 'btn btn-primary', onclick: () => done(true) }, tr`כן, העלה ${local} שבועות`),
      h('button', { class: 'btn', onclick: () => done(false) }, t('לא, התחל מהנתונים שבחשבון')),
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
  applyDocumentLang();
  const app = document.getElementById('app')!;
  const demoBar = h('div', { class: 'demo-bar', hidden: true },
    h('span', null, t('אלה נתוני דוגמה. ייבוא קובץ Word בהגדרות יחליף אותם.')),
    h('button', { class: 'link-btn', type: 'button', onclick: () => clearDemo() }, t('נקה')),
  );
  app.replaceChildren(
    h('header', { class: 'topbar' },
      h('h1', null, logo(26), h('span', null, t('משמעת אישית'))),
      h('div', { class: 'topbar-end' }, syncBadge, themeBtn),
    ),
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
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change', drawThemeBtn);
  try {
    const seen = localStorage.getItem('mishmaat-version');
    if (seen && seen !== APP_VERSION) setTimeout(() => toast(t('עודכן לגרסה {v}. מה חדש: הגדרות ← גרסה', { v: APP_VERSION })), 800);
    localStorage.setItem('mishmaat-version', APP_VERSION);
  } catch { /* ignore */ }
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
