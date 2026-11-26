import { t, tServer } from './i18n';
import { API_URL } from './config';

export interface UserProfile {
  birthDate?: string;
  heightCm?: number;
  goalWeight?: number;
  goal?: string;
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
}

export interface AdminUserRow extends User {
  weeks: number;
  lastWeek: string | null;
  firstWeight: number | null;
  currentWeight: number | null;
  recentWorkouts: number;
  recentMealsPct: number | null;
  level?: number;
  levelName?: string;
  coins?: number;
  lifetime?: number;
}

export class AuthError extends Error {}

let token: string | null = null;
export const setToken = (t: string | null) => (token = t);
export const hasBackend = () => !!API_URL;

/** POST as text/plain so the browser sends a "simple" request (no CORS preflight). */
export async function call<T = any>(action: string, payload: Record<string, unknown> = {}): Promise<T> {
  if (!API_URL) throw new Error(t('השרת לא הוגדר'));
  let res: Response;
  try {
    res = await fetch(API_URL, { method: 'POST', body: JSON.stringify({ action, token, ...payload }) });
  } catch {
    throw new Error(t('אין חיבור לשרת. בדוק את האינטרנט ונסה שוב.'));
  }
  let data: any;
  try {
    data = await res.json();
  } catch {
    throw new Error(t('תשובה לא תקינה מהשרת'));
  }
  if (data?.error) {
    const msg = tServer(String(data.error));
    if (String(data.error).startsWith('AUTH:')) throw new AuthError(tServer(String(data.error).slice(5).trim()));
    throw new Error(msg);
  }
  return data as T;
}
