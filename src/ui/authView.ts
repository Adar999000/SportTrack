import { t } from '../i18n';
import { call, type User } from '../api';
import { startSession } from '../session';
import { h } from './dom';
import { trackLanding } from '../analytics';

type Mode = 'login' | 'register';

/** Field with its own error line under it, wired with aria-describedby / aria-invalid. */
function fieldWithError(id: string, label: string, input: HTMLInputElement, extra?: Node): { el: HTMLElement; input: HTMLInputElement; set: (msg: string) => void } {
  const error = h('p', { class: 'field-error', id: id + '-err', hidden: true });
  const desc = [input.getAttribute('aria-describedby'), id + '-err'].filter(Boolean).join(' ');
  input.setAttribute('aria-describedby', desc);
  const el = h('div', { class: 'field' }, h('label', { for: id }, label), extra ?? input, error);
  const set = (msg: string) => {
    error.textContent = msg; error.hidden = !msg;
    if (msg) input.setAttribute('aria-invalid', 'true'); else input.removeAttribute('aria-invalid');
  };
  input.addEventListener('input', () => set(''));
  return { el, input, set };
}

/** Password input with a show/hide button. */
function passwordInput(id: string, autocomplete: string): { input: HTMLInputElement; box: HTMLElement } {
  const input = h('input', { id, class: 'input', type: 'password', autocomplete, dir: 'ltr' }) as HTMLInputElement;
  const eye = h('button', { class: 'pass-eye', type: 'button', 'aria-pressed': 'false', 'aria-controls': id, 'aria-label': t('הצגת הסיסמה') }, t('הצגה'));
  eye.addEventListener('click', () => {
    const show = input.type === 'password';
    input.type = show ? 'text' : 'password';
    eye.setAttribute('aria-pressed', String(show));
    eye.setAttribute('aria-label', show ? t('הסתרת הסיסמה') : t('הצגת הסיסמה'));
    eye.textContent = show ? t('הסתרה') : t('הצגה');
  });
  return { input, box: h('div', { class: 'pass-box' }, input, eye) };
}

const MIN_PASS = 8;
const emailOk = (v: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

/** Second step of sign-in: the code that was emailed. */
function renderCodeStep(root: HTMLElement, challenge: string, maskedEmail: string): void {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const code = h('input', { id: 'login-code', class: 'input code-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, dir: 'ltr', 'aria-describedby': 'code-hint' });
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', { id: 'code-hint' }, t('שלחנו קוד בן 6 ספרות אל {e}. הוא בתוקף ל-10 דקות.', { e: maskedEmail })),
    h('div', { class: 'field' }, h('label', { for: 'login-code' }, t('קוד כניסה')), code),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('כניסה')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    try {
      const res = await call<{ token: string; user: User }>('login2fa', { challenge, code: code.value.trim() });
      await startSession(res);
    } catch (ex: any) { err.textContent = ex.message; err.hidden = false; }
  });
  root.replaceChildren(h('section', { class: 'card auth-card' },
    h('h2', { class: 'card-title' }, t('אימות דו-שלבי')), form,
    h('p', { class: 'center' }, h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth(root, 'login') }, t('חזרה לכניסה')))));
  code.focus();
}

