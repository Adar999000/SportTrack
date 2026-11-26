import { t } from './i18n';
/** Date helpers. All dates are local calendar dates represented as "YYYY-MM-DD". */

export const DAY_NAMES = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
export const MONTH_NAMES = [
  'ינואר', 'פברואר', 'מרץ', 'אפריל', 'מאי', 'יוני',
  'יולי', 'אוגוסט', 'ספטמבר', 'אוקטובר', 'נובמבר', 'דצמבר',
];

const pad = (n: number) => String(n).padStart(2, '0');

export function toISO(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function fromISO(iso: string): Date {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/** Calendar-day arithmetic that is immune to DST shifts. */
export function addDays(iso: string, n: number): string {
  const [y, m, d] = iso.split('-').map(Number);
  const t = new Date(Date.UTC(y, m - 1, d + n));
  return `${t.getUTCFullYear()}-${pad(t.getUTCMonth() + 1)}-${pad(t.getUTCDate())}`;
}

export function dayIndex(iso: string): number {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

/** Whole days from a to b (b - a). */
export function daysBetween(a: string, b: string): number {
  const [y1, m1, d1] = a.split('-').map(Number);
  const [y2, m2, d2] = b.split('-').map(Number);
  return Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
}

export function sundayOf(iso: string): string {
  return addDays(iso, -dayIndex(iso));
}

export function todayISO(now: Date = new Date()): string {
  return toISO(now);
}

/** "22/11/26" */
export function formatShort(iso: string): string {
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y.slice(2)}`;
}

/** "תאריך 22/11/26 עד 28/11/26" range part */
export function weekRangeLabel(sunday: string): string {
  return t('{a} עד {b}', { a: formatShort(sunday), b: formatShort(addDays(sunday, 6)) });
}

export function monthKey(iso: string): string {
  return iso.slice(0, 7);
}

export function monthLabel(key: string): string {
  const [y, m] = key.split('-').map(Number);
  return `${t(MONTH_NAMES[m - 1])} ${y}`;
}

export function quarterKey(iso: string): string {
  const [y, m] = iso.split('-').map(Number);
  return `${y}-Q${Math.floor((m - 1) / 3) + 1}`;
}

export function quarterLabel(key: string): string {
  const [y, q] = key.split('-Q');
  return t('רבעון {q} {y}', { q, y });
}

/** Parse "D/M/YY" or "DD/MM/YYYY" into ISO. Returns null if invalid. */
export function parseDMY(d: string, m: string, y: string): string | null {
  const day = Number(d), month = Number(m);
  let year = Number(y);
  if (y.length <= 2) year += 2000;
  if (!(month >= 1 && month <= 12 && day >= 1 && day <= 31)) return null;
  const iso = `${year}-${pad(month)}-${pad(day)}`;
  // reject e.g. 31/02
  if (addDays(iso, 0) !== iso) return null;
  return iso;
}
