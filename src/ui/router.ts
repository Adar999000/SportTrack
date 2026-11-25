export type Route =
  | { name: 'week'; sunday?: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'profile'; edit?: boolean }
  | { name: 'admin' }
  | { name: 'adminUser'; userId: string }
  | { name: 'chat'; scope: 'me' | 'all' | 'user'; userId?: string };

/** Hashes are plain names: #week-2026-11-22, #history, #stats, #prefs, #profile, #admin, #chat … */
export const HASH = {
  week: (sunday?: string) => (sunday ? `#week-${sunday}` : '#week'),
  history: '#history',
  stats: '#stats',
  settings: '#prefs',
  profile: '#profile',
  profileEdit: '#profile-edit',
  admin: '#admin',
  adminUser: (id: string) => `#member-${id}`,
  chat: '#chat',
  chatAll: '#chat-all',
  chatUser: (id: string) => `#chat-member-${id}`,
};

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'history') return { name: 'history' };
  if (h === 'stats') return { name: 'stats' };
  if (h === 'prefs' || h === 'settings') return { name: 'settings' };
  if (h === 'profile') return { name: 'profile' };
  if (h === 'profile-edit') return { name: 'profile', edit: true };
  if (h === 'admin') return { name: 'admin' };
  if (h === 'chat') return { name: 'chat', scope: 'me' };
  if (h === 'chat-all') return { name: 'chat', scope: 'all' };
  let m = /^chat-member-([\w-]+)$/.exec(h);
  if (m) return { name: 'chat', scope: 'user', userId: m[1] };
  m = /^member-([\w-]+)$/.exec(h);
  if (m) return { name: 'adminUser', userId: m[1] };
  m = /^week[-/](\d{4}-\d{2}-\d{2})$/.exec(h);
  return { name: 'week', sunday: m ? m[1] : undefined };
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
