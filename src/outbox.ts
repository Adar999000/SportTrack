/**
 * Posts and stories written without a connection wait here (IndexedDB) and are sent
 * as soon as the device is back online, or the next time the app opens.
 */
import { call, NetworkError } from './api';
import { kvGet, kvSet } from './db';
import { t, tr } from './i18n';
import { toast } from './ui/dom';

interface Item { id: string; payload: Record<string, unknown>; at: number }
const KEY = 'outbox-posts';
let flushing = false;
const listeners = new Set<() => void>();
export const onOutboxSent = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

async function load(): Promise<Item[]> { return (await kvGet<Item[]>(KEY)) ?? []; }

/** Send now, or keep it for later if there's no connection. Returns 'sent' or 'queued'. */
export async function postOrQueue(payload: Record<string, unknown>): Promise<'sent' | 'queued'> {
  try { await call('createPost', payload); return 'sent'; } catch (e) {
    if (!(e instanceof NetworkError)) throw e;
    const list = await load();
    if (list.length >= 20) throw new Error(t('יש כבר 20 פוסטים שממתינים לשליחה. נסו שוב כשיחזור החיבור.'));
    list.push({ id: Math.random().toString(36).slice(2), payload, at: Date.now() });
    await kvSet(KEY, list);
    return 'queued';
  }
}

export async function pendingCount(): Promise<number> { return (await load()).length; }

export async function flushOutbox(): Promise<void> {
  if (flushing || !navigator.onLine) return;
  flushing = true;
  try {
    let list = await load();
    let sent = 0;
    for (const item of [...list]) {
      try { await call('createPost', item.payload); sent++; }
      catch (e) { if (e instanceof NetworkError) break; } // a server-side refusal drops the item (e.g. daily limit)
      list = list.filter((x) => x.id !== item.id);
      await kvSet(KEY, list);
    }
    if (sent) { toast(sent === 1 ? t('הפוסט שחיכה נשלח ✓') : tr`${sent} פוסטים שחיכו נשלחו ✓`); listeners.forEach((fn) => fn()); }
  } finally { flushing = false; }
}

export function initOutbox(): void {
  addEventListener('online', () => { void flushOutbox(); });
  setTimeout(() => void flushOutbox(), 4000);
}
