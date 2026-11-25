/**
 * Local-first sync with the Apps Script backend: edits are saved on the device
 * immediately and uploaded in the background; other devices' changes are pulled.
 */
import { AuthError, call, hasBackend } from './api';
import { kvGet, kvSet } from './db';
import { normalizeWeek } from './model';
import { currentUser, endSession } from './session';
import { allMealsRatio, workoutsInWeek } from './stats';
import { applyRemote, dirtyWeeks, markSynced } from './store';
import type { Week } from './types';

export type SyncState = 'idle' | 'syncing' | 'offline' | 'error';
let syncState: SyncState = 'idle';
let lastError = '';
const listeners = new Set<() => void>();
export const getSyncState = () => ({ state: syncState, error: lastError });
export const onSync = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const set = (s: SyncState, err = '') => {
  syncState = s;
  lastError = err;
  listeners.forEach((l) => l());
};

function payload(w: Week) {
  const { photoId: _p, updatedAt, ...data } = w;
  return {
    sundayDate: w.sundayDate,
    updatedAt: updatedAt ?? Date.now(),
    data,
    summary: {
      startWeight: w.startWeight,
      workouts: workoutsInWeek(w),
      mealsPct: allMealsRatio(w.days).pct ?? undefined,
    },
  };
}

let running: Promise<void> | null = null;
let again = false;

export function syncNow(): Promise<void> {
  if (!hasBackend() || !currentUser()) return Promise.resolve();
  if (running) {
    again = true;
    return running;
  }
  running = (async () => {
    set('syncing');
    try {
      do {
        again = false;
        // push in batches
        const dirty = dirtyWeeks();
        for (let i = 0; i < dirty.length; i += 60) {
          const batch = dirty.slice(i, i + 60);
          await call('putWeeks', { weeks: batch.map(payload) });
          markSynced(batch);
        }
        // pull changes since last pull
        const key = 'lastPull:' + currentUser()!.userId;
        const since = (await kvGet<number>(key).catch(() => 0)) ?? 0;
        const started = Date.now();
        const { weeks } = await call<{ weeks: { sundayDate: string; updatedAt: number; photoId: string | null; data: any }[] }>(
          'getWeeks',
          { since },
        );
        const parsed = weeks
          .map((r) => normalizeWeek({ ...r.data, sundayDate: r.sundayDate, updatedAt: r.updatedAt, photoId: r.photoId ?? undefined }))
          .filter((w): w is Week => !!w);
        applyRemote(parsed);
        await kvSet(key, started - 60_000).catch(() => {});
      } while (again);
      set('idle');
    } catch (e: any) {
      if (e instanceof AuthError) {
        await endSession();
        set('error', e.message);
      } else set(navigator.onLine ? 'error' : 'offline', e.message);
    } finally {
      running = null;
    }
  })();
  return running;
}

let timer: ReturnType<typeof setTimeout> | undefined;
/** Debounced sync after edits. */
export function scheduleSync(delay = 2500): void {
  clearTimeout(timer);
  timer = setTimeout(() => syncNow(), delay);
}

export async function resetPullCursor(userId: string): Promise<void> {
  await kvSet('lastPull:' + userId, 0).catch(() => {});
}
