/** Report and block: used from posts, stories and Settings. */
import { t, tr } from '../i18n';
import { call } from '../api';
import { confirmButton, h, toast } from './dom';
import { track } from '../analytics';

export function reportButton(postId: string, after: () => void, label = t('דווח על תוכן לא הולם')): HTMLElement {
  return h('button', { class: 'btn', type: 'button', onclick: async () => {
    try { await call('reportPost', { id: postId }); toast(t('תודה, הדיווח נשלח למנהל')); track('safety:report'); after(); } catch (e: any) { toast(e.message); }
  } }, '🚩 ', label);
}

/** Two-tap block: their posts, stories, comments and chat messages disappear for you (and yours for them). */
export function blockButton(userId: string, name: string, after: () => void): HTMLElement {
  return confirmButton('🚫 ' + tr`חסימת ${name}`, t('הקש שוב לחסימה'), async () => {
    try { await call('blockUser', { userId, on: true }); toast(tr`${name} נחסם/ה. לא תראו יותר תוכן אחד של השני.`); track('safety:block'); after(); } catch (e: any) { toast(e.message); }
  }, 'btn btn-danger');
}

/** Settings section: people I blocked, with "unblock". */
export function blockedListCard(): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const draw = (list: { userId: string; name: string }[]) => body.replaceChildren(
    list.length
      ? h('ul', { class: 'plain-list blocked-list' }, list.map((u) => h('li', { class: 'row-between' }, h('span', null, u.name),
        h('button', { class: 'link-btn', type: 'button', onclick: async () => {
          try { draw((await call<{ blocked: typeof list }>('blockUser', { userId: u.userId, on: false })).blocked); toast(t('החסימה בוטלה')); } catch (e: any) { toast(e.message); }
        } }, t('ביטול חסימה')))))
      : h('p', { class: 'muted' }, t('לא חסמת אף אחד.')),
    h('p', { class: 'hint' }, t('חוסמים מתפריט ⋯ של פוסט או סטורי. מי שנחסם לא יודע על כך, ולא תראו יותר פוסטים, סטוריז, תגובות והודעות אחד של השני.')),
  );
  call<{ blocked: { userId: string; name: string }[] }>('myBlocks').then((r) => draw(r.blocked)).catch(() => body.replaceChildren(h('p', { class: 'muted' }, t('לא זמין כרגע.'))));
  return h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('משתמשים חסומים')), body);
}
