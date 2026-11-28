/**
 * Shared plumbing for the `api` Edge Function: Supabase clients, the signed-in caller, errors,
 * rate limits (replace CacheService), settings (replace Script properties), mail (Resend replaces MailApp),
 * photos (Storage replaces Drive) and the audit log.
 *
 * Secrets (set with `supabase secrets set NAME=...`, never in code):
 *   SUPABASE_URL, SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY  (provided automatically by Supabase)
 *   RESEND_API_KEY, MAIL_FROM            (e.g. "משמעת אישית <no-reply@your-domain>")
 *   MAIL_DAILY_LIMIT                     (optional, default 100 = Resend free tier)
 *   OPENAI_API_KEY, OPENAI_MODEL         (chat, not ported yet)
 *   STRAVA_CLIENT_ID, STRAVA_CLIENT_SECRET (not ported yet)
 */
import { createClient, type SupabaseClient } from 'npm:@supabase/supabase-js@2.45.4';
import { decodePhoto, legacyHash, parseJSON, safeEqual, todayStr } from './logic.ts';

export const env = (k: string) => Deno.env.get(k) ?? '';

// deno-lint-ignore no-explicit-any
export type Json = any;
export type Req = Record<string, Json>;

export interface Profile {
  id: string; legacy_id: string | null; email: string; name: string; role: 'user' | 'admin';
  created_at: string; last_seen: string; photo_path: string | null; profile: Record<string, Json>;
  invited_by: string | null; email_verified: boolean; two_factor: boolean | null; history_approved: boolean;
  frame: string; chat_credits: number; consent_at: string | null; consent: string | null;
}

/** The signed-in caller: their profile, their JWT and a client that acts as them (RLS applies). */
export interface Me { id: string; p: Profile; jwt: string; db: SupabaseClient }

/** Service-role client: bypasses RLS. Use only for work that must see other people's rows. */
export const admin = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_SERVICE_ROLE_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

/** Anonymous client (sign-in calls). A fresh one per call so sessions never leak between requests. */
export const anon = (): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), { auth: { persistSession: false, autoRefreshToken: false } });

/** A client acting as the caller. */
export const asUser = (jwt: string): SupabaseClient =>
  createClient(env('SUPABASE_URL'), env('SUPABASE_ANON_KEY'), {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: 'Bearer ' + jwt } },
  });

/** An error shown to the user as is (the client maps "AUTH:" and "VERIFY:" prefixes, like with Apps Script). */
export class UserError extends Error {}
export const fail = (msg: string): never => { throw new UserError(msg); };

/** Unwrap a Supabase result; database errors become a generic message (details go to the function log). */
export function must<T>(r: { data: T; error: { message: string } | null } | { data: unknown; error: { message: string } }, what = 'db'): T {
  if (r.error) {
    // Messages raised on purpose in SQL (put_weeks, bump_counter) are Hebrew user text; pass them through.
    if (/[֐-׿]/.test(r.error.message)) throw new UserError(r.error.message);
    console.error(what, r.error.message);
    throw new Error('שגיאת שרת. נסו שוב.');
  }
  return r.data as T;
}

export async function loadProfile(db: SupabaseClient, id: string): Promise<Profile | null> {
  return must(await db.from('profiles').select('*').eq('id', id).maybeSingle(), 'profile') as Profile | null;
}

/** Who is calling (auth() in server.js). Throws AUTH: when the token is missing, expired or revoked. */
export async function authenticate(jwt: string): Promise<Me> {
  if (!jwt) fail('AUTH: נדרשת התחברות');
  const { data, error } = await admin().auth.getUser(jwt);
  if (error || !data?.user) fail('AUTH: נדרשת התחברות מחדש');
  const p = await loadProfile(admin(), data.user!.id);
  if (!p) fail('AUTH: המשתמש לא נמצא');
  const me: Me = { id: p!.id, p: p!, jwt, db: asUser(jwt) };
  await touch(me);
  return me;
}

