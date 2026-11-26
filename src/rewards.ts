/** Coins, levels and challenges — computed on the server, cached here for offline display. */
import { call, hasBackend } from './api';
import { kvGet, kvSet } from './db';
import { currentUser } from './session';
import { t } from './i18n';

/** "משמעת אישית ★2" → translated base name + suffix. */
export function levelLabel(name: string): string {
  const [base, star] = name.split(' ★');
  return t(base) + (star ? ' ★' + star : '');
}

export interface RewardItem { date: string; amount: number; kind: string; label: string }
export interface Challenge { id: string; period: 'day' | 'week' | 'month' | 'year'; title: string; progress: number; target: number; reward: number; unit?: string; cells?: number; minCells?: number }
export interface Rewards {
  start: string;
  balance: number;
  lifetime: number;
  week: number;
  month: number;
  level: { n: number; name: string; from: number; to: number };
  challenges: Challenge[];
  badges: Record<string, number>;
  items: RewardItem[];
  frozenDays: string[];
  frozenWeeks: string[];
  unlockedColors: string[];
  chatCredits: number;
  costs: { freezeDay: number; freezeWeek: number; chat10: number; color: number };
  hasGoal: boolean;
  fullHistory?: boolean;
  perks?: { chatBonus: number; discount: number };
  levels?: { n: number; name: string; from: number; perks: string[] }[];
  catalog?: { kind: 'color' | 'bg' | 'frame' | 'effect' | 'mascot' | 'acc'; id: string; base: number; price: number; owned: boolean; minLevel?: number; locked?: boolean }[];
  unlocked?: string[];
  frame?: string;
}
export interface Leader { userId: string; name: string; photoId: string | null; frame?: string; level: number; levelName: string; week: number; month: number; lifetime: number }

let current: Rewards | null = null;
let lastError = '';
export const rewardsError = () => lastError;
const listeners = new Set<() => void>();
export const getRewards = () => current;
export const onRewards = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const key = () => 'rewards:' + (currentUser()?.userId ?? '');

function set(r: Rewards | null) {
  current = r;
  if (r) kvSet(key(), r).catch(() => {});
  listeners.forEach((l) => l());
}

export async function loadCachedRewards(): Promise<void> {
  if (!currentUser()) return set(null);
  current = (await kvGet<Rewards>(key()).catch(() => undefined)) ?? null;
  listeners.forEach((l) => l());
}

let inflight: Promise<void> | null = null;
export function refreshRewards(): Promise<void> {
  if (!hasBackend() || !currentUser()) return Promise.resolve();
  inflight ??= call<{ rewards: Rewards }>('rewards')
    .then((r) => { lastError = ''; set(r.rewards); })
    .catch((e) => { lastError = String(e?.message ?? e); listeners.forEach((l) => l()); })
    .finally(() => (inflight = null));
  return inflight;
}

export async function spend(item: 'freezeDay' | 'freezeWeek' | 'chat10' | 'color' | 'cosmetic', extra: Record<string, string> = {}): Promise<void> {
  const r = await call<{ rewards: Rewards }>('spend', { item, ...extra });
  set(r.rewards);
}

export async function wearFrame(frame: string): Promise<void> {
  await call('setFrame', { frame });
  if (current) set({ ...current, frame });
}

export const owns = (key: string) => !!current?.unlocked?.includes(key) || (key.startsWith('color:') && !!current?.unlockedColors.includes(key.slice(6)));

export const leaderboard = (period: 'week' | 'month' | 'all') => call<{ leaders: Leader[] }>('leaderboard', { period }).then((r) => r.leaders);
export const myInvite = () => call<{ code: string; used: number; rewarded: number; cap: number }>('myInvite');

export const BADGES: Record<string, { name: string; icon: string }> = {
  day3: { name: 'יום מושלם', icon: '⭐' },
  week3: { name: 'שבוע ספורטיבי', icon: '🏃' },
  month12: { name: 'חודש של אימונים', icon: '🏋️' },
  month80: { name: 'חודש של ארוחות בריאות', icon: '🥗' },
  year150: { name: 'שנה של אימונים', icon: '🏆' },
  goal: { name: 'הגעה ליעד', icon: '🎯' },
  friend: { name: 'הביא חבר', icon: '🤝' },
};
