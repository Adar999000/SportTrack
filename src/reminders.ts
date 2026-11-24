import { flush, getSettings, getWeek } from './store';
import { KEYS, kvGet, kvSet } from './db';
import { todayISO, sundayOf } from './dates';
import { dueReminders, type ReminderLog } from './reminders-core';

export function notificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export async function requestPermission(): Promise<NotificationPermission> {
  if (!notificationsSupported()) return 'denied';
  if (Notification.permission === 'default') return Notification.requestPermission();
  return Notification.permission;
}

let timer: ReturnType<typeof setTimeout> | undefined;

/** Check now, then again every minute while the app is open. */
export async function checkReminders(): Promise<void> {
  clearTimeout(timer);
  timer = setTimeout(checkReminders, 60_000);
  if (!notificationsSupported() || Notification.permission !== 'granted') return;
  const settings = getSettings();
  if (!settings.dailyReminder && !settings.weeklyWeightReminder) return;
  const today = todayISO();
  const sunday = sundayOf(today);
  const log = (await kvGet<ReminderLog>(KEYS.reminderLog).catch(() => undefined)) ?? {};
  const due = dueReminders(new Date(), today, settings, { [sunday]: getWeek(sunday) }, log);
  if (!due.length) return;
  const reg = await navigator.serviceWorker.ready;
  for (const r of due) {
    await reg.showNotification(r.title, { body: r.body, tag: r.kind, icon: 'icons/icon-192.png', lang: 'he', dir: 'rtl' });
    log[r.kind] = today;
  }
  await kvSet(KEYS.reminderLog, log).catch(() => {});
}

/**
 * Ask the browser to wake the service worker periodically (Chromium, installed
 * PWA only) so reminders can fire while the app is closed.
 */
export async function registerBackgroundCheck(): Promise<void> {
  await flush();
  try {
    const reg: any = await navigator.serviceWorker.ready;
    if (!reg.periodicSync) return;
    const status = await (navigator.permissions as any).query({ name: 'periodic-background-sync' });
    if (status.state !== 'granted') return;
    const s = getSettings();
    if (s.dailyReminder || s.weeklyWeightReminder) {
      await reg.periodicSync.register('reminders', { minInterval: 60 * 60 * 1000 });
    } else {
      await reg.periodicSync.unregister('reminders');
    }
  } catch {
    /* not supported — in-app checks still work */
  }
}