/** last_seen, at most once an hour (touch). */
async function touch(me: Me) {
  const now = new Date().toISOString();
  if (String(me.p.last_seen).slice(0, 13) === now.slice(0, 13)) return;
  me.p.last_seen = now;
  await admin().from('profiles').update({ last_seen: now }).eq('id', me.id);
}

export function requireAdmin(me: Me) {
  if (me.p.role !== 'admin') fail('אין הרשאת מנהל');
}

export const twoFactorOn = (p: Profile) => p.two_factor === true || (p.role === 'admin' && p.two_factor !== false);

/** The user object the client expects (publicUser). Grandfathered accounts are migrated with email_verified = true. */
export function publicUser(p: Profile) {
  return {
    userId: p.id, email: p.email, name: p.name, role: p.role, createdAt: p.created_at, lastSeen: p.last_seen,
    photoId: p.photo_path || null, profile: parseJSON(p.profile, {}), twoFactor: twoFactorOn(p), emailVerified: !!p.email_verified,
  };
}

// ------------------------------------------------------------------ settings (Script properties)

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const r = must(await admin().from('settings').select('value').eq('key', key).maybeSingle(), 'settings') as { value: T } | null;
  return r ? r.value : fallback;
}
export async function setSetting(key: string, value: Json) {
  must(await admin().from('settings').upsert({ key, value }), 'settings');
}

/** The rewards launch date, fixed on first use (rewardsStart). */
export async function rewardsStart(): Promise<string> {
  let s = await getSetting<string>('REWARDS_START', '');
  if (!s) { s = todayStr(); await setSetting('REWARDS_START', s); }
  return s;
}

export async function verifyRequired() { return (await getSetting<string>('VERIFY_POSTING', '1')) !== '0'; }

/** Community actions need a verified email; admins are exempt (requireVerified). */
export async function requireVerified(me: Me) {
  if (me.p.role === 'admin' || me.p.email_verified || !(await verifyRequired())) return;
  fail('VERIFY: כדי לפרסם בקהילה צריך לאמת את כתובת המייל. שלחנו קוד במסך "אני".');
}

// ------------------------------------------------------------------ counters (CacheService)

/** Count one more `key` in a window of `ttl` seconds; throws `msg` past `max` (dailyCount and friends). */
export async function bump(key: string, max: number, ttl: number, msg: string): Promise<number> {
  return must(await admin().rpc('bump_counter', { p_key: key, p_max: max, p_ttl_seconds: ttl, p_msg: msg }), 'counter') as number;
}
export const dailyCount = (key: string, max: number, msg: string) =>
  bump(key + '-' + new Date().toISOString().slice(0, 10), max, 6 * 3600, msg);

export async function peekCounter(key: string): Promise<number> {
  const r = must(await admin().from('counters').select('n, expires_at').eq('key', key).maybeSingle(), 'counter') as { n: number; expires_at: string } | null;
  return r && Date.parse(r.expires_at) > Date.now() ? r.n : 0;
}
export async function clearCounter(key: string) { await admin().from('counters').delete().eq('key', key); }

// ------------------------------------------------------------------ emailed codes

export interface CodeRec { key: string; user_id: string | null; hash: string; salt: string; tries: number; sent_at: string; expires_at: string; payload: Json }

