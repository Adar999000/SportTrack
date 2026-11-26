import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { IS_DEMO } from './env';
import { clearDemo, isDemoActive, seedDemoIfEmpty } from './demo';
import { call, hasBackend } from './api';
import { sundayOf, todayISO } from './dates';
import { checkReminders } from './reminders';
import { currentUser, isAdmin, loadSession, onSession, refreshUser } from './session';
import { allWeeks, dirtyCount, flush, getSettings, loadStore, setDayCompleteHandler, setOwner, subscribe, weeksOwner } from './store';
import { getSyncState, onSync, resetPullCursor, scheduleSync, syncNow } from './sync';
import { renderAdmin, renderAdminUser } from './ui/adminView';
import { renderAuth } from './ui/authView';
import { renderChat } from './ui/chatView';
import { h, openSheet, toast } from './ui/dom';
import { icon, logo } from './ui/icons';
import { applyDocumentLang, isRTL, t, tr } from './i18n';
import { APP_VERSION } from './version';
import { updateSettings } from './store';
import { renderHistory } from './ui/historyView';
import { renderProfile, renderProfileForm } from './ui/profileView';
import { HASH, navigate, parseRoute, type Route } from './ui/router';
import { renderSettings } from './ui/settingsView';
import { renderStats } from './ui/statsView';
import { renderWeek } from './ui/weekView';
import { renderRewards } from './ui/rewardsView';
import { renderShare } from './ui/shareView';
import { renderTracker } from './ui/trackerView';
import { renderFeed } from './ui/feedView';
import { dirtyDocCount, loadDocs, setDocsOwner } from './docs';
import { initAnalytics, track } from './analytics';
import { renderLanding } from './ui/landingView';
import { initInstall } from './install';
import { applyA11y } from './a11y';
import { mountA11yWidget } from './ui/a11yWidget';
import { renderAccessibility, renderPrivacy } from './ui/legalPages';
import { mountFloatingChat } from './ui/floatingChat';
import { maybeStartTour } from './ui/tour';
import { getRewards, loadCachedRewards, onRewards, refreshRewards } from './rewards';
import { burst } from './ui/confetti';
import { refreshMascots } from './ui/mascot';
setDayCompleteHandler(() => burst());

interface Tab { names: Route['name'][]; hash: string; label: string; icon: string }

function tabs(): Tab[] {
  const today: Tab = { names: ['week', 'tracker'], hash: HASH.week(), label: t('היום'), icon: 'week' };
  const progress: Tab = { names: ['stats', 'history'], hash: HASH.stats, label: t('התקדמות'), icon: 'stats' };
  if (!hasBackend()) return [today, progress, { names: ['settings'], hash: HASH.settings, label: t('הגדרות'), icon: 'settings' }];
  return [today, progress, { names: ['profile', 'settings', 'chat', 'rewards', 'share', 'feed', 'admin', 'adminUser'], hash: HASH.profile, label: t('אני'), icon: 'profile' }];
}

const main = h('main', { id: 'main', class: 'content' });
/** A back link to the Me screen on pages opened from it. */
const crumb = h('div', { class: 'crumb', hidden: true });
const nav = h('nav', { class: 'tabbar', 'aria-label': t('ניווט ראשי') });
const syncBadge = h('span', { class: 'sync-badge', 'aria-live': 'polite' });
const coinChip = h('a', { class: 'coin-chip', href: HASH.rewards, hidden: true });
function drawCoinChip() {
  const r = getRewards();
  coinChip.hidden = !(hasBackend() && currentUser() && r);
  if (!r) return;
  coinChip.replaceChildren(h('span', { class: 'coin', 'aria-hidden': 'true' }), r.balance.toLocaleString('en-US'), h('span', { class: 'muted' }, ' · ' + t('רמה') + ' ' + r.level.n));
  coinChip.setAttribute('aria-label', t('{c} מטבעות, רמה {n}', { c: r.balance, n: r.level.n }));
}

function isDark(): boolean {
  const th = getSettings().theme;
  return th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}
