import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { IS_DEMO } from './env';
import { clearDemo, isDemoActive, seedDemoIfEmpty } from './demo';
import { call, hasBackend } from './api';
import { sundayOf, todayISO } from './dates';
import { checkReminders } from './reminders';
import { currentUser, isAdmin, loadSession, onSession, refreshUser } from './session';
import { allWeeks, dirtyCount, flush, getSettings, loadStore, setDayCompleteHandler, setLockedHandler, setOwner, subscribe, weeksOwner } from './store';
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
import { avatar } from './ui/avatar';
import { renderTracker } from './ui/trackerView';
import { renderWorkout, workoutsCard } from './ui/workoutView';
import { progressBento } from './ui/bento';
import { renderFeed } from './ui/feedView';
import { dirtyDocCount, loadDocs, setDocsOwner } from './docs';
import { initAnalytics, track } from './analytics';
import { markNudgesRead } from './nudges';
import { initPeeks } from './ui/peek';
import { renderLanding } from './ui/landingView';
import { initInstall } from './install';
import { applyA11y } from './a11y';
import { mountA11yWidget } from './ui/a11yWidget';
import { renderAccessibility, renderPrivacy } from './ui/legalPages';
import { mountFloatingChat } from './ui/floatingChat';
import { maybeStartTour } from './ui/tour';
import { BADGES, getRewards, levelLabel, loadCachedRewards, onRewards, owns, refreshRewards } from './rewards';
import { celebrate } from './ui/celebrate';
import { refreshMascots } from './ui/mascot';
import { renderMusic } from './ui/musicView';
import { renderGoals } from './ui/goalsView';
import { handleSpotifyRedirect } from './music';
setLockedHandler((whole) => toast(whole ? t('השבוע נעול. אפשר לשחרר אותו מתחת לטבלה.') : t('היום נעול. לחיצה על היום בטבלה פותחת אותו לשחרור.')));
setDayCompleteHandler(() => {
  const today = todayISO();
  const w = allWeeks().find((x) => x.sundayDate === sundayOf(today));
  if (new Date().getDay() === 6 && w) {
    const full = w.days.filter((d) => (d.breakfast || d.text?.breakfast) && (d.lunch || d.text?.lunch) && (d.dinner || d.text?.dinner) && d.sport.status).length;
    const wo = w.days.filter((d) => d.sport.status === 'V' && d.sport.countsAsWorkout).length;
    celebrate('week', t('השבוע נסגר'), tr`${full} ימים מלאים · ${wo} אימונים`);
  } else celebrate('day', t('היום סגור'), t('כל המשימות של היום סומנו'));
});

interface Tab { names: Route['name'][]; hash: string; label: string; icon: string }

function tabs(): Tab[] {
  const today: Tab = { names: ['week', 'tracker'], hash: HASH.week(), label: t('היום'), icon: 'week' };
  const progress: Tab = { names: ['stats', 'history', 'workout'], hash: HASH.stats, label: t('התקדמות'), icon: 'stats' };
  if (!hasBackend()) return [today, progress, { names: ['settings'], hash: HASH.settings, label: t('הגדרות'), icon: 'settings' }];
  return [today, progress, { names: ['profile', 'settings', 'chat', 'rewards', 'share', 'feed', 'admin', 'adminUser'], hash: HASH.profile, label: t('אני'), icon: 'profile' }];
}

