/**
 * First-week quest on Today: four simple steps in the first 14 days, then 100 coins.
 * Steps are read from local data for instant feedback; the server checks again before paying.
 * Whether the quest is still open (not claimed, inside the 14 days) comes from the server's
 * `questStatus`, so a quest claimed on one device stays hidden on the others.
 */
import { isRTL, t, tr } from '../i18n';
import { call, hasBackend } from '../api';
import { currentUser } from '../session';
import { allWeeks, notifyChange } from '../store';
import { track } from '../analytics';
import { refreshRewards } from '../rewards';
import { celebrate } from './celebrate';
import { h, toast } from './dom';
import type { Day } from '../types';

/** Last server answer per user, fetched once per app start (and set again after a claim). */
let status: { userId: string; paid: boolean; open: boolean } | null = null;
let asking = '';
function serverStatus(userId: string): { paid: boolean; open: boolean } | null {
  if (status?.userId === userId) return status;
  if (asking !== userId) {
    asking = userId;
    call<{ paid: boolean; open: boolean }>('questStatus')
      .then((r) => { status = { userId, paid: !!r.paid, open: !!r.open }; if (r.paid || !r.open) notifyChange(); })
      .catch(() => { asking = ''; }); // offline or old server: keep the local view, ask again next time
  }
  return null;
}
const done = (d: Day) => (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] || d.text?.[k]).length + (d.sport.status ? 1 : 0);

/** Scroll to the control a quest step needs and focus it, with a short highlight. */
function focusControl(selector: string): void {
  const el = document.querySelector<HTMLElement>(selector);
  if (!el) return;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');
  el.scrollIntoView({ block: 'center', behavior: reduced ? 'auto' : 'smooth' });
  el.focus({ preventScroll: true });
  el.classList.add('q-target');
  setTimeout(() => el.classList.remove('q-target'), 1600);
}

export function questCard(): HTMLElement | '' {
  const u = currentUser();
  if (!hasBackend() || !u) return '';
  const s = serverStatus(u.userId);
  if (s && (s.paid || !s.open)) return '';
  const created = Date.parse(u.createdAt) || 0;
  if (Date.now() - created > 14 * 864e5) return '';
  const weeks = allWeeks();
  const days = weeks.flatMap((w) => w.days);
  // [done, icon, label, control to focus on Today]
  const steps: [boolean, string, string, string][] = [
    [days.some((d) => (['breakfast', 'lunch', 'dinner'] as const).some((k) => d[k] === 'V')), '🍽️', 'לסמן ארוחה ראשונה', '.today .today-btn'],
    [weeks.some((w) => typeof w.startWeight === 'number'), '⚖️', 'להזין משקל התחלתי', '#start-weight'],
    [days.some((d) => d.sport.status === 'V'), '🏃', 'לסמן אימון ראשון', '.today .today-sport'],
    [days.some((d) => done(d) >= 4), '⭐', 'לסגור יום מלא', '.today .today-btn.mark-empty, .today .today-sport'],
  ];
  const n = steps.filter((s) => s[0]).length;
  const claim = h('button', { class: 'btn btn-primary', type: 'button', disabled: n < 4 }, n < 4 ? tr`עוד ${4 - n} ל-100 מטבעות` : t('קבלת 100 מטבעות 🎁'));
  const card = h('section', { class: 'card quest', 'aria-label': t('משימות השבוע הראשון') },
    h('div', { class: 'row-between' }, h('h2', { class: 'card-title' }, t('משימות השבוע הראשון')), h('span', { class: 'quest-count' }, `${n}/4`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': n, 'aria-valuemin': 0, 'aria-valuemax': 4, 'aria-label': t('התקדמות') }, h('span', { style: { width: (n / 4) * 100 + '%' } })),
    h('ul', { class: 'quest-list' }, steps.map(([ok, e, label, target]) => {
      const inner = [h('span', { class: 'q-check', 'aria-hidden': 'true' }, ok ? '✓' : e), h('span', null, t(label)), h('span', { class: 'sr-only' }, ok ? t('בוצע') : t('עוד לא'))];
      return h('li', { class: ok ? 'ok' : '' }, ok ? inner
        : h('button', { class: 'q-step', type: 'button', 'aria-describedby': 'q-step-hint', onclick: () => focusControl(target) }, ...inner, h('span', { class: 'q-go', 'aria-hidden': 'true' }, isRTL ? '‹' : '›')));
    })),
    h('p', { class: 'sr-only', id: 'q-step-hint' }, t('מעבר לכפתור המתאים בדף')),
    claim,
    h('p', { class: 'hint quest-coins' }, t('מטבעות קונים סקינים, צבעים ודמויות בחנות')),
  );
  claim.addEventListener('click', async () => {
    claim.setAttribute('disabled', '');
    try {
      const r = await call<{ paid: boolean }>('claimQuest');
      if (r.paid) {
        status = { userId: u.userId, paid: true, open: false };
        track('quest:claim');
        celebrate('day', t('השבוע הראשון הושלם!'), t('100 מטבעות נכנסו לחשבון'));
        refreshRewards();
        card.remove();
      }
    } catch (e: any) { toast(e.message); claim.removeAttribute('disabled'); }
  });
  return card;
}