const themeBtn = h('button', { 'data-track': 'theme:toggle',
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
let floating: { refresh: () => void } | null = null;

function applyTheme() {
  const { theme: th, accent } = getSettings();
  const root = document.documentElement;
  if (th === 'auto') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', th);
  if (!accent || accent === 'green') root.removeAttribute('data-accent');
  else root.setAttribute('data-accent', accent);
  const bg = getSettings().bgTheme;
  if (bg) root.setAttribute('data-bg', bg); else root.removeAttribute('data-bg');
  const brand = getComputedStyle(root).getPropertyValue('--brand').trim();
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => {
    if (!(m as HTMLMetaElement).media.includes('dark')) m.setAttribute('content', brand || '#2f6f5e');
  });
}

function drawSyncBadge() {
  if (!hasBackend() || !currentUser()) return void (syncBadge.textContent = '');
  const { state } = getSyncState();
  const pending = dirtyCount() + dirtyDocCount();
  syncBadge.textContent =
    state === 'syncing' ? t('מסתנכרן…')
      : state === 'offline' ? t('לא מחובר') + (pending ? ' · ' + tr`${pending} ממתינים` : '')
      : state === 'error' ? t('שגיאת סנכרון')
      : pending ? tr`${pending} ממתינים לסנכרון` : '';
  syncBadge.dataset.state = state;
}

function render() {
  queueMicrotask(() => { floating?.refresh(); maybeStartTour(); });
  applyTheme();
  refreshMascots();
  drawThemeBtn();
  drawSyncBadge();
  const route = parseRoute(location.hash);

  const key = location.hash;
  if (route.name === 'accessibility' || route.name === 'privacy') {
    nav.hidden = !currentUser();
    document.body.classList.remove('is-landing');
    if (key !== lastRoute) { route.name === 'accessibility' ? renderAccessibility(main) : renderPrivacy(main); window.scrollTo(0, 0); lastRoute = key; }
    return;
  }
  if (hasBackend() && !currentUser()) {
    nav.hidden = true;
    const landing = route.name !== 'join' && route.name !== 'login' && route.name !== 'signup';
    document.body.classList.toggle('is-landing', landing);
    if (route.name === 'join') { if (!main.querySelector('#reg-invite')) renderAuth(main, 'register', route.code); }
    else if (route.name === 'signup') { if (!main.querySelector('#reg-name')) renderAuth(main, 'register'); }
    else if (route.name === 'login') { if (!main.querySelector('#auth-email') || main.querySelector('#reg-name')) renderAuth(main, 'login'); }
    else if (!main.querySelector('.landing')) renderLanding(main, (to) => (location.hash = to === 'login' ? HASH.login : HASH.signup));
    if (key !== lastRoute) { window.scrollTo(0, 0); lastRoute = key; }
    return;
  }
  document.body.classList.remove('is-landing');
  if (route.name === 'join') { location.hash = HASH.share; return; }
  if (route.name === 'login' || route.name === 'signup') { location.hash = HASH.week(); return; }
  if (hasBackend() && !currentUser()!.profile?.completed) {
    nav.hidden = true;
    if (!main.querySelector('form')) renderProfileForm(main, true);
    return;
  }
  // Keep in-progress forms (chat, profile edit) from being wiped by background updates.
  if (key === lastRoute && (route.name === 'chat' || (route.name === 'profile' && route.edit) || route.name === 'adminUser' || route.name === 'admin' || route.name === 'rewards' || route.name === 'share' || route.name === 'feed')) return;

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

  const fromMe = hasBackend() && ['settings', 'rewards', 'share', 'feed', 'chat', 'admin'].includes(route.name) && !(route.name === 'chat' && route.scope !== 'me');
  crumb.hidden = !fromMe;
  if (fromMe) crumb.replaceChildren(h('a', { class: 'link-btn', href: HASH.profile }, (isRTL ? '→ ' : '← ') + t('אני')));
  switch (route.name) {
    case 'week': renderWeek(main, route.sunday ?? sundayOf(todayISO())); break;
    case 'history':
    case 'stats': {
      const a = h('div', { class: 'stack' }), b = h('div', { class: 'stack' });
      renderStats(a); renderHistory(b);
      main.replaceChildren(a, b);
      break;
    }
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
    case 'rewards': hasBackend() ? renderRewards(main) : renderWeek(main, sundayOf(todayISO())); break;
    case 'share': hasBackend() ? renderShare(main) : renderWeek(main, sundayOf(todayISO())); break;
    case 'tracker': renderTracker(main, route.id, route.sunday); break;
    case 'feed': hasBackend() ? renderFeed(main, route.tab ?? 'posts') : renderWeek(main, sundayOf(todayISO())); break;
    case 'duel':
      call('joinDuel', { code: route.code }).then(() => { toast(t('הצטרפת לאתגר! בהצלחה 💪')); track('duel:join-link'); }).catch((e) => toast(e.message)).finally(() => navigate(HASH.duels));
      break;
  }
  if (key !== lastRoute) {
    track('screen:' + route.name);
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
    setDocsOwner(user.userId, false);
    await resetPullCursor(user.userId);
    return;
  }
  await new Promise<void>((resolve) => {
    const done = (keep: boolean) => {
      setOwner(user.userId, keep);
      setDocsOwner(user.userId, keep);
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
  await loadCachedRewards();
  await adoptLocalData();
  await syncNow();
  refreshRewards();
}

async function boot() {
  applyDocumentLang();
  applyA11y();
  initInstall();
  const app = document.getElementById('app')!;
  const demoBar = h('div', { class: 'demo-bar', hidden: true },
    h('span', null, t('אלה נתוני דוגמה. ייבוא קובץ Word בהגדרות יחליף אותם.')),
    h('button', { class: 'link-btn', type: 'button', onclick: () => clearDemo() }, t('נקה')),
  );
  app.replaceChildren(
    h('a', { class: 'skip-link', href: '#main', onclick: (e: Event) => { e.preventDefault(); main.setAttribute('tabindex', '-1'); main.focus(); } }, t('דלג לתוכן הראשי')),
    h('header', { class: 'topbar' },
      h('h1', null, logo(26), h('span', null, t('משמעת אישית'))),
      h('div', { class: 'topbar-end' }, syncBadge, coinChip, themeBtn),
    ),
    demoBar,
    crumb,
    main,
    nav,
  );
  initAnalytics();
  await loadStore();
  await loadDocs();
  await loadSession();
  floating = mountFloatingChat();
  mountA11yWidget();
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
    if (dirtyCount() || dirtyDocCount()) scheduleSync();
  });
  onSync(() => {
    drawSyncBadge();
    if (getSyncState().state === 'idle' && currentUser()) refreshRewards();
  });
  onRewards(drawCoinChip);
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
