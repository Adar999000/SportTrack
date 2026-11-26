import type { Day, Mark, SportCell, Week } from './types';

export const BUILTIN_SPORT_TYPES = [
  'ריצה', 'אימון כוח', 'חד"כ', 'קיקבוקס', 'אגרוף', 'הליכה', 'אימון בוקר', 'חופשה', 'מנוחה',
];

/**
 * Labels that are logged in the sport row but are NOT workouts.
 * Matches "חופשה", "חופשה ביוון", "מנוחה", "מנוחת קעקוע", "צימר בצפון".
 */
const NON_WORKOUT_PATTERNS = [/^\s*חופש/, /^\s*מנוח/, /^\s*צימר/, /^\s*(vacation|holiday|rest)\b/i];

export function isNonWorkoutLabel(label: string | undefined): boolean {
  if (!label) return false;
  return NON_WORKOUT_PATTERNS.some((re) => re.test(label));
}

export function emptySport(): SportCell {
  return { status: null, countsAsWorkout: false };
}

export function emptyDay(): Day {
  return { breakfast: null, lunch: null, dinner: null, sport: emptySport(), smoked: null };
}

export function emptyWeek(sundayDate: string): Week {
  return { sundayDate, days: Array.from({ length: 7 }, emptyDay) };
}

/** empty → V → X → - → empty */
export function cycleMark(m: Mark | null): Mark | null {
  switch (m) {
    case null: return 'V';
    case 'V': return 'X';
    case 'X': return '-';
    default: return null;
  }
}

/** empty → כן → לא → empty */
export function cycleSmoked(s: boolean | null | undefined): boolean | null {
  if (s === null || s === undefined) return true;
  if (s === true) return false;
  return null;
}

/** Build a sport cell from a "done" label (chosen type + optional details). */
export function sportFromLabel(label: string): SportCell {
  const clean = label.trim().replace(/\s+/g, ' ');
  if (!clean) return emptySport();
  return { status: 'V', label: clean, countsAsWorkout: !isNonWorkoutLabel(clean) };
}

export function sportMark(status: 'X' | '-' | null): SportCell {
  return { status, countsAsWorkout: false };
}

export function isWorkout(s: SportCell): boolean {
  return s.status === 'V' && s.countsAsWorkout;
}

/** True when the week has any user data at all. */
export function weekHasData(w: Week): boolean {
  if (w.startWeight !== undefined || (w.note && w.note.trim()) || w.photoId) return true;
  return w.days.some(
    (d) => d.breakfast || d.lunch || d.dinner || d.sport.status || (d.smoked !== null && d.smoked !== undefined) ||
      (d.text && Object.keys(d.text).length),
  );
}

/** Short text for a sport cell inside the narrow table. */
export function sportShort(s: SportCell): string {
  if (s.status === 'V') return s.label || 'V';
  return s.status ?? '';
}

function cellText(raw: any): { text?: Day['text'] } {
  if (!raw || typeof raw !== 'object') return {};
  const out: Day['text'] = {};
  for (const k of ['breakfast', 'lunch', 'dinner', 'smoked'] as const) {
    if (typeof raw[k] === 'string' && raw[k].trim()) out[k] = raw[k].trim();
  }
  return Object.keys(out).length ? { text: out } : {};
}

/** Normalizes a possibly-partial / older week object into a valid Week. */
export function normalizeWeek(raw: any): Week | null {
  if (!raw || typeof raw.sundayDate !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.sundayDate)) return null;
  const mark = (v: any): Mark | null => (v === 'V' || v === 'X' || v === '-' ? v : null);
  const days: Day[] = Array.from({ length: 7 }, (_, i) => {
    const d = Array.isArray(raw.days) ? raw.days[i] ?? {} : {};
    const s = d.sport ?? {};
    const status = mark(s.status);
    const label = typeof s.label === 'string' && s.label.trim() ? s.label.trim() : undefined;
    return {
      breakfast: mark(d.breakfast),
      lunch: mark(d.lunch),
      dinner: mark(d.dinner),
      sport: {
        status,
        ...(label && status === 'V' ? { label } : {}),
        countsAsWorkout:
          status === 'V' ? (typeof s.countsAsWorkout === 'boolean' ? s.countsAsWorkout : !isNonWorkoutLabel(label)) : false,
      },
      smoked: typeof d.smoked === 'boolean' ? d.smoked : null,
      ...cellText(d.text),
    };
  });
  const w: Week = { sundayDate: raw.sundayDate, days };
  const wt = typeof raw.startWeight === 'string' ? parseFloat(raw.startWeight) : raw.startWeight;
  if (typeof wt === 'number' && Number.isFinite(wt) && wt > 0) w.startWeight = wt;
  if (typeof raw.note === 'string' && raw.note.trim()) w.note = raw.note;
  if (typeof raw.updatedAt === 'number') w.updatedAt = raw.updatedAt;
  if (typeof raw.photoId === 'string' && raw.photoId) w.photoId = raw.photoId;
  return w;
}
