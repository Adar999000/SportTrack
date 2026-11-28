/** Beta micro-survey server side (T26, team/specs/beta-feedback.md). */
import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const DAY = 864e5;
const D0 = Date.parse('2026-12-01T09:00:00Z');

function world() {
  let now = D0;
  const be = createBackend({ now: () => now });
  const at = (d: number, h = 0) => { now = D0 + d * DAY + h * 36e5; };
  const reg = (k: string, name = k) => be.post({ action: 'register', email: `${k}@example.com`, password: 'secret12', name, terms: true });
  const admin = reg('admin', 'מנהלת ראשית');
  const u = reg('u', 'דנה כהן');
  const open = (t: string, d: number) => { at(d); be.post({ action: 'track', token: t, events: { 'screen:today': 1 } }); };
  const status = (t = u.token) => be.post({ action: 'surveyStatus', token: t });
  return { be, at, reg, admin, u, open, status };
}

describe('surveyStatus eligibility', () => {
  it('offers d3 from day 3 to 9 only to users active on 2+ days', () => {
    const w = world();
    w.at(2); expect(w.status().survey).toBeNull();
    w.at(3); expect(w.status().survey).toBeNull(); // not active on 2 days yet
    w.open(w.u.token, 1); w.open(w.u.token, 3);
    expect(w.status()).toMatchObject({ survey: 'd3', snoozedUntil: null });
    w.at(10); expect(w.status().survey).toBe('d7'); // d3 window over: it no longer blocks d7
  });

  it('offers d7 only after d3 is answered or dismissed, never within 24 h of it', () => {
    const w = world();
    w.open(w.u.token, 1); w.open(w.u.token, 2);
    w.at(7);
    expect(w.status().survey).toBe('d3'); // d3 still open (window to day 9)
    expect(w.be.post({ action: 'submitSurvey', token: w.u.token, survey: 'd3', score: 4 }).ok).toBe(true);
    expect(w.status().survey).toBeNull(); // 24 h gap
    w.at(8, 1);
    expect(w.status().survey).toBe('d7');
    w.at(15); expect(w.status().survey).toBeNull(); // d7 window over
  });

  it('never shows a survey to admins', () => {
    const w = world();
    w.open(w.admin.token, 1); w.open(w.admin.token, 3);
    expect(w.status(w.admin.token).survey).toBeNull();
  });
});

describe('snooze and dismiss (stored per user, any device)', () => {
  it('snoozes 2 days; the second snooze closes the survey', () => {
    const w = world();
    w.open(w.u.token, 1); w.open(w.u.token, 3);
    const s1 = w.be.post({ action: 'dismissSurvey', token: w.u.token, survey: 'd3' });
    expect(s1).toMatchObject({ survey: null, snoozedUntil: new Date(D0 + 5 * DAY).toISOString() });
    w.at(5); expect(w.status().survey).toBe('d3');
    w.be.post({ action: 'dismissSurvey', token: w.u.token, survey: 'd3' });
    w.at(6); expect(w.status().survey).toBeNull(); // closed after 2 snoozes; d7 opens on day 7
    w.at(8);
    // a fresh sign-in (new device) sees the same state
    const again = w.be.post({ action: 'login', email: 'u@example.com', password: 'secret12' });
    expect(w.status(again.token).survey).toBe('d7');
  });

  it('"don\'t show again" closes it for good', () => {
    const w = world();
    w.open(w.u.token, 1); w.open(w.u.token, 3);
    w.be.post({ action: 'dismissSurvey', token: w.u.token, survey: 'd3', forever: true });
    w.at(4); expect(w.status().survey).toBeNull();
  });
});

