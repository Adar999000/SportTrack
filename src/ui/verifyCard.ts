/** Verify the email with a 6-digit code (needed to post, comment and open challenges in the community). */
import { track } from '../analytics';
import { t, tr } from '../i18n';
import { call, type User } from '../api';
import { currentUser, setUser } from '../session';
import { h, toast } from './dom';

let seq = 0;

export function verifyCard(opts: { reason?: string; onVerified?: () => void } = {}): HTMLElement | '' {
  const u = currentUser();
  if (!u || u.emailVerified !== false) return '';
  const id = 'vc' + ++seq;
  const body = h('div', { class: 'stack' });
  // one live region for errors and confirmations, so nothing fails silently
  const msg = h('p', { class: 'verify-msg', id: id + '-msg', role: 'status', 'aria-live': 'polite' });
  const say = (text: string, error = false) => { msg.textContent = text; msg.classList.toggle('form-error', error); };

  const askCode = (resent: boolean) => {
    const input = h('input', {
      class: 'input', id: id + '-code', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, dir: 'ltr', placeholder: '123456',
      'aria-describedby': id + '-msg',
    }) as HTMLInputElement;
    const verify = h('button', { class: 'btn btn-primary', type: 'submit' }, t('אימות'));
    const resend = h('button', { class: 'btn', type: 'button' }, t('שליחה מחדש'));
    resend.addEventListener('click', () => send(true));
    const form = h('form', { class: 'stack', novalidate: true },
      h('p', { class: 'muted' }, tr`שלחנו קוד בן 6 ספרות ל-${u.email}. אם לא הגיע, בדקו בספאם.`),
      h('div', { class: 'field' }, h('label', { for: id + '-code' }, t('קוד אימות')), input),
      msg,
      h('div', { class: 'row-btns two' }, verify, resend));
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const code = input.value.replace(/\D/g, '');
      if (code.length !== 6) { say(t('הקוד הוא 6 ספרות'), true); input.setAttribute('aria-invalid', 'true'); input.focus(); return; }
      verify.disabled = true;
      try {
        const r = await call<{ user: User }>('verifyEmail', { code });
        await setUser(r.user);
        track('verify:done');
        toast(t('המייל אומת ✓'));
        opts.onVerified?.();
      } catch (err: any) {
        say(err.message, true); input.setAttribute('aria-invalid', 'true'); input.select(); input.focus();
      } finally { verify.disabled = false; }
    });
    body.replaceChildren(form);
    say(resent ? t('שלחנו קוד חדש') : '');
    input.focus();
  };
  const send = async (resent = false) => {
    say(t('שולח…'));
    try { await call('sendVerifyCode'); askCode(resent); } catch (e: any) { say(e.message, true); }
  };
  const first = h('button', { class: 'btn btn-primary', type: 'button', onclick: () => send() }, t('שליחת קוד למייל'));
  body.replaceChildren(
    h('p', null, opts.reason ?? t('כדי לפרסם בקהילה, להגיב ולפתוח אתגרים צריך לאמת את כתובת המייל. זה לוקח 20 שניות ושומר על הקהילה בלי חשבונות מזויפים.')),
    first, msg);
  return h('section', { class: 'card verify-card', 'aria-labelledby': id + '-h' }, h('h2', { class: 'card-title', id: id + '-h' }, h('span', { 'aria-hidden': 'true' }, '✉️ '), t('אימות מייל')), body);
}
