import { lang, t } from '../i18n';
import { call } from '../api';
import { kvGet, kvSet } from '../db';
import { currentUser } from '../session';
import { h } from './dom';

interface Msg { role: 'user' | 'assistant'; content: string }

const SUGGESTIONS: Record<string, string[]> = {
  me: [t('מה המגמה שלי בחודש האחרון?'), t('באיזה חודש התאמנתי הכי הרבה?'), t('מתי הייתי במשקל הכי נמוך?'), t('איך מוסיפים סוג אימון חדש?')],
  all: [t('מי לא עדכן השבוע?'), t('למי יש את הירידה הגדולה ביותר במשקל?'), t('השווה בין המשתמשים באימונים בחודש האחרון')],
  user: [t('סכם את החודש האחרון שלו'), t('מה המגמה במשקל?'), t('כמה אימונים בממוצע בשבוע?')],
};

export function renderChat(root: HTMLElement, scope: 'me' | 'all' | 'user', userId?: string): void {
  const key = `chat:${currentUser()?.userId}:${scope}:${userId ?? ''}`;
  let messages: Msg[] = [];
  const log = h('div', { class: 'chat-log', 'aria-live': 'polite' });
  const input = h('textarea', { id: 'chat-input', class: 'input chat-input', rows: 1, placeholder: t('כתוב שאלה…'), 'aria-label': t('שאלה לעוזר') });
  const send = h('button', { class: 'btn btn-primary', type: 'submit' }, t('שלח'));

  const bubble = (m: Msg) => h('div', { class: `bubble bubble-${m.role}` }, m.content);
  const draw = () => {
    log.replaceChildren(
      ...(messages.length
        ? messages.map(bubble)
        : [h('div', { class: 'stack' },
            h('p', { class: 'muted' }, scope === 'all' ? t('העוזר מכיר את הנתונים של כל המשתמשים.') : t('העוזר מכיר את ההיסטוריה ואת האפליקציה. שאל כל שאלה.')),
            h('div', { class: 'chips' }, SUGGESTIONS[scope].map((s) => h('button', { class: 'chip', type: 'button', onclick: () => ask(s) }, s))))]),
    );
    log.scrollTop = log.scrollHeight;
  };

  async function ask(text: string) {
    text = text.trim();
    if (!text) return;
    messages.push({ role: 'user', content: text });
    input.value = '';
    draw();
    const typing = h('div', { class: 'bubble bubble-assistant typing' }, t('חושב…'));
    log.append(typing);
    log.scrollTop = log.scrollHeight;
    send.disabled = true;
    try {
      const sent = lang === 'en'
        ? messages.map((m, i) => (i === messages.length - 1 ? { ...m, content: `(Answer in English.) ${m.content}` } : m))
        : messages;
      const { reply } = await call<{ reply: string }>('chat', { messages: sent, scope, userId });
      messages.push({ role: 'assistant', content: reply });
      kvSet(key, messages.slice(-40)).catch(() => {});
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

  root.replaceChildren(
    h('section', { class: 'card chat-card' },
      h('div', { class: 'chat-head' },
        h('h2', { class: 'card-title' }, scope === 'all' ? t('עוזר AI · כל המשתמשים') : t('עוזר AI')),
        h('button', { class: 'link-btn', type: 'button', onclick: () => { messages = []; kvSet(key, []).catch(() => {}); draw(); } }, t('שיחה חדשה')),
      ),
      log,
      form,
      h('p', { class: 'hint' }, t('התשובות נוצרות על ידי AI ועלולות לטעות. זה לא ייעוץ רפואי.')),
    ),
  );
  kvGet<Msg[]>(key).then((m) => { messages = m ?? []; draw(); }).catch(draw);
  draw();
}
