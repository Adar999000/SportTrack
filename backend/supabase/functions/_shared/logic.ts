/**
 * Pure business rules ported 1:1 from apps-script/server.js (no database, no Deno APIs).
 * Shared by the Edge Functions and imported by the vitest suite (tests/supabase-logic.test.ts),
 * which runs the same scenarios through the Apps Script server and compares the results.
 * Keep this file free of imports so both Deno and Node/Vite can load it.
 */

// ------------------------------------------------------------------ constants (server.js)

export const MIN_PASSWORD = 8;
export const LOGIN_MAX_FAILS = 5;
export const LOCK_MINUTES = 15;
export const RESET_MINUTES = 15;
export const RESET_MAX_TRIES = 5;
export const HASH_ROUNDS = 1000;
export const HASH_ROUNDS_V2 = 5000;
export const INVITES_PER_USER = 5;
export const WELCOME_CAP = 500;
export const QUEST_PRIZE = 100;
export const LEAGUE_SIZE = 15;
export const LEAGUE_TIERS = ['יהלום', 'פלטינה', 'זהב', 'כסף', 'ארד'];
export const STORY_MS = 24 * 3600 * 1000;
export const TEAM_ID = 'team';
export const TEAM_NAME = 'צוות משמעת אישית';
export const GOAL_IDS = ['lose', 'muscle', 'fit', 'eat', 'habit', 'smoke', 'sleep', 'race', 'stress', 'friends'];
export const EVENT_TYPES = ['run', 'crossfit', 'triathlon', 'cycling', 'swim', 'other'];
export const POST_KINDS = ['text', 'achievement', 'tracker', 'event', 'meetup', 'story'];

export const LEVELS: [number, string][] = [
  [0, 'מתחיל'], [100, 'מתמיד'], [300, 'ממושמע'], [600, 'לוחם'], [1000, 'אלוף השכונה'],
  [1600, 'מכונה'], [2500, 'ברזל'], [3600, 'פלדה'], [5000, 'טיטניום'], [7000, 'יהלום'],
  [10000, 'אגדה'], [14000, 'מאסטר'], [19000, 'גראנד מאסטר'], [25000, 'אגדה חיה'], [32000, 'משמעת אישית'],
];
export const STAR_EVERY = 10000;
export const COSTS = { freezeDay: 50, freezeWeek: 100, chat10: 30, color: 150 };

export const CATALOG: Record<string, Record<string, number>> = {
  color: { gold: 150, teal: 150, crimson: 150, indigo: 200, coral: 200, olive: 200, plum: 200, sky: 200, emerald: 220, graphite: 240, ruby: 260 },
  bg: { sand: 200, ocean: 200, forest: 200, rose: 200, mint: 200, lavender: 200, sunrise: 240, midnight: 300, carbon: 300, aurora: 380 },
  frame: { silver: 120, goldframe: 250, neon: 280, fire: 300, ice: 300, rainbow: 350, laurel: 380, diamond: 400, champion: 450, legend: 600 },
  effect: { confetti: 200, stars: 220, fireworks: 300 },
  skin: { bubbly: 300, feminine: 300, stadium: 350, anime: 400, retro: 400, neon: 450, leopard: 500, athletic: 350, premium: 600, luxe: 800 },
  mascot: { cat: 120, frog: 120, rabbit: 120, hamster: 120, tiger: 150, fox: 150, bear: 150, horse: 160, koala: 180, monkey: 180, penguin: 180, polarbear: 180,
    owl: 200, octopus: 200, runner: 200, biker: 220, swimmer: 220, yogi: 220, lifter: 250, climber: 260, surfer: 260, unicorn: 300, gorilla: 300, wolf: 320,
    shark: 350, eagle: 380, dragon: 400, ninja: 450 },
  acc: { mint: 120, ocean: 120, sunset: 150, gold: 200, neon: 220, ice: 240, galaxy: 250, flames: 250, lava: 280, rainbow: 300, aurora: 320, cosmic: 400,
    heart: 100, shoe: 100, ball: 100, basket: 100, fire: 120, biceps: 120, glove: 140, partyhat: 150, star: 150, medal2: 150, sports: 160, medal: 180, bolt: 180,
    rocket: 200, '100': 220, trophy: 250, gem: 300, crown: 400 },
};

