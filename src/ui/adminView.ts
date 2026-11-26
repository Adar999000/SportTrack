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
  login_ok: 'כניסה', login_fail: 'כניסה נכשלה', login_locked: 'נחסם אחרי ניסיונות', '2fa_sent': 'נשלח קוד כניסה', '2fa_fail': 'קוד כניסה שגוי',
  '2fa_on': 'הופעל אימות דו-שלבי', '2fa_off': 'כובה אימות דו-שלבי', password_change: 'שינוי סיסמה', reset_request: 'בקשת איפוס סיסמה',
  reset_done: 'איפוס סיסמה', logout_all: 'ניתוק כל המכשירים', register: 'הרשמה', admin_view: 'צפייה של מנהל', role_change: 'שינוי הרשאה', public_contact: 'פנייה מהאתר',
};

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
          h('p', null, h('strong', null, p.author.name), ' · ', p.text || (p.data?.title ?? '')),
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
  return h('section', { class: 'card' }, det);
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
  config: { a11yName: string; a11yPhone: string; a11yEmail: string };
  ai: { month: string; spend: number; budget: number };
  backups: { id: string; name: string; at: string }[];
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
        draw(await call<AdminSettings>('setSiteConfig', { a11yName: v('a11y-name'), a11yPhone: v('a11y-phone'), a11yEmail: v('a11y-email'), aiBudget: Number(v('ai-budget')) }));
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
  return h('section', { class: 'card' }, h('details', null, h('summary', { class: 'card-title' }, t('הגדרות אתר, תקציב AI וגיבויים')), body));
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

  root.replaceChildren(
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('לוח מנהל')), overview,
      h('button', { class: 'btn ai-btn', onclick: () => navigate(HASH.chatAll) }, aiBadge(), ' ', t('שאל את העוזר על כל המשתמשים'))),
    inboxCard(),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('משתמשים')),
      h('p', { class: 'hint' }, t('בעמודה השמאלית: שינוי משקל מההתחלה, אימונים וארוחות ב-4 השבועות האחרונים. מוצגים רק נתונים סטטיסטיים.')),
      list,
    ),
    settingsCard(),
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
          h('div', { class: 'table-scroll' },
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
