import { feedbackCard } from './feedbackCard';
import { funnelCard } from './funnelCard';
import { photoUrl } from '../session';
import { APP_VERSION } from '../version';
import { isRTL, t, tr } from '../i18n';
import { call, type AdminUserRow, type UserSummary } from '../api';
import { formatShort, monthLabel, sundayOf, todayISO, daysBetween } from '../dates';
import { round1 } from '../stats';
import { avatar } from './avatar';
import { aiBadge } from './icons';
import { fmtPct, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { EVENT_TYPES, eventForm, type CompEvent, type Post } from './feedView';

let usersCache: AdminUserRow[] | null = null;

function relDays(iso: string | null): string {
  if (!iso) return '—';
  const d = daysBetween(String(iso).slice(0, 10), todayISO());
  return d <= 0 ? t('היום') : d === 1 ? t('אתמול') : tr`לפני ${d} ימים`;
}

interface Thread { userId: string; name: string; photoId: string | null; unread: number; count: number; last: { at: string; from: string; text: string } }
interface SupportMsg { id: string; at: string; from: 'user' | 'admin'; subject: string; text: string }

function openThread(th: Thread, onDone: () => void) {
  const log = h('div', { class: 'support-log' }, h('p', { class: 'muted' }, t('טוען…')));
  const input = h('textarea', { id: 'admin-reply', class: 'input', rows: 3, maxlength: 2000, placeholder: t('התשובה שלך'), 'aria-label': t('התשובה שלך') });
  const load = () => call<{ messages: SupportMsg[] }>('adminThread', { userId: th.userId }).then(({ messages }) => {
    log.replaceChildren(...messages.map((m) => h('div', { class: `bubble bubble-${m.from === 'admin' ? 'user' : 'assistant'} support-bubble` },
      m.subject && m.from === 'user' ? h('strong', null, m.subject, h('br')) : '', m.text,
      h('div', { class: 'muted small' }, formatShort(String(m.at).slice(0, 10))))));
    log.scrollTop = log.scrollHeight;
  }).catch((e) => log.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  const form = h('form', { class: 'stack' }, input, h('button', { class: 'btn btn-primary', type: 'submit' }, t('שליחת תשובה')));
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    try { await call('adminReply', { userId: th.userId, text: input.value }); input.value = ''; toast(t('התשובה נשלחה')); load(); onDone(); }
    catch (ex: any) { toast(ex.message); }
  });
  openSheet(tr`פניות מ${th.name}`, h('div', { class: 'stack' }, log, form), { full: true });
  load().then(onDone);
}

/** Open the inbox thread that contains a message (from a survey answer that asked for a reply). */
async function openThreadFor(messageId: string, firstName: string): Promise<void> {
  try {
    const { threads } = await call<{ threads: Thread[] }>('adminInbox');
    const likely = threads.filter((th) => !firstName || th.name.split(' ')[0] === firstName);
    for (const th of [...likely, ...threads.filter((x) => !likely.includes(x))]) {
      const { messages } = await call<{ messages: SupportMsg[] }>('adminThread', { userId: th.userId });
      if (messages.some((m) => m.id === messageId)) return openThread(th, () => {});
    }
    toast(t('השרשור לא נמצא בפניות'));
  } catch (e: any) { toast(e.message); }
}

function inboxCard(): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const load = () => call<{ threads: Thread[] }>('adminInbox').then(({ threads }) => {
    body.replaceChildren(...(threads.length
      ? threads.map((th) => h('button', { class: 'user-row', type: 'button', onclick: () => openThread(th, load) },
          avatar(th.name, th.photoId, 40),
          h('span', { class: 'user-main' },
            h('strong', null, th.name, th.unread ? h('span', { class: 'fab-badge inline' }, String(th.unread)) : ''),
            h('span', { class: 'muted small clamp-1' }, (th.last.from === 'admin' ? t('אתה: ') : '') + th.last.text)),
          h('span', { class: 'muted small' }, formatShort(String(th.last.at).slice(0, 10)))))
      : [h('p', { class: 'muted' }, t('אין פניות עדיין.'))]));
  }).catch((e) => body.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  load();
  return h('section', { class: 'card inbox-card' }, h('h2', { class: 'card-title' }, t('פניות ממשתמשים')), body);
}