export const ITEM_LEVEL: Record<string, number> = {
  'skin:bubbly': 2, 'skin:feminine': 2, 'skin:stadium': 3, 'skin:anime': 4, 'skin:retro': 5, 'skin:neon': 6, 'skin:leopard': 7, 'skin:athletic': 3, 'skin:premium': 8, 'skin:luxe': 10,
  'color:emerald': 3, 'color:graphite': 4, 'color:ruby': 6,
  'bg:sunrise': 3, 'bg:carbon': 5, 'bg:aurora': 9,
  'frame:neon': 4, 'frame:ice': 5, 'frame:diamond': 7, 'frame:laurel': 8, 'frame:champion': 10, 'frame:legend': 13,
  'effect:stars': 3, 'effect:fireworks': 6,
  'mascot:climber': 3, 'mascot:surfer': 3, 'mascot:gorilla': 4, 'mascot:unicorn': 5, 'mascot:wolf': 5, 'mascot:shark': 6, 'mascot:eagle': 7,
  'mascot:dragon': 8, 'mascot:ninja': 9,
  'acc:galaxy': 4, 'acc:neon': 4, 'acc:ice': 5, 'acc:flames': 5, 'acc:rainbow': 6, 'acc:lava': 7, 'acc:aurora': 9, 'acc:cosmic': 11,
  'acc:rocket': 3, 'acc:100': 4, 'acc:trophy': 6, 'acc:gem': 8, 'acc:crown': 10,
};

interface Perk { level: number; chatBonus?: number; discount?: number; free?: string[]; freeAll?: boolean; text: string }
export const LEVEL_PERKS: Perk[] = [
  { level: 2, chatBonus: 5, text: '+5 הודעות ביום לעוזר' },
  { level: 3, free: ['frame:silver', 'acc:mint'], text: 'מסגרת פרופיל כסופה והילת מנטה לעוזר בחינם' },
  { level: 4, chatBonus: 5, text: '+5 הודעות ביום לעוזר (סה"כ +10)' },
  { level: 5, free: ['color:gold'], text: 'צבע זהב בחינם' },
  { level: 6, discount: 10, text: '10% הנחה בחנות' },
  { level: 7, free: ['frame:goldframe'], text: 'מסגרת זהב בחינם' },
  { level: 8, chatBonus: 10, text: '+10 הודעות ביום לעוזר (סה"כ +20)' },
  { level: 9, discount: 20, text: '20% הנחה בחנות' },
  { level: 10, free: ['bg:midnight'], text: 'רקע חצות בחינם' },
  { level: 11, free: ['frame:diamond'], text: 'מסגרת יהלום בחינם' },
  { level: 12, discount: 30, text: '30% הנחה בחנות' },
  { level: 13, free: Object.keys(CATALOG.color).map((c) => 'color:' + c), text: 'כל הצבעים בחינם' },
  { level: 14, chatBonus: 30, text: '+30 הודעות ביום לעוזר (סה"כ +50)' },
  { level: 15, freeAll: true, text: 'כל הפריטים בחנות בחינם ותג היכל התהילה' },
];

// ------------------------------------------------------------------ small helpers

export function parseJSON<T>(s: unknown, fallback: T): T {
  if (s && typeof s === 'object') return s as T; // jsonb columns arrive parsed
  try { return s ? JSON.parse(String(s)) : fallback; } catch { return fallback; }
}

export const normEmail = (e: unknown) => String(e ?? '').trim().toLowerCase();
export const validEmail = (e: string) => /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(e) && e.length <= 120;

export function passwordProblem(p: unknown): string {
  const s = String(p ?? '');
  if (s.length < MIN_PASSWORD) return 'הסיסמה צריכה להיות לפחות ' + MIN_PASSWORD + ' תווים';
  if (/^(.)\1+$/.test(s) || /^(12345678|123456789|1234567890|password|qwertyui|11111111)$/i.test(s)) return 'הסיסמה קלה מדי לניחוש. בחרו סיסמה אחרת.';
  return '';
}

export function safeEqual(a: unknown, b: unknown): boolean {
  const x = String(a), y = String(b);
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x.charCodeAt(i) || 0) ^ (y.charCodeAt(i) || 0);
  return diff === 0;
}

