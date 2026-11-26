import { t } from '../i18n';
import { call, type User } from '../api';
import { startSession } from '../session';
import { h } from './dom';

type Mode = 'login' | 'register';

export function renderAuth(root: HTMLElement, mode: Mode = 'login'): void {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const field = (id: string, label: string, attrs: Record<string, any>) =>
    h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, class: 'input', ...attrs }));

  const form = h('form', { class: 'stack', novalidate: true },
    mode === 'register' && field('reg-name', t('שם'), { type: 'text', autocomplete: 'name', required: true }),
    field('auth-email', t('אימייל'), { type: 'email', autocomplete: 'email', inputmode: 'email', dir: 'ltr', required: true }),
    field('auth-pass', t('סיסמה'), { type: 'password', autocomplete: mode === 'login' ? 'current-password' : 'new-password', minlength: 6, required: true }),
    mode === 'register' && h('div', { id: 'invite-wrap' }, field('reg-invite', t('קוד הזמנה'), { type: 'text', autocapitalize: 'characters', dir: 'ltr' })),
    mode === 'register' && h('p', { class: 'hint' }, t('הנתונים שלך נשמרים בגיליון של מנהל האפליקציה, והוא יכול לראות אותם.')),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, mode === 'login' ? t('כניסה') : t('הרשמה')),
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
      form,
      h('p', { class: 'center' },
        mode === 'login' ? t('אין לך חשבון? ') : t('כבר רשום? '),
        h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth(root, mode === 'login' ? 'register' : 'login') },
          mode === 'login' ? t('הרשמה עם קוד הזמנה') : t('כניסה')),
      ),
    ),
  );
}
