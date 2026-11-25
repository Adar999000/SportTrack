import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { IS_DEMO } from './env';
import { clearDemo, isDemoActive, seedDemoIfEmpty } from './demo';
import { sundayOf, todayISO } from './dates';
import { checkReminders } from './reminders';
import { flush, getSettings, loadStore, subscribe } from './store';
import { h } from './ui/dom';
import { renderHistory } from './ui/historyView';
import { HASH, parseRoute, type Route } from './ui/router';
import { renderSettings } from './ui/settingsView';
import { renderStats } from './ui/statsView';
import { renderWeek } from './ui/weekView';

const TABS: { name: Route['name']; hash: string; label: string; icon: string }[] = [
  { name: 'week', hash: HASH.week(), label: 'שבוע', icon: '▦' },
  { name: 'history', hash: HASH.history, label: 'היסטוריה', icon: '☰' },
  { name: 'stats', hash: HASH.stats, label: 'סטטיסטיקה', icon: '◔' },
  { name: 'settings', hash: HASH.settings, label: 'הגדרות', icon: '⚙' },
];

const main = h('main', { id: 'main', class: 'content' });
const nav = h('nav', { class: 'tabbar', 'aria-label': 'ניווט ראשי' });
let lastRoute = '';

function applyTheme() {
  const t = getSettings().theme;
  if (t === 'auto') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', t);
}

function render() {
  applyTheme();
  const route = parseRoute(location.hash);
  const key = location.hash;
  nav.replaceChildren(
    ...TABS.map((t) =>
      h('a', { href: t.hash, class: 'tab', 'aria-current': t.name === route.name ? 'page' : undefined },
        h('span', { class: 'tab-icon', 'aria-hidden': 'true' }, t.icon), h('span', null, t.label)),
    ),
  );
  switch (route.name) {
    case 'week': renderWeek(main, route.sunday ?? sundayOf(todayISO())); break;
    case 'history': renderHistory(main); break;
    case 'stats': renderStats(main); break;
    case 'settings': renderSettings(main); break;
  }
  if (key !== lastRoute) {
    window.scrollTo(0, 0);
    lastRoute = key;
  }
}

async function boot() {
  const app = document.getElementById('app')!;
  document.documentElement.lang = 'he';
  document.documentElement.dir = 'rtl';
  const demoBar = h('div', { class: 'demo-bar', hidden: true },
    h('span', null, 'אלה נתוני דוגמה. ייבוא קובץ Word בהגדרות יחליף אותם.'),
    h('button', { class: 'link-btn', type: 'button', onclick: () => clearDemo() }, 'נקה'),
  );
  app.replaceChildren(
    h('header', { class: 'topbar' }, h('h1', null, 'משמעת אישית')),
    demoBar,
    main,
    nav,
  );
  await loadStore();
  if (IS_DEMO) {
    await seedDemoIfEmpty();
    const sync = () => (demoBar.hidden = !isDemoActive());
    sync();
    subscribe(sync);
  }
  render();
  subscribe(render);
  window.addEventListener('hashchange', render);
  // Day may roll over while the app stays open.
  let day = todayISO();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
    else {
      if (todayISO() !== day) { day = todayISO(); render(); }
      checkReminders();
    }
  });
  window.addEventListener('pagehide', () => flush());
  if (!IS_DEMO && 'serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
  checkReminders();
}

boot();
