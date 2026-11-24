import { KEYS, kvGet, kvSet } from './db';
import { emptyWeek, normalizeWeek, weekHasData } from './model';
import { DEFAULT_SETTINGS, type Settings, type Week } from './types';

type Listener = () => void;

interface State {
  weeks: Record<string, Week>;
  settings: Settings;
}

const state: State = { weeks: {}, settings: { ...DEFAULT_SETTINGS } };
const listeners = new Set<Listener>();
let saveTimer: ReturnType<typeof setTimeout> | undefined;
const LS_FALLBACK = 'mishmaat-ishit-backup';

export async function loadStore(): Promise<void> {
  try {
    const [weeks, settings] = await Promise.all([
      kvGet<Record<string, Week>>(KEYS.weeks),
      kvGet<Partial<Settings>>(KEYS.settings),
    ]);
    state.weeks = {};
    for (const w of Object.values(weeks ?? {})) {
      const n = normalizeWeek(w);
      if (n) state.weeks[n.sundayDate] = n;
    }
    state.settings = { ...DEFAULT_SETTINGS, ...(settings ?? {}) };
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
    await Promise.all([kvSet(KEYS.weeks, weeks), kvSet(KEYS.settings, state.settings)]);
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
export function editWeek(sunday: string, fn: (w: Week) => void): void {
  const w = structuredClone(getWeek(sunday));
  fn(w);
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
    state.weeks[w.sundayDate] = w;
    n++;
  }
  emit();
  return n;
}

export function replaceAll(weeks: Week[], settings?: Partial<Settings>): void {
  state.weeks = {};
  for (const w of weeks) state.weeks[w.sundayDate] = w;
  if (settings) state.settings = { ...DEFAULT_SETTINGS, ...settings };
  emit();
}

export function addCustomSportType(t: string): void {
  const clean = t.trim();
  if (!clean || state.settings.customSportTypes.includes(clean)) return;
  updateSettings({ customSportTypes: [...state.settings.customSportTypes, clean] });
}
