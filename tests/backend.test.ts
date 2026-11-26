import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const week = (sunday: string, weight?: number) => ({
  sundayDate: sunday,
  updatedAt: 1000,
  data: { sundayDate: sunday, startWeight: weight, days: [] },
  summary: { startWeight: weight, workouts: 2, mealsPct: 50 },
});

describe('Apps Script backend (apps-script/server.js)', () => {
  let be: ReturnType<typeof createBackend>;
  let admin: { token: string; user: any };

  beforeEach(() => {
    be = createBackend();
    admin = be.post({ action: 'register', email: 'Me@Example.com', password: 'secret12', name: 'אדר' });
  });

  it('makes the first user an admin without an invite', () => {
    expect(admin.user.role).toBe('admin');
    expect(admin.user.email).toBe('me@example.com');
    expect(be.post({ action: 'status' }).hasUsers).toBe(true);
  });

  it('lets anyone sign up; an invite code is optional but must be valid', () => {
    expect(be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב' }).user.role).toBe('user');
    expect(be.post({ action: 'register', email: 'c@x.com', password: 'secret12', name: 'ג', invite: 'NOPE99' }).error).toMatch(/קוד ההזמנה לא תקין/);
    // an admin-created code works once
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    expect(be.post({ action: 'register', email: 'd@x.com', password: 'secret12', name: 'ד', invite: code.toLowerCase() }).user).toBeTruthy();
    expect(be.post({ action: 'register', email: 'e@x.com', password: 'secret12', name: 'ה', invite: code }).error).toMatch(/לא תקין/);
    // a personal code works for many sign-ups
    const mine = be.post({ action: 'myInvite', token: admin.token });
    for (const e of ['f@x.com', 'g@x.com', 'h@x.com']) {
      expect(be.post({ action: 'register', email: e, password: 'secret12', name: 'x', invite: mine.code }).user).toBeTruthy();
    }
    expect(be.post({ action: 'myInvite', token: admin.token })).toMatchObject({ code: mine.code, used: 4 }); // includes the admin-panel code
  });

  it('logs in with the right password only (admins get a second step by email)', () => {
    const first = be.post({ action: 'login', email: 'me@example.com', password: 'secret12' });
    expect(first.needCode).toBe(true);
    const code = /(\d{6})/.exec(be.mails.at(-1).body)![1];
    expect(be.post({ action: 'login2fa', challenge: first.challenge, code: '000000' }).error).toMatch(/שגוי/);
    expect(be.post({ action: 'login2fa', challenge: first.challenge, code }).token).toBeTruthy();
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'nope!!!!' }).error).toMatch(/שגויים/);
    expect(be.sheets.Users.data[1][4]).not.toContain('secret12');
    expect(be.sheets.Users.data[1][4]).toMatch(/^v2\$/);
  });

  it('rejects bad or tampered tokens', () => {
    expect(be.post({ action: 'me', token: 'x.y.z' }).error).toMatch(/^AUTH:/);
    const [id, exp, ver, sig] = admin.token.split('.');
    expect(be.post({ action: 'me', token: `${id}.${Number(exp) + 1}.${ver}.${sig}` }).error).toMatch(/^AUTH:/);
    expect(be.post({ action: 'me', token: `${id}.${exp}.${Number(ver) + 1}.${sig}` }).error).toMatch(/^AUTH:/);
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
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
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
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
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
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
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
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'newpass1' }).needCode).toBe(true); // admin: second step
    expect(be.post({ action: 'login', email: 'me@example.com', password: 'secret12' }).error).toBeTruthy();
    // the code works only once
    expect(be.post({ action: 'confirmReset', email: 'me@example.com', code, newPassword: 'other12' }).error).toMatch(/הקוד/);
  });

  it('cancels a reset code after 5 wrong attempts', () => {
    be.post({ action: 'requestReset', email: 'me@example.com' });
    const code = /(\d{6})/.exec(be.mails[0].body)![1];
    for (let i = 0; i < 5; i++) be.post({ action: 'confirmReset', email: 'me@example.com', code: '111111', newPassword: 'newpass1' });
    expect(be.post({ action: 'confirmReset', email: 'me@example.com', code, newPassword: 'newpass1' }).error).toMatch(/הקוד/);
  });

  it('locks sign-in for 15 minutes after 5 wrong passwords', () => {
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
    for (let i = 0; i < 5; i++) be.post({ action: 'login', email: 'b@x.com', password: 'wrongpass' });
    expect(be.post({ action: 'login', email: 'b@x.com', password: 'secret12' }).error).toMatch(/יותר מדי ניסיונות/);
    expect(be.sheets.Audit.data.filter((r: any[]) => r[2] === 'login_fail')).toHaveLength(5);
  });

  it('rejects weak passwords', () => {
    expect(be.post({ action: 'register', email: 'w@x.com', password: 'short', name: 'w' }).error).toMatch(/8/);
    expect(be.post({ action: 'register', email: 'w@x.com', password: '12345678', name: 'w' }).error).toMatch(/קלה מדי/);
  });

  it('changing the password signs out other devices; "log out everywhere" too', () => {
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
    const other = be.post({ action: 'login', email: 'b@x.com', password: 'secret12' }).token;
    const r = be.post({ action: 'changePassword', token: b.token, oldPassword: 'secret12', newPassword: 'newpass99' });
    expect(be.post({ action: 'me', token: other }).error).toMatch(/^AUTH:/);
    expect(be.post({ action: 'me', token: r.token }).user.name).toBe('ב');
    const r2 = be.post({ action: 'logoutAll', token: r.token });
    expect(be.post({ action: 'me', token: r.token }).error).toMatch(/^AUTH:/);
    expect(be.post({ action: 'me', token: r2.token }).user).toBeTruthy();
  });

  it('upgrades old password hashes on sign-in', () => {
    // simulate a legacy (1000-round) hash
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    be.post({ action: 'register', email: 'old@x.com', password: 'oldpass12', name: 'o', invite: code });
    const row = be.sheets.Users.data.find((r: any[]) => r[1] === 'old@x.com');
    const { createHash } = require('node:crypto');
    let h = createHash('sha256').update(Buffer.from(row[5] + ':oldpass12')).digest();
    for (let i = 0; i < 1000; i++) h = createHash('sha256').update(Buffer.concat([h, Buffer.from(row[5])])).digest();
    row[4] = h.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
    expect(be.post({ action: 'login', email: 'old@x.com', password: 'oldpass12' }).token).toBeTruthy();
    expect(row[4]).toMatch(/^v2\$/);
  });

  it('users can turn on two-step sign-in (password required to change it)', () => {
    const { code } = be.post({ action: 'createInvite', token: admin.token });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'ב', invite: code });
    expect(be.post({ action: 'setTwoFactor', token: b.token, enabled: true, password: 'nope' }).error).toMatch(/שגויה/);
    expect(be.post({ action: 'setTwoFactor', token: b.token, enabled: true, password: 'secret12' }).user.twoFactor).toBe(true);
    expect(be.post({ action: 'login', email: 'b@x.com', password: 'secret12' }).needCode).toBe(true);
  });

  it('visitors can send a contact message (rate-limited) that reaches the admin', () => {
    expect(be.post({ action: 'publicContact', name: 'דנה', email: 'd@x.com', topic: 'נגישות', text: 'הכפתור לא נקרא בקורא מסך' }).ok).toBe(true);
    expect(be.mails.at(-1).subject).toMatch(/נגישות/);
    be.post({ action: 'publicContact', name: 'דנה', email: 'd@x.com', text: '2' });
    be.post({ action: 'publicContact', name: 'דנה', email: 'd@x.com', text: '3' });
    expect(be.post({ action: 'publicContact', name: 'דנה', email: 'd@x.com', text: '4' }).error).toMatch(/יותר מדי/);
    expect(be.post({ action: 'adminInbox', token: admin.token }).threads.length).toBeGreaterThan(0);
  });

  it('admins can read the audit log; users cannot', () => {
    be.post({ action: 'login', email: 'me@example.com', password: 'bad-pass-1' });
    const entries = be.post({ action: 'auditLog', token: admin.token }).entries;
    expect(entries.some((e: any) => e.event === 'login_fail')).toBe(true);
    expect(JSON.stringify(entries)).not.toMatch(/bad-pass-1/);
  });
});

