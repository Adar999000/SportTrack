import { t, tr } from '../i18n';
import { call, type User } from '../api';
import { daysBetween, formatShort, todayISO } from '../dates';
import { fileToDataUrl, pickImage } from '../image';
import { currentUser, endSession, isAdmin, rememberPhoto, replaceToken, setUser } from '../session';
import { weightPoints, weightSummary, countWorkouts, round1 } from '../stats';
import { allWeeks, replaceAll } from '../store';
import { avatar } from './avatar';
import { confirmButton, fmtKg, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { menuItem } from './weekView';
import { openAssistant } from './floatingChat';
import { openAccessibility } from './a11yWidget';
import { getRewards, levelLabel } from '../rewards';

function age(birth?: string): number | null {
  if (!birth) return null;
  return Math.floor(daysBetween(birth, todayISO()) / 365.25);
}

/** First-time setup and later edits of name, photo and personal details. */
export function renderProfileForm(root: HTMLElement, onboarding: boolean): void {
  const u = currentUser()!;
  const p = u.profile ?? {};
  let photo: string | null | undefined; // undefined = unchanged, null = removed
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const preview = h('div', { class: 'avatar-edit' }, avatar(u.name, u.photoId, 96));

  const field = (id: string, label: string, attrs: Record<string, any>, hint?: string) =>
    h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, class: 'input', ...attrs }), hint && h('small', { class: 'hint' }, hint));

  const form = h('form', { class: 'stack', novalidate: true },
    h('div', { class: 'avatar-row' },
      preview,
      h('div', { class: 'stack' },
        h('button', {
          class: 'btn', type: 'button', onclick: async () => {
            const f = await pickImage();
            if (!f) return;
            try {
              photo = await fileToDataUrl(f, 640);
              preview.replaceChildren(h('span', { class: 'avatar', style: { width: '96px', height: '96px' } }, h('img', { src: photo, alt: '' })));
            } catch (e: any) { toast(e.message); }
          },
        }, t('בחר תמונה')),
        (u.photoId || photo) && h('button', { class: 'link-btn', type: 'button', onclick: () => { photo = null; preview.replaceChildren(avatar(u.name, null, 96)); } }, t('הסר תמונה')),
      ),
    ),
    field('pf-name', t('שם'), { type: 'text', value: u.name, required: true, autocomplete: 'name' }),
    field('pf-birth', t('תאריך לידה'), { type: 'date', value: p.birthDate ?? '' }),
    field('pf-height', t('גובה (ס"מ)'), { type: 'number', inputmode: 'numeric', min: 100, max: 250, value: p.heightCm ?? '' }),
    field('pf-goalw', t('משקל יעד (ק"ג)'), { type: 'number', inputmode: 'decimal', step: '0.1', min: 30, max: 300, value: p.goalWeight ?? '' }),
    h('div', { class: 'field' },
      h('label', { for: 'pf-goal' }, t('המטרה שלי')),
      h('textarea', { id: 'pf-goal', class: 'input', rows: 3, placeholder: t('למשל: לרדת ל-90 ק"ג ולהתאמן 3 פעמים בשבוע') }, p.goal ?? ''),
    ),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, onboarding ? t('שמור והמשך') : t('שמור')),
    !onboarding && h('button', { class: 'btn', type: 'button', onclick: () => navigate(HASH.profile) }, t('ביטול')),
  );

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const v = (id: string) => (form.querySelector('#' + id) as HTMLInputElement).value.trim();
    const num = (id: string) => (v(id) ? Number(v(id).replace(',', '.')) : undefined);
    if (!v('pf-name')) {
      err.textContent = t('נא למלא שם');
      err.hidden = false;
      return;
    }
    const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
    btn.disabled = true;
    btn.textContent = t('שומר…');
    try {
      const res = await call<{ user: User }>('updateProfile', {
        name: v('pf-name'),
        profile: { birthDate: v('pf-birth') || undefined, heightCm: num('pf-height'), goalWeight: num('pf-goalw'), goal: v('pf-goal') || undefined, completed: true },
        ...(photo !== undefined ? { photo } : {}),
      });
      if (photo && res.user.photoId) rememberPhoto(res.user.photoId, photo);
      await setUser(res.user);
      toast('הפרופיל נשמר');
      navigate(onboarding ? HASH.week() : HASH.profile);
    } catch (ex: any) {
      err.textContent = ex.message;
      err.hidden = false;
      btn.disabled = false;
      btn.textContent = t('שמור');
    }
  });

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, onboarding ? tr`ברוך הבא, ${u.name}` : t('עריכת פרופיל')),
      onboarding && h('p', { class: 'muted' }, t('כמה פרטים כדי שהאנליזה תהיה אישית. אפשר לדלג על כל שדה ולערוך אחר כך.')),
      form,
    ),
  );
}

