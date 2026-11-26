/**
 * Now and then the assistant's character pops out of its round button with a short line:
 * a reminder, an insight from your data, "a good time for a run", or a bit of motivation.
 * Tap the bubble to continue in the chat. At most a few times a day; off in Settings.
 */
import { t, tr } from '../i18n';
import { currentUser } from '../session';
import { allWeeks, getSettings, getWeek } from '../store';
import { dayIndex, sundayOf, todayISO } from '../dates';
import { allMealsRatio, datedDays, lunchStreak, weightPoints, workoutsInWeek } from '../stats';
import { listWorkouts } from '../workouts';
import { mascot } from './mascot';
import { myMeetups } from './feedView';
import { openAssistant } from './floatingChat';
import { NOTE_EVENT_NAME } from '../nudges';

const QUOTES = ['כל יום מלא הוא ניצחון קטן', 'לא צריך להיות מושלם, רק עקבי', 'האימון הכי טוב הוא זה שקורה', 'קטן ועקבי מנצח גדול ופעם אחת',
  'ההרגל של היום הוא התוצאה של מחר', 'צעד אחד בכל פעם', 'הגוף משיג מה שהראש מאמין', 'אין קיצורי דרך לקו הסיום'];
const MAX_PER_DAY = 4;
const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');

let weather: { at: number; temp: number; rain: number } | null = null;
/** Current weather where you usually work out (from your last GPS workout). No location prompt. */
async function getWeather(): Promise<typeof weather> {
  if (weather && Date.now() - weather.at < 30 * 60000) return weather;
  const last = listWorkouts().find((w) => w.points.length);
  if (!last) return null;
  const [lat, lng] = last.points[0];
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat.toFixed(2)}&longitude=${lng.toFixed(2)}&current=temperature_2m,precipitation&hourly=precipitation_probability&forecast_hours=2&timezone=auto`);
    const j = await r.json();
    weather = { at: Date.now(), temp: Math.round(j.current.temperature_2m), rain: Math.max(...(j.hourly?.precipitation_probability ?? [0])) };
    return weather;
  } catch { return null; }
}

/** The hours you usually start workouts (from recorded workouts), or common ones. */
function usualHours(): number[] {
  const hrs = listWorkouts().slice(0, 20).map((w) => new Date(w.start).getHours());
  if (hrs.length < 3) return [6, 7, 8, 17, 18, 19];
  const count: Record<number, number> = {};
  hrs.forEach((x) => { count[x] = (count[x] ?? 0) + 1; });
  return Object.keys(count).map(Number).sort((a, b) => count[b] - count[a]).slice(0, 3).flatMap((x) => [x - 1, x]);
}

async function compose(): Promise<string> {
  const name = currentUser()?.name?.split(' ')[0] ?? '';
  const today = todayISO();
  const w = getWeek(sundayOf(today));
  const d = w.days[dayIndex(today)];
  const weeks = allWeeks();
  const hr = new Date().getHours();
  // 1. a meetup soon
  const soon = myMeetups().find((m) => { const ms = Date.parse(m.when) - Date.now(); return ms > 0 && ms < 4 * 3600000; });
  if (soon) return tr`בעוד ${Math.max(1, Math.round((Date.parse(soon.when) - Date.now()) / 3600000))} שעות: ${soon.title}${soon.location ? ' ב' + soon.location : ''}. נתראה שם!`;
  // 2. a good time to work out
  if (!d.sport.status && usualHours().includes(hr)) {
    const wx = await getWeather();
    if (wx && wx.temp >= 8 && wx.temp <= 29 && wx.rain < 30) return tr`עכשיו ${wx.temp}° ובלי גשם בשעה הקרובה. זמן מצוין לצאת לריצה, ${name}!`;
    if (wx && wx.rain >= 50) return tr`צפוי גשם בשעה הקרובה. אולי אימון בבית היום? גם 20 דקות נחשבות.`;
    return tr`בשעה הזו את/ה בדרך כלל מתאמן/ת. יוצאים?`;
  }
  // 3. insights from the data
  const tips: string[] = [];
  const ls = lunchStreak(weeks, today);
  if (ls.current >= 3) tips.push(tr`${ls.current} ימים ברצף של צהריים בריא. עוד יום ושוברים שיא?`);
  const wo = workoutsInWeek(w);
  if (wo < 3 && dayIndex(today) >= 2) tips.push(tr`השבוע ${wo} אימונים. עוד ${3 - wo} ושמרת על היעד השבועי.`);
  const pts = weightPoints(weeks).slice(-5);
  if (pts.length >= 3 && pts[pts.length - 1].weight < pts[0].weight) tips.push(tr`ירדת ${(pts[0].weight - pts[pts.length - 1].weight).toFixed(1)} ק"ג בשבועות האחרונים. המגמה בכיוון הנכון!`);
  const days = datedDays(weeks, today);
  const byDow = [0, 0, 0, 0, 0, 0, 0];
  days.forEach((x) => { if (x.day.sport.status === 'V' && x.day.sport.countsAsWorkout) byDow[dayIndex(x.date)]++; });
  const best = byDow.indexOf(Math.max(...byDow));
  if (Math.max(...byDow) >= 4) tips.push(tr`יום ${t(['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'][best])} הוא היום שבו את/ה הכי מתאמן/ת.`);
  const m30 = allMealsRatio(days.slice(-30).map((x) => x.day)).pct;
  if (m30 !== null && m30 >= 75) tips.push(tr`${Math.round(m30)}% ארוחות בריאות בחודש האחרון. מרשים!`);
  if (!d.lunch && hr >= 14 && hr < 17) tips.push(t('איך היה הצהריים? סימון אחד ואת/ה קרוב/ה ליום מלא.'));
  if (tips.length && Math.random() < 0.75) return tips[Math.floor(Math.random() * tips.length)];
  // 4. motivation
  return t(QUOTES[Math.floor(Math.random() * QUOTES.length)]);
}

