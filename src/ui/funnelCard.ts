/** Admin "Funnel" card: the sign-up cohort from landing visit to first invite (spec: team/specs/beta-metrics.md §3). */
import { t, tr } from '../i18n';
import { call } from '../api';
import { formatHours, funnelRows, MIN_BASE, type FunnelResponse, type FunnelRow, type StepKey } from '../funnel';
import { formatShort } from '../dates';
import { h } from './dom';

function stepLabel(k: StepKey): string {
  switch (k) {
    case 'landing': return t('ביקורים בדף הבית');
    case 'signupOpen': return t('פתחו את טופס ההרשמה');
    case 'signedUp': return t('נרשמו');
    case 'onboarded': return t('סיימו את ההיכרות');
    case 'firstMark': return t('סימון ראשון');
    case 'firstFullDay': return t('יום מלא ראשון');
    case 'day3': return t('חזרו ביום 3');
    case 'day7': return t('חזרו ביום 7');
    case 'invited': return t('שיתפו הזמנה');
  }
}

const pctCell = (v: number | null, tooFew: boolean) =>
  v !== null ? `${v}%` : tooFew ? t('מעט מדי') : '—';

function stepNote(r: FunnelRow, f: FunnelResponse): string {
  if (r.key === 'day3' && r.base !== undefined) return tr`מתוך ${r.base} שנרשמו לפני 4 ימים לפחות`;
  if (r.key === 'day7' && r.base !== undefined) return tr`מתוך ${r.base} שנרשמו לפני 8 ימים לפחות`;
  if (r.key === 'invited') return tr`${f.cohort.invitedConverted} הביאו חבר שנרשם`;
  if (r.key === 'landing' || r.key === 'signupOpen') return t('מבקרים, בלי חשבון');
  return '';
}

function medianText(hrs: number | null): string {
  const m = formatHours(hrs);
  if (!m) return '—';
  return m.unit === 'min' ? t('{n} דק׳', { n: m.n }) : m.unit === 'h' ? t('{n} שעות', { n: m.n }) : t('{n} ימים', { n: m.n });
}

function render(f: FunnelResponse): HTMLElement[] {
  const rows = funnelRows(f);
  const max = Math.max(1, f.cohort.signedUp, ...rows.filter((r) => r.key !== 'landing' && r.key !== 'signupOpen').map((r) => r.count));
  const funnel = h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('משפך ההרשמה') },
    h('table', { class: 'data-table funnel-table' },
      h('caption', { class: 'sr-only' }, tr`משפך ההרשמה, ${formatShort(f.from)} עד ${formatShort(f.to)}`),
      h('thead', null, h('tr', null, [t('שלב'), t('כמה'), t('% מהנרשמים'), t('% מהשלב הקודם')].map((c) => h('th', { scope: 'col' }, c)))),
      h('tbody', null, rows.map((r, i) => {
        const note = stepNote(r, f);
        const visitor = r.key === 'landing' || r.key === 'signupOpen';
        return h('tr', { class: visitor ? 'funnel-visitor' : '' },
          h('th', { scope: 'row' },
            h('span', { class: 'funnel-name' }, h('span', { class: 'funnel-num', 'aria-hidden': 'true' }, String(i + 1)), stepLabel(r.key)),
            note ? h('span', { class: 'funnel-note' }, note) : '',
            visitor ? '' : h('span', { class: 'an-bar funnel-bar', 'aria-hidden': 'true', style: { width: Math.round((r.count / max) * 100) + '%' } })),
          h('td', null, r.count.toLocaleString('en-US')),
          h('td', null, pctCell(r.ofSignedUp, r.tooFew && !visitor)),
          h('td', null, pctCell(r.ofPrev, r.tooFew)));
      }))));

  const weeks = f.weeks.length
    ? h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('לפי שבוע הרשמה') },
        h('table', { class: 'data-table' },
          h('caption', { class: 'sr-only' }, t('לפי שבוע הרשמה')),
          h('thead', null, h('tr', null, [t('שבוע הרשמה'), t('נרשמו'), t('סימון ראשון'), t('חזרו ביום 7')].map((c) => h('th', { scope: 'col' }, c)))),
          h('tbody', null, f.weeks.map((w) => h('tr', null,
            h('th', { scope: 'row' }, formatShort(w.weekStart)),
            h('td', null, String(w.signedUp)), h('td', null, String(w.firstMark)), h('td', null, String(w.day7Returned)))))))
    : h('p', { class: 'muted' }, t('עוד אין נרשמים בתקופה הזאת.'));

  return [
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('נרשמו בתקופה')), h('div', { class: 'tile-value' }, String(f.cohort.signedUp))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('זמן חציוני לסימון ראשון')), h('div', { class: 'tile-value' }, medianText(f.medianHoursToFirstMark)))),
    funnel,
    h('details', { class: 'funnel-help' },
      h('summary', null, t('איך סופרים?')),
      h('p', { class: 'hint' }, t('הקבוצה היא מי שנרשמו בתקופה שנבחרה. חזרה ביום 3 נספרת רק למי שנרשמו לפני 4 ימים לפחות, וחזרה ביום 7 רק למי שנרשמו לפני 8 ימים לפחות.')),
      h('p', { class: 'hint' }, tr`אחוזים מוצגים רק כשיש לפחות ${MIN_BASE} משתמשים בבסיס. מנהלים וחשבונות בדיקה לא נספרים, ואין כאן שמות.`)),
    h('h3', { class: 'section-title' }, t('לפי שבוע הרשמה')),
    weeks,
  ];
}

export function funnelCard(): HTMLElement {
  let days = 30;
  const body = h('div', { class: 'stack', 'aria-live': 'polite' });
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('תקופה') });
  const drawSeg = () => seg.replaceChildren(...[7, 30, 90].map((n) =>
    h('button', { type: 'button', 'aria-pressed': String(n === days), onclick: () => { days = n; drawSeg(); load(); } }, tr`${n} ימים`)));
  const load = async () => {
    body.setAttribute('aria-busy', 'true');
    body.replaceChildren(h('p', { class: 'muted' }, t('טוען…')));
    try {
      body.replaceChildren(...render(await call<FunnelResponse>('adminFunnel', { days })));
    } catch (e: any) {
      body.replaceChildren(h('p', { class: 'form-error' }, /לא מוכרת|Unknown action/.test(e.message) ? t('עוד אין נתונים למשפך. הם יופיעו אחרי עדכון קוד השרת.') : e.message));
    }
    body.removeAttribute('aria-busy');
  };
  drawSeg();
  load();
  return h('section', { class: 'card funnel-card', 'aria-labelledby': 'funnel-h' }, h('h2', { class: 'card-title', id: 'funnel-h' }, t('משפך הבטא')), seg, body);
}
