/**
 * Small synced documents (custom trackers, main-table settings), stored on the device
 * and uploaded in the background like weeks. A document set to null is deleted.
 */
import { kvGet, kvSet } from './db';
import { notifyChange } from './store';

interface Doc { updatedAt: number; data: unknown }
interface DocsState { owner: string | null; items: Record<string, Doc>; dirty: string[] }

const state: DocsState = { owner: null, items: {}, dirty: [] };
const KEY = 'docs';
let saveTimer: ReturnType<typeof setTimeout> | undefined;

export async function loadDocs(): Promise<void> {
  try {
    const s = await kvGet<DocsState>(KEY);
    if (s) Object.assign(state, { owner: s.owner ?? null, items: s.items ?? {}, dirty: s.dirty ?? [] });
  } catch { /* no IndexedDB: docs live in memory for this visit */ }
}

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => { kvSet(KEY, state).catch(() => {}); }, 150);
}

export function getDoc<T>(id: string): T | null {
  return (state.items[id]?.data as T) ?? null;
}

/** All live docs whose id starts with `prefix`. */
export function docsWithPrefix<T>(prefix: string): [string, T][] {
  return Object.entries(state.items).filter(([k, d]) => k.startsWith(prefix) && d.data !== null).map(([k, d]) => [k, d.data as T]);
}

export function putDoc(id: string, data: unknown): void {
  state.items[id] = { updatedAt: Date.now(), data: data ?? null };
  if (!state.dirty.includes(id)) state.dirty.push(id);
  persist();
  notifyChange();
}

export const dirtyDocs = () => state.dirty.filter((id) => state.items[id]).map((id) => ({ id, ...state.items[id] }));
export const dirtyDocCount = () => state.dirty.length;

export function markDocsSynced(sent: { id: string; updatedAt: number }[]): void {
  for (const d of sent) if ((state.items[d.id]?.updatedAt ?? 0) <= d.updatedAt) state.dirty = state.dirty.filter((x) => x !== d.id);
  persist();
}

/** Server changes; local unsynced edits win. */
export function applyRemoteDocs(docs: { id: string; updatedAt: number; data: unknown }[]): void {
  let n = 0;
  for (const d of docs) {
    if (state.dirty.includes(d.id)) continue;
    if ((state.items[d.id]?.updatedAt ?? 0) < d.updatedAt) { state.items[d.id] = { updatedAt: d.updatedAt, data: d.data }; n++; }
  }
  if (n) { persist(); notifyChange(); }
}

/** Same rule as weeks: keep (and upload) pre-account docs, or wipe another user's. */
export function setDocsOwner(userId: string | null, keepLocal: boolean): void {
  if (!keepLocal) { state.items = {}; state.dirty = []; }
  else state.dirty = Object.keys(state.items);
  state.owner = userId;
  persist();
}