let timer: ReturnType<typeof setTimeout> | undefined;
let showing = false;

function countToday(add = false): number {
  const key = 'peeks:' + todayISO();
  let n = 0;
  try { n = Number(localStorage.getItem(key)) || 0; if (add) localStorage.setItem(key, String(++n)); } catch { /* ignore */ }
  return n;
}

async function peek() {
  const fab = document.querySelector<HTMLElement>('.fab');
  const busy = document.querySelector('.backdrop, .cel-layer, .tour-layer, .fab-panel:not([hidden])');
  if (!fab || fab.hidden || busy || document.visibilityState !== 'visible' || showing || getSettings().peeks === false || !currentUser()?.profile?.completed) return schedule();
  if (countToday() >= MAX_PER_DAY) return;
  const text = await compose();
  showing = true;
  countToday(true);
  const r = fab.getBoundingClientRect();
  const onLeft = r.left + r.width / 2 < innerWidth / 2;
  const layer = document.createElement('div');
  layer.className = 'peek' + (onLeft ? ' peek-left' : ' peek-right') + (reduced() ? ' still' : '');
  layer.style.setProperty('--fx', r.left + r.width / 2 + 'px');
  layer.style.setProperty('--fy', r.top + r.height / 2 + 'px');
  const char = mascot(70, 'mascot-wave peek-char');
  const bubble = document.createElement('button');
  bubble.className = 'peek-bubble';
  bubble.type = 'button';
  bubble.textContent = text;
  bubble.setAttribute('aria-label', tr`העוזר אומר: ${text}. לחצו כדי להמשיך בשיחה`);
  const close = document.createElement('button');
  close.className = 'peek-close'; close.type = 'button'; close.textContent = '✕'; close.setAttribute('aria-label', t('סגור'));
  const live = document.createElement('span'); live.className = 'sr-only'; live.setAttribute('aria-live', 'polite'); live.textContent = text;
  const sparks = document.createElement('span'); sparks.className = 'peek-sparks'; sparks.setAttribute('aria-hidden', 'true');
  for (let i = 0; i < 6; i++) sparks.append(Object.assign(document.createElement('i'), { style: `--a:${i * 60}deg` }));
  layer.append(sparks, char, bubble, close, live);
  document.body.append(layer);
  fab.classList.add('peeking');
  navigator.vibrate?.(10);
  let done = false;
  const end = () => {
    if (done) return; done = true;
    layer.classList.add('peek-out');
    setTimeout(() => { layer.remove(); fab.classList.remove('peeking'); showing = false; schedule(); }, reduced() ? 0 : 380);
  };
  bubble.addEventListener('click', () => {
    const key = `chat:${currentUser()!.userId}:me:`;
    window.dispatchEvent(new CustomEvent(NOTE_EVENT_NAME, { detail: { key, text, handled: false } }));
    end(); openAssistant('ai');
  });
  close.addEventListener('click', end);
  setTimeout(end, 8000);
}

function schedule(first = false) {
  clearTimeout(timer);
  const min = first ? 2.5 : 7, max = first ? 4 : 12; // minutes
  timer = setTimeout(peek, (min + Math.random() * (max - min)) * 60000);
}

export function initPeeks(): void { schedule(true); }
/** For testing / a "show me" button. */
export const peekNow = () => peek();