const b64url = (bytes: Uint8Array) => {
  let s = '';
  bytes.forEach((b) => (s += String.fromCharCode(b)));
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

/** The Sheet's password hash: SHA-256(salt:password), then `rounds` × SHA-256(h ‖ salt). Used to accept legacy passwords once. */
export async function legacyHash(password: string, salt: string, rounds = HASH_ROUNDS): Promise<string> {
  const enc = new TextEncoder();
  const saltBytes = enc.encode(salt);
  let h = new Uint8Array(await crypto.subtle.digest('SHA-256', enc.encode(salt + ':' + password)));
  for (let i = 0; i < rounds; i++) {
    const buf = new Uint8Array(h.length + saltBytes.length);
    buf.set(h); buf.set(saltBytes, h.length);
    h = new Uint8Array(await crypto.subtle.digest('SHA-256', buf));
  }
  return b64url(h);
}

/** 'v2' | 'legacy' | '' - same as checkPassword() in server.js, for a stored Sheet hash. */
export async function checkLegacyPassword(stored: string, salt: string, password: string): Promise<'v2' | 'legacy' | ''> {
  if (stored.startsWith('v2$')) return safeEqual(stored, 'v2$' + await legacyHash(password, salt, HASH_ROUNDS_V2)) ? 'v2' : '';
  return safeEqual(stored, await legacyHash(password, salt, HASH_ROUNDS)) ? 'legacy' : '';
}

/** A 6-digit code (crypto random, unlike the Sheet version). */
export function sixDigits(): string {
  const a = new Uint32Array(1);
  crypto.getRandomValues(a);
  return String(a[0] % 1_000_000).padStart(6, '0');
}

export const maskEmail = (email: string) => email.replace(/^(.).*(@.*)$/, '$1***$2');

// ------------------------------------------------------------------ dates (Asia/Jerusalem days, ISO strings)

export function todayStr(now: Date = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}
export function addDaysStr(iso: string, n: number): string {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2] + n)).toISOString().slice(0, 10);
}
export function dowStr(iso: string): number {
  const p = iso.split('-').map(Number);
  return new Date(Date.UTC(p[0], p[1] - 1, p[2])).getUTCDay();
}
export const sundayStr = (iso: string) => addDaysStr(iso, -dowStr(iso));

// ------------------------------------------------------------------ levels, perks, prices

export interface Level { n: number; name: string; from: number; to: number }
export function levelFor(lifetime: number): Level {
  let i = 0;
  while (i + 1 < LEVELS.length && lifetime >= LEVELS[i + 1][0]) i++;
  if (i === LEVELS.length - 1) {
    const extra = Math.floor((lifetime - LEVELS[i][0]) / STAR_EVERY);
    const base = LEVELS[i][0] + extra * STAR_EVERY;
    return { n: i + 1 + extra, name: LEVELS[i][1] + (extra ? ' ★' + extra : ''), from: base, to: base + STAR_EVERY };
  }
  return { n: i + 1, name: LEVELS[i][1], from: LEVELS[i][0], to: LEVELS[i + 1][0] };
}

export interface Perks { chatBonus: number; discount: number; free: Record<string, boolean>; freeAll: boolean }
export function perksFor(levelN: number): Perks {
  const p: Perks = { chatBonus: 0, discount: 0, free: {}, freeAll: false };
  LEVEL_PERKS.forEach((x) => {
    if (levelN < x.level) return;
    p.chatBonus += x.chatBonus || 0;
    if (x.discount) p.discount = Math.max(p.discount, x.discount);
    (x.free || []).forEach((k) => { p.free[k] = true; });
    if (x.freeAll) p.freeAll = true;
  });
  return p;
}

export function priceFor(kind: string, id: string, perks: Perks): number | null {
  const base = (CATALOG[kind] || {})[id];
  if (base === undefined) return null;
  if (perks.freeAll || perks.free[kind + ':' + id]) return 0;
  return Math.round(base * (100 - perks.discount) / 100);
}

// ------------------------------------------------------------------ days

export type Day = Record<string, any> | null | undefined;
export const isWorkout = (day: Day) => !!(day && day.sport && day.sport.status === 'V' && day.sport.countsAsWorkout);
export function isFullDay(day: Day): boolean {
  if (!day) return false;
  const t = day.text || {};
  const meal = (k: string) => !!(day[k] || t[k]);
  return meal('breakfast') && meal('lunch') && meal('dinner') && !!(day.sport && day.sport.status);
}

// ------------------------------------------------------------------ rewards (rewardsFor)

export interface RewardUser {
  id: string; createdAt: string; role: string; historyApproved: boolean; profile: Record<string, any>;
  invitedBy: string | null; frame: string; chatCredits: number;
}
export interface RewardWeek { sunday: string; data: any }
export interface LedgerEntry { at: string; amount: number; ref: string; label: string }
export interface Invitee { id: string; name: string; createdAt: string; weeks: RewardWeek[] }
export interface RewardsInput {
  user: RewardUser;
  weeks: RewardWeek[];          // the user's weeks
  ledger: LedgerEntry[];        // the user's ledger rows
  invitees: Invitee[];          // people who joined with the user's code (any order)
  rewardsStart: string;         // global launch date (settings.REWARDS_START)
  today?: string;
}

