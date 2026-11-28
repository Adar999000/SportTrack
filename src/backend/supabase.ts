/**
 * Supabase transport for `call(action, payload)` (used only when VITE_BACKEND=supabase).
 * Talks to the `api` Edge Function (backend/supabase/functions/api), which answers with the same JSON
 * as Apps Script, so screens don't change. Differences handled here:
 *  - The token is a short-lived Supabase access token sent as `Authorization: Bearer`, not in the body.
 *  - Sign-in answers carry a `refresh` token. It is kept here (not in the session) and used once to get a
 *    new access token when the server says the old one expired; the request is then retried.
 * The anon key and project URL are public build settings (VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY), not secrets.
 */
import { IS_DEMO } from '../env';

export interface SupabaseConfig { url: string; anonKey: string }

/** Read at call time so tests (and a future runtime switch) can change it. */
export function supabaseConfig(): SupabaseConfig | null {
  if (IS_DEMO) return null;
  const url = String(import.meta.env.VITE_SUPABASE_URL ?? '').replace(/\/+$/, '');
  const anonKey = String(import.meta.env.VITE_SUPABASE_ANON_KEY ?? '');
  return url && anonKey ? { url, anonKey } : null;
}

const REFRESH_KEY = 'mishmaat.sb.refresh';
let memRefresh: string | null = null;

function readRefresh(): string | null {
  try { return localStorage.getItem(REFRESH_KEY) ?? memRefresh; } catch { return memRefresh; }
}
function writeRefresh(v: string | null) {
  memRefresh = v;
  try { if (v) localStorage.setItem(REFRESH_KEY, v); else localStorage.removeItem(REFRESH_KEY); } catch { /* private mode: memory only */ }
}
/** Forget the refresh token (sign-out). */
export const clearRefresh = () => writeRefresh(null);

async function post(cfg: SupabaseConfig, action: string, payload: Record<string, unknown>, token: string | null): Promise<any> {
  const res = await fetch(cfg.url + '/functions/v1/api', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', apikey: cfg.anonKey, Authorization: 'Bearer ' + (token || cfg.anonKey) },
    body: JSON.stringify({ ...payload, action }),
  });
  const data = await res.json(); // SyntaxError = not our server
  if (data && typeof data.refresh === 'string') {
    writeRefresh(data.refresh);
    delete data.refresh;
  }
  return data;
}

let refreshing: Promise<string | null> | null = null;

/** One refresh at a time: parallel calls share it (refresh tokens are single-use). */
function refreshToken(cfg: SupabaseConfig): Promise<string | null> {
  const r = readRefresh();
  if (!r) return Promise.resolve(null);
  refreshing ??= post(cfg, 'refresh', { refresh: r }, null)
    .then((d) => (d && typeof d.token === 'string' ? d.token : (writeRefresh(null), null)))
    .finally(() => { refreshing = null; });
  return refreshing;
}

/**
 * Send one action. Returns the server's JSON (which may be `{ error }`; api.ts maps errors as before).
 * Throws TypeError when offline and SyntaxError on a non-JSON answer. `onToken` gets a refreshed access token.
 */
export async function supabaseCall(action: string, payload: Record<string, unknown>, token: string | null, onToken: (t: string) => void): Promise<any> {
  const cfg = supabaseConfig();
  if (!cfg) throw new Error('supabase not configured');
  const data = await post(cfg, action, payload, token);
  if (token && action !== 'refresh' && typeof data?.error === 'string' && data.error.startsWith('AUTH:')) {
    const fresh = await refreshToken(cfg);
    if (fresh) {
      onToken(fresh);
      return post(cfg, action, payload, fresh);
    }
  }
  return data;
}
