/**
 * First-week quest on Today: four simple steps in the first 14 days, then 100 coins.
 * Steps are read from local data for instant feedback; the server checks again before paying.
 */
import { t, tr } from '../i18n';
import { call, hasBackend } from '../api';
import { currentUser } from '../session';
import { allWeeks } from '../store';
import { refreshRewards } from '../rewards';
import { celebrate } from './celebrate';
import { h, toast } from './dom';
import type { Day } from '../types';

const KEY = () => 'quest-done:' + (currentUser()?.userId ?? '');
const done = (d: Day) => (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] || d.text?.[k]).length + (d.sport.status ? 1 : 0);

export function questCard(): HTMLElement | '' {
  const u = currentUser();
  if (!hasBackend() || !u) return '';
  try { if (localStorage.getItem(KEY())) return ''; } catch { /* ignore */ }
  const created = Date.parse(u.createdAt) || 0;
  if (Date.now() - created > 14 * 864e5) return '';
  const weeks = allWeeks();
  const days = weeks.flatMap((w) => w.days);
  const steps: [boolean, string, string][] = [
    [days.some((d) => (['breakfast', 'lunch', 'dinner'] as const).some((k) => d[k] === 'V')), '🍽️', 'לסמן ארוחה ראשונה'],
    [weeks.some((w) => typeof w.startWeight === 'number'), '⚖️', 'להזין משקל התחלתי'],
    [days.some((d) => d.sport.status === 'V'), '🏃', 'לסמן אימון ראשון'],
    [days.some((d) => done(d) >= 4), '⭐', 'לסגור יום מלא'],
  ];
  const n = steps.filter((s) => s[0]).length;
  const claim = h('button', { class: 'btn btn-primary', type: 'button', disabled: n < 4 }, n < 4 ? tr`עוד ${4 - n} ל-100 מטבעות` : t('קבלת 100 מטבעות 🎁'));
  const card = h('section', { class: 'card quest', 'aria-label': t('משימות השבוע הראשון') },
    h('div', { class: 'row-between' }, h('h2', { class: 'card-title' }, t('משימות השבוע הראשון')), h('span', { class: 'quest-count' }, `${n}/4`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': n, 'aria-valuemin': 0, 'aria-valuemax': 4, 'aria-label': t('התקדמות') }, h('span', { style: { width: (n / 4) * 100 + '%' } })),
    h('ul', { class: 'quest-list' }, steps.map(([ok, e, label]) => h('li', { class: ok ? 'ok' : '' },
      h('span', { class: 'q-check', 'aria-hidden': 'true' }, ok ? '✓' : e), h('span', null, t(label)), h('span', { class: 'sr-only' }, ok ? t('בוצע') : t('עוד לא'))))),
    claim,
  );
  claim.addEventListener('click', async () => {
    claim.setAttribute('disabled', '');
    try {
      const r = await call<{ paid: boolean }>('claimQuest');
      if (r.paid) {
        try { localStorage.setItem(KEY(), '1'); } catch { /* ignore */ }
        celebrate('day', t('השבוע הראשון הושלם!'), t('100 מטבעות נכנסו לחשבון'));
        refreshRewards();
        card.remove();
      }
    } catch (e: any) { toast(e.message); claim.removeAttribute('disabled'); }
  });
  return card;
}