/** Everything about one user's coins, computed from their data (so the client can't fake it). */
export function rewardsFor(inp: RewardsInput) {
  const u = inp.user;
  const today = inp.today || todayStr();
  const created = String(u.createdAt || '').slice(0, 10);
  const startGlobal = inp.rewardsStart;
  const fullHistory = u.role === 'admin' || u.historyApproved === true;
  const start = fullHistory ? '2000-01-01' : (created > startGlobal ? created : startGlobal);

  const frozenDays: Record<string, boolean> = {}, frozenWeeks: Record<string, boolean> = {}, owned: Record<string, boolean> = {};
  inp.ledger.forEach((r) => {
    const ref = String(r.ref);
    if (ref.indexOf('freezeDay:') === 0) frozenDays[ref.slice(10)] = true;
    if (ref.indexOf('freezeWeek:') === 0) frozenWeeks[ref.slice(11)] = true;
    if (ref.indexOf('item:') === 0) owned[ref.slice(5)] = true;
    if (ref.indexOf('color:') === 0) owned['color:' + ref.slice(6)] = true;
  });

  const weeks = inp.weeks
    .map((w) => ({ sunday: String(w.sunday), data: parseJSON<any>(w.data, null) }))
    .filter((w) => w.data && Array.isArray(w.data.days))
    .sort((a, b) => a.sunday.localeCompare(b.sunday));
  const dayMap: Record<string, any> = {};
  weeks.forEach((w) => w.data.days.forEach((d: any, i: number) => { dayMap[addDaysStr(w.sunday, i)] = d; }));
  const weekMap: Record<string, { sunday: string; data: any }> = {};
  weeks.forEach((w) => { weekMap[w.sunday] = w; });

  const items: { date: string; amount: number; kind: string; label: string }[] = [];
  const badges: Record<string, number> = {};
  const add = (date: string, amount: number, kind: string, label: string) => items.push({ date, amount, kind, label });

  Object.keys(dayMap).sort().forEach((date) => {
    if (date < start || date > today) return;
    const d = dayMap[date];
    if (isFullDay(d)) add(date, 5, 'day', 'יום מלא בטבלה');
    if (isWorkout(d)) add(date, 10, 'workout', 'אימון');
    if (d && d.breakfast === 'V' && d.lunch === 'V' && d.dinner === 'V') {
      add(date, 15, 'challenge', 'אתגר יומי: 3 ארוחות בריאות');
      badges.day3 = (badges.day3 || 0) + 1;
    }
  });

  const firstSunday = weeks.length ? weeks[0].sunday : null;
  let wkRun = 0;
  if (firstSunday) {
    for (let s = firstSunday; s <= sundayStr(today); s = addDaysStr(s, 7)) {
      const w = weekMap[s];
      const sat = addDaysStr(s, 6);
      const when = sat < today ? sat : today;
      let n = 0;
      if (w) w.data.days.forEach((d: any, i: number) => { if (addDaysStr(s, i) <= today && isWorkout(d)) n++; });
      const counted = s >= sundayStr(start);
      if (w && typeof w.data.startWeight === 'number' && counted) add(s, 5, 'weigh', 'שקילה שבועית');
      if (n >= 3 && counted) { add(when, 30, 'challenge', 'אתגר שבועי: 3 אימונים'); badges.week3 = (badges.week3 || 0) + 1; }
      if (n >= 3 || frozenWeeks[s]) {
        wkRun++;
        if (wkRun % 4 === 0 && when >= start) add(when, 50, 'streak', 'רצף 4 שבועות עם 3+ אימונים');
      } else if (s !== sundayStr(today)) wkRun = 0;
    }
  }

  if (firstSunday) {
    let run = 0;
    for (let d = firstSunday; d <= today; d = addDaysStr(d, 1)) {
      const day = dayMap[d];
      const m = day ? day.lunch : null;
      if (m === 'V') {
        run++;
        if (run % 7 === 0 && d >= start) add(d, 20, 'streak', '7 ימים רצופים עם צהריים V');
      } else if (m === '-' || frozenDays[d] || (d === today && !m)) continue;
      else run = 0;
    }
  }

  const byMonth: Record<string, { wo: number; v: number; x: number }> = {}, byYear: Record<string, { wo: number }> = {};
  Object.keys(dayMap).forEach((date) => {
    if (date < start || date > today) return;
    const d = dayMap[date];
    const mk = date.slice(0, 7), yk = date.slice(0, 4);
    byMonth[mk] = byMonth[mk] || { wo: 0, v: 0, x: 0 };
    byYear[yk] = byYear[yk] || { wo: 0 };
    if (isWorkout(d)) { byMonth[mk].wo++; byYear[yk].wo++; }
    ['breakfast', 'lunch', 'dinner'].forEach((k) => { if (d && d[k] === 'V') byMonth[mk].v++; else if (d && d[k] === 'X') byMonth[mk].x++; });
  });
  Object.keys(byMonth).sort().forEach((mk) => {
    const m = byMonth[mk];
    const end = addDaysStr(mk + '-01', 40).slice(0, 7) + '-01';
    const when = addDaysStr(end, -1) < today ? addDaysStr(end, -1) : today;
    if (m.wo >= 12) { add(when, 100, 'challenge', 'אתגר חודשי: 12 אימונים'); badges.month12 = (badges.month12 || 0) + 1; }
    if (m.v + m.x >= 40 && m.v / (m.v + m.x) >= 0.8) { add(when, 100, 'challenge', 'אתגר חודשי: 80% ארוחות בריאות'); badges.month80 = (badges.month80 || 0) + 1; }
  });
  Object.keys(byYear).sort().forEach((yk) => {
    if (byYear[yk].wo >= 150) {
      add(yk + '-12-31' < today ? yk + '-12-31' : today, 500, 'challenge', 'אתגר שנתי: 150 אימונים');
      badges.year150 = (badges.year150 || 0) + 1;
    }
  });

  const profile = u.profile || {};
  const goal = Number(profile.goalWeight) || 0;
  const weighIns = weeks.filter((w) => typeof w.data.startWeight === 'number').map((w) => ({ d: w.sunday, w: w.data.startWeight as number }));
  if (goal && weighIns.length) {
    const before = weighIns.filter((x) => x.d < sundayStr(start));
    const baseline = before.length ? before[before.length - 1] : weighIns[0];
    const dir = goal < baseline.w ? -1 : 1;
    let milestones = 0, reached = (dir < 0 ? baseline.w <= goal : baseline.w >= goal);
    weighIns.forEach((x) => {
      if (x.d < sundayStr(start) || x === baseline) return;
      const prog = dir < 0 ? baseline.w - x.w : x.w - baseline.w;
      if (Math.floor(prog) > milestones && !reached) { milestones++; add(x.d, 20, 'weight', 'ק"ג בדרך ליעד'); }
      if (!reached && (dir < 0 ? x.w <= goal : x.w >= goal)) { reached = true; add(x.d, 200, 'weight', 'הגעת למשקל היעד'); badges.goal = 1; }
      else if (reached && Math.abs(x.w - goal) <= 1) add(x.d, 10, 'weight', 'שמירה על המשקל');
    });
  }

  if (u.invitedBy) add(created || start, 50, 'referral', 'הצטרפת עם קוד הזמנה');
  inp.invitees.slice()
    .sort((a, b) => String(a.createdAt).localeCompare(String(b.createdAt)))
    .slice(0, INVITES_PER_USER)
    .forEach((r) => {
      add(String(r.createdAt).slice(0, 10), 50, 'referral', 'חבר הצטרף: ' + r.name);
      for (const w of r.weeks) {
        const data = parseJSON<any>(w.data, null);
        if (data && data.days && data.days.filter(isFullDay).length >= 5) {
          add(addDaysStr(String(w.sunday), 6), 50, 'referral', 'חבר השלים שבוע ראשון: ' + r.name);
          badges.friend = (badges.friend || 0) + 1;
          break;
        }
      }
    });

  let hist = 0;
  Object.keys(dayMap).forEach((date) => {
    if (date >= start) return;
    if (isWorkout(dayMap[date])) hist += 1;
    if (isFullDay(dayMap[date])) hist += 0.5;
  });
  hist += weighIns.filter((x) => x.d < sundayStr(start)).length * 2;
  hist = Math.min(WELCOME_CAP, Math.round(hist));
  if (hist > 0) add(start, hist, 'bonus', 'בונוס פתיחה על ההיסטוריה');

  inp.ledger.forEach((r) => add(String(r.at).slice(0, 10), Number(r.amount) || 0, 'spend', String(r.label || r.ref)));

  items.sort((a, b) => a.date.localeCompare(b.date));
  const balance = items.reduce((s, x) => s + x.amount, 0);
  const lifetime = items.filter((x) => x.amount > 0).reduce((s, x) => s + x.amount, 0);
  const weekStart = sundayStr(today), monthStart = today.slice(0, 8) + '01';
  const earnedSince = (d0: string) => items.filter((x) => x.amount > 0 && x.date >= d0).reduce((s, x) => s + x.amount, 0);

  const td = dayMap[today] || {};
  const mealsToday = ['breakfast', 'lunch', 'dinner'].filter((k) => td[k] === 'V').length;
  const cw = weekMap[weekStart];
  let weekWo = 0;
  if (cw) cw.data.days.forEach((d: any, i: number) => { if (addDaysStr(weekStart, i) <= today && isWorkout(d)) weekWo++; });
  const cm = byMonth[today.slice(0, 7)] || { wo: 0, v: 0, x: 0 };
  const cy = byYear[today.slice(0, 4)] || { wo: 0 };
  const mealsPct = cm.v + cm.x ? Math.round((cm.v / (cm.v + cm.x)) * 100) : 0;

  const level = levelFor(lifetime);
  const perks = perksFor(level.n);
  const unlocked = Object.keys(owned);
  Object.keys(CATALOG).forEach((kind) => Object.keys(CATALOG[kind]).forEach((id) => {
    if (priceFor(kind, id, perks) === 0 && unlocked.indexOf(kind + ':' + id) < 0) unlocked.push(kind + ':' + id);
  }));
  const catalog: any[] = [];
  Object.keys(CATALOG).forEach((kind) => Object.keys(CATALOG[kind]).forEach((id) => {
    const minLevel = ITEM_LEVEL[kind + ':' + id] || 0;
    const price = priceFor(kind, id, perks);
    catalog.push({ kind, id, base: CATALOG[kind][id], price, owned: unlocked.indexOf(kind + ':' + id) >= 0, minLevel, locked: minLevel > level.n && price !== 0 });
  }));
  return {
    start,
    fullHistory,
    balance,
    lifetime,
    week: earnedSince(weekStart),
    month: earnedSince(monthStart),
    level,
    perks: { chatBonus: perks.chatBonus, discount: perks.discount },
    levels: LEVELS.map((l, i) => ({ n: i + 1, name: l[1], from: l[0], perks: LEVEL_PERKS.filter((p) => p.level === i + 1).map((p) => p.text) })),
    catalog,
    unlocked,
    frame: u.frame || '',
    challenges: [
      { id: 'day3', period: 'day', title: '3 ארוחות בריאות היום', progress: mealsToday, target: 3, reward: 15 },
      { id: 'week3', period: 'week', title: '3 אימונים השבוע', progress: weekWo, target: 3, reward: 30 },
      { id: 'month12', period: 'month', title: '12 אימונים החודש', progress: cm.wo, target: 12, reward: 100 },
      { id: 'month80', period: 'month', title: '80% ארוחות בריאות החודש', progress: mealsPct, target: 80, reward: 100, unit: '%', cells: cm.v + cm.x, minCells: 40 },
      { id: 'year150', period: 'year', title: '150 אימונים השנה', progress: cy.wo, target: 150, reward: 500 },
    ],
    badges,
    items: items.slice(-60).reverse(),
    frozenDays: Object.keys(frozenDays).sort(),
    frozenWeeks: Object.keys(frozenWeeks).sort(),
    unlockedColors: unlocked.filter((k) => k.indexOf('color:') === 0).map((k) => k.slice(6)),
    chatCredits: Number(u.chatCredits) || 0,
    costs: COSTS,
    hasGoal: !!goal,
  };
}
export type Rewards = ReturnType<typeof rewardsFor>;

