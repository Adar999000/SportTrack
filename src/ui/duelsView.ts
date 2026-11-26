import { t, tr } from '../i18n';
import { call } from '../api';
import { currentUser } from '../session';
import { daysBetween, formatShort, todayISO } from '../dates';
import { avatar } from './avatar';
import { confirmButton, h, openSheet, toast } from './dom';
import { HASH } from './router';
import { track } from '../analytics';

export interface Duel {
  id: string; title: string; metric: string; metricName: string; start: string; end: string; code: string; status: 'active' | 'done';
  mine: boolean; myStatus: string; winners: string[]; prize: number;
  standings: { userId: string; name: string; photoId: string | null; frame: string; status: string; score: number }[];
}

export const METRICS: Record<string, { icon: string; name: string; unit: string }> = {
  workouts: { icon: '💪', name: 'הכי הרבה אימונים', unit: 'אימונים' },
  runs: { icon: '🏃', name: 'הכי הרבה ריצות', unit: 'ריצות' },
  healthy: { icon: '🥗', name: 'הכי הרבה ארוחות בריאות', unit: 'ארוחות' },
  fullDays: { icon: '✅', name: 'הכי הרבה ימים מלאים', unit: 'ימים' },
  coins: { icon: '🪙', name: 'הכי הרבה מטבעות', unit: 'מטבעות' },
};

async function shareInvite(d: Duel) {
  const url = location.origin + location.pathname + HASH.duel(d.code);
  const text = tr`בוא/י להתחרות איתי: "${d.title}" במשמעת אישית! קוד: ${d.code}`;
  track('duel:invite');
  try {
    if (navigator.share) { await navigator.share({ text, url }); return; }
  } catch (e: any) { if (e?.name === 'AbortError') return; }
  try { await navigator.clipboard.writeText(`${text}\n${url}`); toast(t('הקישור הועתק. אפשר להדביק בוואטסאפ')); } catch { toast(d.code); }
}

function duelCard(d: Duel, reload: () => void): HTMLElement {
  const m = METRICS[d.metric] ?? { icon: '🏆', name: d.metricName, unit: '' };
  const me = currentUser()?.userId;
  const today = todayISO();
  const total = daysBetween(d.start, d.end) + 1;
  const passed = Math.max(0, Math.min(total, daysBetween(d.start, today) + 1));
  const left = Math.max(0, daysBetween(today, d.end));
  const top = Math.max(1, ...d.standings.map((s) => s.score));
  const medal = ['🥇', '🥈', '🥉'];
  const invited = d.myStatus === 'invited';
  const iWon = d.status === 'done' && !!me && d.winners.includes(me);
  return h('article', { class: 'card duel' + (d.status === 'done' ? ' duel-done' : '') },
    h('header', { class: 'duel-head' },
      h('span', { class: 'duel-icon', 'aria-hidden': 'true' }, m.icon),
      h('div', { class: 'duel-title' },
        h('strong', null, d.title),
        h('span', { class: 'muted small' }, `${d.title === m.name || d.title === t(m.name) ? '' : t(m.name) + ' · '}${formatShort(d.start)} – ${formatShort(d.end)}`)),
      h('span', { class: 'prize', title: t('פרס למנצח') }, '🏆 ', String(d.prize)),
    ),
    d.status === 'active'
      ? h('div', { class: 'duel-time' },
          h('div', { class: 'bar', role: 'progressbar', 'aria-label': t('זמן שעבר'), 'aria-valuenow': Math.round((passed / total) * 100), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: (passed / total) * 100 + '%' } })),
          h('span', { class: 'muted small' }, d.start > today ? t('מתחיל מחר') : left === 0 ? t('יום אחרון!') : tr`עוד ${left} ימים`))
      : h('div', { class: 'duel-winner' + (iWon ? ' me' : '') }, d.winners.length
          ? (iWon ? tr`🎉 ניצחת! +${d.prize} מטבעות` : tr`🏆 ניצח/ה: ${d.standings.filter((s) => d.winners.includes(s.userId)).map((s) => s.name).join(', ')}`)
          : t('האתגר הסתיים בלי מנצח')),
    h('ol', { class: 'standings' }, d.standings.map((s, i) => h('li', { class: s.userId === me ? 'me' : '' },
      h('span', { class: 'rank' }, s.status === 'invited' ? '⏳' : medal[i] ?? String(i + 1)),
      avatar(s.name, s.photoId, 34, s.frame),
      h('div', { class: 'st-main' },
        h('div', { class: 'st-row' }, h('strong', null, s.name), h('span', { class: 'st-score' }, s.status === 'invited' ? t('הוזמן/ה') : `${s.score} ${t(m.unit)}`)),
        s.status === 'in' && h('div', { class: 'st-bar' }, h('span', { style: { width: Math.round((s.score / top) * 100) + '%' } }))),
    ))),
    invited
      ? h('div', { class: 'row-btns two' },
          h('button', { class: 'btn btn-primary', type: 'button', onclick: async () => { try { await call('respondDuel', { id: d.id, accept: true }); track('duel:join'); toast(t('הצטרפת! בהצלחה 💪')); reload(); } catch (e: any) { toast(e.message); } } }, t('הצטרף')),
          h('button', { class: 'btn', type: 'button', onclick: async () => { try { await call('respondDuel', { id: d.id, accept: false }); reload(); } catch (e: any) { toast(e.message); } } }, t('לא תודה')))
      : h('div', { class: 'duel-actions' },
          d.status === 'active' && d.code && h('button', { class: 'btn', type: 'button', onclick: () => shareInvite(d) }, '📨 ', t('הזמן חברים')),
          d.status === 'active' && confirmButton(d.mine ? t('בטל אתגר') : t('צא מהאתגר'), t('הקש שוב לאישור'), async () => { try { await call('leaveDuel', { id: d.id }); reload(); } catch (e: any) { toast(e.message); } }, 'btn btn-danger'),
        ),
  );
}

