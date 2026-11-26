/**
 * The assistant occasionally starts the conversation: short, personal notes built on the device
 * from the user's own data (no AI call, no cost). At most two a day, in different parts of the day.
 * Unread notes show as a red count on the floating assistant button.
 */
import { kvGet, kvSet } from './db';
import { currentUser } from './session';
import { allWeeks, getWeek } from './store';
import { addDays, dayIndex, sundayOf, todayISO } from './dates';
import { lunchStreak, workoutsInWeek, workoutWeekStreak } from './stats';
import { getRewards } from './rewards';
import { t, tr } from './i18n';

interface NudgeState { day: string; sent: string[]; unread: number }
const NOTE_EVENT = 'mishmaat:assistant-note';
const listeners = new Set<() => void>();
export const onNudgeUnread = (fn: () => void) => { listeners.add(fn); return () => listeners.delete(fn); };

const stateKey = () => 'nudges:' + (currentUser()?.userId ?? '');
function load(): NudgeState {
  try { return JSON.parse(localStorage.getItem(stateKey()) || '') as NudgeState; } catch { return { day: '', sent: [], unread: 0 }; }
}
function save(s: NudgeState) { try { localStorage.setItem(stateKey(), JSON.stringify(s)); } catch { /* ignore */ } listeners.forEach((l) => l()); }

export const nudgeUnread = () => (currentUser() ? load().unread || 0 : 0);
export function markNudgesRead() { const s = load(); if (s.unread) { s.unread = 0; save(s); } }

/** Deliver a note into the assistant chat (live panel if open, else the saved history). */
async function deliver(text: string) {
  const key = `chat:${currentUser()!.userId}:me:`;
  const ev = new CustomEvent(NOTE_EVENT, { detail: { key, text, handled: false } });
  window.dispatchEvent(ev);
  if (ev.detail.handled) return;
  const msgs = (await kvGet<{ role: string; content: string }[]>(key).catch(() => null)) ?? [];
  msgs.push({ role: 'assistant', content: text });
  await kvSet(key, msgs.slice(-40)).catch(() => {});
}
export const NOTE_EVENT_NAME = NOTE_EVENT;

/** Pick a note for this part of the day, from the user's own data. */
function compose(slot: 'morning' | 'noon' | 'evening' | 'week'): string | null {
  const u = currentUser();
  const name = u?.name?.split(' ')[0] ?? '';
  const today = todayISO();
  const w = getWeek(sundayOf(today));
  const d = w.days[dayIndex(today)];
  const weeks = allWeeks();
  if (slot === 'week') {
    const wo = workoutsInWeek(w);
    const full = w.days.filter((x) => x.breakfast && x.lunch && x.dinner && x.sport.status).length;
    return tr`סיכום שבוע, ${name}: ${wo} אימונים ו-${full} ימים מלאים. מחר מתחיל שבוע חדש, אל תשכח/י להזין משקל התחלתי.`;
  }
  if (slot === 'morning') {
    const ls = lunchStreak(weeks, today);
    if (ls.current >= 3) return tr`בוקר טוב ${name}! ${ls.current} ימים ברצף של צהריים בריא. בוא/י נשמור על זה גם היום.`;
    const r = getRewards();
    if (r && r.level.to - r.lifetime <= 150) return tr`בוקר טוב ${name}! נשארו רק ${r.level.to - r.lifetime} מטבעות לרמה הבאה. יום מלא היום יקרב אותך.`;
    return tr`בוקר טוב ${name}! מה בתוכנית היום? אפשר לכתוב לי "תסמן לי בוקר V" ואסמן בשבילך.`;
  }
  if (slot === 'noon') {
    if (!d.breakfast && !d.lunch) return tr`היי ${name}, עוד לא סימנת ארוחות היום. איך היה הבוקר והצהריים?`;
    if (!d.lunch) return tr`${name}, איך היה הצהריים? סימון אחד ואת/ה בדרך ליום מלא.`;
    return null;
  }
  // evening
  if (!d.sport.status) {
    const ws = workoutWeekStreak(weeks, today);
    const wo = workoutsInWeek(w);
    if (wo < 3 && dayIndex(today) >= 3) return tr`${name}, השבוע ${wo} אימונים עד עכשיו. עוד ${3 - wo} כדי לשמור על רצף של ${Math.max(ws.current, 1)} שבועות. אולי הליכה קצרה הערב?`;
    return tr`ערב טוב ${name}! היה אימון היום? אם כן, סמן/י אותו בספורט.`;
  }
  if (d.breakfast && d.lunch && d.dinner) return tr`יום מלא, ${name}! כל הכבוד. מחר ממשיכים 💪`;
  if (!d.dinner) return tr`${name}, נשאר לסמן ארוחת ערב כדי לסגור את היום.`;
  return null;
}

let lastCheck = 0;
/** Called on app activity; sends at most one note per part of the day, two per day. */
export async function checkNudges(): Promise<void> {
  const u = currentUser();
  if (!u || !u.profile?.completed || Date.now() - lastCheck < 5 * 60_000) return;
  lastCheck = Date.now();
  const s = load();
  const today = todayISO();
  if (s.day !== today) { s.day = today; s.sent = []; }
  if (s.sent.length >= 2) return;
  const h = new Date().getHours();
  const isSat = new Date().getDay() === 6;
  const slot = isSat && h >= 19 ? 'week' : h >= 7 && h < 11 ? 'morning' : h >= 13 && h < 17 ? 'noon' : h >= 19 && h < 23 ? 'evening' : null;
  if (!slot || s.sent.includes(slot)) return;
  const text = compose(slot);
  s.sent.push(slot);
  if (!text) { save(s); return; }
  await deliver(text);
  s.unread = (s.unread || 0) + 1;
  save(s);
  void addDays; void t;
}