/** What a purchase costs and how it's recorded (the checks in spend()). Throws with the same messages. */
export function spendPlan(req: Record<string, any>, rw: Rewards, today = todayStr()): { cost: number; ref: string; label: string } {
  if (req.item === 'freezeDay') {
    const d = String(req.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d) || d > today || d < addDaysStr(today, -14)) throw new Error('אפשר להקפיא רק יום מ-14 הימים האחרונים');
    if (rw.frozenDays.indexOf(d) >= 0) throw new Error('היום הזה כבר מוקפא');
    return { cost: COSTS.freezeDay, ref: 'freezeDay:' + d, label: 'הקפאת יום: ' + d };
  }
  if (req.item === 'freezeWeek') {
    const s = String(req.date || '');
    if (!/^\d{4}-\d{2}-\d{2}$/.test(s) || dowStr(s) !== 0 || s > today || s < addDaysStr(sundayStr(today), -35)) throw new Error('אפשר להקפיא רק שבוע מ-5 השבועות האחרונים');
    if (rw.frozenWeeks.indexOf(s) >= 0) throw new Error('השבוע הזה כבר מוקפא');
    return { cost: COSTS.freezeWeek, ref: 'freezeWeek:' + s, label: 'הקפאת שבוע: ' + s };
  }
  if (req.item === 'chat10') return { cost: COSTS.chat10, ref: 'chat10', label: '10 הודעות לבוט' };
  if (req.item === 'color' || req.item === 'cosmetic') {
    const kind = req.item === 'color' ? 'color' : String(req.kind || '');
    const id = req.item === 'color' ? String(req.color || '') : String(req.id || '');
    const price = priceFor(kind, id, perksFor(rw.level.n));
    if (price === null) throw new Error('פריט לא מוכר');
    const need = ITEM_LEVEL[kind + ':' + id] || 0;
    if (need > rw.level.n && price !== 0) throw new Error('הפריט נפתח ברמה ' + need);
    if (rw.unlocked.indexOf(kind + ':' + id) >= 0) throw new Error('הפריט כבר שלך');
    return { cost: price, ref: 'item:' + kind + ':' + id, label: 'חנות: ' + kind + ':' + id };
  }
  throw new Error('פריט לא מוכר');
}

