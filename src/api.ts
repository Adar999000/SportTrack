import { t, tServer } from './i18n';
import { API_URL } from './config';
import { clearRefresh, supabaseCall, supabaseConfig } from './backend/supabase';

export interface UserProfile {
  birthDate?: string;
  heightCm?: number;
  goalWeight?: number;
  goal?: string;
  goals?: string[];
  gender?: 'male' | 'female' | '';
  completed?: boolean;
}

export interface User {
  userId: string;
  email: string;
  name: string;
  role: 'admin' | 'user';
  createdAt: string;
  lastSeen: string;
  photoId: string | null;
  profile: UserProfile;
  twoFactor?: boolean;
  emailVerified?: boolean;
}

export interface AdminUserRow extends Omit<User, 'profile'> {
  weeks: number;
  lastWeek: string | null;
  weightChange: number | null;
  recentWorkouts: number;
  recentMealsPct: number | null;
  level?: number;
  levelName?: string;
  coins?: number;
  lifetime?: number;
}

/** What an admin may see about another user: aggregates only. */
export interface UserSummary {
  userId: string;
  name: string;
  email: string;
  photoId: string | null;
  createdAt: string;
  lastSeen: string;
  weeks: number;
  firstWeek: string | null;
  lastWeek: string | null;
  totalWorkouts: number;
  workoutsPerWeek: number | null;
  mealsPct: number | null;
  weightChange: number | null;
  level: number;
  levelName: string;
  historyApproved?: boolean;
  coins: number;
  months: { month: string; weeks: number; workoutsPerWeek: number; mealsPct: number | null; weightChange: number | null }[];
}

export class AuthError extends Error {}

let token: string | null = null;
export const setToken = (t: string | null) => {
  token = t;
  if (t === null) clearRefresh(); // signed out: the Supabase refresh token goes too
};
export const getToken = () => token;

/** Which server answers `call()`: Apps Script (default) or Supabase when built with VITE_BACKEND=supabase. */
export const backendKind = (): 'supabase' | 'apps-script' => (import.meta.env.VITE_BACKEND === 'supabase' ? 'supabase' : 'apps-script');
export const hasBackend = () => (backendKind() === 'supabase' ? !!supabaseConfig() : !!API_URL);

/** No connection at all (as opposed to an error the server returned). */
export class NetworkError extends Error {}

/** Apps Script: POST as text/plain so the browser sends a "simple" request (no CORS preflight). */
async function appsScript(action: string, payload: Record<string, unknown>): Promise<any> {
  if (!API_URL) throw new Error(t('השרת לא הוגדר'));
  let res: Response;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, token, ...payload }) });
  } catch {
    throw new NetworkError(t('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'));
  }
  try {
    return await res.json();
  } catch {
    throw new Error(t('תשובה לא תקינה מהשרת'));
  }
}

/** Supabase Edge Function `api` (src/backend/supabase.ts); same actions and answers. */
async function supabase(action: string, payload: Record<string, unknown>): Promise<any> {
  if (!supabaseConfig()) throw new Error(t('השרת לא הוגדר'));
  try {
    return await supabaseCall(action, payload, token, (fresh) => { token = fresh; });
  } catch (e) {
    if (e instanceof SyntaxError) throw new Error(t('תשובה לא תקינה מהשרת'));
    throw new NetworkError(t('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'));
  }
}

export async function call<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  const data = backendKind() === 'supabase' ? await supabase(action, payload) : await appsScript(action, payload);
  if (data?.error) {
    const msg = tServer(String(data.error));
    if (String(data.error).startsWith('AUTH:')) throw new AuthError(tServer(String(data.error).slice(5).trim()));
    if (String(data.error).startsWith('VERIFY:')) { dispatchEvent(new Event('need-verify')); throw new Error(tServer(String(data.error).slice(7).trim())); }
    throw new Error(msg);
  }
  return data as T;
}
