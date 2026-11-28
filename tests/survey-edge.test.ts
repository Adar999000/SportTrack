/** T29 (qa): boundary and privacy edge cases for the beta micro-survey, on top of tests/survey.test.ts. */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const DAY = 864e5, HOUR = 36e5;
const D0 = Date.parse('2026-12-01T09:00:00Z');

function world(start = D0) {
  let now = start;
  const be = createBackend({ now: () => now });
  const at = (d: number, h = 0) => { now = start + d * DAY + h * HOUR; };
  const reg = (k: string, name = k) => be.post({ action: 'register', email: `${k}@example.com`, password: 'secret12', name, terms: true });
  const admin = reg('admin', 'מנהלת');
  const u = reg('u', 'דנה כהן');
  const open = (t: string, d: number) => { at(d); be.post({ action: 'track', token: t, events: { 'screen:today': 1 } }); };
  const status = (t = u.token) => be.post({ action: 'surveyStatus', token: t });
  const submit = (p: object, t = u.token) => be.post({ action: 'submitSurvey', token: t, ...p });
  const dismiss = (p: object, t = u.token) => be.post({ action: 'dismissSurvey', token: t, ...p });
  return { be, at, reg, admin, u, open, status, submit, dismiss };
}
const active = (w: ReturnType<typeof world>, t = w.u.token) => { w.open(t, 1); w.open(t, 2); };

describe('windows: d3 days 3–9, d7 days 7–14', () => {
  it('d3: closed on day 2, open on days 3 and 9, gone on day 10', () => {
    const w = world(); active(w);
    w.at(2); expect(w.status().survey).toBeNull();
    w.at(3); expect(w.status().survey).toBe('d3');
    w.at(9); expect(w.status().survey).toBe('d3');
    w.at(10); expect(w.status().survey).not.toBe('d3');
  });

  it('an unanswered expired d3 unblocks d7 at once (no 24 h gap, nothing was answered)', () => {
    const w = world(); active(w);
    w.at(10); expect(w.status().survey).toBe('d7');
  });

  it('d7: not before day 7 (after d3 is done), open on day 14, gone on day 15', () => {
    const w = world(); active(w);
    w.at(3); w.dismiss({ survey: 'd3', forever: true });
    w.at(6); expect(w.status().survey).toBeNull();
    w.at(7); expect(w.status().survey).toBe('d7');
    w.at(14); expect(w.status().survey).toBe('d7');
    w.at(15); expect(w.status().survey).toBeNull();
  });

  it('counts Israel calendar days, not 24 h blocks (sign-up 00:30 local on day 1)', () => {
    // 2026-12-01T22:30Z is 2026-12-02 00:30 in Israel (UTC+2)
    const start = Date.parse('2026-12-01T22:30:00Z');
    const w = world(start);
    w.at(1, 23); // 2026-12-03 21:30Z = Dec 3 23:30 IL → age 2
    expect(w.submit({ survey: 'd3', score: 3 }).error).toMatch(/עוד לא פתוח/);
    w.at(2, 0); // 2026-12-03 22:30Z = Dec 4 00:30 IL → age 2 still (Dec 2 → Dec 4)
    expect(w.submit({ survey: 'd3', score: 3 }).error).toMatch(/עוד לא פתוח/);
    w.at(2, 24); // Dec 4 22:30Z = Dec 5 00:30 IL → age 3
    expect(w.submit({ survey: 'd3', score: 3 })).toEqual({ ok: true });
  });
});

describe('who is eligible', () => {
  it('a user active on one day only is never asked, even inside the window', () => {
    const w = world(); w.open(w.u.token, 3);
    for (const d of [3, 5, 9]) { w.at(d); expect(w.status().survey).toBeNull(); }
  });

  it('the 24 h gap after d3 is exact: 23 h no, 24 h yes', () => {
    const w = world(); active(w);
    w.at(7, 0); w.dismiss({ survey: 'd3', forever: true });
    w.at(7, 23); expect(w.status().survey).toBeNull();
    w.at(8, 0); expect(w.status().survey).toBe('d7');
  });

  it('a snoozed d3 keeps d7 waiting, and reports when it returns', () => {
    const w = world(); active(w);
    w.at(7); const s = w.dismiss({ survey: 'd3' });
    expect(s).toMatchObject({ survey: null, snoozedUntil: new Date(D0 + 9 * DAY).toISOString() });
    w.at(8); expect(w.status()).toMatchObject({ survey: null, snoozedUntil: expect.any(String) });
    w.at(9); expect(w.status().survey).toBe('d3');
  });
});

describe('snooze limits', () => {
  it('second snooze closes d3 for good; d7 then follows its own window', () => {
    const w = world(); active(w);
    w.at(3); w.dismiss({ survey: 'd3' });
    w.at(5); w.dismiss({ survey: 'd3' });
    w.at(6); expect(w.status()).toMatchObject({ survey: null, snoozedUntil: null });
    w.at(7); expect(w.status().survey).toBe('d7');
  });

  it('the same limit applies to d7', () => {
    const w = world(); active(w);
    w.at(3); w.dismiss({ survey: 'd3', forever: true });
    w.at(8); w.dismiss({ survey: 'd7' });
    w.at(10); expect(w.status().survey).toBe('d7');
    w.dismiss({ survey: 'd7' });
    w.at(14); expect(w.status().survey).toBeNull();
  });

  it('an answered survey cannot be dismissed back open or snoozed', () => {
    const w = world(); active(w);
    w.at(3); w.submit({ survey: 'd3', score: 5 });
    w.dismiss({ survey: 'd3' });
    w.at(4); expect(w.status().survey).toBeNull();
    expect(w.dismiss({ survey: 'nope' }).error).toBeTruthy();
  });
});

