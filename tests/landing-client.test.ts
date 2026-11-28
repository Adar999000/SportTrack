/** trackLanding (T21 client): name only, no token, once per session. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { trackLanding } from '../src/analytics';
import { setToken } from '../src/api';

afterEach(() => vi.unstubAllGlobals());

describe('trackLanding', () => {
  it('sends only the event name, once per session (signed out: no token)', async () => {
    const sent: any[] = [];
    const store = new Map<string, string>();
    vi.stubGlobal('sessionStorage', { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => store.set(k, v) });
    vi.stubGlobal('fetch', vi.fn(async (_u: string, init: RequestInit) => { sent.push(JSON.parse(String(init.body))); return { json: async () => ({ ok: true }) }; }));
    setToken(null);
    trackLanding('landing:view');
    trackLanding('landing:view');
    trackLanding('landing:cta');
    await new Promise((r) => setTimeout(r, 0));
    expect(sent).toEqual([{ action: 'landing', token: null, event: 'landing:view' }, { action: 'landing', token: null, event: 'landing:cta' }]);
  });

  it('ignores names outside the allow-list', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    trackLanding('screen:week' as any);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
