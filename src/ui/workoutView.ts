import { t, tr } from '../i18n';
import { formatShort } from '../dates';
import { confirmButton, h, openSheet, toast } from './dom';
import { call, hasBackend } from '../api';
import { openStoryComposer, workoutStory } from './storiesView';
import { miniPlayer } from './musicView';
import { icon } from './icons';
import { isAdmin } from '../session';
import { HASH, navigate } from './router';
import { track } from '../analytics';
import { celebrate } from './celebrate';
import {
  WORKOUT_TYPES, deleteWorkout, estSteps, fmtDuration, fmtKm, getWorkout, haversine, listWorkouts, markSportFromWorkout, paceOrSpeed,
  saveImported, saveWorkout, simplify, type StravaActivity, type Workout, type WorkoutType,
} from '../workouts';

type L = typeof import('leaflet');
let leaflet: Promise<L> | null = null;
/** Leaflet loads only when a map is shown (keeps the app light). */
function loadLeaflet(): Promise<L> {
  leaflet ??= Promise.all([import('leaflet'), import('leaflet/dist/leaflet.css')]).then(([m]) => (m as any).default ?? m);
  return leaflet;
}

function mapBox(points: [number, number, number][], live = false): { el: HTMLElement; update: (pts: [number, number, number][]) => void } {
  const el = h('div', { class: 'wo-map', role: 'img', 'aria-label': t('מפת המסלול') });
  let line: any = null, dot: any = null, map: any = null;
  const update = (pts: [number, number, number][]) => {
    if (!map || !pts.length) return;
    const ll = pts.map((p) => [p[0], p[1]] as [number, number]);
    line.setLatLngs(ll);
    dot.setLatLng(ll[ll.length - 1]);
    if (live) map.setView(ll[ll.length - 1], Math.max(map.getZoom(), 16));
    else map.fitBounds(line.getBounds(), { padding: [20, 20] });
  };
  loadLeaflet().then((Lf) => {
    map = Lf.map(el, { zoomControl: false, attributionControl: true }).setView(points.length ? [points[0][0], points[0][1]] : [32.08, 34.78], 15);
    Lf.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, attribution: '© OpenStreetMap' }).addTo(map);
    const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#14160f';
    line = Lf.polyline([], { color, weight: 5, opacity: .9 }).addTo(map);
    dot = Lf.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#d6304a', fillOpacity: 1 }).addTo(map);
    if (points.length) { Lf.circleMarker([points[0][0], points[0][1]], { radius: 5, color: '#fff', weight: 2, fillColor: '#2f8a5b', fillOpacity: 1 }).addTo(map); update(points); }
    setTimeout(() => map.invalidateSize(), 50);
  }).catch(() => el.replaceChildren(h('p', { class: 'muted' }, t('המפה לא נטענה'))));
  return { el, update };
}

/** A tiny drawing of the route (no map tiles) for lists. */
function routeThumb(points: [number, number, number][]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'wo-thumb'); svg.setAttribute('aria-hidden', 'true');
  if (points.length > 1) {
    const lats = points.map((p) => p[0]), lngs = points.map((p) => p[1]);
    const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
    const span = Math.max(b - a, d - c) || 1;
    const path = points.map((p, i) => `${i ? 'L' : 'M'}${(10 + ((p[1] - c) / span) * 80).toFixed(1)},${(90 - ((p[0] - a) / span) * 80).toFixed(1)}`).join('');
    const el = document.createElementNS(NS, 'path'); el.setAttribute('d', path); svg.append(el);
  }
  return svg;
}

