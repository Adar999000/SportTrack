export type Route =
  | { name: 'week'; sunday?: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' };

export function parseRoute(hash: string): Route {
  const parts = hash.replace(/^#\/?/, '').split('/');
  switch (parts[0]) {
    case 'history': return { name: 'history' };
    case 'stats': return { name: 'stats' };
    case 'settings': return { name: 'settings' };
    case 'week':
      return { name: 'week', sunday: /^\d{4}-\d{2}-\d{2}$/.test(parts[1] ?? '') ? parts[1] : undefined };
    default: return { name: 'week' };
  }
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