const AUDIT_LABEL: Record<string, string> = {
  server_updated: 'השרת עודכן אוטומטית',
  login_ok: 'כניסה', login_fail: 'כניסה נכשלה', login_locked: 'נחסם אחרי ניסיונות', '2fa_sent': 'נשלח קוד כניסה', '2fa_fail': 'קוד כניסה שגוי',
  '2fa_on': 'הופעל אימות דו-שלבי', '2fa_off': 'כובה אימות דו-שלבי', password_change: 'שינוי סיסמה', reset_request: 'בקשת איפוס סיסמה',
  reset_done: 'איפוס סיסמה', logout_all: 'ניתוק כל המכשירים', register: 'הרשמה', admin_view: 'צפייה של מנהל', role_change: 'שינוי הרשאה', public_contact: 'פנייה מהאתר',
};

interface Analytics { days: number; daily: { day: string; users: number; events: number }[]; dau: number; wau: number; mau: number; totalUsers: number;
  events: { event: string; count: number; users: number; count7: number; users7: number }[] }

const EVENT_LABEL: Record<string, string> = {
  'screen:week': 'מסך שבוע', 'screen:history': 'היסטוריה', 'screen:stats': 'סטטיסטיקה', 'screen:profile': 'פרופיל', 'screen:settings': 'הגדרות',
  'screen:rewards': 'מטבעות וחנות', 'screen:share': 'הזמנת חברים', 'screen:feed': 'קהילה', 'screen:tracker': 'מעקב מותאם', 'screen:chat': 'צ\'אט מלא',
  'screen:admin': 'ניהול', 'screen:adminuser': 'ניהול: משתמש',
  'mark:meal': 'סימון ארוחה', 'mark:sport': 'סימון ספורט', 'cell:vxd': 'תא מותאם V/X', 'cell:check': 'תא וי', 'cell:emoji': 'תא מצב רוח', 'cell:stars': 'תא כוכבים',
  'cell:number': 'תא מספר', 'cell:text': 'תא טקסט', 'table:customize': 'עריכת הטבלה', 'chat:me': 'שאלה לעוזר', 'chat:all': 'עוזר מנהל', 'chat:user': 'עוזר על משתמש',
  'fab:open': 'פתיחת העוזר הצף', 'post:create': 'פוסט חדש', 'post:like': 'לייק', 'post:comment': 'תגובה', 'share:achievement': 'שיתוף הישג בקהילה',
  'share:outside': 'שיתוף לרשתות', 'store:buy': 'קנייה בחנות', 'store:try': 'ניסיון פריט', 'duel:create': 'יצירת אתגר', 'duel:join': 'הצטרפות לאתגר', 'duel:join-link': 'הצטרפות מקישור',
  'duel:invite': 'הזמנה לאתגר', 'theme:toggle': 'החלפת בהיר/כהה', 'a11y:open': 'תפריט נגישות',
};
const eventLabel = (e: string) => t(EVENT_LABEL[e] ?? (e.startsWith('tracker:create:') ? 'מעקב חדש' : e));

function activityChart(daily: Analytics['daily']): SVGSVGElement {
  const W = 600, H = 150, pad = 22;
  const max = Math.max(1, ...daily.map((d) => d.users));
  const bw = (W - pad * 2) / daily.length;
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', `0 0 ${W} ${H}`); svg.setAttribute('class', 'act-chart'); svg.setAttribute('role', 'img');
  svg.setAttribute('aria-label', tr`משתמשים פעילים ביום, ${daily.length} ימים אחרונים. מקסימום ${max}`);
  const el = (n: string, a: Record<string, any>, text?: string) => { const x = document.createElementNS(NS, n); for (const k in a) x.setAttribute(k, String(a[k])); if (text) x.textContent = text; svg.append(x); return x; };
  el('line', { x1: pad, x2: W - pad, y1: H - pad, y2: H - pad, class: 'axis' });
  el('text', { x: pad - 4, y: pad, class: 'axis-label', 'text-anchor': 'end' }, String(max));
  daily.forEach((d, i) => {
    const h0 = ((H - pad * 2) * d.users) / max;
    const r = el('rect', { x: pad + i * bw + 1, y: H - pad - h0, width: Math.max(1, bw - 2), height: h0, rx: 2, class: 'act-bar' });
    const tt = document.createElementNS(NS, 'title'); tt.textContent = `${formatShort(d.day)}: ${d.users} · ${d.events}`; r.append(tt);
  });
  el('text', { x: W - pad, y: H - 6, class: 'axis-label', 'text-anchor': 'end' }, formatShort(daily[daily.length - 1].day).slice(0, 5));
  el('text', { x: pad, y: H - 6, class: 'axis-label' }, formatShort(daily[0].day).slice(0, 5));
  return svg;
}

