/** The transport switch in src/api.ts: Apps Script by default, Supabase only with VITE_BACKEND=supabase. */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthError, backendKind, call, getToken, hasBackend, NetworkError, setToken } from '../src/api';

type Sent = { url: string; init: RequestInit };
let sent: Sent[] = [];

function serve(...answers: (object | Error)[]) {
  sent = [];
  vi.stubGlobal('fetch', vi.fn(async (url: string, init: RequestInit) => {
    sent.push({ url, init });
    const a = answers.length > 1 ? answers.shift()! : answers[0];
    if (a instanceof Error) throw a;
    return { json: async () => a } as Response;
  }));
}

const body = (i = 0) => JSON.parse(String(sent[i].init.body));
const headers = (i = 0) => (sent[i].init.headers || {}) as Record<string, string>;

beforeEach(() => setToken(null));
afterEach(() => {
  vi.unstubAllGlobals();
  vi.unstubAllEnvs();
});

describe('default transport (Apps Script)', () => {
  it('is used when VITE_BACKEND is not set, unchanged: token in the body, no custom headers', async () => {
    expect(backendKind()).toBe('apps-script');
    expect(hasBackend()).toBe(true);
    serve({ user: { userId: 'u1' } });
    setToken('tok');
    expect(await call('me')).toEqual({ user: { userId: 'u1' } });
    expect(sent[0].url).toMatch(/^https:\/\/script\.google\.com\//);
    expect(sent[0].init.method).toBe('POST');
    expect(sent[0].init.headers).toBeUndefined(); // "simple" request: no CORS preflight
    expect(body()).toEqual({ action: 'me', token: 'tok' });
  });

  it('maps server and network errors as before', async () => {
    serve({ error: 'AUTH: נדרשת התחברות' });
    await expect(call('me')).rejects.toBeInstanceOf(AuthError);
    serve(new TypeError('offline'));
    await expect(call('me')).rejects.toBeInstanceOf(NetworkError);
  });
});

describe('Supabase transport (VITE_BACKEND=supabase)', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_BACKEND', 'supabase');
    vi.stubEnv('VITE_SUPABASE_URL', 'https://demo-project.supabase.co/');
    vi.stubEnv('VITE_SUPABASE_ANON_KEY', 'anon-public-key');
  });

  it('has no backend until the project URL and anon key are set', () => {
    expect(backendKind()).toBe('supabase');
    expect(hasBackend()).toBe(true);
    vi.stubEnv('VITE_SUPABASE_URL', '');
    expect(hasBackend()).toBe(false);
  });

  it('posts the same action to the api Edge Function with the token as a bearer header', async () => {
    serve({ weeks: [] });
    setToken('access-1');
    expect(await call('getWeeks', { since: 5 })).toEqual({ weeks: [] });
    expect(sent[0].url).toBe('https://demo-project.supabase.co/functions/v1/api');
    expect(headers()).toMatchObject({ Authorization: 'Bearer access-1', apikey: 'anon-public-key', 'Content-Type': 'application/json' });
    expect(body()).toEqual({ since: 5, action: 'getWeeks' }); // no token in the body
  });

  it('uses the anon key when signed out', async () => {
    serve({ ok: true });
    await call('status');
    expect(headers().Authorization).toBe('Bearer anon-public-key');
  });

  it('keeps the refresh token out of the app and renews an expired access token once', async () => {
    serve({ token: 'access-1', refresh: 'refresh-1', user: { userId: 'u1' } });
    const r = await call<any>('login', { email: 'a@x.com', password: 'x' });
    expect(r).toEqual({ token: 'access-1', user: { userId: 'u1' } }); // refresh stripped
    setToken(r.token);

    serve({ error: 'AUTH: נדרשת התחברות מחדש' }, { token: 'access-2', refresh: 'refresh-2' }, { rewards: { balance: 7 } });
    expect(await call('rewards')).toEqual({ rewards: { balance: 7 } });
    expect(body(1)).toEqual({ refresh: 'refresh-1', action: 'refresh' });
    expect(headers(2).Authorization).toBe('Bearer access-2');
    expect(getToken()).toBe('access-2');
  });

  it('signs out (AuthError) when there is no refresh token or it was revoked', async () => {
    setToken('stale');
    setToken(null); // sign-out clears the stored refresh token
    setToken('stale');
    serve({ error: 'AUTH: נדרשת התחברות מחדש' });
    await expect(call('me')).rejects.toBeInstanceOf(AuthError);
    expect(sent).toHaveLength(1);
  });

  it('maps VERIFY, plain errors, offline and non-JSON answers like the Apps Script path', async () => {
    const seen = vi.fn();
    vi.stubGlobal('dispatchEvent', seen); // window event in the browser
    serve({ error: 'VERIFY: צריך לאמת' });
    await expect(call('createPost')).rejects.toThrow('צריך לאמת');
    expect(seen.mock.calls[0][0].type).toBe('need-verify');

    serve({ error: 'אין מספיק מטבעות' });
    await expect(call('spend')).rejects.toThrow('אין מספיק מטבעות');

    serve(new TypeError('Failed to fetch'));
    await expect(call('me')).rejects.toBeInstanceOf(NetworkError);

    vi.stubGlobal('fetch', vi.fn(async () => ({ json: async () => { throw new SyntaxError('bad'); } })));
    const e = await call('me').catch((x) => x);
    expect(e).toBeInstanceOf(Error);
    expect(e).not.toBeInstanceOf(NetworkError);
  });
});
