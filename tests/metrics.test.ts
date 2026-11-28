/** Backend metrics: adminFunnel extras (T22), anonymous landing counters (T21). */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const NOW = '2026-12-09T10:00:00Z';
const reg = (be: any, key: string) => be.post({ action: 'register', email: `${key}@example.com`, password: 'secret12', name: key, terms: true });

describe('adminFunnel (T22, backend details)', () => {
  it('leaves flagged test accounts out, and only admins can flag', () => {
    const be = createBackend({ now: NOW });
    const admin = reg(be, 'admin');
    const a = reg(be, 'a');
    const t = reg(be, 't');
    expect(be.post({ action: 'setTestAccount', token: a.token, userId: t.user.userId, on: true }).error).toBeTruthy();
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 30 }).cohort.signedUp).toBe(2);
    expect(be.post({ action: 'setTestAccount', token: admin.token, userId: t.user.userId, on: true }).ok).toBe(true);
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 30 }).cohort.signedUp).toBe(1); // cache dropped
  });

  it('is cached for 10 minutes per period and day', () => {
    const be = createBackend({ now: NOW });
    const admin = reg(be, 'admin');
    reg(be, 'a');
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 30 }).cohort.signedUp).toBe(1);
    reg(be, 'b');
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 30 }).cohort.signedUp).toBe(1); // cached
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 7 }).cohort.signedUp).toBe(2); // other period
  });
});

describe('anonymous landing counters (T21)', () => {
  const analytics = (be: any) => be.sheets.Analytics?.data.slice(1) ?? [];

  it('counts allowed events per day without a token or any user data', () => {
    const be = createBackend({ now: NOW });
    expect(be.post({ action: 'landing', event: 'landing:view' })).toEqual({ ok: true });
    be.post({ action: 'landing', event: 'landing:view' });
    be.post({ action: 'landing', event: 'landing:signup-open' });
    const rows = analytics(be);
    expect(rows).toEqual([['2026-12-09', 'landing:view', 2, '[]'], ['2026-12-09', 'landing:signup-open', 1, '[]']]);
  });

  it('ignores unknown names, extra fields and free text', () => {
    const be = createBackend({ now: NOW });
    expect(be.post({ action: 'landing', event: 'screen:week' })).toEqual({ ok: true });
    expect(be.post({ action: 'landing', event: 'x'.repeat(500) })).toEqual({ ok: true });
    be.post({ action: 'landing', event: 'landing:cta', userId: 'abc', email: 'a@b.com', text: 'hello' });
    expect(analytics(be)).toEqual([['2026-12-09', 'landing:cta', 1, '[]']]);
    expect(JSON.stringify(be.sheets)).not.toMatch(/a@b\.com|hello|abc/);
  });

  it('is capped per event per hour so it cannot flood the sheet', () => {
    const be = createBackend({ now: NOW });
    be.cache.set('land-landing:view-2026-12-09T10', '2000');
    be.post({ action: 'landing', event: 'landing:view' });
    expect(analytics(be)).toEqual([]);
  });

  it('feeds the funnel visitor counts', () => {
    const be = createBackend({ now: NOW });
    const admin = reg(be, 'admin');
    be.post({ action: 'landing', event: 'landing:view' });
    be.post({ action: 'landing', event: 'landing:signup-open' });
    expect(be.post({ action: 'adminFunnel', token: admin.token, days: 7 }).visitors).toEqual({ landing: 1, signupOpen: 1 });
  });
});
