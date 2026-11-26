import { t } from '../i18n';
import { call, type User } from '../api';
import { startSession } from '../session';
import { h } from './dom';

type Mode = 'login' | 'register';

/** Forgotten password: email a code, then set a new password with it. */
function renderReset(root: HTMLElement, presetEmail = ''): void {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const info = h('p', { class: 'hint', hidden: true });
  const email = h('input', { id: 'reset-email', class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', dir: 'ltr', value: presetEmail });
  const code = h('input', { id: 'reset-code', class: 'input code-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, dir: 'ltr' });
  const pass = h('input', { id: 'reset-pass', class: 'input', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const step2 = h('div', { class: 'stack', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'reset-code' }, t('הקוד מהמייל')), code),
    h('div', { class: 'field' }, h('label', { for: 'reset-pass' }, t('סיסמה חדשה (6 תווים לפחות)')), pass),
  );
  const btn = h('button', { class: 'btn btn-primary', type: 'submit' }, t('שלח קוד'));
  const fail = (m: string) => { err.textContent = m; err.hidden = false; };
  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'field' }, h('label', { for: 'reset-email' }, t('אימייל')), email),
    info, step2, err, btn,
    h('button', { class: 'link-btn', type: 'button', hidden: true, id: 'resend', onclick: () => send() }, t('שלח קוד שוב')),
  );
  async function send() {
    err.hidden = true;
    if (!email.value.trim()) return fail(t('נא למלא אימייל'));
    btn.disabled = true;
    try {
      await call('requestReset', { email: email.value.trim() });
      info.textContent = t('אם האימייל רשום, נשלח אליו קוד. הוא בתוקף ל-15 דקות. כדאי לבדוק גם בספאם.');
      info.hidden = false;
      step2.hidden = false;
      (form.querySelector('#resend') as HTMLElement).hidden = false;
      btn.textContent = t('איפוס סיסמה');
      code.focus();
    } catch (e: any) { fail(e.message); }
    btn.disabled = false;
  }
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (step2.hidden) return send();
    err.hidden = true;
    btn.disabled = true;
    try {
      const res = await call<{ token: string; user: User }>('confirmReset', { email: email.value.trim(), code: code.value.trim(), newPassword: pass.value });
      await startSession(res);
    } catch (ex: any) { fail(ex.message); btn.disabled = false; }
  });
  root.replaceChildren(
    h('section', { class: 'card auth-card' },
      h('h2', { class: 'card-title' }, t('איפוס סיסמה')),
      form,
      h('p', { class: 'center' }, h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth(root, 'login') }, t('חזרה לכניסה'))),
    ),
  );
  (presetEmail ? email : email).focus();
}

export function renderAuth(root: HTMLElement, mode: Mode = 'login', inviteCode = ''): void {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const field = (id: string, label: string, attrs: Record<string, any>) =>
    h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, class: 'input', ...attrs }));

  const form = h('form', { class: 'stack', novalidate: true },
    mode === 'register' && field('reg-name', t('שם'), { type: 'text', autocomplete: 'name', required: true }),
    field('auth-email', t('אימייל'), { type: 'email', autocomplete: 'email', inputmode: 'email', dir: 'ltr', required: true }),
    field('auth-pass', t('סיסמה'), { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', minlength: 6, required: true }),
    mode === 'register' && h('div', { id: 'invite-wrap' }, field('reg-invite', t('קוד הזמנה'), { type: 'text', autocapitalize: 'characters', dir: 'ltr', value: inviteCode })),
    mode === 'register' && h('p', { class: 'hint' }, t('הנתונים שלך נשמרים בגיליון בגוגל דרייב של מנהל האפליקציה. באפליקציה המנהל רואה רק סיכומים סטטיסטיים (אימונים, ארוחות, שינוי משקל ופעילות), לא הערות, תמונות שבועיות או פרטים אישיים.')),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, mode === 'login' ? t('כניסה') : t('הרשמה')),
    mode === 'login' && h('button', {
      class: 'link-btn forgot', type: 'button',
      onclick: () => renderReset(root, (form.querySelector('#auth-email') as HTMLInputElement).value.trim()),
    }, t('שכחתי סיסמה')),
  );

  const val = (id: string) => (form.querySelector('#' + id) as HTMLInputElement | null)?.value.trim() ?? '';

  if (mode === 'register') {
    call<{ hasUsers: boolean }>('status').then((s) => {
      if (!s.hasUsers) {
        form.querySelector('#invite-wrap')?.replaceWith(h('p', { class: 'hint' }, t('אתה המשתמש הראשון, ולכן תהיה מנהל. לא צריך קוד הזמנה.')));
      }
    }).catch(() => {});
  }

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = t('רגע…');
    try {
      const res = await call<{ token: string; user: User }>(mode, {
        email: val('auth-email'),
        password: (form.querySelector('#auth-pass') as HTMLInputElement).value,
        name: val('reg-name'),
        invite: val('reg-invite'),
      });
      await startSession(res);
    } catch (ex: any) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = mode === 'login' ? t('כניסה') : t('הרשמה');
    }
  });

  root.replaceChildren(
    h('section', { class: 'card auth-card' },
      h('h2', { class: 'card-title' }, mode === 'login' ? t('כניסה לחשבון') : t('הרשמה')),
      mode === 'register' && inviteCode && h('p', { class: 'hint' }, t('הוזמנת על ידי חבר. קוד ההזמנה כבר מולא.')),
      form,
      h('p', { class: 'center' },
        mode === 'login' ? t('אין לך חשבון? ') : t('כבר רשום? '),
        h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth(root, mode === 'login' ? 'register' : 'login', inviteCode) },
          mode === 'login' ? t('הרשמה עם קוד הזמנה') : t('כניסה')),
      ),
    ),
  );
}