function serverCard(): HTMLElement {
  const info = h('p', { class: 'muted' }, t('בודק…'));
  const btn = h('button', { class: 'btn', type: 'button' }, '🔄 ', t('עדכן את השרת עכשיו')) as HTMLButtonElement;
  call<{ serverVersion?: string }>('status').then((r) => {
    const v = r.serverVersion;
    info.replaceChildren(v ? tr`גרסת שרת ${v} · גרסת אפליקציה ${APP_VERSION}` : t('השרת בגרסה ישנה. אחרי העדכון הידני האחרון הוא יתעדכן לבד.'));
  }).catch(() => info.replaceChildren(''));
  btn.addEventListener('click', async () => {
    btn.disabled = true;
    try {
      const r = await call<{ updated: boolean; upToDate?: boolean; error?: string; version?: number }>('serverUpdate', { force: false });
      toast(r.updated ? tr`השרת עודכן (גרסה ${r.version}). רענון בעוד רגע…` : r.upToDate ? t('השרת כבר מעודכן') : r.error ?? t('העדכון נכשל'));
      if (r.updated) setTimeout(() => location.reload(), 2500);
    } catch (e: any) { toast(/לא מוכרת|Unknown action/.test(e.message) ? t('צריך עדכון ידני אחד אחרון של קוד השרת') : e.message); }
    btn.disabled = false;
  });
  return h('section', { class: 'card stack' },
    h('h2', { class: 'card-title' }, t('שרת')),
    info,
    h('p', { class: 'hint' }, t('השרת מושך את הקוד העדכני מ-GitHub לבד (תוך עד 10 דקות מכל עדכון), באותה כתובת ובלי פריסה מחדש.')),
    btn,
  );
}

function analyticsCard(): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  let days = 30;
  const load = async () => {
    try {
      const a = await call<Analytics>('adminAnalytics', { days });
      const feats = a.events.filter((e) => !e.event.startsWith('screen:'));
      const screens = a.events.filter((e) => e.event.startsWith('screen:'));
      const maxF = Math.max(1, ...feats.map((e) => e.count)), maxS = Math.max(1, ...screens.map((e) => e.count));
      const table = (list: Analytics['events'], max: number) => list.length ? h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('טבלה') }, h('table', { class: 'data-table an-table' },
        h('thead', null, h('tr', null, [t('פיצ\'ר'), tr`${a.days} ימים`, t('7 ימים'), t('משתמשים')].map((c) => h('th', { scope: 'col' }, c)))),
        h('tbody', null, list.slice(0, 20).map((e) => h('tr', null,
          h('th', { scope: 'row' }, h('span', { class: 'an-name' }, eventLabel(e.event)), h('span', { class: 'an-bar', style: { width: Math.round((e.count / max) * 100) + '%' } })),
          h('td', null, e.count.toLocaleString('en-US')), h('td', null, e.count7.toLocaleString('en-US')), h('td', null, String(e.users))))))) : h('p', { class: 'muted' }, t('עוד אין נתונים.'));
      const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('תקופה') }, [7, 30, 90].map((n) => h('button', { type: 'button', 'aria-pressed': String(n === days), onclick: () => { days = n; load(); } }, tr`${n} ימים`)));
      body.replaceChildren(
        seg,
        h('div', { class: 'tiles' },
          tile(t('פעילים היום'), String(a.dau)), tile(t('פעילים השבוע'), String(a.wau)),
          tile(tr`פעילים ב-${a.days} ימים`, String(a.mau)), tile(t('אחוז פעילים השבוע'), a.totalUsers ? Math.round((a.wau / a.totalUsers) * 100) + '%' : '—')),
        h('h3', { class: 'section-title' }, t('משתמשים פעילים ביום')), activityChart(a.daily),
        h('h3', { class: 'section-title' }, t('הפיצ\'רים המובילים')), table(feats, maxF),
        h('h3', { class: 'section-title' }, t('מסכים')), table(screens, maxS),
        h('p', { class: 'hint' }, t('נאספים רק שמות פעולות ומספרים מצטברים ליום, בלי תוכן ובלי פרטים אישיים.')),
      );
    } catch (e: any) { body.replaceChildren(h('p', { class: 'form-error' }, /לא מוכרת|Unknown action/.test(e.message) ? t('האנליטיקס יופעל אחרי עדכון קוד השרת.') : e.message)); }
  };
  load();
  return h('section', { class: 'card admin-analytics' }, h('h2', { class: 'card-title' }, t('אנליטיקס שימוש')), body);
}