function newDuelSheet(onDone: () => void): void {
  let metric = 'workouts', days = 7;
  const picks = h('div', { class: 'metric-pick', role: 'radiogroup', 'aria-label': t('על מה מתחרים') },
    Object.entries(METRICS).map(([k, m]) => {
      const b = h('button', { class: 'metric-opt', type: 'button', role: 'radio', 'aria-checked': String(k === metric), onclick: () => {
        metric = k; picks.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      } }, h('span', { 'aria-hidden': 'true' }, m.icon), t(m.name));
      return b;
    }));
  const lengths = h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('משך') },
    [3, 7, 14, 30].map((n) => {
      const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(n === days), onclick: () => {
        days = n; lengths.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      } }, n === 7 ? t('שבוע') : n === 14 ? t('שבועיים') : n === 30 ? t('חודש') : tr`${n} ימים`);
      return b;
    }));
  const title = h('input', { class: 'input', id: 'duel-title', maxlength: 60, placeholder: t('לדוגמה: מי רץ הכי הרבה השבוע') }) as HTMLInputElement;
  const start = h('select', { class: 'input', id: 'duel-start' }, h('option', { value: 'today' }, t('מהיום')), h('option', { value: 'tomorrow' }, t('ממחר'))) as HTMLSelectElement;
  const friendsBox = h('div', { class: 'stack' }, h('p', { class: 'muted small' }, t('טוען חברים…')));
  call<{ friends: { userId: string; name: string; photoId: string | null }[] }>('friends').then(({ friends }) => {
    friendsBox.replaceChildren(...(friends.length ? friends.map((f) => h('label', { class: 'friend-opt' },
      h('input', { type: 'checkbox', value: f.userId }), avatar(f.name, f.photoId, 30), h('span', null, f.name)))
      : [h('p', { class: 'hint' }, t('עוד אין לך חברים באפליקציה. אחרי היצירה תקבל/י קישור להזמנה בוואטסאפ.'))]));
  }).catch(() => friendsBox.replaceChildren());
  const close = openSheet(t('אתגר חדש'), h('form', { class: 'stack', onsubmit: async (e: Event) => {
    e.preventDefault();
    const invite = [...friendsBox.querySelectorAll<HTMLInputElement>('input:checked')].map((i) => i.value);
    try {
      const { duel } = await call<{ duel: Duel }>('createDuel', { metric, days, title: title.value, invite, startToday: start.value === 'today' });
      track('duel:create');
      close(); toast(t('האתגר נוצר! עכשיו מזמינים חברים')); onDone();
      shareInvite(duel);
    } catch (ex: any) { toast(ex.message); }
  } },
    h('h3', { class: 'section-title' }, t('על מה מתחרים?')), picks,
    h('h3', { class: 'section-title' }, t('כמה זמן?')), lengths,
    h('div', { class: 'field' }, h('label', { for: 'duel-start' }, t('מתי מתחילים')), start),
    h('div', { class: 'field' }, h('label', { for: 'duel-title' }, t('שם לאתגר (לא חובה)')), title),
    h('h3', { class: 'section-title' }, t('את מי להזמין')), friendsBox,
    h('p', { class: 'hint' }, tr`הניקוד מחושב אוטומטית מהטבלה של כל משתתף. המנצח מקבל ${100} מטבעות.`),
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('צור אתגר')),
  ), { full: true });
}

export function duelsTab(box: HTMLElement): void {
  const list = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const code = h('input', { class: 'input', maxlength: 10, placeholder: t('קוד אתגר'), 'aria-label': t('קוד אתגר'), dir: 'ltr' }) as HTMLInputElement;
  const load = () => call<{ duels: Duel[] }>('duels').then(({ duels }) => {
    const active = duels.filter((d) => d.status === 'active'), done = duels.filter((d) => d.status === 'done');
    list.replaceChildren(
      ...(active.length ? active.map((d) => duelCard(d, load)) : [h('section', { class: 'card empty' },
        h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '🏁'), h('p', null, t('עוד אין אתגרים פעילים. צרו אתגר והזמינו חברים: מי מתאמן הכי הרבה השבוע?')))]),
      done.length ? h('h3', { class: 'section-title' }, t('אתגרים שהסתיימו')) : '',
      ...done.map((d) => duelCard(d, load)),
    );
  }).catch((e) => list.replaceChildren(h('p', { class: 'form-error' }, /לא מוכרת|Unknown action/.test(e.message) ? t('האתגרים עוד לא הופעלו בשרת. הם יופיעו אחרי שמנהל האפליקציה יעדכן את קוד השרת.') : e.message)));
  box.replaceChildren(
    h('section', { class: 'card duel-hero' },
      h('div', null, h('h2', null, t('אתגרים עם חברים')), h('p', null, t('מתחרים על אימונים, ריצות, תזונה או מטבעות. הניקוד מתעדכן לבד מהטבלה.'))),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => newDuelSheet(load) }, t('+ אתגר חדש')),
    ),
    h('form', { class: 'join-code', onsubmit: async (e: Event) => {
      e.preventDefault();
      try { await call('joinDuel', { code: code.value }); track('duel:join'); toast(t('הצטרפת! בהצלחה 💪')); code.value = ''; load(); } catch (ex: any) { toast(ex.message); }
    } }, code, h('button', { class: 'btn', type: 'submit' }, t('הצטרף עם קוד'))),
    list,
  );
  load();
}
