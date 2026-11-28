/**
 * Anonymous-ish usage counts for the admin dashboard: which screens and features are used.
 * Only event names and counts are sent (batched); never content or personal data.
 */
import { call, hasBackend } from './api';
import { currentUser } from './session';

let pending: Record<string, number> = {};
let timer: ReturnType<typeof setTimeout> | undefined;
let disabled = false;

export function track(name: string, n = 1): void {
  if (disabled || !hasBackend() || !currentUser()) return;
  const key = name.toLowerCase().replace(/[^a-z0-9:_-]/g, '').slice(0, 40);
  if (!key) return;
  pending[key] = (pending[key] ?? 0) + n;
  clearTimeout(timer);
  timer = setTimeout(flushAnalytics, 30_000);
}

export async function flushAnalytics(): Promise<void> {
  clearTimeout(timer);
  if (!Object.keys(pending).length || !currentUser()) return;
  const events = pending;
  pending = {};
  try { await call('track', { events }); }
  catch (e: any) {
    if (/לא מוכרת|Unknown action/.test(e.message)) disabled = true; // server not updated yet
    else for (const [k, v] of Object.entries(events)) pending[k] = (pending[k] ?? 0) + v;
  }
}

/** Tracks clicks on anything marked with data-track="name". */
export function initAnalytics(): void {
  document.addEventListener('click', (e) => {
    const el = (e.target as HTMLElement).closest<HTMLElement>('[data-track]');
    if (el) track(el.dataset.track!);
  }, true);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushAnalytics(); });
}

const LANDING_EVENTS = ['landing:view', 'landing:cta', 'landing:signup-open'] as const;
export type LandingEvent = (typeof LANDING_EVENTS)[number];
const sentLanding = new Set<string>();

/**
 * Anonymous landing counter (signed-out visitors): only the event name is sent, at most once per
 * browser session. No token, no user id, no cookie. Failures are ignored.
 */
export function trackLanding(event: LandingEvent): void {
  if (!hasBackend() || !LANDING_EVENTS.includes(event)) return;
  const key = 'mishmaat.landing.' + event;
  try {
    if (sessionStorage.getItem(key)) return;
    sessionStorage.setItem(key, '1');
  } catch {
    if (sentLanding.has(key)) return; // no sessionStorage: once per page load
  }
  sentLanding.add(key);
  call('landing', { event }).catch(() => {});
}
