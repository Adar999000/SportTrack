export type Route =
  | { name: 'week'; sunday?: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' };

/** Hashes are plain names: #week-2026-11-22, #history, #stats, #prefs (older "#/..." links still work). */
export const HASH = {
  week: (sunday?: string) => (sunday ? `#week-${sunday}` : '#week'),
  history: '#history',
  stats: '#stats',
  settings: '#prefs',
};

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'history') return { name: 'history' };
  if (h === 'stats') return { name: 'stats' };
  if (h === 'prefs' || h === 'settings') return { name: 'settings' };
  const m = /^week[-/](\d{4}-\d{2}-\d{2})$/.exec(h);
  return { name: 'week', sunday: m ? m[1] : undefined };
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
