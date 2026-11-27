/**
 * Unexpected errors in the app are sent to the admin (message, screen, version, browser), so bugs on
 * real phones get fixed. No personal data: emails are masked on the server, nothing typed is sent.
 */
import { API_URL } from './config';
import { APP_VERSION } from './version';
import { getToken } from './api';

const sent = new Set<string>();
let count = 0;

function report(message: string, stack = '') {
  if (!API_URL || count >= 5) return;
  const key = message.slice(0, 120);
  if (!message || sent.has(key)) return;
  // ignore noise we can't act on
  if (/ResizeObserver loop|Script error\.?$|Load failed|NetworkError|Failed to fetch|AbortError|chrome-extension|moz-extension/i.test(message + stack)) return;
  sent.add(key); count++;
  const body = JSON.stringify({ action: 'clientError', token: getToken() ?? undefined, message, stack: stack.slice(0, 900), version: APP_VERSION,
    screen: location.hash.replace(/-[\w-]{6,}$/, '').slice(0, 40) || '#', agent: navigator.userAgent.slice(0, 160) });
  try { fetch(API_URL, { method: 'POST', body, keepalive: true }).catch(() => {}); } catch { /* ignore */ }
}

export function initErrorReporting(): void {
  addEventListener('error', (e) => report(String(e.message || e.error?.message || ''), String(e.error?.stack || `${e.filename}:${e.lineno}`)));
  addEventListener('unhandledrejection', (e) => {
    const r: any = e.reason;
    if (r?.name === 'AuthError') return;
    report(String(r?.message || r || 'unhandled rejection'), String(r?.stack || ''));
  });
}
