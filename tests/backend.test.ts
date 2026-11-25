import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const week = (sunday: string, weight?: number) => ({
  sundayDate: sunday,
  updatedAt: 1000,
  data: { sundayDate: sunday, startWeight: weight, days: [] },
  summary: { startWeight: weight, workouts: 2, mealsPct: 50 },
});

describe('Apps Script backend (apps-script/Code.gs)', () => {
  let be: ReturnType<typeof createBackend>;
  let admin: { token: string; user: any };

  beforeEach(() => {
    be = createBackend();
    admin = be.post({ action: 'register', email: 'Me@Example.com', password: 'secret1', name: 'אדר' });
  });

  it('makes the first user an admin without an invite', () => {
    expect(admin.user.role).toBe('admin');
    expect(admin.user.email).toBe('me@example.com');
    expect(be.post({ action: 'status' }).hasUsers).toBe(true);
  });

  it('requires a valid unused invite for later users', () => {
    expect(be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב' }).error).toMatch(/הזמנה/);
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב', invite: code.toLowerCase() });
    expect(b.user.role).toBe('user');
    expect(be.post({ action: 'register', email: 'c@x.com', password: 'secret1', name: 'ג', invite: code }).error).toMatch(/נוצל/);
  });

  it('logs in with the right password only', () => {
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'secret1' }).token).toBeTruthy();
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'nope!!' }).error).toMatch(/שגויים/);
    expect(be.sheets.Users.data[1][4]).not.toContain('secret1');
  });

  it('rejects bad or tampered tokens', () => {
    expect(be.post({ action: 'me', token: 'x.y.z' }).error).toMatch(/^AUTH:/);
    const [id, exp, sig] = admin.token.split('.');
    expect(be.post({ action: 'me', token: `${id}.${Number(exp) + 1}.${sig}` }).error).toMatch(/^AUTH:/);
    expect(be.post({ action: 'me', token: admin.token }).user.name).toBe('אדר');
  });

  it('upserts weeks, keeping the newest version', () => {
    const t = admin.token;
    expect(be.post({ action: 'putWeeks', token: t, weeks: [week('2026-11-15', 104), week('2026-11-22', 103)] }).accepted).toBe(2);
    // older update is ignored, newer one replaces
    expect(be.post({ action: 'putWeeks', token: t, weeks: [{ ...week('2026-11-22', 99), updatedAt: 500 }] }).accepted).toBe(0);
    expect(be.post({ action: 'putWeeks', token: t, weeks: [{ ...week('2026-11-22', 102), updatedAt: 2000 }] }).accepted).toBe(1);
    const { weeks } = be.post({ action: 'getWeeks', token: t, since: 0 });
    expect(weeks.map((w: any) => [w.sundayDate, w.data.startWeight])).toEqual([['2026-11-15', 104], ['2026-11-22', 102]]);
    expect(be.post({ action: 'getWeeks', token: t, since: 1500 }).weeks).toHaveLength(1);
  });

  it('grows the sheet when it runs out of rows', () => {
    const many = Array.from({ length: 1100 }, (_, i) => week(`2000-01-${String((i % 28) + 1).padStart(2, '0')}`.replace(/^2000/, String(2000 + Math.floor(i / 28)))));
    const res = be.post({ action: 'putWeeks', token: admin.token, weeks: many.slice(0, 400) });
    expect(res.accepted).toBe(400);
    be.post({ action: 'putWeeks', token: admin.token, weeks: many.slice(400, 800) });
    expect(be.post({ action: 'putWeeks', token: admin.token, weeks: many.slice(800, 1100) }).accepted).toBe(300);
    expect(be.sheets.Weeks.getLastRow()).toBe(1101);
  });

  it('keeps users apart and lets only the admin read others', () => {
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב', invite: code });
    be.post({ action: 'putWeeks', token: b.token, weeks: [week('2026-11-22', 70)] });
    expect(be.post({ action: 'getWeeks', token: admin.token }).weeks).toHaveLength(0);
    expect(be.post({ action: 'getWeeks', token: admin.token, userId: b.user.userId }).weeks).toHaveLength(1);
    expect(be.post({ action: 'getWeeks', token: b.token, userId: admin.user.userId }).error).toMatch(/מנהל/);
    expect(be.post({ action: 'listUsers', token: b.token }).error).toMatch(/מנהל/);
    const users = be.post({ action: 'listUsers', token: admin.token }).users;
    expect(users.find((u: any) => u.userId === b.user.userId)).toMatchObject({ weeks: 1, currentWeight: 70, recentWorkouts: 2 });
  });

  it('stores profile details and photos, and guards photo access', () => {
    const img = 'data:image/jpeg;base64,' + btoa('fake-jpeg');
    const res = be.post({ action: 'updateProfile', token: admin.token, name: 'אדר ב', profile: { heightCm: 180, completed: true }, photo: img });
    expect(res.user).toMatchObject({ name: 'אדר ב', profile: { heightCm: 180, completed: true } });
    expect(be.post({ action: 'getPhoto', token: admin.token, photoId: res.user.photoId }).dataUrl).toBe(img);

    const wk = be.post({ action: 'setWeekPhoto', token: admin.token, sundayDate: '2026-11-22', photo: img, data: { sundayDate: '2026-11-22', days: [] } });
    expect(wk.photoId).toBeTruthy();
    // a later sync of the same week keeps the photo
    be.post({ action: 'putWeeks', token: admin.token, weeks: [{ ...week('2026-11-22', 100), updatedAt: Date.now() + 1000 }] });
    expect(be.post({ action: 'getWeeks', token: admin.token }).weeks[0].photoId).toBe(wk.photoId);

    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב', invite: code });
    expect(be.post({ action: 'getPhoto', token: b.token, photoId: wk.photoId }).error).toMatch(/גישה/);
    // replacing trashes the old file
    be.post({ action: 'setWeekPhoto', token: admin.token, sundayDate: '2026-11-22', photo: null });
    expect(be.files.get(wk.photoId).trashed).toBe(true);
  });

  it('chat: needs a key, sends history as context, and enforces a daily limit', () => {
    expect(be.post({ action: 'chat', token: admin.token, messages: [{ role: 'user', content: 'היי' }] }).error).toMatch(/מפתח/);
    be.properties.set('OPENAI_API_KEY', 'sk-test');
    be.properties.set('CHAT_DAILY_LIMIT', '2');
    be.post({ action: 'putWeeks', token: admin.token, weeks: [week('2026-11-22', 104.2)] });
    const r = be.post({ action: 'chat', token: admin.token, messages: [{ role: 'user', content: 'מה המשקל שלי?' }] });
    expect(r.reply).toBe('תשובה לדוגמה');
    const sent = JSON.parse(be.fetches[0].opts.payload);
    expect(sent.messages[0].content).toContain('2026-11-22 | משקל 104.2');
    expect(be.fetches[0].opts.headers.Authorization).toBe('Bearer sk-test');
    be.post({ action: 'chat', token: admin.token, messages: [] });
    expect(be.post({ action: 'chat', token: admin.token, messages: [] }).error).toMatch(/מגבלת/);
  });

  it('chat: keeps the prompt small for a long history', () => {
    be.properties.set('OPENAI_API_KEY', 'sk-test');
    const weeks = Array.from({ length: 191 }, (_, i) => {
      const d = new Date(Date.UTC(2023, 3, 2 + 7 * i)).toISOString().slice(0, 10);
      return {
        sundayDate: d, updatedAt: 1000,
        data: { sundayDate: d, days: Array.from({ length: 7 }, () => ({ sport: { status: 'V', label: 'אימון קיקבוקס (שעה)' } })), note: 'הערה קצרה' },
        summary: { startWeight: 90 + (i % 10), workouts: 3, mealsPct: 60 },
      };
    });
    be.post({ action: 'putWeeks', token: admin.token, weeks });
    be.post({ action: 'chat', token: admin.token, messages: [{ role: 'user', content: 'סכם' }] });
    const sent = JSON.parse(be.fetches.at(-1).opts.payload);
    expect(sent.max_tokens).toBe(350);
    expect(sent.messages[0].content).toContain('סיכום חודשי');
    expect(sent.messages[0].content.length).toBeLessThan(7000);
    console.log('system prompt chars for 191 weeks:', sent.messages[0].content.length);
  });
});
