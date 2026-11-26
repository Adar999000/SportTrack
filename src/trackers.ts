/** Custom trackers: the user's own tables (by days, or a free grid), plus main-table settings. */
import { docsWithPrefix, getDoc, putDoc } from './docs';
import type { CellVal } from './types';
import { t } from './i18n';

export type CellType = 'vxd' | 'check' | 'emoji' | 'stars' | 'number' | 'text';
export interface TRow { id: string; label: string; type: CellType; unit?: string }
export interface TCol { id: string; label: string }
export interface Tracker {
  id: string;
  name: string;
  icon: string;
  /** 'week': rows × days (Sunday → Saturday), per week. 'grid': rows × your own columns. */
  mode: 'week' | 'grid';
  rows: TRow[];
  cols: TCol[];
  corner?: string;
  createdAt: number;
}
/** Main table: renamed rows and the user's extra rows. */
export interface MainCfg {
  corner?: string;
  labels?: Partial<Record<'breakfast' | 'lunch' | 'dinner' | 'sport' | 'smoked', string>>;
  extraRows?: TRow[];
}

export const CELL_TYPES: { id: CellType; name: string; hint: string }[] = [
  { id: 'vxd', name: 'V / X / -', hint: 'הקשה מחליפה בין בוצע, לא בוצע ולא רלוונטי' },
  { id: 'check', name: 'וי ✓', hint: 'הקשה מסמנת או מבטלת' },
  { id: 'emoji', name: 'מצב רוח 😀', hint: 'הקשה מחליפה בין 😀 🙂 😐 🙁' },
  { id: 'stars', name: 'כוכבים ★', hint: 'דירוג 1 עד 5' },
  { id: 'number', name: 'מספר', hint: 'כמות, משקל, דקות… עם יחידה לבחירה' },
  { id: 'text', name: 'טקסט', hint: 'כל מה שרוצים לכתוב' },
];
export const ICONS = ['📋', '💧', '😴', '🏋️', '🏃', '🧘', '📚', '🥗', '💊', '🚭', '🎯', '💰', '🙏', '🦷', '🚶', '🚴', '🏊', '⚽'];
export const EMOJI_SCALE = ['😀', '🙂', '😐', '🙁'];

export const uid = () => Math.random().toString(36).slice(2, 9);
const defId = (id: string) => `t:${id}:def`;
const weekDocId = (id: string, sunday: string) => `t:${id}:w:${sunday}`;
const gridDocId = (id: string) => `t:${id}:g`;

export function listTrackers(): Tracker[] {
  return docsWithPrefix<Tracker>('t:').filter(([k]) => k.endsWith(':def')).map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt);
}
export const getTracker = (id: string) => getDoc<Tracker>(defId(id));
export function saveTracker(t: Tracker): void { putDoc(defId(t.id), t); }

export function deleteTracker(id: string): void {
  for (const [k] of docsWithPrefix(`t:${id}:`)) putDoc(k, null);
}

/** Week mode: rowId → 7 values. */
export function trackerWeek(id: string, sunday: string): Record<string, CellVal[]> {
  return getDoc<Record<string, CellVal[]>>(weekDocId(id, sunday)) ?? {};
}
export function setTrackerCell(id: string, sunday: string, rowId: string, day: number, v: CellVal): void {
  const data = structuredClone(trackerWeek(id, sunday));
  const vals = data[rowId] ?? Array(7).fill(null);
  vals[day] = v;
  data[rowId] = vals;
  putDoc(weekDocId(id, sunday), data);
}

/** Grid mode: `${rowId}|${colId}` → value. */
export function trackerGrid(id: string): Record<string, CellVal> {
  return getDoc<Record<string, CellVal>>(gridDocId(id)) ?? {};
}
export function setGridCell(id: string, rowId: string, colId: string, v: CellVal): void {
  const data = { ...trackerGrid(id) };
  if (v === null || v === '') delete data[`${rowId}|${colId}`];
  else data[`${rowId}|${colId}`] = v;
  putDoc(gridDocId(id), data);
}

export const mainCfg = (): MainCfg => getDoc<MainCfg>('main:cfg') ?? {};
export const saveMainCfg = (c: MainCfg) => putDoc('main:cfg', c);

/** Ready-made starting points for a new tracker. */
export const TEMPLATES: { id: string; name: string; make: () => Omit<Tracker, 'id' | 'createdAt'> }[] = [
  { id: 'blank', name: 'מעקב ריק לפי ימים', make: () => ({ name: t('מעקב חדש'), icon: '📋', mode: 'week', rows: [{ id: uid(), label: t('משימה'), type: 'vxd' }], cols: [] }) },
  { id: 'body', name: 'שתייה, שינה ומצב רוח', make: () => ({ name: t('גוף ונפש'), icon: '💧', mode: 'week', cols: [], rows: [
    { id: uid(), label: t('כוסות מים'), type: 'number', unit: t('כוסות') }, { id: uid(), label: t('שעות שינה'), type: 'number', unit: t('שעות') }, { id: uid(), label: t('מצב רוח'), type: 'emoji' }] }) },
  { id: 'habits', name: 'הרגלים יומיים', make: () => ({ name: t('הרגלים'), icon: '🎯', mode: 'week', cols: [], rows: [
    { id: uid(), label: t('קריאה'), type: 'check' }, { id: uid(), label: t('מדיטציה'), type: 'check' }, { id: uid(), label: t('בלי סוכר'), type: 'vxd' }, { id: uid(), label: t('צעדים'), type: 'number', unit: t('צעדים') }] }) },
  { id: 'gym', name: 'גיליון חדר כושר (חופשי)', make: () => ({ name: t('חדר כושר'), icon: '🏋️', mode: 'grid', corner: t('תרגיל'), rows: [
    { id: uid(), label: t('סקוואט'), type: 'number', unit: t('ק"ג') }, { id: uid(), label: t('לחיצת חזה'), type: 'number', unit: t('ק"ג') }, { id: uid(), label: t('דדליפט'), type: 'number', unit: t('ק"ג') }],
    cols: [{ id: uid(), label: t('סט 1') }, { id: uid(), label: t('סט 2') }, { id: uid(), label: t('סט 3') }] }) },
  { id: 'grid', name: 'גיליון ריק (חופשי)', make: () => ({ name: t('גיליון חדש'), icon: '📋', mode: 'grid', rows: [{ id: uid(), label: t('שורה 1'), type: 'text' }], cols: [{ id: uid(), label: t('עמודה 1') }, { id: uid(), label: t('עמודה 2') }] }) },
];
