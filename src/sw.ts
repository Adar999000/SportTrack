/// <reference lib="webworker" />
import { cleanupOutdatedCaches, precacheAndRoute, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { KEYS, kvGet, kvSet } from './db';
import { todayISO } from './dates';
import { dueReminders, type ReminderLog } from './reminders-core';
import { DEFAULT_SETTINGS, type Settings, type Week } from './types';

declare const self: ServiceWorkerGlobalScope;

cleanupOutdatedCaches();
precacheAndRoute(self.__WB_MANIFEST);
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});

async function backgroundCheck() {
  const settings = { ...DEFAULT_SETTINGS, ...((await kvGet<Partial<Settings>>(KEYS.settings)) ?? {}) };
  const weeks = (await kvGet<Record<string, Week>>(KEYS.weeks)) ?? {};
  const log = (await kvGet<ReminderLog>(KEYS.reminderLog)) ?? {};
  const today = todayISO();
  const due = dueReminders(new Date(), today, settings, weeks, log);
  for (const r of due) {
    await self.registration.showNotification(r.title, { body: r.body, tag: r.kind, icon: 'icons/icon-192.png', lang: 'he', dir: 'rtl' });
    log[r.kind] = today;
  }
  if (due.length) await kvSet(KEYS.reminderLog, log);
}

self.addEventListener('periodicsync', (e: any) => {
  if (e.tag === 'reminders') e.waitUntil(backgroundCheck());
});

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  e.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) if ('focus' in c) return (c as WindowClient).focus();
      return self.clients.openWindow('./');
    }),
  );
});