/** Connect a smart watch through Strava, or import new activities. */
async function watchSheet() {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('בודק…')));
  openSheet(t('שעון חכם'), body);
  try {
    const st = await call<{ configured: boolean; connected: boolean; athlete: string }>('stravaStatus');
    const intro = h('p', null, t('מחברים את Strava, והאימונים מהשעון (Garmin, Apple Watch, Polar, Coros, Suunto ועוד) נכנסים לאפליקציה עם המרחק, הזמן והמסלול.'));
    if (!st.configured) {
      body.replaceChildren(intro, h('p', { class: 'hint' }, isAdmin()
        ? t('כדי להפעיל: צור אפליקציית API ב-strava.com/settings/api עם Authorization Callback Domain = script.google.com, והוסף ב-Apps Script את המאפיינים STRAVA_CLIENT_ID ו-STRAVA_CLIENT_SECRET.')
        : t('החיבור לשעונים עוד לא הופעל באפליקציה. אפשר לבקש מהמנהל דרך "פנייה למנהל".')));
      return;
    }
    if (!st.connected) {
      body.replaceChildren(intro, h('button', { class: 'btn btn-primary strava-btn', type: 'button', onclick: async () => {
        try { const { url } = await call<{ url: string }>('stravaAuthUrl'); track('strava:connect'); location.href = url; } catch (e: any) { toast(e.message); }
      } }, t('התחבר עם Strava')));
      return;
    }
    const sync = h('button', { class: 'btn btn-primary', type: 'button' }, '⟳ ', t('ייבא אימונים חדשים')) as HTMLButtonElement;
    sync.addEventListener('click', async () => {
      sync.disabled = true;
      try {
        const last = listWorkouts().filter((w) => w.source === 'strava').reduce((m, w) => Math.max(m, w.start), 0);
        const { activities } = await call<{ activities: StravaActivity[] }>('stravaImport', { after: last ? last + 1000 : 0 });
        const n = saveImported(activities);
        toast(n ? tr`יובאו ${n} אימונים` : t('אין אימונים חדשים'));
        track('strava:import');
      } catch (e: any) { toast(e.message); }
      sync.disabled = false;
    });
    body.replaceChildren(h('p', null, '✓ ', tr`מחובר ל-Strava${st.athlete ? ' (' + st.athlete.trim() + ')' : ''}`), sync,
      confirmButton(t('נתק את Strava'), t('הקש שוב לניתוק'), async () => { await call('stravaDisconnect'); toast(t('נותק')); }, 'btn btn-danger'));
  } catch (e: any) {
    body.replaceChildren(h('p', { class: 'form-error' }, /לא מוכרת|Unknown action/.test(e.message) ? t('השרת עוד לא עודכן. נסו שוב בעוד כמה דקות.') : e.message));
  }
}

/** "Recorded workouts" card for the Progress screen. */
export function workoutsCard(): HTMLElement {
  const list = listWorkouts();
  const totalKm = list.reduce((s, w) => s + w.distanceM, 0) / 1000;
  return h('section', { class: 'card' },
    h('div', { class: 'tracker-head' },
      h('h2', { class: 'card-title' }, t('אימונים מתועדים')),
      h('div', { class: 'wo-head-btns' },
        h('button', { class: 'btn', type: 'button', onclick: watchSheet }, '⌚ ', t('שעון חכם')),
        h('a', { class: 'btn btn-primary', href: HASH.workout() }, '▶ ', t('אימון חדש'))),
    ),
    list.length ? h('p', { class: 'muted small' }, tr`${list.length} אימונים · ${totalKm.toFixed(1)} ק"מ בסך הכל`) : h('p', { class: 'hint' }, t('מתחילים אימון, והטלפון מודד מרחק, זמן, קצב ומסלול על המפה.')),
    h('div', { class: 'wo-list' }, list.slice(0, 12).map((w) => {
      const ty = WORKOUT_TYPES[w.type];
      return h('a', { class: 'wo-item', href: HASH.workout(w.id) },
        routeThumb(w.points),
        h('div', { class: 'wo-item-main' },
          h('strong', null, `${ty.icon} ${w.name || t(ty.name)}`),
          h('span', { class: 'muted small' }, `${formatShort(new Date(w.start).toISOString().slice(0, 10))} · ${fmtKm(w.distanceM)} ${t('ק"מ')} · ${fmtDuration(w.durationS)}`)),
        h('span', { class: 'wo-pace' }, paceOrSpeed(w.type, w.distanceM, w.durationS).value));
    })),
  );
}

function statTiles(type: WorkoutType, distanceM: number, durationS: number): HTMLElement {
  const ps = paceOrSpeed(type, distanceM, durationS);
  const steps = estSteps(type, distanceM);
  return h('div', { class: 'wo-stats' },
    h('div', { class: 'wo-stat big' }, h('b', null, fmtDuration(durationS)), h('span', null, t('זמן'))),
    h('div', { class: 'wo-stat big' }, h('b', null, fmtKm(distanceM)), h('span', null, t('ק"מ'))),
    h('div', { class: 'wo-stat' }, h('b', null, ps.value), h('span', null, ps.label)),
    steps ? h('div', { class: 'wo-stat' }, h('b', null, steps.toLocaleString('en-US')), h('span', null, t('צעדים (הערכה)'))) : '',
  );
}