function communityCard(): HTMLElement {
  const body = h('div', { class: 'stack' });
  const det = h('details', null, h('summary', null, t('קהילה: תחרויות ודיווחים')), body);
  const load = async () => {
    body.replaceChildren(h('p', { class: 'muted' }, t('טוען…')));
    try {
      const [{ events }, { posts }] = await Promise.all([
        call<{ events: CompEvent[] }>('adminEvents'),
        call<{ posts: (Post & { reports: { reason: string }[] })[] }>('modQueue'),
      ]);
      const act = (fn: () => Promise<unknown>) => async () => { try { await fn(); toast(t('בוצע')); load(); } catch (e: any) { toast(e.message); } };
      body.replaceChildren(
        h('h3', { class: 'section-title' }, t('תחרויות')),
        h('button', { class: 'btn', type: 'button', onclick: () => eventForm(load, true) }, t('+ הוסף תחרות')),
        events.length ? h('div', { class: 'earn-list' }, events.map((e) => h('div', { class: 'earn-row mod-row' },
          h('span', null, `${(EVENT_TYPES[e.type] ?? EVENT_TYPES.other)[0]} ${e.title} · ${formatShort(e.date)} `, h('span', { class: 'badge' }, t(e.status === 'approved' ? 'מאושר' : e.status === 'pending' ? 'ממתין' : 'נדחה'))),
          h('span', { class: 'row-actions' },
            e.status !== 'approved' && h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('setEventStatus', { id: e.id, status: 'approved' })) }, t('אשר')),
            e.status === 'pending' && h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('setEventStatus', { id: e.id, status: 'rejected' })) }, t('דחה')),
            h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('setEventStatus', { id: e.id, status: 'delete' })) }, t('מחק'))),
        ))) : h('p', { class: 'muted' }, t('אין תחרויות.')),
        h('h3', { class: 'section-title' }, t('פוסטים שדווחו')),
        posts.length ? h('div', { class: 'stack' }, posts.map((p) => h('div', { class: 'mod-post' },
          h('p', null, p.kind === 'story' ? h('span', { class: 'badge' }, t('סטורי')) : '', ' ', h('strong', null, p.author.name), ' · ', p.text || (p.data?.title ?? p.data?.name ?? (p.photoId ? t('תמונה') : ''))),
          p.photoId ? h('a', { class: 'link-btn', href: '#', onclick: (e: Event) => { e.preventDefault(); photoUrl(p.photoId!).then((u) => openSheet(t('תמונה מדווחת'), h('img', { src: u, alt: t('תמונה מדווחת'), style: { width: '100%', borderRadius: '12px' } }))).catch(() => {}); } }, t('צפייה בתמונה')) : '',
          h('p', { class: 'muted small' }, tr`${p.reports.length} דיווחים`, p.status !== 'ok' ? ' · ' + t('מוסתר') : ''),
          h('div', { class: 'row-actions' },
            h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('modAction', { id: p.id, do: 'restore' })) }, t('השאר והסר דיווחים')),
            p.status === 'ok' && h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('modAction', { id: p.id, do: 'hide' })) }, t('הסתר')),
            h('button', { class: 'link-btn', type: 'button', onclick: act(() => call('modAction', { id: p.id, do: 'delete' })) }, t('מחק'))),
        ))) : h('p', { class: 'muted' }, t('אין דיווחים.')),
      );
    } catch (e: any) { body.replaceChildren(h('p', { class: 'form-error' }, e.message)); }
  };
  det.addEventListener('toggle', () => { if (det.open) load(); });
  return h('section', { class: 'card admin-community' }, det);
}

function auditCard(names: Record<string, string>): HTMLElement {
  const body = h('div', { class: 'earn-list' });
  const det = h('details', null, h('summary', null, t('יומן אבטחה (200 האירועים האחרונים)')), body);
  det.addEventListener('toggle', () => {
    if (!det.open || body.childElementCount) return;
    body.append(h('p', { class: 'muted' }, t('טוען…')));
    call<{ entries: { at: string; userId: string; event: string; detail: string }[] }>('auditLog').then(({ entries }) => {
      body.replaceChildren(...entries.map((e) => h('div', { class: 'earn-row' },
        h('span', null, t(AUDIT_LABEL[e.event] ?? e.event), e.userId ? ` · ${names[e.userId] ?? e.userId}` : '', e.detail && e.event !== 'admin_view' ? h('span', { class: 'muted small' }, ` (${e.detail})`) : ''),
        h('span', { class: 'muted small', dir: 'ltr' }, String(e.at).replace('T', ' ').slice(0, 16)))));
    }).catch((err) => body.replaceChildren(h('p', { class: 'form-error' }, err.message)));
  });
  return h('section', { class: 'card' }, det);
}