const main = h('main', { id: 'main', class: 'content' });
/** Top-left mark: the user's profile picture once signed in (opens the Me screen), else the app logo. */
const brandMark = h('span', { class: 'brand-mark' });
let brandKey = '';
function drawBrand() {
  const u = currentUser();
  const frame = getRewards()?.frame ?? '';
  const key = u ? `${u.userId}|${u.photoId ?? ''}|${u.name}|${frame}` : 'logo';
  if (key === brandKey) return;
  brandKey = key;
  brandMark.replaceChildren(u && hasBackend()
    ? h('a', { href: HASH.profile, class: 'brand-avatar', 'aria-label': tr`הפרופיל של ${u.name}` }, avatar(u.name, u.photoId, 36, frame))
    : '');
}
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
  const skin = getSettings().skin;
  if (skin && owns('skin:' + skin)) root.setAttribute('data-skin', skin); else root.removeAttribute('data-skin');
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
  drawBrand();
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
  if (key === lastRoute && (route.name === 'chat' || (route.name === 'profile' && route.edit) || route.name === 'adminUser' || route.name === 'admin' || route.name === 'rewards' || route.name === 'share' || route.name === 'feed' || route.name === 'workout' || route.name === 'music' || route.name === 'goals')) return;

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

  const fromMe = hasBackend() && ['settings', 'rewards', 'share', 'feed', 'chat', 'admin', 'music', 'goals'].includes(route.name) && !(route.name === 'chat' && route.scope !== 'me');
  crumb.hidden = !fromMe;
  if (fromMe) crumb.replaceChildren(h('a', { class: 'link-btn', href: HASH.profile }, (isRTL ? '→ ' : '← ') + t('אני')));
  switch (route.name) {
    case 'week': renderWeek(main, route.sunday ?? sundayOf(todayISO())); break;
    case 'history':
    case 'stats': {
      const a = h('div', { class: 'stack' }), b = h('div', { class: 'stack' });
      renderStats(a); renderHistory(b);
      main.replaceChildren(progressBento(), workoutsCard(), a, b);
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
      else { renderChat(main, route.scope, route.userId); if (route.scope === 'me') markNudgesRead(); }
      break;
    case 'rewards': hasBackend() ? renderRewards(main) : renderWeek(main, sundayOf(todayISO())); break;
    case 'share': hasBackend() ? renderShare(main) : renderWeek(main, sundayOf(todayISO())); break;
    case 'tracker': renderTracker(main, route.id, route.sunday); break;
    case 'workout': renderWorkout(main, route.id); break;
    case 'music': renderMusic(main); break;
    case 'goals': renderGoals(main); break;
    case 'feed': hasBackend() ? renderFeed(main, route.tab ?? 'posts') : renderWeek(main, sundayOf(todayISO())); break;
    case 'duel':
      call('joinDuel', { code: route.code }).then(() => { toast(t('הצטרפת לאתגר! בהצלחה 💪')); track('duel:join-link'); }).catch((e) => toast(e.message)).finally(() => navigate(HASH.duels));
      break;
  }
  if (key !== lastRoute) {
    track('screen:' + route.name);
    window.scrollTo(0, 0);
    const ti = tabIndex(route.name);
    if (lastRoute) pageTransition(lastTab >= 0 && ti >= 0 && ti !== lastTab ? (ti > lastTab ? 1 : -1) : 0);
    lastTab = ti;
    lastRoute = key;
  }
}

let lastTab = -1;

/** Level up or a new badge since the last time we looked: celebrate it once. */
function checkMilestones() {
  const r = getRewards();
  const u = currentUser();
  if (!r || !u) return;
  const key = 'milestones:' + u.userId;
  let prev: { level: number; badges: Record<string, number> } | null = null;
  try { prev = JSON.parse(localStorage.getItem(key) || 'null'); } catch { /* ignore */ }
  try { localStorage.setItem(key, JSON.stringify({ level: r.level.n, badges: r.badges })); } catch { /* ignore */ }
  if (!prev) return; // first look: just remember
  if (r.level.n > prev.level) { celebrate('level', tr`עלית לרמה ${r.level.n}`, levelLabel(r.level.name), { num: r.level.n }); return; }
  const id = Object.keys(r.badges).find((b) => (r.badges[b] ?? 0) > (prev!.badges[b] ?? 0));
  if (id && BADGES[id]) celebrate('badge', t('תג חדש'), t(BADGES[id].name), { icon: BADGES[id].icon });
}
const tabIndex = (name: Route['name']) => tabs().findIndex((tb) => tb.names.includes(name));
const reducedMotion = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');

