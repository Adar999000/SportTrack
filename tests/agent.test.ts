import { describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

const NOW = '2026-12-09T10:00:00Z';

describe('assistant actions and messages to the admin', () => {
  it('returns validated actions for the app to apply, then a confirmation', () => {
    const be = createBackend({
      now: NOW,
      openaiReply: (p: any) => p.tools
        ? { content: '', tool_calls: [
            { id: 'a', type: 'function', function: { name: 'mark_meal', arguments: JSON.stringify({ date: '2026-12-09', meal: 'lunch', mark: 'V' }) } },
            { id: 'b', type: 'function', function: { name: 'set_weight', arguments: JSON.stringify({ date: '2026-12-09', kg: 99.5 }) } },
            { id: 'c', type: 'function', function: { name: 'mark_meal', arguments: JSON.stringify({ date: '2027-01-01', meal: 'lunch', mark: 'V' }) } },
          ] }
        : { content: 'סימנתי צהריים V ומשקל 99.5.' },
    });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'א' });
    be.properties.set('OPENAI_API_KEY', 'sk');
    const r = be.post({ action: 'chat', token: a.token, messages: [{ role: 'user', content: 'תסמן צהריים היום ומשקל 99.5' }] });
    expect(r.reply).toBe('סימנתי צהריים V ומשקל 99.5.');
    expect(r.actions).toEqual([
      { type: 'mark_meal', date: '2026-12-09', meal: 'lunch', mark: 'V' },
      { type: 'set_weight', date: '2026-12-09', kg: 99.5 },
    ]); // the future date was refused
    const second = JSON.parse(be.fetches.at(-1).opts.payload);
    expect(second.messages.filter((m: any) => m.role === 'tool').map((m: any) => m.content)).toEqual(['בוצע.', 'בוצע.', expect.stringMatching(/שגיאה/)]);
    expect(second.tools).toBeUndefined();
  });

  it('the admin assistant cannot change data in views of other users', () => {
    const be = createBackend({ now: NOW, openaiReply: (p: any) => ({ content: (p.tools || []).map((t: any) => t.function.name).join(',') }) });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'א' });
    be.properties.set('OPENAI_API_KEY', 'sk');
    expect(be.post({ action: 'chat', token: a.token, scope: 'all', messages: [] }).reply).toBe('open_page');
    expect(be.post({ action: 'chat', token: a.token, messages: [] }).reply).toContain('mark_meal');
  });

  it('a user can contact the admin (directly or through the assistant); the admin replies', () => {
    const be = createBackend({
      now: NOW,
      openaiReply: (p: any) => p.tools
        ? { content: '', tool_calls: [{ id: 'x', type: 'function', function: { name: 'contact_admin', arguments: JSON.stringify({ subject: 'תקלה', message: 'הגרף לא נטען' }) } }] }
        : { content: 'שלחתי למנהל.' },
    });
    const admin = be.post({ action: 'register', email: 'admin@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'נועה' });
    be.properties.set('OPENAI_API_KEY', 'sk');
    be.post({ action: 'contactAdmin', token: u.token, subject: 'שאלה', text: 'איך מקפיאים יום?' });
    be.post({ action: 'chat', token: u.token, messages: [{ role: 'user', content: 'תדווח למנהל שהגרף לא נטען' }] });
    expect(be.mails.filter((m: any) => m.to === 'admin@x.com')).toHaveLength(2);
    expect(be.post({ action: 'adminInbox', token: u.token }).error).toMatch(/מנהל/);
    const inbox = be.post({ action: 'adminInbox', token: admin.token }).threads;
    expect(inbox[0]).toMatchObject({ name: 'נועה', unread: 2, count: 2 });
    expect(be.post({ action: 'adminThread', token: admin.token, userId: u.user.userId }).messages.map((m: any) => m.text)).toEqual(['איך מקפיאים יום?', 'הגרף לא נטען']);
    expect(be.post({ action: 'adminInbox', token: admin.token }).threads[0].unread).toBe(0);
    be.post({ action: 'adminReply', token: admin.token, userId: u.user.userId, text: 'בחנות, "הקפאת יום".' });
    expect(be.mails.at(-1).to).toBe('u@x.com');
    expect(be.post({ action: 'unreadCount', token: u.token }).unread).toBe(1);
    expect(be.post({ action: 'unreadCount', token: u.token }).unread).toBe(1); // checking doesn't mark as read
    const mine = be.post({ action: 'myMessages', token: u.token });
    expect(mine.unread).toBe(1);
    expect(mine.messages.at(-1)).toMatchObject({ from: 'admin', text: 'בחנות, "הקפאת יום".' });
    expect(be.post({ action: 'myMessages', token: u.token }).unread).toBe(0);
  });
});