interface AdminSettings {
  config: { a11yName: string; a11yPhone: string; a11yEmail: string; spotifyClientId?: string };
  ai: { month: string; spend: number; budget: number };
  backups: { id: string; name: string; at: string }[];
  mail?: { left: number; reserve: number; skippedToday: number };
  verifyPosting?: boolean;
}

interface ErrGroup { message: string; count: number; last: string; versions: string[]; screens: string[]; users: number; stack: string; agent: string }
/** Errors users hit on their devices in the last 14 days, grouped by message. */
function errorsCard(): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const det = h('details', { class: 'admin-errors' }, h('summary', { class: 'card-title' }, t('תקלות אצל משתמשים (14 ימים)')), body);
  let loaded = false;
  det.addEventListener('toggle', () => {
    if (!det.open || loaded) return;
    loaded = true;
    call<{ errors: ErrGroup[] }>('adminErrors').then(({ errors }) => body.replaceChildren(...(errors.length ? errors.map((e) => h('details', { class: 'err-row' },
      h('summary', null, h('strong', null, `${e.count}×`), ' ', e.message, h('span', { class: 'muted small' }, ` · ${e.users} ${t('משתמשים')} · ${String(e.last).replace('T', ' ').slice(0, 16)}`)),
      h('p', { class: 'muted small', dir: 'ltr' }, `v${e.versions.join(', ')} · ${e.screens.join(', ')}`),
      h('pre', { class: 'err-stack', dir: 'ltr' }, e.stack), h('p', { class: 'muted small', dir: 'ltr' }, e.agent)))
      : [h('p', { class: 'muted' }, t('אין תקלות. 🎉'))]))).catch((er) => body.replaceChildren(h('p', { class: 'form-error' }, er.message)));
  });
  return h('section', { class: 'card' }, det);
}

function settingsCard(): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const draw = (s: AdminSettings) => {
    const f = (id: string, label: string, value: string, attrs: Record<string, any> = {}) =>
      h('div', { class: 'field' }, h('label', { for: id }, label), h('input', { id, class: 'input', value, ...attrs }));
    const pct = s.ai.budget ? Math.min(100, Math.round((s.ai.spend / s.ai.budget) * 100)) : 100;
    const form = h('form', { class: 'stack' },
      h('h3', { class: 'section-title' }, t('רכז/ת נגישות (מוצג בהצהרת הנגישות)')),
      f('a11y-name', t('שם'), s.config.a11yName, { autocomplete: 'name' }),
      f('a11y-phone', t('טלפון'), s.config.a11yPhone, { type: 'tel', dir: 'ltr' }),
      f('a11y-email', t('אימייל'), s.config.a11yEmail, { type: 'email', dir: 'ltr' }),
      h('h3', { class: 'section-title' }, t('מוזיקה (Spotify)')),
      f('spotify-id', t('Client ID של אפליקציית Spotify'), s.config.spotifyClientId ?? '', { dir: 'ltr', autocomplete: 'off', spellcheck: false }),
      h('p', { class: 'hint' }, t('יוצרים אפליקציה ב-developer.spotify.com, מוסיפים Redirect URI זהה לכתובת האתר, ומדביקים כאן את ה-Client ID (לא את ה-Secret).')),
      h('h3', { class: 'section-title' }, t('הגנה מספאם')),
      h('label', { class: 'consent' }, h('input', { type: 'checkbox', id: 'verify-posting', checked: s.verifyPosting !== false }), h('span', null, t('לדרוש אימות מייל לפני פרסום, תגובות ואתגרים (מומלץ)'))),
      s.mail ? h('div', { class: 'mail-quota' + (s.mail.left >= 0 && s.mail.left <= s.mail.reserve ? ' low' : '') },
        h('strong', null, t('מיילים שנשארו היום: ')), s.mail.left < 0 ? t('לא ידוע') : String(s.mail.left),
        s.mail.skippedToday ? h('span', { class: 'muted small' }, ' · ', tr`${s.mail.skippedToday} לא נשלחו היום`) : '',
        h('p', { class: 'hint' }, t('בחשבון Gmail רגיל אפשר כ-100 מיילים ביום. כשנשארים 20, נשלחים רק קודי כניסה, איפוס ואימות.'))) : '',
      h('h3', { class: 'section-title' }, t('תקציב עוזר AI לחודש')),
      h('div', { class: 'bar', role: 'progressbar', 'aria-label': t('ניצול התקציב החודשי'), 'aria-valuenow': pct, 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: pct + '%' } })),
      h('p', { class: 'hint' }, t('נוצלו ${0} מתוך ${1} ב-{2}. כשמגיעים לתקרה העוזר נעצר עד החודש הבא.').replace('{0}', s.ai.spend.toFixed(2)).replace('{1}', String(s.ai.budget)).replace('{2}', s.ai.month)),
      f('ai-budget', t('תקרה חודשית בדולרים'), String(s.ai.budget), { type: 'number', min: 0, max: 1000, step: '0.5', inputmode: 'decimal' }),
      h('button', { class: 'btn btn-primary', type: 'submit' }, t('שמירה')),
    );
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const v = (id: string) => (form.querySelector('#' + id) as HTMLInputElement).value;
      try {
        draw(await call<AdminSettings>('setSiteConfig', { a11yName: v('a11y-name'), a11yPhone: v('a11y-phone'), a11yEmail: v('a11y-email'), spotifyClientId: v('spotify-id'), verifyPosting: (form.querySelector('#verify-posting') as HTMLInputElement).checked, aiBudget: Number(v('ai-budget')) }));
        toast(t('נשמר'));
      } catch (ex: any) { toast(ex.message); }
    });
    body.replaceChildren(
      form,
      h('h3', { class: 'section-title' }, t('גיבויים')),
      h('p', { class: 'hint' }, t('גיבוי אוטומטי של הגיליון כל לילה לתיקייה "גיבויים" בדרייב שלך. נשמרים 14 הגיבויים האחרונים.')),
      s.backups.length
        ? h('div', { class: 'earn-list' }, s.backups.map((b) => h('div', { class: 'earn-row' }, h('span', null, b.name), h('span', { class: 'muted small', dir: 'ltr' }, String(b.at).slice(0, 10)))))
        : h('p', { class: 'muted' }, t('עוד אין גיבויים.')),
      h('button', {
        class: 'btn', type: 'button', onclick: async () => {
          try { await call('backupNow'); toast(t('הגיבוי נשמר בדרייב')); load(); } catch (ex: any) { toast(ex.message); }
        },
      }, t('גיבוי עכשיו')),
    );
  };
  const load = () => call<AdminSettings>('adminSettings').then(draw).catch((e) => body.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  load();
  return h('section', { class: 'card admin-settings' }, h('details', null, h('summary', { class: 'card-title' }, t('הגדרות אתר, Spotify, תקציב AI וגיבויים')), body));
}

