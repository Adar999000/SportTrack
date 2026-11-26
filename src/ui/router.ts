export type Route =
  | { name: 'week'; sunday?: string }
  | { name: 'history' }
  | { name: 'stats' }
  | { name: 'settings' }
  | { name: 'profile'; edit?: boolean }
  | { name: 'admin' }
  | { name: 'adminUser'; userId: string }
  | { name: 'chat'; scope: 'me' | 'all' | 'user'; userId?: string }
  | { name: 'rewards' }
  | { name: 'share' }
  | { name: 'join'; code: string }
  | { name: 'login' }
  | { name: 'signup' }
  | { name: 'accessibility' }
  | { name: 'privacy' }
  | { name: 'tracker'; id: string; sunday?: string }
  | { name: 'feed'; tab?: 'posts' | 'events' | 'duels' }
  | { name: 'duel'; code: string }
  | { name: 'workout'; id?: string }
  | { name: 'music' }
  | { name: 'goals' };

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
  rewards: '#rewards',
  login: '#login',
  signup: '#signup',
  share: '#share',
  tracker: (id: string, sunday?: string) => (sunday ? `#tracker-${id}-${sunday}` : `#tracker-${id}`),
  feed: '#feed',
  events: '#events',
  duels: '#duels',
  workout: (id?: string) => (id ? `#workout-${id}` : '#workout'),
  duel: (code: string) => `#duel-${code}`,
  music: '#music',
  goals: '#goals',
};

export function parseRoute(hash: string): Route {
  const h = hash.replace(/^#\/?/, '');
  if (h === 'history') return { name: 'history' };
  if (h === 'stats') return { name: 'stats' };
  if (h === 'prefs' || h === 'settings') return { name: 'settings' };
  if (h === 'profile') return { name: 'profile' };
  if (h === 'profile-edit') return { name: 'profile', edit: true };
  if (h === 'admin') return { name: 'admin' };
  if (h === 'rewards') return { name: 'rewards' };
  if (h === 'login') return { name: 'login' };
  if (h === 'accessibility') return { name: 'accessibility' };
  if (h === 'privacy') return { name: 'privacy' };
  if (h === 'signup') return { name: 'signup' };
  if (h === 'share') return { name: 'share' };
  if (h === 'music') return { name: 'music' };
  if (h === 'goals') return { name: 'goals' };
  const j = /^join-([A-Za-z0-9]{4,12})$/.exec(h);
  if (j) return { name: 'join', code: j[1].toUpperCase() };
  if (h === 'chat') return { name: 'chat', scope: 'me' };
  if (h === 'chat-all') return { name: 'chat', scope: 'all' };
  let m = /^chat-member-([\w-]+)$/.exec(h);
  if (m) return { name: 'chat', scope: 'user', userId: m[1] };
  m = /^member-([\w-]+)$/.exec(h);
  if (m) return { name: 'adminUser', userId: m[1] };
  m = /^tracker-([a-z0-9]{3,12})(?:-(\d{4}-\d{2}-\d{2}))?$/.exec(h);
  if (m) return { name: 'tracker', id: m[1], sunday: m[2] };
  if (h === 'feed') return { name: 'feed', tab: 'posts' };
  if (h === 'events') return { name: 'feed', tab: 'events' };
  if (h === 'duels') return { name: 'feed', tab: 'duels' };
  if (h === 'workout') return { name: 'workout' };
  m = /^workout-([a-z0-9]{3,16})$/.exec(h);
  if (m) return { name: 'workout', id: m[1] };
  m = /^duel-([A-Za-z0-9]{4,10})$/.exec(h);
  if (m) return { name: 'duel', code: m[1].toUpperCase() };
  m = /^week[-/](\d{4}-\d{2}-\d{2})$/.exec(h);
  return { name: 'week', sunday: m ? m[1] : undefined };
}

export function navigate(hash: string): void {
  if (location.hash === hash) window.dispatchEvent(new HashChangeEvent('hashchange'));
  else location.hash = hash;
}
