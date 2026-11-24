import './styles.css';
import { registerSW } from 'virtual:pwa-register';
import { sundayOf, todayISO } from './dates';
import { checkReminders } from './reminders';
import { flush, getSettings, loadStore, subscribe } from './store';
import { h } from './ui/dom';
import { renderHistory } from './ui/historyView';
import { parseRoute, type Route } from './ui/router';
import { renderSettings } from './ui/settingsView';
import { renderStats } from './ui/statsView';
import { renderWeek } from './ui/weekView';

const TABS: { name: Route['name']; hash: string; label: string; icon: string }[] = [
  { name: 'week', hash: '#/', label: 'שבוע', icon: '▦' },
  { name: 'history', hash: '#/history', label: 'היסטוריה', icon: '☰' },
  { name: 'stats', hash: '#/stats', label: 'סטטיסטיקה', icon: '◔' },
  { name: 'settings', hash: '#/settings', label: 'הגדרות', icon: '⚙' },
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
  app.replaceChildren(
    h('header', { class: 'topbar' }, h('h1', null, 'משמעת אישית')),
    main,
    nav,
  );
  await loadStore();
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
  if ('serviceWorker' in navigator && import.meta.env.PROD) registerSW({ immediate: true });
  checkReminders();
}

boot();
