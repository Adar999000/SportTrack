import { t, tr } from '../i18n';
import { call, type User } from '../api';
import { daysBetween, formatShort, todayISO } from '../dates';
import { fileToDataUrl, pickImage } from '../image';
import { currentUser, endSession, isAdmin, rememberPhoto, setUser } from '../session';
import { weightPoints, weightSummary, countWorkouts, round1 } from '../stats';
import { allWeeks } from '../store';
import { avatar } from './avatar';
import { confirmButton, fmtKg, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { statsSections } from './statsView';
import { aiBadge } from './icons';
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

function changePasswordSheet() {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const oldP = h('input', { id: 'pw-old', class: 'input', type: 'password', autocomplete: 'current-password' });
  const newP = h('input', { id: 'pw-new', class: 'input', type: 'password', autocomplete: 'new-password', minlength: 6 });
  const body = h('div', { class: 'stack' },
    h('div', { class: 'field' }, h('label', { for: 'pw-old' }, t('סיסמה נוכחית')), oldP),
    h('div', { class: 'field' }, h('label', { for: 'pw-new' }, t('סיסמה חדשה (6 תווים לפחות)')), newP),
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

  root.replaceChildren(
    h('section', { class: 'card profile-head' },
      avatar(u.name, u.photoId, 72),
      h('div', { class: 'profile-id' },
        h('h2', null, u.name),
        h('div', { class: 'muted', dir: 'ltr' }, u.email),
        u.role === 'admin' && h('span', { class: 'badge' }, t('מנהל')),
      ),
      h('button', { class: 'btn', onclick: () => navigate(HASH.profileEdit) }, t('עריכה')),
    ),
    h('section', { class: 'card' },
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
    (() => {
      const r = getRewards();
      return h('section', { class: 'card stack' },
        r ? h('div', { class: 'level-top' },
          h('div', { class: 'level-num' }, h('small', null, t('רמה')), h('b', null, String(r.level.n))),
          h('div', null, h('p', { class: 'level-name' }, levelLabel(r.level.name)),
            h('div', { class: 'balance small-balance' }, h('span', { class: 'coin', 'aria-hidden': 'true' }), r.balance.toLocaleString('en-US'))),
        ) : '',
        h('div', { class: 'row-btns two' },
          h('button', { class: 'btn btn-primary', onclick: () => navigate(HASH.rewards) }, t('מטבעות ואתגרים')),
          h('button', { class: 'btn', onclick: () => navigate(HASH.share) }, t('הזמנת חברים')),
        ),
      );
    })(),
    ...statsSections(weeks, { days: getRewards()?.frozenDays, weeks: getRewards()?.frozenWeeks }),
    h('section', { class: 'card stack' },
      h('button', { class: 'btn ai-btn', onclick: () => navigate(HASH.chat) }, aiBadge(), ' ', t('שאל את העוזר על הנתונים שלך')),
      isAdmin() && h('button', { class: 'btn btn-primary', onclick: () => navigate(HASH.admin) }, t('לוח מנהל')),
      h('button', { class: 'btn', onclick: () => navigate(HASH.settings) }, t('הגדרות, ייבוא וייצוא')),
      h('button', { class: 'btn', onclick: changePasswordSheet }, t('שינוי סיסמה')),
      confirmButton(t('התנתקות'), t('הקש שוב להתנתקות'), () => endSession(), 'btn btn-danger'),
    ),
  );
}