export function renderAdmin(root: HTMLElement): void {
  const list = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען משתמשים…')));
  const invites = h('div', { class: 'stack' });
  const overview = h('div', { class: 'tiles' });

  const loadInvites = async () => {
    try {
      const { invites: inv } = await call<{ invites: { code: string; createdAt: string; usedBy: string | null }[] }>('listInvites');
      const open = inv.filter((i) => !i.usedBy);
      invites.replaceChildren(
        open.length
          ? h('div', { class: 'chips' }, open.map((i) => h('button', {
              class: 'chip code', dir: 'ltr', onclick: async () => {
                try { await navigator.clipboard.writeText(i.code); toast('הקוד הועתק'); } catch { toast(i.code); }
              },
            }, i.code)))
          : h('p', { class: 'muted' }, t('אין קודים פנויים.')),
        inv.some((i) => i.usedBy) ? h('p', { class: 'hint' }, tr`נוצלו: ${inv.filter((i) => i.usedBy).map((i) => i.usedBy).join(', ')}`) : '',
      );
    } catch (e: any) { invites.replaceChildren(h('p', { class: 'form-error' }, e.message)); }
  };

  const draw = (users: AdminUserRow[]) => {
    const thisSunday = sundayOf(todayISO());
    const active = users.filter((u) => u.lastWeek && daysBetween(u.lastWeek, thisSunday) <= 7).length;
    const losses = users.filter((u) => u.weightChange != null).map((u) => u.weightChange!);
    overview.replaceChildren(
      tile(t('משתמשים'), String(users.length)),
      tile(t('עדכנו השבוע או בשבוע שעבר'), String(active)),
      tile(t('שינוי משקל ממוצע'), losses.length ? round1(losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1) : '—'),
    );
    const sorted = [...users].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    list.replaceChildren(...sorted.map((u) => {
      const change = u.weightChange;
      return h('button', { class: 'user-row', onclick: () => navigate(HASH.adminUser(u.userId)) },
        avatar(u.name, u.photoId, 44),
        h('span', { class: 'user-main' },
          h('strong', null, u.name, u.role === 'admin' ? t(' · מנהל') : ''),
          h('span', { class: 'muted small' }, tr`נכנס ${relDays(u.lastSeen)} · ${u.weeks} שבועות`),
          u.level ? h('span', { class: 'muted small' }, tr`רמה ${u.level} · ${(u.coins ?? 0).toLocaleString('en-US')} מטבעות`) : '',
        ),
        h('span', { class: 'user-nums' },
          h('span', null, change != null ? tr`${(change > 0 ? '+' : '') + change.toFixed(1)} ק"ג` : '—'),
          h('span', { class: 'muted small' }, tr`${u.recentWorkouts} אימונים · ${fmtPct(u.recentMealsPct)}`),
        ),
      );
    }));
  };

  const jump = (sel: string) => () => {
    const el = root.querySelector(sel) as HTMLElement | null;
    if (!el) return;
    el.querySelectorAll('details').forEach((d) => { (d as HTMLDetailsElement).open = true; });
    if (el instanceof HTMLDetailsElement) el.open = true;
    el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    if (!el.hasAttribute('tabindex')) el.setAttribute('tabindex', '-1');
    el.focus({ preventScroll: true });
  };
  const quick = h('nav', { class: 'chips admin-jump', 'aria-label': t('קפיצה מהירה') },
    ([['.admin-settings', '⚙️ הגדרות אתר, Spotify ונגישות'], ['.admin-community', '🚩 דיווחים ותחרויות'], ['.inbox-card', '✉️ פניות'], ['.admin-users', '👥 משתמשים']] as const)
      .map(([sel, label]) => h('button', { type: 'button', class: 'chip', onclick: jump(sel) }, t(label))));
  // the weekly 30-minute review (spec: team/specs/beta-feedback.md §2), in reading order
  const review = h('details', { class: 'card weekly-review' },
    h('summary', { class: 'card-title' }, t('סקירה שבועית (30 דקות)')),
    h('ol', { class: 'review-list' }, ([
      ['.funnel-card', t('משפך'), t('השלב החלש ביותר הוא הנושא של השבוע')],
      ['.feedback-card', t('משוב'), t('ממוצע יום 3 ויום 7, תשובות כתובות ומי ביקש תשובה')],
      ['.inbox-card', t('פניות'), t('לענות על הכל תוך 24 שעות, מהישנה לחדשה')],
      ['.admin-analytics', t('אנליטיקס'), t('פעילים השבוע, ומה משתמשים בו ומה לא')],
      ['.admin-errors', t('תקלות'), t('תקלה אצל 2 משתמשים או יותר מתוקנת השבוע')],
      ['.admin-users', t('משתמשים'), t('מי לא חזר 7 ימים אחרי ההרשמה: לפנות לעד 3')],
    ] as const).map(([sel, title, what]) => h('li', null,
      h('button', { class: 'review-jump', type: 'button', onclick: jump(sel) }, h('strong', null, title), h('span', { class: 'muted small' }, what))))),
    h('p', { class: 'hint' }, t('בסוף: להרחיב, לתקן קודם או לעצור, נושא אחד לשבוע הבא, ושורה ב-decisions.md.')));
  root.replaceChildren(
    quick,
    review,
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('לוח מנהל')), overview,
      h('button', { class: 'btn ai-btn', onclick: () => navigate(HASH.chatAll) }, aiBadge(), ' ', t('שאל את העוזר על כל המשתמשים'))),
    inboxCard(),
    h('section', { class: 'card admin-users' },
      h('h2', { class: 'card-title' }, t('משתמשים')),
      h('p', { class: 'hint' }, t('בעמודה השמאלית: שינוי משקל מההתחלה, אימונים וארוחות ב-4 השבועות האחרונים. מוצגים רק נתונים סטטיסטיים.')),
      list,
    ),
    funnelCard(),
    feedbackCard((id, name) => void openThreadFor(id, name)),
    analyticsCard(),
    serverCard(),
    settingsCard(),
    errorsCard(),
    communityCard(),
    auditCard(Object.fromEntries((usersCache ?? []).map((u) => [u.userId, u.name]))),
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, t('קודי הזמנה')),
      h('p', { class: 'hint' }, t('כל קוד מאפשר הרשמה אחת. הקש על קוד כדי להעתיק אותו ולשלוח למי שתרצה.')),
      invites,
      h('button', {
        class: 'btn btn-primary', onclick: async () => {
          try { const { code } = await call<{ code: string }>('createInvite'); toast(tr`נוצר קוד ${code}`); loadInvites(); } catch (e: any) { toast(e.message); }
        },
      }, t('צור קוד הזמנה')),
    ),
  );
  if (usersCache) draw(usersCache);
  call<{ users: AdminUserRow[] }>('listUsers').then(({ users }) => { usersCache = users; draw(users); })
    .catch((e) => list.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  loadInvites();
}

