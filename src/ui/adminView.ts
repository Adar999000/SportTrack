import { isRTL, t, tr } from '../i18n';
import { call, type AdminUserRow, type UserSummary } from '../api';
import { formatShort, monthLabel, sundayOf, todayISO, daysBetween } from '../dates';
import { round1 } from '../stats';
import { avatar } from './avatar';
import { aiBadge } from './icons';
import { fmtPct, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';

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
