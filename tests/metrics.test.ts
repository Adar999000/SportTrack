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