function renderDetail(root: HTMLElement, w: Workout) {
  const ty = WORKOUT_TYPES[w.type];
  const m = mapBox(w.points);
  // splits per km
  const splits: number[] = [];
  let acc = 0, lastT = 0;
  for (let i = 1; i < w.points.length; i++) {
    acc += haversine([w.points[i - 1][0], w.points[i - 1][1]], [w.points[i][0], w.points[i][1]]);
    if (acc >= 1000 * (splits.length + 1)) { splits.push(w.points[i][2] - lastT); lastT = w.points[i][2]; }
  }
  root.replaceChildren(
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, `${ty.icon} ${w.name || t(ty.name)}`),
      h('p', { class: 'muted small' }, new Date(w.start).toLocaleString(), w.source === 'strava' ? ' · Strava' : ''),
      m.el,
      statTiles(w.type, w.distanceM, w.durationS),
      splits.length && w.type !== 'bike' ? h('div', null, h('h3', { class: 'section-title' }, t('לפי קילומטר')),
        h('div', { class: 'wo-splits' }, splits.map((s, i) => h('div', { class: 'wo-split' }, h('span', null, tr`ק"מ ${i + 1}`), h('b', null, fmtDuration(s)))))) : '',
      hasBackend() ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => openStoryComposer(workoutStory(w)) }, icon('story'), ' ', t('שיתוף כסטורי')) : '',
      confirmButton(t('מחק אימון'), t('הקש שוב למחיקה'), () => { deleteWorkout(w.id); navigate(HASH.stats); toast(t('האימון נמחק')); }, 'btn btn-danger'),
    ),
  );
}

interface Session { type: WorkoutType; start: number; points: [number, number, number][]; distanceM: number; movingS: number; paused: boolean; lastT: number }
const SESSION_KEY = 'mishmaat-workout-session';