/** First-week quest steps (questStatus). */
export function questSteps(weeksData: any[]) {
  const weeks = weeksData.map((w) => parseJSON<any>(w, null)).filter(Boolean);
  const days: any[] = [].concat(...weeks.map((w: any) => w.days || []));
  const done = (d: any) => ['breakfast', 'lunch', 'dinner'].filter((k) => d[k] || (d.text && d.text[k])).length + (d.sport && d.sport.status ? 1 : 0);
  return {
    meal: days.some((d) => d && ['breakfast', 'lunch', 'dinner'].some((k) => d[k] === 'V')),
    weight: weeks.some((w: any) => typeof w.startWeight === 'number'),
    sport: days.some((d) => d && d.sport && d.sport.status === 'V'),
    full: days.some((d) => d && done(d) >= 4),
  };
}

export interface LeaderRow { userId: string; name: string; photoId: string | null; frame: string; level: number; levelName: string; week: number; month: number; lifetime: number }
export function sortLeaders(list: LeaderRow[], period: string): LeaderRow[] {
  const k = period === 'month' ? 'month' : period === 'all' ? 'lifetime' : 'week';
  return list.slice().sort((a, b) => b[k] - a[k]);
}

/** Weekly league from the all-time leaderboard (league). */
export function leagueFor(all: LeaderRow[], uid: string) {
  const groups = Math.max(1, Math.ceil(all.length / LEAGUE_SIZE));
  const idx = Math.max(0, all.findIndex((l) => l.userId === uid));
  const g = Math.min(groups - 1, Math.floor(idx / LEAGUE_SIZE));
  const members = all.slice(g * LEAGUE_SIZE, (g + 1) * LEAGUE_SIZE).sort((a, b) => b.week - a.week || b.lifetime - a.lifetime)
    .map((l, i) => ({ rank: i + 1, userId: l.userId, name: l.name, photoId: l.photoId, frame: l.frame, level: l.level, week: l.week, me: l.userId === uid }));
  const tier = LEAGUE_TIERS[Math.min(LEAGUE_TIERS.length - 1, Math.round((g / Math.max(1, groups - 1)) * (LEAGUE_TIERS.length - 1)) || 0)];
  return { tier: groups === 1 ? LEAGUE_TIERS[2] : tier, members, up: g > 0 ? 3 : 0, down: g < groups - 1 ? 3 : 0 };
}

