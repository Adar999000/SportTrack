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

  it('lets anyone sign up; an invite code is optional but must be valid', () => {
    expect(be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב' }).user.role).toBe('user');
    expect(be.post({ action: 'register', email: 'c@x.com', password: 'secret1', name: 'ג', invite: 'NOPE99' }).error).toMatch(/קוד ההזמנה לא תקין/);
    // an admin-created code works once
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    expect(be.post({ action: 'register', email: 'd@x.com', password: 'secret1', name: 'ד', invite: code.toLowerCase() }).user).toBeTruthy();
    expect(be.post({ action: 'register', email: 'e@x.com', password: 'secret1', name: 'ה', invite: code }).error).toMatch(/לא תקין/);
    // a personal code works for many sign-ups
    const mine = be.post({ action: 'myInvite', token: admin.token });
    for (const e of ['f@x.com', 'g@x.com', 'h@x.com']) {
      expect(be.post({ action: 'register', email: e, password: 'secret1', name: 'x', invite: mine.code }).user).toBeTruthy();
    }
    expect(be.post({ action: 'myInvite', token: admin.token })).toMatchObject({ code: mine.code, used: 4 }); // includes the admin-panel code
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

  it('keeps users apart; the admin sees statistics only', () => {
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב', invite: code });
    be.post({ action: 'updateProfile', token: b.token, profile: { birthDate: '1990-01-01', heightCm: 170, goal: 'סוד' } });
    be.post({ action: 'putWeeks', token: b.token, weeks: [
      { ...week('2026-11-15', 72), data: { sundayDate: '2026-11-15', startWeight: 72, note: 'הערה פרטית', days: [] } },
      week('2026-11-22', 70),
    ] });
    expect(be.post({ action: 'getWeeks', token: admin.token }).weeks).toHaveLength(0);
    // no raw weeks of other users, even for the admin
    expect(be.post({ action: 'getWeeks', token: admin.token, userId: b.user.userId }).weeks).toHaveLength(0);
    expect(be.post({ action: 'listUsers', token: b.token }).error).toMatch(/מנהל/);
    const row = be.post({ action: 'listUsers', token: admin.token }).users.find((u: any) => u.userId === b.user.userId);
    expect(row).toMatchObject({ weeks: 2, weightChange: -2, recentWorkouts: 4 });
    expect(row).not.toHaveProperty('profile');
    expect(row).not.toHaveProperty('currentWeight');
    const sum = be.post({ action: 'userSummary', token: admin.token, userId: b.user.userId }).summary;
    expect(sum).toMatchObject({ weeks: 2, weightChange: -2, workoutsPerWeek: 2 });
    expect(JSON.stringify(sum)).not.toMatch(/הערה פרטית|סוד|1990|170/);
    expect(be.post({ action: 'userSummary', token: b.token, userId: admin.user.userId }).error).toMatch(/מנהל/);
  });

  it('admin assistant gets aggregates, never notes or profile details', () => {
    be.properties.set('OPENAI_API_KEY', 'sk');
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret1', name: 'ב', invite: code });
    be.post({ action: 'updateProfile', token: b.token, profile: { goal: 'סוד אישי', heightCm: 170 } });
    be.post({ action: 'putWeeks', token: b.token, weeks: [{ ...week('2026-11-22', 70), data: { sundayDate: '2026-11-22', startWeight: 70, note: 'הערה פרטית', days: [] } }] });
    be.post({ action: 'chat', token: admin.token, scope: 'all', messages: [{ role: 'user', content: 'סכם' }] });
    let sys = JSON.parse(be.fetches.at(-1).opts.payload).messages[0].content;
    expect(sys).toContain('סיכומים סטטיסטיים');
    expect(sys).not.toMatch(/הערה פרטית|סוד אישי|170|משקל 70/);
    be.post({ action: 'chat', token: admin.token, userId: b.user.userId, messages: [{ role: 'user', content: 'סכם' }] });
    sys = JSON.parse(be.fetches.at(-1).opts.payload).messages[0].content;
    expect(sys).not.toMatch(/הערה פרטית|סוד אישי/);
    // the user's own assistant still sees their own notes, and is told to stay on topic
    be.post({ action: 'chat', token: b.token, messages: [{ role: 'user', content: 'מה הבירה של צרפת?' }] });
    sys = JSON.parse(be.fetches.at(-1).opts.payload).messages[0].content;
    expect(sys).toContain('הערה פרטית');
    expect(sys).toContain('אני יכול לעזור רק בשאלות על הנתונים שלך ועל האפליקציה');
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
    // others may see profile pictures (leaderboard), not weekly photos — admins included
    expect(be.post({ action: 'getPhoto', token: b.token, photoId: res.user.photoId }).dataUrl).toBe(img);
    const bPhoto = be.post({ action: 'setWeekPhoto', token: b.token, sundayDate: '2026-11-22', photo: img, data: { sundayDate: '2026-11-22', days: [] } }).photoId;
    expect(be.post({ action: 'getPhoto', token: admin.token, photoId: bPhoto }).error).toMatch(/גישה/);
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

  it('resets a forgotten password with an emailed code', () => {
    expect(be.post({ action: 'requestReset', email: 'nobody@x.com' })).toEqual({ ok: true });
    expect(be.mails).toHaveLength(0); // unknown email: same answer, no mail
    expect(be.post({ action: 'requestReset', email: 'ME@example.com' })).toEqual({ ok: true });
    expect(be.mails).toHaveLength(1);
    const code = /(\d{6})/.exec(be.mails[0].body)![1];
    expect(be.mails[0].to).toBe('me@example.com');
    // a second request within a minute doesn't send another email
    be.post({ action: 'requestReset', email: 'me@example.com' });
    expect(be.mails).toHaveLength(1);
    expect(be.post({ action: 'confirmReset', email: 'me@example.com', code: '000000', newPassword: 'newpass1' }).error).toMatch(/הקוד/);
    const ok = be.post({ action: 'confirmReset', email: 'me@example.com', code, newPassword: 'newpass1' });
    expect(ok.token).toBeTruthy();
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'newpass1' }).token).toBeTruthy();
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'secret1' }).error).toBeTruthy();
    // the code works only once
    expect(be.post({ action: 'confirmReset', email: 'me@example.com', code, newPassword: 'other12' }).error).toMatch(/הקוד/);
  });

  it('cancels a reset code after 5 wrong attempts', () => {
    be.post({ action: 'requestReset', email: 'me@example.com' });
    const code = /(\d{6})/.exec(be.mails[0].body)![1];
    for (let i = 0; i < 5; i++) be.post({ action: 'confirmReset', email: 'me@example.com', code: '111111', newPassword: 'newpass1' });
    expect(be.post({ action: 'confirmReset', email: 'me@example.com', code, newPassword: 'newpass1' }).error).toMatch(/הקוד/);
  });
});