/** Forgotten password: email a code, then set a new password with it. */
function renderReset(root: HTMLElement, presetEmail = ''): void {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const info = h('p', { class: 'hint', hidden: true });
  const email = h('input', { id: 'reset-email', class: 'input', type: 'email', inputmode: 'email', autocomplete: 'email', dir: 'ltr', value: presetEmail });
  const code = h('input', { id: 'reset-code', class: 'input code-input', type: 'text', inputmode: 'numeric', autocomplete: 'one-time-code', maxlength: 6, dir: 'ltr' });
  const pw = passwordInput('reset-pass', 'new-password');
  const pass = pw.input;
  pass.minLength = MIN_PASS;
  const passF = fieldWithError('reset-pass', t('סיסמה חדשה (8 תווים לפחות)'), pass, pw.box);
  const step2 = h('div', { class: 'stack', hidden: true },
    h('div', { class: 'field' }, h('label', { for: 'reset-code' }, t('הקוד מהמייל')), code),
    passF.el,
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
    if (pass.value.length < MIN_PASS) { passF.set(t('הסיסמה צריכה להיות לפחות 8 תווים')); pass.focus(); return; }
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
  const reg = mode === 'register';
  if (reg) trackLanding('landing:signup-open');
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const inp = (id: string, attrs: Record<string, any>) => h('input', { id, class: 'input', ...attrs }) as HTMLInputElement;

  const name = fieldWithError('reg-name', t('שם'), inp('reg-name', { type: 'text', autocomplete: 'name' }));
  const email = fieldWithError('auth-email', t('אימייל'), inp('auth-email', { type: 'email', autocomplete: 'email', inputmode: 'email', dir: 'ltr' }));
  const pw = passwordInput('auth-pass', reg ? 'new-password' : 'current-password');
  if (reg) pw.input.minLength = MIN_PASS;
  const pass = fieldWithError('auth-pass', reg ? t('סיסמה (8 תווים לפחות)') : t('סיסמה'), pw.input, pw.box);

  // invite code: collapsed unless the link carried one
  const inviteInput = inp('reg-invite', { type: 'text', autocapitalize: 'characters', dir: 'ltr', value: inviteCode, placeholder: t('אם קיבלתם מחבר'), 'aria-describedby': 'reg-invite-hint' });
  const inviteBody = h('div', { class: 'field', id: 'invite-body', hidden: !inviteCode },
    h('label', { for: 'reg-invite' }, t('קוד הזמנה (לא חובה)')), inviteInput,
    h('small', { class: 'hint', id: 'reg-invite-hint' }, t('עם קוד הזמנה תקבלו 50 מטבעות, וגם החבר שהזמין.')));
  const inviteToggle = h('button', { class: 'link-btn invite-toggle', type: 'button', 'aria-expanded': 'false', 'aria-controls': 'invite-body', hidden: !!inviteCode }, t('יש לי קוד הזמנה'));
  inviteToggle.addEventListener('click', () => { inviteBody.hidden = false; inviteToggle.hidden = true; inviteToggle.setAttribute('aria-expanded', 'true'); inviteInput.focus(); });

  const terms = h('input', { type: 'checkbox', id: 'reg-terms', 'aria-describedby': 'reg-terms-err' }) as HTMLInputElement;
  const termsErr = h('p', { class: 'field-error', id: 'reg-terms-err', hidden: true });
  const setTerms = (msg: string) => { termsErr.textContent = msg; termsErr.hidden = !msg; if (msg) terms.setAttribute('aria-invalid', 'true'); else terms.removeAttribute('aria-invalid'); };
  terms.addEventListener('change', () => setTerms(''));

  const form = h('form', { class: 'stack', novalidate: true },
    reg && name.el,
    email.el,
    pass.el,
    reg && h('div', { id: 'invite-wrap' }, inviteToggle, inviteBody),
    reg && h('div', { class: 'consent-wrap' },
      h('label', { class: 'consent' }, terms,
        h('span', null, t('קראתי ואני מסכים/ה ל'), h('a', { href: '#terms', target: '_blank' }, t('תנאי השימוש')), t(' ול'), h('a', { href: '#privacy', target: '_blank' }, t('מדיניות הפרטיות')), t(', ואני בן/בת 16 ומעלה (או משתמש/ת באישור הורה).'))),
      termsErr),
    reg && h('p', { class: 'hint' }, t('המנהל רואה רק סיכומים, לא הערות, תמונות או פרטים אישיים.')),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, reg ? t('הרשמה') : t('כניסה')),
    !reg && h('button', {
      class: 'link-btn forgot', type: 'button',
      onclick: () => renderReset(root, email.input.value.trim()),
    }, t('שכחתי סיסמה')),
  );

  if (reg) {
    call<{ hasUsers: boolean }>('status').then((s) => {
      if (!s.hasUsers) {
        form.querySelector('#invite-wrap')?.replaceWith(h('p', { class: 'hint' }, t('אתה המשתמש הראשון, ולכן תהיה מנהל. לא צריך קוד הזמנה.')));
      }
    }).catch(() => {});
  }

  /** Inline checks; focus moves to the first invalid field. */
  const validate = (): boolean => {
    const bad: HTMLElement[] = [];
    const check = (ok: boolean, f: { set: (m: string) => void; input: HTMLInputElement }, msg: string) => { f.set(ok ? '' : msg); if (!ok) bad.push(f.input); };
    if (reg) check(!!name.input.value.trim(), name, t('נא למלא שם'));
    const ev = email.input.value.trim();
    check(!!ev && emailOk(ev), email, ev ? t('כתובת המייל לא תקינה') : t('נא למלא אימייל'));
    const pv = pw.input.value;
    check(reg ? pv.length >= MIN_PASS : !!pv, pass, reg ? t('הסיסמה צריכה להיות לפחות 8 תווים') : t('נא למלא סיסמה'));
    if (reg) { setTerms(terms.checked ? '' : t('כדי להירשם צריך לאשר את תנאי השימוש')); if (!terms.checked) bad.push(terms); }
    bad[0]?.focus();
    return !bad.length;
  };

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    if (!validate()) return;
    const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = t('רגע…');
    try {
      const res = await call<{ token?: string; user?: User; needCode?: boolean; challenge?: string; email?: string }>(mode, {
        email: email.input.value.trim(),
        password: pw.input.value,
        name: reg ? name.input.value.trim() : '',
        invite: reg ? inviteInput.value.trim() : '',
        ...(reg ? { terms: true } : {}),
      });
      if (res.needCode && res.challenge) return renderCodeStep(root, res.challenge, res.email ?? '');
      await startSession(res as { token: string; user: User });
    } catch (ex: any) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = reg ? t('הרשמה') : t('כניסה');
    }
  });

  root.replaceChildren(
    h('section', { class: 'card auth-card' },
      h('h2', { class: 'card-title' }, reg ? t('הרשמה') : t('כניסה לחשבון')),
      reg && inviteCode && h('p', { class: 'hint' }, t('הוזמנת על ידי חבר. קוד ההזמנה כבר מולא, ושניכם תקבלו מטבעות.')),
      form,
      h('p', { class: 'center' },
        h('a', { class: 'link-btn', href: '#' }, t('לדף הבית')), ' · ',
        reg ? t('כבר רשום? ') : t('אין לך חשבון? '),
        h('button', { class: 'link-btn', type: 'button', onclick: () => renderAuth(root, reg ? 'login' : 'register', inviteCode) },
          reg ? t('כניסה') : t('להרשמה')),
      ),
    ),
  );
}