describe('submitSurvey', () => {
  it('validates the survey, score and text; ignores a second answer', () => {
    const w = world();
    w.at(3);
    const post = (p: object) => w.be.post({ action: 'submitSurvey', token: w.u.token, ...p });
    expect(post({ survey: 'x', score: 3 }).error).toBeTruthy();
    expect(post({ survey: 'd3', score: 0 }).error).toBeTruthy();
    expect(post({ survey: 'd3', score: 2.5 }).error).toBeTruthy();
    expect(post({ survey: 'd3', score: 6 }).error).toBeTruthy();
    expect(post({ survey: 'd3', score: 3, text: 'x'.repeat(501) }).error).toBeTruthy();
    expect(post({ survey: 'd7', score: 3 }).error).toMatch(/עוד לא פתוח/);
    expect(post({ survey: 'd3', score: 3, text: 'קצת מבלבל' })).toEqual({ ok: true });
    expect(post({ survey: 'd3', score: 1 })).toEqual({ ok: true, duplicate: true });
    expect(w.be.sheets.Feedback.data.slice(1).map((r: any[]) => [r[2], r[3], r[4]])).toEqual([['d3', 3, 'קצת מבלבל']]);
  });

  it('never emails for an answer; a reply request opens one support thread', () => {
    const w = world();
    const v = w.reg('v');
    w.at(3);
    const mails = w.be.mails.length;
    w.be.post({ action: 'submitSurvey', token: w.u.token, survey: 'd3', score: 5, wantsReply: true }); // no text: no thread
    expect(w.be.sheets.Messages?.data.length ?? 1).toBe(1);
    expect(w.be.mails.length).toBe(mails);
    w.be.post({ action: 'submitSurvey', token: v.token, survey: 'd3', score: 2, text: 'לא מצאתי איך מסמנים', wantsReply: true });
    const msgs = w.be.sheets.Messages.data.slice(1);
    expect(msgs).toHaveLength(1);
    expect(msgs[0][4]).toBe('משוב יום 3');
    expect(msgs[0][5]).toBe('לא מצאתי איך מסמנים');
  });

  it("returns the user's own answers (for their export) and deletes them with the account", () => {
    const w = world();
    w.at(3);
    w.be.post({ action: 'submitSurvey', token: w.u.token, survey: 'd3', score: 4, text: 'טוב' });
    expect(w.status().answers).toEqual([expect.objectContaining({ survey: 'd3', score: 4, text: 'טוב', wantsReply: false })]);
    w.be.post({ action: 'deleteAccount', token: w.u.token, password: 'secret12' });
    expect(w.be.sheets.Feedback.data.slice(1)).toHaveLength(0);
  });
});

describe('adminFeedback', () => {
  it('links a reply request to its support thread with messageId', () => {
    const w = world();
    const v = w.reg('v', 'ורד');
    w.at(3);
    w.be.post({ action: 'submitSurvey', token: w.u.token, survey: 'd3', score: 4, text: 'בלי בקשה לתשובה' });
    w.be.post({ action: 'submitSurvey', token: v.token, survey: 'd3', score: 2, text: 'תחזרו אליי', wantsReply: true });
    const latest = w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback.d3.latest;
    const asked = latest.find((x: any) => x.text === 'תחזרו אליי');
    const plain = latest.find((x: any) => x.text === 'בלי בקשה לתשובה');
    const thread = w.be.post({ action: 'adminThread', token: w.admin.token, userId: v.user.userId }).messages;
    expect(asked.messageId).toBe(thread[0].id);
    expect(plain).not.toHaveProperty('messageId');
  });

  it('admin only; average hidden under 5 answers; first names only, no email or ids', () => {
    const w = world();
    const others = ['a', 'b', 'c', 'd'].map((k) => w.reg(k));
    w.at(3);
    expect(w.be.post({ action: 'adminFeedback', token: w.u.token }).error).toBeTruthy();
    w.be.post({ action: 'submitSurvey', token: w.u.token, survey: 'd3', score: 4, text: 'נחמד מאוד' });
    let f = w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback;
    expect(f.d3).toMatchObject({ count: 1, distribution: { 1: 0, 2: 0, 3: 0, 4: 1, 5: 0 } });
    expect(f.d3).not.toHaveProperty('average');
    expect(f.d3.latest[0]).toMatchObject({ firstName: 'דנה', score: 4, text: 'נחמד מאוד', day: 3 });
    const text = JSON.stringify(f);
    expect(text).not.toMatch(/example\.com|כהן|userId/);
    expect(text).not.toContain(w.u.user.userId);
    for (const o of others) w.be.post({ action: 'submitSurvey', token: o.token, survey: 'd3', score: 2 });
    f = w.be.post({ action: 'adminFeedback', token: w.admin.token }).feedback;
    expect(f.d3).toMatchObject({ count: 5, average: 2.4 });
    expect(f.d7.count).toBe(0);
  });
});