function tile(label: string, value: string) {
  return h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, label), h('div', { class: 'tile-value' }, value));
}

function historyCard(userId: string, approved: boolean): HTMLElement {
  const id = 'hist-approve';
  const input = h('input', { type: 'checkbox', role: 'switch', id, checked: approved, class: 'switch' }) as HTMLInputElement;
  input.addEventListener('change', async () => {
    input.disabled = true;
    try { await call('approveHistory', { userId, approved: input.checked }); toast(t('נשמר')); }
    catch (e: any) { input.checked = !input.checked; toast(e.message); }
    finally { input.disabled = false; }
  });
  return h('section', { class: 'card' },
    h('div', { class: 'setting' }, h('label', { for: id }, t('אישור ספירת היסטוריה מלאה')), input),
    h('p', { class: 'hint' }, t('בלי אישור, היסטוריה מלפני ההצטרפות נספרת כבונוס פתיחה של עד 500 מטבעות. עם אישור, כל ההיסטוריה נספרת למטבעות ולרמה.')),
  );
}

export function renderAdminUser(root: HTMLElement, userId: string): void {
  const u = usersCache?.find((x) => x.userId === userId);
  const body = h('div', { class: 'stack' }, h('section', { class: 'card' }, h('p', { class: 'muted' }, t('טוען נתונים…'))));
  root.replaceChildren(
    h('button', { class: 'link-btn', onclick: () => navigate(HASH.admin) }, (isRTL ? '→ ' : '← ') + t('חזרה ללוח המנהל')),
    body,
  );
  const signed = (n: number | null) => (n === null ? '—' : (n > 0 ? '+' : '') + n.toFixed(1));
  call<{ summary: UserSummary }>('userSummary', { userId })
    .then(({ summary: s }) => {
      body.replaceChildren(
        h('section', { class: 'card profile-head' },
          avatar(s.name, s.photoId, 64),
          h('div', { class: 'profile-id' },
            h('h2', null, s.name),
            h('div', { class: 'muted', dir: 'ltr' }, s.email),
            h('div', { class: 'muted small' }, tr`נרשם ${formatShort(String(s.createdAt).slice(0, 10))} · נכנס ${relDays(s.lastSeen)} · רמה ${s.level}`),
          ),
        ),
        h('button', { class: 'btn ai-btn', onclick: () => navigate(HASH.chatUser(userId)) }, aiBadge(), ' ', tr`שאל את העוזר על ${s.name}`),
        h('section', { class: 'card' },
          h('div', { class: 'tiles' },
            tile(t('שבועות במעקב'), String(s.weeks)),
            tile(t('אימונים בשבוע'), s.workoutsPerWeek === null ? '—' : s.workoutsPerWeek.toFixed(1)),
            tile(t('ארוחות בריאות'), fmtPct(s.mealsPct)),
            tile(t('שינוי משקל'), signed(s.weightChange)),
          ),
          h('p', { class: 'hint' }, t('מוצגים רק נתונים סטטיסטיים. הערות, תמונות שבועיות ופרטים אישיים של המשתמש לא מוצגים למנהל.')),
        ),
        historyCard(userId, !!s.historyApproved),
        h('section', { class: 'card' },
          h('h2', { class: 'card-title' }, t('לפי חודש')),
          h('div', { class: 'table-scroll', tabindex: 0, role: 'region', 'aria-label': t('טבלה') },
            h('table', { class: 'data-table' },
              h('thead', null, h('tr', null, [t('חודש'), t('שבועות'), t('אימונים לשבוע'), t('ארוחות בריאות'), t('שינוי משקל')].map((c) => h('th', { scope: 'col' }, c)))),
              h('tbody', null, [...s.months].reverse().map((m) => h('tr', null,
                h('th', { scope: 'row' }, monthLabel(m.month)),
                h('td', null, m.weeks),
                h('td', null, m.workoutsPerWeek.toFixed(1)),
                h('td', null, fmtPct(m.mealsPct)),
                h('td', null, signed(m.weightChange)),
              ))),
            ),
          ),
        ),
      );
    })
    .catch((e) => body.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  void u;
}
