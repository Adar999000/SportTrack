import { KEYS, kvGet, kvSet } from './db';
import { emptyWeek, normalizeWeek, weekHasData } from './model';
import { DEFAULT_SETTINGS, type Day, type Settings, type Week } from './types';
import { sundayOf, todayISO } from './dates';

type Listener = () => void;

interface State {
  weeks: Record<string, Week>;
  settings: Settings;
  /** Sundays edited locally and not yet uploaded. */
  dirty: Set<string>;
  /** userId the local weeks belong to (undefined = pre-account local data). */
  owner?: string | null;
}

const state: State = { weeks: {}, settings: { ...DEFAULT_SETTINGS }, dirty: new Set() };
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const LS_FALLBACK = 'mishmaat-ishit-backup';

export async function loadStore(): Promise<void> {
  try {
    const [weeks, settings, dirty, owner] = await Promise.all([
      kvGet<Record<string, Week>>(KEYS.weeks),
      kvGet<Partial<Settings>>(KEYS.settings),
      kvGet<string[]>('dirty'),
      kvGet<string | null>('weeksOwner'),
    ]);
    state.dirty = new Set(dirty ?? []);
    state.owner = owner;
    state.weeks = {};
    for (const w of Object.values(weeks ?? {})) {
      const n = normalizeWeek(w);
      if (n) state.weeks[n.sundayDate] = n;
    }
    state.settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
    if (settings && (settings.rev ?? 0) < 2) {
      // v1.1: the smoking row is hidden by default (it can be turned on in settings)
      state.settings = { ...state.settings, showSmoking: false, rev: 2 };
    }
  } catch (e) {
    // IndexedDB unavailable (e.g. some private modes) — fall back to localStorage.
    console.warn('IndexedDB unavailable, using localStorage', e);
    const raw = localStorage.getItem(LS_FALLBACK);
    if (raw) {
      const parsed = JSON.parse(raw);
      for (const w of Object.values(parsed.weeks ?? {})) {
        const n = normalizeWeek(w);
        if (n) state.weeks[n.sundayDate] = n;
      }
      state.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings ?? {}) };
    }
  }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flush, 150);
}

export async function flush(): Promise<void> {
  clearTimeout(saveTimer);
  const weeks: Record<string, Week> = {};
  for (const [k, w] of Object.entries(state.weeks)) if (weekHasData(w)) weeks[k] = w;
  try {
    await Promise.all([
      kvSet(KEYS.weeks, weeks),
      kvSet(KEYS.settings, state.settings),
      kvSet('dirty', [...state.dirty]),
      kvSet('weeksOwner', state.owner ?? null),
    ]);
  } catch {
    localStorage.setItem(LS_FALLBACK, JSON.stringify({ weeks, settings: state.settings }));
  }
}

function emit() {
  persist();
  listeners.forEach((l) => l());
}

export function subscribe(l: Listener): () => void {
  listeners.add(l);
  return () => listeners.delete(l);
}

export function getSettings(): Settings {
  return state.settings;
}

export function updateSettings(patch: Partial<Settings>): void {
  state.settings = { ...state.settings, ...patch };
  emit();
}

/** Existing week or a fresh empty one (not stored until edited). */
export function getWeek(sunday: string): Week {
  return state.weeks[sunday] ?? emptyWeek(sunday);
}

export function hasWeek(sunday: string): boolean {
  const w = state.weeks[sunday];
  return !!w && weekHasData(w);
}

/** All weeks with data, sorted oldest → newest. */
export function allWeeks(): Week[] {
  return Object.values(state.weeks)
    .filter(weekHasData)
    .sort((a, b) => a.sundayDate.localeCompare(b.sundayDate));
}

/** Apply a mutation to a week (creating it if needed). */
const fullDay = (d?: Day) => !!d && (['breakfast', 'lunch', 'dinner'] as const).every((k) => d[k] || d.text?.[k]) && !!d.sport?.status;
let onDayComplete: (() => void) | null = null;
/** Called when today's row becomes complete (used for the confetti effect). */
export function setDayCompleteHandler(fn: () => void): void { onDayComplete = fn; }

export function editWeek(sunday: string, fn: (w: Week) => void): void {
  const w = structuredClone(getWeek(sunday));
  const today = todayISO();
  const idx = sunday === sundayOf(today) ? new Date(today + 'T12:00:00').getDay() : -1;
  const wasFull = idx >= 0 && fullDay(w.days[idx]);
  fn(w);
  if (idx >= 0 && !wasFull && fullDay(w.days[idx])) queueMicrotask(() => onDayComplete?.());
  w.updatedAt = Date.now();
  state.weeks[sunday] = w;
  state.dirty.add(sunday);
  emit();
}

// ---------------------------------------------------------------- sync support

export const dirtyWeeks = (): Week[] => [...state.dirty].map((s) => state.weeks[s]).filter(Boolean);
export const dirtyCount = () => state.dirty.size;

/** Mark weeks as uploaded, unless they were edited again meanwhile. */
export function markSynced(weeks: Week[]): void {
  for (const w of weeks) {
    if ((state.weeks[w.sundayDate]?.updatedAt ?? 0) <= (w.updatedAt ?? 0)) state.dirty.delete(w.sundayDate);
  }
  persist();
}

/** Apply weeks from the server; local unsynced edits win. Doesn't mark anything dirty. */
export function applyRemote(weeks: Week[]): number {
  let n = 0;
  for (const w of weeks) {
    const local = state.weeks[w.sundayDate];
    if (state.dirty.has(w.sundayDate) && local) continue;
    if (!local || (w.updatedAt ?? 0) > (local.updatedAt ?? 0) || w.photoId !== local.photoId) {
      state.weeks[w.sundayDate] = w;
      n++;
    }
  }
  if (n) emit();
  return n;
}

export const weeksOwner = () => state.owner;

/** Switch the local data set to a user: keep (and upload) pre-account data, or wipe another user's. */
export function setOwner(userId: string | null, keepLocal: boolean): void {
  if (!keepLocal) {
    state.weeks = {};
    state.dirty = new Set();
  } else {
    for (const w of Object.values(state.weeks)) if (weekHasData(w)) state.dirty.add(w.sundayDate);
  }
  state.owner = userId;
  emit();
}

export function setPhotoLocal(sunday: string, photoId: string | undefined): void {
  const w = structuredClone(getWeek(sunday));
  if (photoId) w.photoId = photoId;
  else delete w.photoId;
  state.weeks[sunday] = w;
  emit();
}

export function ensureWeek(sunday: string): void {
  if (!state.weeks[sunday]) state.weeks[sunday] = emptyWeek(sunday);
}

export function putWeeks(weeks: Week[], mode: 'skip-existing' | 'overwrite'): number {
  let n = 0;
  for (const w of weeks) {
    if (mode === 'skip-existing' && hasWeek(w.sundayDate)) continue;
    state.weeks[w.sundayDate] = { ...w, updatedAt: Date.now() };
    state.dirty.add(w.sundayDate);
    n++;
  }
  emit();
  return n;
}

export function replaceAll(weeks: Week[], settings?: Partial<Settings>): void {
  state.weeks = {};
  for (const w of weeks) {
    state.weeks[w.sundayDate] = { ...w, updatedAt: Date.now() };
    state.dirty.add(w.sundayDate);
  }
  if (settings) state.settings = { ...DEFAULT_SETTINGS, ...settings };
  emit();
}

export function addCustomSportType(t: string): void {
  const clean = t.trim();
  if (!clean || state.settings.customSportTypes.includes(clean)) return;
  updateSettings({ customSportTypes: [...state.settings.customSportTypes, clean] });
}