/** Slide between tabs (in the direction of the tab bar), fade for other page changes. */
function pageTransition(dir: number) {
  if (reducedMotion() || !main.animate) return;
  const x = swipeEnter ? -swipeEnter * innerWidth * 0.5 * -1 : dir * (isRTL ? -28 : 28);
  swipeEnter = 0;
  main.animate([{ opacity: 0, transform: `translateX(${x}px)` }, { opacity: 1, transform: 'none' }], { duration: dir ? 260 : 180, easing: 'cubic-bezier(.2,.8,.2,1)' });
  // cards rise in one after another
  main.classList.remove('stagger'); void main.offsetWidth; main.classList.add('stagger');
  setTimeout(() => main.classList.remove('stagger'), 900);
}

/** Phones: drag the page sideways (outside tables/scrollers) to move between tabs; it follows the finger. */
let swipeEnter = 0;
function initSwipeTabs() {
  let sx = 0, sy = 0, st = 0, ok = false, dragging = false, dx = 0;
  const SKIP = '.week-card, .table-wrap, .table-scroll, .shop-tabs, .tracker-bar, .chart-box, .wo-map, .seg, .chips, input, textarea, select, .sheet, .fab-panel, .tour-tip';
  const target = () => {
    const list = tabs();
    const cur = tabIndex(parseRoute(location.hash).name);
    if (cur < 0) return null;
    // the tab bar runs right-to-left in Hebrew: dragging toward the right reveals the next tab
    const next = cur + ((dx > 0) === isRTL ? 1 : -1);
    return next >= 0 && next < list.length ? list[next] : null;
  };
  main.addEventListener('touchstart', (e) => {
    const t0 = e.touches[0];
    ok = e.touches.length === 1 && !nav.hidden && !(e.target as HTMLElement).closest(SKIP);
    sx = t0.clientX; sy = t0.clientY; st = Date.now(); dragging = false; dx = 0;
  }, { passive: true });
  main.addEventListener('touchmove', (e) => {
    if (!ok) return;
    const t1 = e.touches[0];
    dx = t1.clientX - sx;
    const dy = t1.clientY - sy;
    if (!dragging) {
      if (Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)) { ok = false; return; } // vertical scroll
      if (Math.abs(dx) < 12) return;
      dragging = true;
      main.style.transition = 'none';
    }
    if (reducedMotion()) return;
    const resist = target() ? 1 : 0.25; // no tab that way: a little rubber band
    main.style.transform = `translateX(${dx * resist}px)`;
    main.style.opacity = String(1 - Math.min(0.35, Math.abs(dx) / innerWidth * 0.6));
  }, { passive: true });
  main.addEventListener('touchend', () => {
    if (!ok || !dragging) return;
    const fast = Math.abs(dx) > 50 && Date.now() - st < 300;
    const go = (Math.abs(dx) > innerWidth * 0.28 || fast) ? target() : null;
    main.style.transition = 'transform .2s cubic-bezier(.2,.8,.2,1), opacity .2s';
    if (go && !reducedMotion()) {
      main.style.transform = `translateX(${Math.sign(dx) * innerWidth}px)`;
      main.style.opacity = '0';
      navigator.vibrate?.(8);
      setTimeout(() => {
        main.style.transition = 'none'; main.style.transform = ''; main.style.opacity = '';
        swipeEnter = -Math.sign(dx);
        navigate(go.hash);
      }, 190);
    } else {
      main.style.transform = ''; main.style.opacity = '';
      if (go) navigate(go.hash);
      setTimeout(() => { main.style.transition = ''; }, 220);
    }
  }, { passive: true });
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
      h('div', { class: 'topbar-end' }, syncBadge, h('div', { class: 'me-chip' }, brandMark, coinChip), themeBtn),
    ),
    demoBar,
    crumb,
    main,
    nav,
  );
  initAnalytics();
  initSwipeTabs();
  initPeeks();
  addEventListener('scroll', () => document.body.classList.toggle('scrolled', scrollY > 4), { passive: true });
  await loadStore();
  await loadDocs();
  await loadSession();
  floating = mountFloatingChat();
  mountA11yWidget();
  handleSpotifyRedirect().then((done) => { if (done) { toast(t('Spotify מחובר 🎵')); render(); } }).catch((e) => toast(e.message));
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
  onRewards(() => { drawCoinChip(); drawBrand(); checkMilestones(); applyTheme(); });
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
