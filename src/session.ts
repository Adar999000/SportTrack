import { AuthError, call, hasBackend, setToken, type User } from './api';
import { kvGet, kvSet } from './db';

interface Session {
  token: string;
  user: User;
}

let session: Session | null = null;
const listeners = new Set<() => void>();

export const currentUser = () => session?.user ?? null;
export const isAdmin = () => session?.user.role === 'admin';
export const onSession = (l: () => void) => (listeners.add(l), () => listeners.delete(l));
const emit = () => listeners.forEach((l) => l());

export async function loadSession(): Promise<void> {
  if (!hasBackend()) return;
  session = (await kvGet<Session>('session').catch(() => undefined)) ?? null;
  setToken(session?.token ?? null);
}

export async function startSession(s: Session): Promise<void> {
  session = s;
  setToken(s.token);
  await kvSet('session', s).catch(() => {});
  emit();
}

export async function setUser(user: User): Promise<void> {
  if (!session) return;
  session = { ...session, user };
  await kvSet('session', session).catch(() => {});
  emit();
}

export async function endSession(): Promise<void> {
  session = null;
  setToken(null);
  await kvSet('session', null).catch(() => {});
  emit();
}

/** Refresh the user record; ends the session if the token was rejected. */
export async function refreshUser(): Promise<void> {
  if (!session) return;
  try {
    const { user } = await call<{ user: User }>('me');
    await setUser(user);
  } catch (e) {
    if (e instanceof AuthError) await endSession();
  }
}

const photoMem = new Map<string, string>();
/** Photo by Drive id, cached in memory and IndexedDB. */
export async function photoUrl(photoId: string): Promise<string> {
  if (photoMem.has(photoId)) return photoMem.get(photoId)!;
  const cached = await kvGet<string>('photo:' + photoId).catch(() => undefined);
  if (cached) {
    photoMem.set(photoId, cached);
    return cached;
  }
  const { dataUrl } = await call<{ dataUrl: string }>('getPhoto', { photoId });
  photoMem.set(photoId, dataUrl);
  kvSet('photo:' + photoId, dataUrl).catch(() => {});
  return dataUrl;
}

export function rememberPhoto(photoId: string, dataUrl: string): void {
  photoMem.set(photoId, dataUrl);
  kvSet('photo:' + photoId, dataUrl).catch(() => {});
}