export async function putCode(key: string, code: string, minutes: number, userId: string | null, payload: Json = null) {
  const salt = crypto.randomUUID();
  must(await admin().from('auth_codes').upsert({
    key, user_id: userId, hash: await legacyHash(code, salt), salt, tries: 0, sent_at: new Date().toISOString(),
    expires_at: new Date(Date.now() + minutes * 60000).toISOString(), payload,
  }), 'code');
}
export async function getCode(key: string): Promise<CodeRec | null> {
  const r = must(await admin().from('auth_codes').select('*').eq('key', key).maybeSingle(), 'code') as CodeRec | null;
  if (r && Date.parse(r.expires_at) < Date.now()) { await dropCode(key); return null; }
  return r;
}
export async function dropCode(key: string) { await admin().from('auth_codes').delete().eq('key', key); }
/** Check a code; counts a wrong try and removes the record after `maxTries`. */
export async function checkCode(rec: CodeRec, code: string, maxTries: number): Promise<boolean> {
  if (safeEqual(await legacyHash(String(code || '').trim(), rec.salt), rec.hash)) { await dropCode(rec.key); return true; }
  if (rec.tries + 1 >= maxTries) await dropCode(rec.key);
  else await admin().from('auth_codes').update({ tries: rec.tries + 1 }).eq('key', rec.key);
  return false;
}

// ------------------------------------------------------------------ mail (Resend; replaces MailApp)

const MAIL_RESERVE = 20;
/** Codes are critical and always try; other mail stops when MAIL_RESERVE are left today (safeMail). */
export async function sendMail(to: string, subject: string, text: string, critical = false, html?: string): Promise<boolean> {
  const limit = Number(env('MAIL_DAILY_LIMIT')) || 100;
  const key = 'mail-' + new Date().toISOString().slice(0, 10);
  const used = await peekCounter(key);
  if (used >= limit || (!critical && limit - used <= MAIL_RESERVE)) { await bumpSkipped(); return false; }
  if (!env('RESEND_API_KEY')) { console.warn('RESEND_API_KEY missing; mail not sent'); await bumpSkipped(); return false; }
  try {
    const r = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + env('RESEND_API_KEY'), 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: env('MAIL_FROM'), to: [to], subject, text, ...(html ? { html } : {}) }),
    });
    if (!r.ok) { console.error('resend', r.status, await r.text()); await bumpSkipped(); return false; }
    await bump(key, 1e9, 26 * 3600, '');
    return true;
  } catch (e) {
    console.error('resend', e);
    await bumpSkipped();
    return false;
  }
}
async function bumpSkipped() {
  try { await bump('mail-skipped-' + new Date().toISOString().slice(0, 10), 1e9, 26 * 3600, ''); } catch { /* never break a request */ }
}

export async function adminEmails(): Promise<string[]> {
  const r = must(await admin().from('profiles').select('email').eq('role', 'admin'), 'admins') as { email: string }[];
  return r.map((x) => x.email);
}

// ------------------------------------------------------------------ audit

/** Security-relevant events (never passwords or codes). Never breaks a request. */
export async function audit(userId: string | null, event: string, detail = '') {
  try { await admin().from('audit').insert({ user_id: userId || null, event, detail: String(detail).slice(0, 200) }); } catch { /* ignore */ }
}

// ------------------------------------------------------------------ photos (Storage bucket "photos")

/** Store a data-URL photo under the owner's folder; removes `oldPath`. Returns the path or '' (savePhoto). */
export async function savePhoto(dataUrl: string | null, path: string, oldPath?: string | null): Promise<string> {
  const store = admin().storage.from('photos');
  if (oldPath) await store.remove([oldPath]);
  if (!dataUrl) return '';
  const { type, bytes } = decodePhoto(dataUrl);
  must(await store.upload(path, bytes, { contentType: type, upsert: true }), 'photo');
  return path;
}

export async function removePhotos(paths: (string | null | undefined)[]) {
  const list = [...new Set(paths.filter(Boolean) as string[])];
  if (list.length) await admin().storage.from('photos').remove(list);
}

/** Download a stored photo as a data URL (getPhoto keeps its old response shape). */
export async function photoDataUrl(path: string): Promise<string> {
  const blob = must(await admin().storage.from('photos').download(path), 'photo') as Blob;
  const bytes = new Uint8Array(await blob.arrayBuffer());
  let s = '';
  for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  return 'data:' + (blob.type || 'image/jpeg') + ';base64,' + btoa(s);
}

export const shortId = (n: number) => crypto.randomUUID().replace(/-/g, '').slice(0, n);