describe('submitSurvey', () => {
  it('accepts exactly 500 chars, rejects 501; whitespace-only text counts as no text', () => {
    const w = world(); const v = w.reg('v'); const x = w.reg('x');
    w.at(3);
    expect(w.submit({ survey: 'd3', score: 3, text: 'x'.repeat(501) }).error).toBeTruthy();
    expect(w.submit({ survey: 'd3', score: 3, text: 'ש'.repeat(500) })).toEqual({ ok: true });
    const before = w.be.sheets.Messages?.data.length ?? 1;
    expect(w.submit({ survey: 'd3', score: 4, text: '   ', wantsReply: true }, v.token)).toEqual({ ok: true });
    expect(w.be.sheets.Messages?.data.length ?? 1).toBe(before); // wantsReply without text opens no thread
    expect(w.submit({ survey: 'd3', score: null }, x.token).error).toBeTruthy();
    expect(w.submit({ survey: 'd3' }, x.token).error).toBeTruthy();
    expect(w.submit({ survey: 'd3', score: '7' }, x.token).error).toBeTruthy();
  });

  it('one answer per survey; the second is ignored and the first score stays', () => {
    const w = world(); w.at(3);
    w.submit({ survey: 'd3', score: 2 });
    expect(w.submit({ survey: 'd3', score: 5 })).toEqual({ ok: true, duplicate: true });
    expect(w.status().answers.map((a: any) => a.score)).toEqual([2]);
  });

  it('never sends any email (scores, text, or reply request) — only the reply thread may notify the admin', () => {
    const w = world(); w.at(3);
    const n = w.be.mails.length;
    w.submit({ survey: 'd3', score: 1, text: 'לא ברור' });
    expect(w.be.mails.length).toBe(n);
    expect(JSON.stringify(w.be.mails.slice(n))).not.toContain('u@example.com');
  });

  it('a signed-out caller cannot submit or read status', () => {
    const w = world(); w.at(3);
    expect(w.be.post({ action: 'submitSurvey', survey: 'd3', score: 3 }).error).toBeTruthy();
    expect(w.be.post({ action: 'surveyStatus' }).error).toBeTruthy();
  });
});

describe('adminFeedback privacy', () => {
  const answers = (w: ReturnType<typeof world>, n: number, survey = 'd3') => {
    w.at(0);
    const users = Array.from({ length: n }, (_, i) => w.reg(`p${survey}${i}`, `שם${i} משפחה`));
    w.at(survey === 'd3' ? 3 : 7);
    users.forEach((r, i) => w.submit({ survey, score: 3 + (i % 3), text: `הערה ${i}` }, r.token));
  };

  it('average appears at exactly 5 answers, not 4; each survey counted on its own', () => {
    const w = world(); answers(w, 4);
    const f4 = w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback;
    expect(f4.d3.count).toBe(4); expect(f4.d3).not.toHaveProperty('average');
    answers(w, 1, 'd7'); // a d7 answer does not push d3 over the line
    expect(w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback.d3).not.toHaveProperty('average');
    w.at(0); const r = w.reg('fifth'); w.at(3); w.submit({ survey: 'd3', score: 5 }, r.token);
    expect(w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback.d3).toHaveProperty('average');
  });

  it('exposes no emails, user ids, tokens or surnames; texts newest first, first names only', () => {
    const w = world(); answers(w, 6);
    const f = w.be.post({ action: 'adminFeedback', token: w.admin.token });
    const text = JSON.stringify(f);
    expect(text).not.toMatch(/@|example\.com|משפחה|userId|token/);
    const ids = w.be.post({ action: 'listUsers', token: w.admin.token }).users.map((x: any) => x.userId);
    ids.forEach((id: string) => expect(text).not.toContain(id));
    const times = f.feedback.d3.latest.map((x: any) => x.at);
    expect([...times].sort().reverse()).toEqual(times);
    f.feedback.d3.latest.forEach((x: any) => expect(x.firstName).toMatch(/^שם\d$/));
  });

  it('non-admins and signed-out callers are refused', () => {
    const w = world(); answers(w, 1);
    expect(w.be.post({ action: 'adminFeedback', token: w.u.token }).error).toBeTruthy();
    expect(w.be.post({ action: 'adminFeedback' }).error).toBeTruthy();
  });

  it("surveyStatus returns only the caller's own answers", () => {
    const w = world(); answers(w, 2);
    w.submit({ survey: 'd3', score: 5, text: 'שלי' });
    const mine = w.status().answers;
    expect(mine).toHaveLength(1);
    expect(JSON.stringify(mine)).not.toContain('הערה');
  });
});

describe('deleteAccount', () => {
  it("removes that user's answers (both surveys) and leaves everyone else's", () => {
    const w = world(); const v = w.reg('v');
    w.at(7);
    w.submit({ survey: 'd3', score: 4, text: 'א' }); w.submit({ survey: 'd7', score: 5, text: 'ב' });
    w.submit({ survey: 'd3', score: 2 }, v.token);
    expect(w.be.sheets.Feedback.data.length).toBe(4);
    expect(w.be.post({ action: 'deleteAccount', token: w.u.token, password: 'secret12' }).ok).toBe(true);
    const left = w.be.sheets.Feedback.data.slice(1);
    expect(left).toHaveLength(1);
    expect(left[0][0]).toBe(v.user.userId);
    expect(JSON.stringify(w.be.post({ action: 'adminFeedback', token: w.admin.token }))).not.toMatch(/"text":"[אב]"/);
  });
});