/** The recorder: GPS distance, time, pace and route, live on a map. */
function renderRecorder(root: HTMLElement) {
  let s: Session | null = null;
  try { s = JSON.parse(localStorage.getItem(SESSION_KEY) || 'null'); } catch { /* ignore */ }
  let type: WorkoutType = s?.type ?? 'run';
  let watch: number | null = null, tick: ReturnType<typeof setInterval> | null = null, wake: any = null;
  const stats = h('div');
  const statusEl = h('p', { class: 'muted small', 'aria-live': 'polite' });
  const m = mapBox(s?.points ?? [], true);
  const controls = h('div', { class: 'wo-controls' });
  const types = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('סוג אימון') });
  const persist = () => { try { if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s)); else localStorage.removeItem(SESSION_KEY); } catch { /* ignore */ } };
  const draw = () => {
    stats.replaceChildren(statTiles(type, s?.distanceM ?? 0, s?.movingS ?? 0));
    types.replaceChildren(...(Object.keys(WORKOUT_TYPES) as WorkoutType[]).map((k) => h('button', {
      class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(k === type), disabled: !!s,
      onclick: () => { type = k; draw(); } }, `${WORKOUT_TYPES[k].icon} ${t(WORKOUT_TYPES[k].name)}`)));
    controls.replaceChildren(...(!s
      ? [h('button', { class: 'btn btn-primary wo-go', type: 'button', onclick: start }, '▶ ', t('התחל'))]
      : [
          s.paused ? h('button', { class: 'btn btn-primary', type: 'button', onclick: resume }, '▶ ', t('המשך'))
            : h('button', { class: 'btn', type: 'button', onclick: pause }, '⏸ ', t('השהה')),
          confirmButton('■ ' + t('סיים ושמור'), t('הקש שוב לשמירה'), finish, 'btn btn-buy'),
          confirmButton(t('בטל'), t('הקש שוב: האימון לא יישמר'), discard, 'btn btn-danger'),
        ]));
  };
  const onPos = (pos: GeolocationPosition) => {
    if (!s || s.paused) return;
    const { latitude: lat, longitude: lng, accuracy } = pos.coords;
    if (accuracy > 35) { statusEl.textContent = tr`מחפש GPS מדויק… (דיוק ${Math.round(accuracy)} מ')`; return; }
    statusEl.textContent = t('GPS פעיל');
    const sec = (Date.now() - s.start) / 1000;
    const last = s.points[s.points.length - 1];
    if (last) {
      const d = haversine([last[0], last[1]], [lat, lng]);
      const dt = Math.max(1, sec - last[2]);
      if (d < 3) return; // standing still / jitter
      if (d / dt > (type === 'bike' ? 25 : 12)) return; // impossible jump
      s.distanceM += d;
    }
    s.points.push([+lat.toFixed(6), +lng.toFixed(6), Math.round(sec)]);
    m.update(s.points);
    persist();
  };
  const startGps = async () => {
    if (!('geolocation' in navigator)) { toast(t('המכשיר לא תומך ב-GPS')); return; }
    watch = navigator.geolocation.watchPosition(onPos, (e) => { statusEl.textContent = e.code === 1 ? t('צריך לאשר גישה למיקום') : t('אין קליטת GPS כרגע'); }, { enableHighAccuracy: true, maximumAge: 0, timeout: 20000 });
    tick = setInterval(() => { if (s && !s.paused) { const now = Date.now(); s.movingS += (now - s.lastT) / 1000; s.lastT = now; draw(); } }, 1000);
    try { wake = await (navigator as any).wakeLock?.request('screen'); } catch { /* not supported */ }
  };
  const stopGps = () => {
    if (watch !== null) navigator.geolocation.clearWatch(watch);
    if (tick) clearInterval(tick);
    watch = null; tick = null;
    try { wake?.release(); } catch { /* ignore */ }
  };
  function start() { s = { type, start: Date.now(), points: [], distanceM: 0, movingS: 0, paused: false, lastT: Date.now() }; persist(); startGps(); draw(); navigator.vibrate?.(30); track('workout:start'); }
  function pause() { if (!s) return; s.paused = true; persist(); draw(); }
  function resume() { if (!s) return; s.paused = false; s.lastT = Date.now(); persist(); draw(); }
  function discard() { stopGps(); s = null; persist(); draw(); }
  function finish() {
    if (!s) return;
    stopGps();
    if (s.distanceM < 50 && s.movingS < 60) { toast(t('האימון קצר מדי לשמירה')); s = null; persist(); draw(); return; }
    const w: Workout = { id: Math.random().toString(36).slice(2, 10), type: s.type, start: s.start, durationS: Math.round(s.movingS), distanceM: Math.round(s.distanceM), points: simplify(s.points), source: 'gps' };
    saveWorkout(w);
    const marked = markSportFromWorkout(w);
    s = null; persist();
    track('workout:save');
    celebrate('badge', t('אימון נשמר'), `${fmtKm(w.distanceM)} ${t('ק"מ')} · ${fmtDuration(w.durationS)}${marked ? ' · ' + t('סומן בטבלה') : ''}`, { icon: WORKOUT_TYPES[w.type].icon });
    navigate(HASH.workout(w.id));
  }
  draw();
  if (s) { statusEl.textContent = t('ממשיכים את האימון שהתחלת'); if (!s.paused) s.lastT = Date.now(); startGps(); }
  // stop GPS when leaving the screen (the session stays saved and continues when you return)
  const stopOnLeave = () => { if (!root.contains(stats)) { stopGps(); removeEventListener('hashchange', stopOnLeave); } };
  addEventListener('hashchange', () => setTimeout(stopOnLeave, 0));
  root.replaceChildren(
    h('section', { class: 'card stack wo-recorder' },
      h('h2', { class: 'card-title' }, t('אימון חדש')),
      types, m.el, stats, statusEl, controls, miniPlayer(),
      h('p', { class: 'hint' }, t('השאירו את האפליקציה פתוחה בזמן האימון: הדפדפן לא מודד מיקום כשהמסך כבוי. הצעדים הם הערכה לפי המרחק.')),
    ),
  );
}

export function renderWorkout(root: HTMLElement, id?: string): void {
  if (!id) return renderRecorder(root);
  const w = getWorkout(id);
  if (!w) { root.replaceChildren(h('section', { class: 'card' }, h('p', null, t('האימון לא נמצא')))); return; }
  renderDetail(root, w);
}
