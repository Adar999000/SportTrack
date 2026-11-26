import { call } from '../api';
import { kvGet, kvSet } from '../db';
import { applyActions, type AgentAction } from '../actions';
import { currentUser } from '../session';
import { h, toast } from './dom';
import { mascot } from './mascot';
import { track } from '../analytics';
import { lang, t } from '../i18n';
import { formatShort } from '../dates';

interface Msg { role: 'user' | 'assistant'; content: string; done?: string[]; undo?: () => void; undone?: boolean }
export type Scope = 'me' | 'all' | 'user' | 'guest';

const SUGGESTIONS: Record<Scope, string[]> = {
  me: ['מה המגמה שלי בחודש האחרון?', 'תסמן לי צהריים V היום', 'כמה מטבעות חסרים לי לרמה הבאה?', 'איך מוסיפים סוג אימון חדש?'],
  all: ['מי לא עדכן השבוע?', 'למי יש את הירידה הגדולה ביותר במשקל?', 'השווה בין המשתמשים באימונים בחודש האחרון'],
  user: ['סכם את החודש האחרון שלו', 'מה המגמה במשקל?', 'כמה אימונים בממוצע בשבוע?'],
  guest: ['כמה זה עולה?', 'איך נרשמים?', 'איך מתקינים בטלפון?', 'איך צוברים מטבעות?'],
};

function guestId(): string {
  try {
    let id = localStorage.getItem('mishmaat-guest');
    if (!id) { id = Math.random().toString(36).slice(2, 12); localStorage.setItem('mishmaat-guest', id); }
    return id;
  } catch { return 'anon'; }
}

/** The assistant conversation (used as a page and in the floating widget). */
export function chatPanel(scope: Scope, userId?: string): HTMLElement {
  const key = scope === 'guest' ? 'chat:guest' : `chat:${currentUser()?.userId}:${scope}:${userId ?? ''}`;
  let messages: Msg[] = [];
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const input = h('textarea', { id: 'chat-input-' + scope, class: 'input chat-input', rows: 1, placeholder: t('כתוב שאלה או בקשה…'), 'aria-label': t('שאלה לעוזר') });
  const send = h('button', { class: 'btn btn-primary', type: 'submit' }, t('שלח'));

  const bubble = (m: Msg) => {
    const b = h('div', { class: `bubble bubble-${m.role}` }, m.role === 'assistant' ? h('span', { class: 'bubble-ai' }, mascot(26)) : '', m.content);
    if (m.done?.length) b.append(h('div', { class: 'done-list' }, ...m.done.map((d) => h('div', null, '✓ ', d))));
    if (m.undo && !m.undone) {
      b.append(h('button', { class: 'link-btn undo-btn', type: 'button', onclick: () => { m.undo!(); m.undone = true; toast(t('הפעולה בוטלה')); draw(); } }, t('ביטול הפעולה')));
    } else if (m.undone) b.append(h('div', { class: 'muted small' }, t('בוטל')));
    return b;
  };
  const draw = () => {
    log.replaceChildren(
      ...(messages.length
        ? messages.map(bubble)
        : [h('div', { class: 'stack chat-empty' },
            h('div', { class: 'chat-hero' }, mascot(84, 'mascot-wave')),
            h('p', { class: 'chat-hello' }, scope === 'all' ? t('העוזר מכיר סיכומים סטטיסטיים על כל המשתמשים.')
              : scope === 'guest' ? t('שלום! אפשר לשאול כל שאלה על האפליקציה: הרשמה, התקנה, מטבעות, פרטיות ועוד.')
              : t('אפשר לשאול על הנתונים שלך, לבקש לסמן משהו בטבלה, או לפנות למנהל.')),
            h('div', { class: 'chips' }, SUGGESTIONS[scope].map((s) => h('button', { class: 'chip', type: 'button', onclick: () => ask(t(s)) }, t(s)))))]),
    );
    log.scrollTop = log.scrollHeight;
  };

  async function ask(text: string) {
    text = text.trim();
    if (!text) return;
    messages.push({ role: 'user', content: text });
    track('chat:' + scope);
    input.value = '';
    draw();
    const typing = h('div', { class: 'bubble bubble-assistant typing', 'aria-label': t('חושב…') }, h('span', { class: 'bubble-ai' }, mascot(26, 'mascot-think')), h('span', { class: 'dots', 'aria-hidden': 'true' }, h('i'), h('i'), h('i')));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    send.disabled = true;
    try {
      const sent = lang === 'en'
        ? messages.map((m, i) => (i === messages.length - 1 ? { ...m, content: `(Answer in English.) ${m.content}` } : m))
        : messages;
      const plain = sent.map(({ role, content }) => ({ role, content }));
      const { reply, actions } = scope === 'guest'
        ? await call<{ reply: string; actions?: AgentAction[] }>('publicChat', { messages: plain, client: guestId() })
        : await call<{ reply: string; actions?: AgentAction[] }>('chat', { messages: plain, scope, userId });
      const msg: Msg = { role: 'assistant', content: reply };
      if (actions?.length) {
        const applied = applyActions(actions);
        if (applied.summary.length) {
          msg.done = applied.summary;
          msg.undo = applied.undo;
        }
      }
      messages.push(msg);
      kvSet(key, messages.slice(-40).map(({ undo: _u, ...rest }) => rest)).catch(() => {});
    } catch (e: any) {
      messages.push({ role: 'assistant', content: `⚠ ${e.message}` });
    }
    send.disabled = false;
    draw();
  }

  const form = h('form', { class: 'chat-form' }, input, send);
  form.addEventListener('submit', (e) => { e.preventDefault(); ask(input.value); });
  input.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input.value); }
  });
  const reset = h('button', { class: 'link-btn', type: 'button', onclick: () => { messages = []; kvSet(key, []).catch(() => {}); draw(); } }, t('שיחה חדשה'));
  kvGet<Msg[]>(key).then((m) => { messages = m ?? []; draw(); }).catch(draw);
  draw();
  const wrap = h('div', { class: 'chat-panel' }, log, form, h('div', { class: 'chat-foot' }, h('span', { class: 'hint' }, t('התשובות נוצרות על ידי AI ועלולות לטעות. זה לא ייעוץ רפואי.')), reset));
  return wrap;
}