// ------------------------------------------------------------------ profile

/** The profile fields a user may set (updateProfile). */
export function cleanProfile(p: Record<string, any>): Record<string, any> {
  const clean: Record<string, any> = {};
  ['birthDate', 'heightCm', 'goalWeight', 'goal', 'completed'].forEach((k) => {
    if (p[k] !== undefined) clean[k] = typeof p[k] === 'string' ? p[k].slice(0, 300) : p[k];
  });
  if (p.gender !== undefined) clean.gender = ['male', 'female'].indexOf(p.gender) >= 0 ? p.gender : '';
  if (Array.isArray(p.goals)) clean.goals = p.goals.filter((g: string) => GOAL_IDS.indexOf(g) >= 0).slice(0, 10);
  return clean;
}

/** "הזמין/ה" → "הזמין" or "הזמינה" by gender (gz). */
export function gz(text: string, gender: unknown): string {
  if (gender !== 'male' && gender !== 'female') return text;
  const fin: Record<string, string> = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
  return String(text).replace(/([֐-׿]+)\/(ה|י|ית)(?![֐-׿])/g, (_m, w: string, suf: string) =>
    (gender === 'female' ? w.replace(/[ךםןףץ]$/, (c) => fin[c]) + suf : w));
}

// ------------------------------------------------------------------ posts & stories