function twoFactorSheet() {
  const u = currentUser()!;
  const on = !!u.twoFactor;
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const pass = h('input', { id: 'tf-pass', class: 'input', type: 'password', autocomplete: 'current-password' });
  const body = h('div', { class: 'stack' },
    h('p', null, on
      ? t('אימות דו-שלבי פעיל: בכל כניסה נשלח אליך קוד במייל, בנוסף לסיסמה.')
      : t('בכל כניסה, בנוסף לסיסמה, יישלח אליך קוד חד-פעמי במייל. כך גם מי שיודע את הסיסמה לא ייכנס בלי גישה למייל שלך.')),
    h('div', { class: 'field' }, h('label', { for: 'tf-pass' }, t('הסיסמה שלך, לאישור')), pass),
    err,
    h('button', {
      class: on ? 'btn btn-danger' : 'btn btn-primary', type: 'button', onclick: async () => {
        try {
          const r = await call<{ user: User }>('setTwoFactor', { enabled: !on, password: pass.value });
          await setUser(r.user);
          close();
          toast(on ? t('אימות דו-שלבי כבוי') : t('אימות דו-שלבי הופעל'));
        } catch (e: any) { err.textContent = e.message; err.hidden = false; }
      },
    }, on ? t('כיבוי אימות דו-שלבי') : t('הפעלת אימות דו-שלבי')),
  );
  const close = openSheet(t('אימות דו-שלבי'), body);
}

function deleteAccountSheet() {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const pass = h('input', { id: 'del-pass', class: 'input', type: 'password', autocomplete: 'current-password' });
  const confirmWord = t('מחיקה');
  const typed = h('input', { id: 'del-confirm', class: 'input', type: 'text', autocomplete: 'off' });
  const body = h('div', { class: 'stack' },
    h('p', null, t('מחיקת החשבון תמחק לצמיתות את כל הנתונים שלך: השבועות, התמונות, המטבעות והפניות. אי אפשר לשחזר אותם.')),
    h('p', { class: 'hint' }, t('כדאי לייצא גיבוי קודם (הגדרות ← ייצוא JSON).')),
    h('div', { class: 'field' }, h('label', { for: 'del-pass' }, t('הסיסמה שלך')), pass),
    h('div', { class: 'field' }, h('label', { for: 'del-confirm' }, t('להקליד "{w}" לאישור', { w: confirmWord })), typed),
    err,
    h('button', {
      class: 'btn btn-danger', type: 'button', onclick: async () => {
        if (typed.value.trim() !== confirmWord) { err.textContent = t('להקליד "{w}" לאישור', { w: confirmWord }); err.hidden = false; return; }
        try {
          await call('deleteAccount', { password: pass.value });
          replaceAll([]);
          close();
          await endSession();
          toast(t('החשבון נמחק'));
        } catch (e: any) { err.textContent = e.message; err.hidden = false; }
      },
    }, t('מחיקת החשבון לצמיתות')),
  );
  const close = openSheet(t('מחיקת חשבון'), body);
}

function changePasswordSheet() {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const oldP = h('input', { id: 'pw-old', class: 'input', type: 'password', autocomplete: 'current-password' });
  const newP = h('input', { id: 'pw-new', class: 'input', type: 'password', autocomplete: 'new-password', minlength: 8 });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('label', { for: 'pw-old' }, t('סיסמה נוכחית')), oldP),
    h('div', { class: 'field' }, h('label', { for: 'pw-new' }, t('סיסמה חדשה (8 תווים לפחות)')), newP),
    err,
    h('button', {
      class: 'btn btn-primary', type: 'button', onclick: async () => {
        try {
          await call('changePassword', { oldPassword: oldP.value, newPassword: newP.value });
          close();
          toast('הסיסמה שונתה');
        } catch (e: any) {
          err.textContent = e.message;
          err.hidden = false;
        }
      },
    }, t('שנה סיסמה')),
  );
  const close = openSheet('שינוי סיסמה', body);
}

