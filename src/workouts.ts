/** Recorded workouts (GPS or imported), kept as synced documents `wo:<id>`. */
import { docsWithPrefix, getDoc, putDoc } from './docs';
import { editWeek, getWeek } from './store';
import { dayIndex, sundayOf } from './dates';
import { t, tr } from './i18n';

export type WorkoutType = 'run' | 'walk' | 'bike' | 'hike';
export interface Workout {
  id: string;
  type: WorkoutType;
  start: number; // ms
  durationS: number; // moving time
  distanceM: number;
  /** Route, simplified: [lat, lng, seconds from start]. */
  points: [number, number, number][];
  source: 'gps' | 'strava';
  name?: string;
}

export const WORKOUT_TYPES: Record<WorkoutType, { icon: string; name: string; stride: number }> = {
  run: { icon: '🏃', name: 'ריצה', stride: 1.0 },
  walk: { icon: '🚶', name: 'הליכה', stride: 0.75 },
  hike: { icon: '🥾', name: 'טיול', stride: 0.7 },
  bike: { icon: '🚴', name: 'רכיבה', stride: 0 },
};

export const listWorkouts = (): Workout[] => docsWithPrefix<Workout>('wo:').map(([, w]) => w).sort((a, b) => b.start - a.start);
export const getWorkout = (id: string) => getDoc<Workout>('wo:' + id);
export const saveWorkout = (w: Workout) => putDoc('wo:' + w.id, w);
export const deleteWorkout = (id: string) => putDoc('wo:' + id, null);

/** Great-circle distance in meters. */
export function haversine(a: [number, number], b: [number, number]): number {
  const R = 6371000, rad = Math.PI / 180;
  const dLat = (b[0] - a[0]) * rad, dLng = (b[1] - a[1]) * rad;
  const x = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * rad) * Math.cos(b[0] * rad) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(x));
}

/** Keep at most `max` points, evenly, always keeping the ends (keeps documents small). */
export function simplify<T>(pts: T[], max = 600): T[] {
  if (pts.length <= max) return pts;
  const step = (pts.length - 1) / (max - 1);
  return Array.from({ length: max }, (_, i) => pts[Math.round(i * step)]);
}

export const fmtDuration = (s: number) => {
  const h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), sec = Math.floor(s % 60);
  return (h ? h + ':' + String(m).padStart(2, '0') : String(m)) + ':' + String(sec).padStart(2, '0');
};
export const fmtKm = (m: number) => (m / 1000).toFixed(m < 10000 ? 2 : 1);
/** Pace (min:sec per km) for foot workouts, speed (km/h) for bike. */
export function paceOrSpeed(type: WorkoutType, distanceM: number, durationS: number): { label: string; value: string } {
  if (type === 'bike') return { label: t('מהירות'), value: distanceM > 0 && durationS > 0 ? ((distanceM / 1000) / (durationS / 3600)).toFixed(1) + ' ' + t('קמ"ש') : '—' };
  if (distanceM < 50 || durationS <= 0) return { label: t('קצב'), value: '—' };
  const secPerKm = durationS / (distanceM / 1000);
  return { label: t('קצב'), value: `${Math.floor(secPerKm / 60)}:${String(Math.round(secPerKm % 60)).padStart(2, '0')} ${t('לק"מ')}` };
}
export const estSteps = (type: WorkoutType, distanceM: number) => (WORKOUT_TYPES[type].stride ? Math.round(distanceM / WORKOUT_TYPES[type].stride) : 0);

/** Mark the day's sport cell from a workout (if it's empty and the day isn't locked). */
export function markSportFromWorkout(w: Workout): boolean {
  const date = new Date(w.start);
  const iso = date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0') + '-' + String(date.getDate()).padStart(2, '0');
  const sunday = sundayOf(iso), i = dayIndex(iso);
  const day = getWeek(sunday).days[i];
  if (day.sport.status === 'V') return false;
  const label = tr`${t(WORKOUT_TYPES[w.type].name)} ${fmtKm(w.distanceM)} ק"מ`;
  let ok = true;
  editWeek(sunday, (wk) => { wk.days[i].sport = { status: 'V', label, countsAsWorkout: true }; });
  ok = getWeek(sunday).days[i].sport.status === 'V';
  return ok;
}

/** Decode a Google/Strava encoded polyline into [lat, lng] pairs. */
export function decodePolyline(str: string): [number, number][] {
  const out: [number, number][] = [];
  let i = 0, lat = 0, lng = 0;
  while (i < str.length) {
    for (const which of [0, 1]) {
      let shift = 0, result = 0, b: number;
      do { b = str.charCodeAt(i++) - 63; result |= (b & 0x1f) << shift; shift += 5; } while (b >= 0x20 && i < str.length);
      const d = result & 1 ? ~(result >> 1) : result >> 1;
      if (which === 0) lat += d; else lng += d;
    }
    out.push([lat / 1e5, lng / 1e5]);
  }
  return out;
}

export interface StravaActivity { id: string; type: WorkoutType; name: string; start: number; durationS: number; distanceM: number; polyline: string }

/** Save activities imported from Strava (skips ones already saved). Returns how many were new. */
export function saveImported(list: StravaActivity[]): number {
  let n = 0;
  for (const a of list) {
    if (getWorkout(a.id)) continue;
    const pts = decodePolyline(a.polyline);
    const w: Workout = { id: a.id, type: a.type, name: a.name, start: a.start, durationS: a.durationS, distanceM: a.distanceM, source: 'strava',
      points: simplify(pts.map((p, k) => [p[0], p[1], Math.round((k / Math.max(1, pts.length - 1)) * a.durationS)] as [number, number, number])) };
    saveWorkout(w);
    markSportFromWorkout(w);
    n++;
  }
  return n;
}
