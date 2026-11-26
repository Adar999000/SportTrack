import { addDays, dayIndex, DAY_NAMES, formatShort, parseDMY, sundayOf } from '../dates';
import { emptyWeek, sportFromLabel, sportMark } from '../model';
import type { Mark, Week } from '../types';
import type { Block } from './extract';

export interface ParsedWeek {
  week: Week;
  /** The original header line, for the preview. */
  header: string;
  issues: string[];
}

export interface ParseResult {
  weeks: ParsedWeek[];
  warnings: string[];
}

// "תאריך 22/11/26 עד 28/11/26", "תאריך - 9/4/23 עד 15/4/23", "תאריך -2/4/23 עד 8/4/23"
const DATE_RE =
  /תאריך[\s:\-–—]*(\d{1,2})[./](\d{1,2})[./](\d{2,4})\s*(?:עד|[-–—])\s*(\d{1,2})[./](\d{1,2})[./](\d{2,4})/;
// "משקל התחלתי: 104.2 ק"ג" (decimal comma tolerated)
const WEIGHT_RE = /משקל\s*התחלתי\s*:?\s*(\d{2,3}(?:[.,]\d+)?)/;

type RowKind = 'breakfast' | 'lunch' | 'dinner' | 'sport' | 'smoking';

export function rowKind(label: string): RowKind | null {
  const l = label.replace(/\s+/g, ' ');
  if (l.includes('בוקר') && l.includes('ארוח')) return 'breakfast';
  if (/צהר(י)?ים/.test(l)) return 'lunch';
  if (l.includes('ערב') && l.includes('ארוח')) return 'dinner';
  if (l.includes('ספורט') || l.includes('פעילות')) return 'sport';
  if (l.includes('מעשן') || l.includes('סיגרי')) return 'smoking';
  return null;
}

export function parseMark(raw: string): Mark | null | undefined {
  const s = raw.replace(/\s+/g, '').toUpperCase();
  if (!s) return null;
  if (/^[V✓✔]$/.test(s)) return 'V';
  if (/^[X✗✘×]$/.test(s)) return 'X';
  if (/^[-–—־]$/.test(s)) return '-';
  return undefined; // unrecognized
}

export function parseSportCell(raw: string) {
  const text = raw.replace(/\s*\n\s*/g, ' ').replace(/\s+/g, ' ').replace(/\(\s+/g, '(').replace(/\s+\)/g, ')').trim();
  const m = parseMark(text);
  if (m === null) return sportMark(null);
  if (m === 'X' || m === '-') return sportMark(m);
  if (m === 'V') return { status: 'V' as const, countsAsWorkout: true };
  return sportFromLabel(text);
}

function parseSmoke(raw: string): boolean | null {
  const s = raw.trim();
  if (s.startsWith('כן')) return true;
  if (s.startsWith('לא')) return false;
  return null;
}

function isTrackerTable(rows: string[][]): boolean {
  return rows.some((r) => r.some((c) => c.includes('ראשון'))) || rows.some((r) => rowKind(r[0] ?? '') !== null);
}

/** Map table column index → day index (0 = Sunday), using the header row when possible. */
function columnMap(rows: string[][]): { headerIdx: number; cols: number[] } {
  const headerIdx = rows.findIndex((r) => r.some((c) => c.trim() === 'ראשון'));
  if (headerIdx >= 0) {
    const cols: number[] = [];
    rows[headerIdx].forEach((c, j) => {
      const d = DAY_NAMES.indexOf(c.trim());
      if (d >= 0) cols[d] = j;
    });
    if (cols.filter((x) => x !== undefined).length === 7) return { headerIdx, cols };
  }
  return { headerIdx, cols: [1, 2, 3, 4, 5, 6, 7] };
}

function parseTable(rows: string[][], week: Week, issues: string[]) {
  const { headerIdx, cols } = columnMap(rows);
  rows.forEach((r, i) => {
    if (i === headerIdx) return;
    const label = (r[0] ?? '').trim();
    const kind = rowKind(label);
    if (!kind) {
      if (label && !label.includes('יום')) issues.push(`שורה לא מזוהה: "${label}"`);
      return;
    }
    for (let d = 0; d < 7; d++) {
      const raw = (r[cols[d]] ?? '').trim();
      const day = week.days[d];
      if (kind === 'sport') {
        day.sport = parseSportCell(raw);
      } else if (kind === 'smoking') {
        day.smoked = parseSmoke(raw);
        if (day.smoked === null && raw) day.text = { ...day.text, smoked: raw };
      } else {
        const m = parseMark(raw);
        if (m === undefined) {
          day[kind] = null;
          day.text = { ...day.text, [kind]: raw.replace(/\s+/g, ' ') };
        } else day[kind] = m;
      }
    }
  });
}

/** Turn extracted blocks into weeks. Duplicate weeks within the file keep the first occurrence. */
export function parseBlocks(blocks: Block[]): ParseResult {
  const weeks: ParsedWeek[] = [];
  const warnings: string[] = [];
  const seen = new Set<string>();
  let pending: { sunday: string; header: string; weight?: number; issues: string[] } | null = null;

  for (const b of blocks) {
    if (b.type === 'p') {
      const text = b.text.replace(/\s+/g, ' ').trim();
      const dm = DATE_RE.exec(text);
      if (dm) {
        if (pending) warnings.push(`לא נמצאה טבלה עבור "${pending.header}"`);
        const start = parseDMY(dm[1], dm[2], dm[3]);
        const end = parseDMY(dm[4], dm[5], dm[6]);
        if (!start) {
          warnings.push(`תאריך לא תקין: "${text}"`);
          pending = null;
          continue;
        }
        const issues: string[] = [];
        const sunday = sundayOf(start);
        if (dayIndex(start) !== 0) issues.push(`התאריך ${formatShort(start)} אינו יום ראשון — שויך לשבוע של ${formatShort(sunday)}`);
        if (end && end !== addDays(start, 6)) issues.push(`תאריך הסיום ${formatShort(end)} אינו 6 ימים אחרי ההתחלה`);
        pending = { sunday, header: text, issues };
      }
      const wm = WEIGHT_RE.exec(text);
      if (wm && pending) pending.weight = parseFloat(wm[1].replace(',', '.'));
      continue;
    }

    // table
    if (!isTrackerTable(b.rows)) continue;
    if (!pending) {
      warnings.push('נמצאה טבלה ללא שורת תאריך לפניה — דולגה');
      continue;
    }
    const week = emptyWeek(pending.sunday);
    if (pending.weight !== undefined && pending.weight > 0) week.startWeight = pending.weight;
    parseTable(b.rows, week, pending.issues);
    if (seen.has(week.sundayDate)) {
      warnings.push(`השבוע ${formatShort(week.sundayDate)} מופיע פעמיים בקובץ — נשמר הראשון`);
    } else {
      seen.add(week.sundayDate);
      weeks.push({ week, header: pending.header, issues: pending.issues });
    }
    pending = null;
  }
  if (pending) warnings.push(`לא נמצאה טבלה עבור "${pending.header}"`);
  weeks.sort((a, b) => a.week.sundayDate.localeCompare(b.week.sundayDate));
  return { weeks, warnings };
}