const STORY_TPL = ['photo', 'text', 'rings', 'workout', 'achievement', 'week'];
const STORY_BG = ['ink', 'lime', 'sunset', 'ocean', 'berry', 'forest'];
export function cleanStory(d: Record<string, any>): Record<string, any> {
  const num = (x: unknown, max: number) => Math.max(0, Math.min(max, Number(x) || 0));
  const out: Record<string, any> = { tpl: STORY_TPL.indexOf(d.tpl) >= 0 ? d.tpl : 'text', bg: STORY_BG.indexOf(d.bg) >= 0 ? d.bg : 'ink' };
  if (out.tpl === 'rings') Object.assign(out, { meals: num(d.meals, 3), sport: num(d.sport, 1), week: num(d.week, 7), streak: num(d.streak, 3650) });
  if (out.tpl === 'workout') {
    Object.assign(out, { type: ['run', 'walk', 'bike', 'hike'].indexOf(d.type) >= 0 ? d.type : 'run', distanceM: num(d.distanceM, 1e6), durationS: num(d.durationS, 864000),
      name: String(d.name || '').slice(0, 60) });
    if (Array.isArray(d.route)) out.route = d.route.slice(0, 80).map((p: any) => [Math.round(num(p[0], 100) * 10) / 10, Math.round(num(p[1], 100) * 10) / 10]);
  }
  if (out.tpl === 'photo' && d.ov && typeof d.ov === 'object') {
    out.ov = d.ov.km !== undefined
      ? { km: num(d.ov.km, 1000), time: String(d.ov.time || '').slice(0, 10), pace: String(d.ov.pace || '').slice(0, 16) }
      : { meals: num(d.ov.meals, 3), sport: num(d.ov.sport, 1) };
  }
  if (out.tpl === 'week') Object.assign(out, { workouts: num(d.workouts, 100), full: num(d.full, 31), meals: num(d.meals, 100), label: String(d.label || '').slice(0, 20) });
  if (out.tpl === 'achievement') Object.assign(out, { title: String(d.title || '').slice(0, 80), emoji: String(d.emoji || '🏆').slice(0, 4) });
  return out;
}

/**
 * Validate and normalise a new post (createPost) before photos are stored.
 * Returns the clean fields or throws with the server's messages. `uid` goes into a meetup's going list.
 */
export function planPost(req: Record<string, any>, uid: string, isAdmin: boolean, now = Date.now()) {
  const text = String(req.text || '').trim().slice(0, 1000);
  const kind = POST_KINDS.indexOf(req.kind) >= 0 ? req.kind as string : 'text';
  let data: Record<string, any> | null = req.data && typeof req.data === 'object' ? req.data : null;
  if (kind === 'meetup') {
    const m = data || {};
    const when = String(m.when || '');
    if (!String(m.title || '').trim()) throw new Error('נא לתת שם למפגש');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(when) || Date.parse(when) < now - 3600000) throw new Error('נא לבחור מועד עתידי');
    data = { title: String(m.title).trim().slice(0, 80), when: when.slice(0, 16), location: String(m.location || '').trim().slice(0, 120),
      sport: EVENT_TYPES.indexOf(m.sport) >= 0 ? m.sport : 'other', going: [uid] };
  }
  if (data && data.image !== undefined) { data = { ...data }; delete data.image; }
  if (kind === 'story') data = cleanStory(data || {});
  const json = data ? JSON.stringify(data) : '';
  const asTeam = !!req.asTeam && isAdmin;
  if (json.length > 4000) throw new Error('הפוסט גדול מדי');
  const photos: string[] = (Array.isArray(req.photos) ? req.photos : req.photo ? [req.photo] : []).slice(0, kind === 'story' ? 1 : 4).map(String);
  if (!text && !json && !photos.length) throw new Error('נא לכתוב משהו');
  return { text, kind, data, asTeam, photos, visibility: req.visibility === 'friends' && !asTeam ? 'friends' : 'all' };
}

/** Story replies are private: the author sees all of them, everyone else only their own (postOut). */
export function visibleComments<C extends { userId: string }>(comments: C[], kind: string, authorId: string | null, uid: string, hidden: Record<string, boolean>): C[] {
  return comments.filter((c) => (kind !== 'story' || authorId === uid || c.userId === uid) && !hidden[c.userId]).slice(-30);
}

/** Order story groups: mine first, then by newest item (stories). */
export function orderStoryGroups(order: string[], lastAt: Record<string, string>, uid: string): string[] {
  return order.slice().sort((a, b) => (a === uid ? -1 : b === uid ? 1 : String(lastAt[b]).localeCompare(String(lastAt[a]))));
}

/** Decode a data URL photo (savePhoto); throws like the server. */
export function decodePhoto(dataUrl: string): { type: string; bytes: Uint8Array } {
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('תמונה לא תקינה');
  const bin = atob(m[2]);
  if (bin.length > 3 * 1024 * 1024) throw new Error('התמונה גדולה מדי');
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return { type: m[1], bytes };
}
