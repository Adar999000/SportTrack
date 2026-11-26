import { isRTL, t, tr } from '../i18n';
import { call, type AdminUserRow } from '../api';
import { formatShort, sundayOf, todayISO, daysBetween } from '../dates';
import { normalizeWeek } from '../model';
import { round1 } from '../stats';
import type { Week } from '../types';
import { avatar } from './avatar';
import { fmtPct, h, toast } from './dom';
import { HASH, navigate } from './router';
import { statsSections } from './statsView';

let usersCache: AdminUserRow[] | null = null;

function relDays(iso: string | null): string {
  if (!iso) return '—';
  const d = daysBetween(String(iso).slice(0, 10), todayISO());
  return d <= 0 ? t('היום') : d === 1 ? t('אתמול') : tr`לפני ${d} ימים`;
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
    const losses = users.filter((u) => u.firstWeight != null && u.currentWeight != null).map((u) => u.currentWeight! - u.firstWeight!);
    overview.replaceChildren(
      tile(t('משתמשים'), String(users.length)),
      tile(t('עדכנו השבוע או בשבוע שעבר'), String(active)),
      tile(t('שינוי משקל ממוצע'), losses.length ? round1(losses.reduce((a, b) => a + b, 0) / losses.length).toFixed(1) : '—'),
    );
    const sorted = [...users].sort((a, b) => String(b.lastSeen).localeCompare(String(a.lastSeen)));
    list.replaceChildren(...sorted.map((u) => {
      const change = u.firstWeight != null && u.currentWeight != null ? round1(u.currentWeight - u.firstWeight) : null;
      return h('button', { class: 'user-row', onclick: () => navigate(HASH.adminUser(u.userId)) },
        avatar(u.name, u.photoId, 44),
        h('span', { class: 'user-main' },
          h('strong', null, u.name, u.role === 'admin' ? t(' · מנהל') : ''),
          h('span', { class: 'muted small' }, tr`נכנס ${relDays(u.lastSeen)} · ${u.weeks} שבועות`),
          u.level ? h('span', { class: 'muted small' }, tr`רמה ${u.level} · ${(u.coins ?? 0).toLocaleString('en-US')} מטבעות`) : '',
        ),
        h('span', { class: 'user-nums' },
          h('span', null, u.currentWeight != null ? tr`${Number(u.currentWeight).toFixed(1)} ק"ג` : '—'),
          h('span', { class: 'muted small' }, change != null ? `${change > 0 ? '+' : ''}${change.toFixed(1)}` : ''),
          h('span', { class: 'muted small' }, tr`${u.recentWorkouts} אימונים · ${fmtPct(u.recentMealsPct)}`),
        ),
      );
    }));
  };

  root.replaceChildren(
    h('section', { class: 'card' }, h('h2', { class: 'card-title' }, t('לוח מנהל')), overview,
      h('button', { class: 'btn', onclick: () => navigate(HASH.chatAll) }, t('שאל את העוזר על כל המשתמשים'))),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('משתמשים')),
      h('p', { class: 'hint' }, t('בעמודה השמאלית: משקל נוכחי, שינוי מההתחלה, אימונים וארוחות ב-4 השבועות האחרונים.')),
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
  const p = u?.profile ?? {};
  root.replaceChildren(
    h('button', { class: 'link-btn', onclick: () => navigate(HASH.admin) }, (isRTL ? '→ ' : '← ') + t('חזרה ללוח המנהל')),
    u ? h('section', { class: 'card profile-head' },
      avatar(u.name, u.photoId, 64),
      h('div', { class: 'profile-id' },
        h('h2', null, u.name),
        h('div', { class: 'muted', dir: 'ltr' }, u.email),
        h('div', { class: 'muted small' }, [
          p.heightCm && tr`גובה ${p.heightCm}`, p.goalWeight && tr`יעד ${p.goalWeight} ק"ג`, tr`נרשם ${formatShort(String(u.createdAt).slice(0, 10))}`,
        ].filter(Boolean).join(' · ')),
        p.goal && h('div', { class: 'small' }, tr`מטרה: ${p.goal}`),
      ),
    ) : '',
    h('button', { class: 'btn', onclick: () => navigate(HASH.chatUser(userId)) }, tr`שאל את העוזר על ${u?.name ?? t('המשתמש')}`),
    body,
  );
  call<{ weeks: { sundayDate: string; updatedAt: number; photoId: string | null; data: any }[] }>('getWeeks', { userId, since: 0 })
    .then(({ weeks }) => {
      const parsed = weeks
        .map((r) => normalizeWeek({ ...r.data, sundayDate: r.sundayDate, photoId: r.photoId ?? undefined }))
        .filter((w): w is Week => !!w)
        .sort((a, b) => a.sundayDate.localeCompare(b.sundayDate));
      body.replaceChildren(...statsSections(parsed));
    })
    .catch((e) => body.replaceChildren(h('p', { class: 'form-error' }, e.message)));
}