export function renderProfile(root: HTMLElement): void {
  const u = currentUser()!;
  const p = u.profile ?? {};
  const weeks = allWeeks();
  const ws = weightSummary(weightPoints(weeks));
  const a = age(p.birthDate);
  const bmi = ws && p.heightCm ? round1(ws.current.weight / (p.heightCm / 100) ** 2) : null;
  const toGoal = ws && p.goalWeight ? round1(ws.current.weight - p.goalWeight) : null;

  const detail = (label: string, value: string | null) =>
    value ? h('div', { class: 'detail' }, h('span', { class: 'muted' }, label), h('span', null, value)) : '';

  const r = getRewards();
  const go = (hash: string) => () => navigate(hash);
  root.replaceChildren(
    h('section', { class: 'card profile-head' },
      avatar(u.name, u.photoId, 72, r?.frame ?? ''),
      h('div', { class: 'profile-id' },
        h('h2', null, u.name),
        r ? h('div', { class: 'muted small' }, tr`רמה ${r.level.n} · ${levelLabel(r.level.name)}`) : h('div', { class: 'muted', dir: 'ltr' }, u.email),
      ),
      h('button', { class: 'btn', onclick: go(HASH.profileEdit) }, t('עריכה')),
    ),
    h('section', { class: 'card menu-list' },
      menuItem('coin', t('מטבעות וחנות'), t('אתגרים אישיים, רמות וחנות'), go(HASH.rewards)),
      menuItem('feed', t('קהילה ואתגרים'), t('פיד, אתגרים עם חברים ותחרויות'), go(HASH.feed)),
      menuItem('chat', t('עוזר AI'), t('שאלות על הנתונים שלך'), go(HASH.chat)),
      menuItem('info', t('פנייה למנהל'), t('שאלה, בעיה או הצעה'), () => openAssistant('support')),
      menuItem('mail', t('הזמנת חברים'), t('קישור אישי, ומטבעות לשניכם'), go(HASH.share)),
      menuItem('access', t('נגישות'), t('גודל טקסט, ניגודיות, עצירת אנימציות'), () => openAccessibility()),
      menuItem('settings', t('הגדרות'), t('תצוגה, תזכורות, ייבוא וגיבוי'), go(HASH.settings)),
      isAdmin() && menuItem('admin', t('ניהול'), t('משתמשים, אנליטיקס ופניות'), go(HASH.admin)),
    ),
    h('details', { class: 'card fold' },
      h('summary', null, t('הפרטים שלי')),
      h('div', { class: 'details' },
        detail(t('גיל'), a !== null ? String(a) : null),
        detail(t('גובה'), p.heightCm ? tr`${p.heightCm} ס"מ` : null),
        detail(t('משקל יעד'), p.goalWeight ? tr`${p.goalWeight} ק"ג` : null),
        detail(t('BMI נוכחי'), bmi !== null ? bmi.toFixed(1) : null),
        detail(t('עד היעד'), toGoal !== null ? (toGoal > 0 ? tr`${toGoal.toFixed(1)} ק"ג` : t('הושג')) : null),
        detail(t('שבועות במעקב'), String(weeks.length)),
        detail(t('סה"כ אימונים'), String(countWorkouts(weeks))),
        detail(t('משקל נוכחי'), ws ? `${fmtKg(ws.current.weight)} (${formatShort(ws.current.date)})` : null),
      ),
      p.goal && h('p', { class: 'goal' }, h('span', { class: 'muted' }, t('המטרה שלי: ')), p.goal),
    ),
    h('details', { class: 'card fold' },
      h('summary', null, t('חשבון ואבטחה')),
      h('div', { class: 'stack' },
        h('div', { class: 'muted small', dir: 'ltr' }, u.email),
        h('button', { class: 'btn', onclick: twoFactorSheet }, (currentUser()?.twoFactor ? '🔒 ' + t('אימות דו-שלבי: פעיל') : t('אימות דו-שלבי: כבוי'))),
        h('button', { class: 'btn', onclick: changePasswordSheet }, t('שינוי סיסמה')),
        confirmButton(t('התנתקות מכל המכשירים'), t('הקש שוב: כל המכשירים האחרים ינותקו'), async () => {
          try { const r2 = await call<{ token: string }>('logoutAll'); await replaceToken(r2.token); toast(t('כל המכשירים האחרים נותקו')); } catch (e: any) { toast(e.message); }
        }, 'btn'),
        h('button', { class: 'link-btn danger-link', type: 'button', onclick: deleteAccountSheet }, t('מחיקת החשבון')),
      ),
    ),
    confirmButton(t('התנתקות'), t('הקש שוב להתנתקות'), () => endSession(), 'btn btn-danger'),
  );
}