describe('site settings, AI budget, account deletion, backups', () => {
  const setup = () => {
    const be = createBackend();
    const admin = be.post({ action: 'register', email: 'admin@x.com', password: 'secret12', name: 'מנהל' });
    return { be, admin };
  };

  it('admins set the accessibility coordinator; visitors can read it', () => {
    const { be, admin } = setup();
    be.post({ action: 'setSiteConfig', token: admin.token, a11yName: 'דנה כהן', a11yPhone: '03-1234567', a11yEmail: 'a11y@x.com' });
    expect(be.post({ action: 'siteConfig' }).config).toEqual({ a11yName: 'דנה כהן', a11yPhone: '03-1234567', a11yEmail: 'a11y@x.com', spotifyClientId: '' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'u' });
    expect(be.post({ action: 'setSiteConfig', token: u.token, a11yName: 'x' }).error).toMatch(/מנהל/);
  });

  it('stops the assistant when the monthly AI budget is used up', () => {
    const { be, admin } = setup();
    be.properties.set('OPENAI_API_KEY', 'sk');
    be.post({ action: 'setSiteConfig', token: admin.token, aiBudget: 0.0005 });
    expect(be.post({ action: 'chat', token: admin.token, messages: [] }).reply).toBeDefined(); // 2000 in + 300 out ≈ $0.00048
    be.post({ action: 'chat', token: admin.token, messages: [] });
    expect(be.post({ action: 'chat', token: admin.token, messages: [] }).error).toMatch(/תקציב/);
    const s = be.post({ action: 'adminSettings', token: admin.token });
    expect(s.ai.budget).toBe(0.0005);
    expect(s.ai.spend).toBeGreaterThan(0);
  });

  it('deletes an account and all its data (password required)', () => {
    const { be, admin } = setup();
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'נועה' });
    const img = 'data:image/jpeg;base64,' + btoa('x');
    be.post({ action: 'updateProfile', token: u.token, photo: img });
    be.post({ action: 'putWeeks', token: u.token, weeks: [{ sundayDate: '2026-11-22', updatedAt: 1, data: { sundayDate: '2026-11-22', days: [] }, summary: {} }] });
    be.post({ action: 'contactAdmin', token: u.token, text: 'שלום' });
    expect(be.post({ action: 'deleteAccount', token: u.token, password: 'nope' }).error).toMatch(/שגויה/);
    expect(be.post({ action: 'deleteAccount', token: u.token, password: 'secret12' }).ok).toBe(true);
    expect(be.sheets.Users.data.some((r: any[]) => r[1] === 'u@x.com')).toBe(false);
    expect(be.sheets.Weeks.data.length).toBe(1);
    expect(be.sheets.Messages.data.length).toBe(1);
    expect([...be.files.values()].every((f: any) => f.trashed)).toBe(true);
    expect(be.post({ action: 'me', token: u.token }).error).toMatch(/^AUTH:/);
    // the only admin can't delete themselves
    expect(be.post({ action: 'deleteAccount', token: admin.token, password: 'secret12' }).error).toMatch(/היחיד/);
  });

  it('backs up the spreadsheet, keeps the newest 14, and installs a daily trigger', () => {
    const { be, admin } = setup();
    for (let i = 0; i < 16; i++) be.post({ action: 'backupNow', token: admin.token });
    expect(be.backups.filter((b: any) => !b.trashed)).toHaveLength(14);
    expect(be.post({ action: 'adminSettings', token: admin.token }).backups).toHaveLength(5);
    be.run('setup');
    be.run('setup');
    expect(be.triggers).toEqual(['backupNow', 'autoUpdate']);
  });
});