interface SupportMsg { id: string; at: string; from: 'user' | 'admin'; subject: string; text: string; status: string }

/** The user's thread with the admin: send a request, read replies. */
export function supportPanel(onUnread?: (n: number) => void): HTMLElement {
  const list = h('div', { class: 'support-log' }, h('p', { class: 'muted' }, t('טוען…')));
  const subject = h('input', { id: 'support-subject', class: 'input', type: 'text', maxlength: 120, placeholder: t('נושא (לא חובה)'), 'aria-label': t('נושא') });
  const text = h('textarea', { id: 'support-text', class: 'input', rows: 3, maxlength: 2000, placeholder: t('מה תרצו לשאול או לדווח?'), 'aria-label': t('הפנייה') });
  const load = async () => {
    try {
      const r = await call<{ messages: SupportMsg[]; unread: number }>('myMessages');
      onUnread?.(0);
      list.replaceChildren(...(r.messages.length
        ? r.messages.map((m) => h('div', { class: `bubble bubble-${m.from === 'user' ? 'user' : 'assistant'} support-bubble` },
            m.subject && m.from === 'user' ? h('strong', null, m.subject, h('br')) : '',
            m.from === 'admin' ? h('strong', null, t('המנהל: ')) : '', m.text,
            h('div', { class: 'muted small' }, formatShort(String(m.at).slice(0, 10)))))
        : [h('p', { class: 'muted' }, t('עוד לא שלחת פניות. כאן אפשר לשאול את מנהל האפליקציה שאלה או לדווח על תקלה. התשובה תגיע לכאן ולמייל.'))]));
      list.scrollTop = list.scrollHeight;
    } catch (e: any) { list.replaceChildren(h('p', { class: 'form-error' }, e.message)); }
  };
  const form = h('form', { class: 'stack' }, subject, text, h('button', { class: 'btn btn-primary', type: 'submit' }, t('שליחה למנהל')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try {
      await call('contactAdmin', { subject: subject.value, text: text.value });
      subject.value = ''; text.value = '';
      toast(t('הפנייה נשלחה'));
      load();
    } catch (ex: any) { toast(ex.message); }
  });
  load();
  return h('div', { class: 'support-panel stack' }, list, form);
}
