import { addDays, formatShort, sundayOf, todayISO } from '../dates';
import { currentUser } from '../session';
import { BADGES, levelLabel, getRewards, leaderboard, refreshRewards, rewardsError, spend, type Leader, type Rewards } from '../rewards';
import { avatar } from './avatar';
import { confirmButton, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { t, tr } from '../i18n';
import { ACCENTS } from '../types';
import { updateSettings } from '../store';

const coin = () => h('span', { class: 'coin', 'aria-hidden': 'true' });
const fmt = (n: number) => n.toLocaleString('en-US');
const price = (n: number) => h('span', { class: 'price' }, coin(), fmt(n));
const pct = (a: number, b: number) => Math.max(0, Math.min(100, Math.round((a / b) * 100)));

const EARN_RULES: [string, string][] = [
  ['יום מלא בטבלה', '5'],
  ['אימון (פעם ביום)', '10'],
  ['שקילה שבועית', '5'],
  ['7 ימים רצופים עם צהריים V', '20'],
  ['4 שבועות רצופים עם 3+ אימונים', '50'],
  ['אתגר יומי: 3 ארוחות בריאות', '15'],
  ['אתגר שבועי / חודשי / שנתי', '30 / 100 / 500'],
  ['כל ק"ג בדרך למשקל היעד (עד אחד בשבוע)', '20'],
  ['הגעה למשקל היעד', '200'],
  ['חבר נרשם בקישור שלך · משלים שבוע ראשון', '50 + 50'],
];

function levelCard(r: Rewards): HTMLElement {
  const toNext = r.level.to - r.lifetime;
  return h('section', { class: 'card level-card' },
    h('div', { class: 'level-top' },
      h('div', { class: 'level-num', 'aria-label': tr`רמה ${r.level.n}` }, h('small', null, t('רמה')), h('b', null, String(r.level.n))),
      h('div', null,
        h('p', { class: 'level-name' }, levelLabel(r.level.name)),
        h('div', { class: 'muted small' }, tr`עוד ${fmt(toNext)} מטבעות לרמה הבאה`),
      ),
    ),
    h('div', { class: 'bar', role: 'progressbar', 'aria-label': t('התקדמות לרמה הבאה'), 'aria-valuenow': pct(r.lifetime - r.level.from, r.level.to - r.level.from), 'aria-valuemin': 0, 'aria-valuemax': 100 },
      h('span', { style: { width: pct(r.lifetime - r.level.from, r.level.to - r.level.from) + '%' } })),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('יתרה')), h('div', { class: 'balance' }, coin(), fmt(r.balance))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('השבוע')), h('div', { class: 'tile-value' }, '+' + fmt(r.week))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('החודש')), h('div', { class: 'tile-value' }, '+' + fmt(r.month))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('נצברו בסך הכל')), h('div', { class: 'tile-value' }, fmt(r.lifetime))),
    ),
  );
}

function challengesCard(r: Rewards): HTMLElement {
  const label = { day: 'יומי', week: 'שבועי', month: 'חודשי', year: 'שנתי' } as const;
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('אתגרים')),
    ...r.challenges.map((c) => {
      const needMore = c.minCells !== undefined && (c.cells ?? 0) < c.minCells;
      const done = c.progress >= c.target && !needMore;
      return h('div', { class: 'challenge' + (done ? ' done' : '') },
        h('div', { class: 'challenge-head' },
          h('span', null, h('span', { class: 'badge' }, t(label[c.period])), ' ', t(c.title)),
          price(c.reward),
        ),
        h('div', { class: 'bar', role: 'progressbar', 'aria-label': t(c.title), 'aria-valuenow': pct(c.progress, c.target), 'aria-valuemin': 0, 'aria-valuemax': 100 }, h('span', { style: { width: pct(c.progress, c.target) + '%' } })),
        h('div', { class: 'muted small' }, done ? t('הושלם')
          : `${c.progress}${c.unit ?? ''} / ${c.target}${c.unit ?? ''}` + (needMore ? ' · ' + tr`נספר אחרי ${c.minCells} ארוחות מסומנות (עכשיו ${c.cells ?? 0})` : '')),
      );
    }),
    !r.hasGoal && h('p', { class: 'hint' }, t('כדי לצבור מטבעות על משקל, צריך להגדיר משקל יעד בפרופיל.')),
  );
}

function pickDateSheet(title: string, options: { value: string; label: string }[], onPick: (v: string) => Promise<void>) {
  const body = h('div', { class: 'stack' },
    ...options.map((o) => h('button', {
      class: 'btn', type: 'button',
      onclick: async () => {
        try { await onPick(o.value); close(); toast(t('בוצע')); } catch (e: any) { toast(e.message); }
      },
    }, o.label)),
  );
  const close = openSheet(title, body);
}

function shopCard(r: Rewards): HTMLElement {
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i - 1)).filter((d) => !r.frozenDays.includes(d));
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(sundayOf(today), -7 * (i + 1))).filter((s) => !r.frozenWeeks.includes(s));
  const buy = async (fn: () => Promise<void>) => {
    try { await fn(); toast(t('בוצע')); } catch (e: any) { toast(e.message); }
  };
  const item = (title: string, desc: string, cost: number, action: HTMLElement) =>
    h('div', { class: 'shop-item' }, h('strong', null, title), h('span', { class: 'muted small' }, desc), price(cost), action);
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('חנות')),
    h('div', { class: 'shop' },
      item(t('הקפאת יום'), t('יום שפספסת לא ישבור את רצף הצהריים'), r.costs.freezeDay,
        h('button', { class: 'btn', type: 'button', disabled: r.balance < r.costs.freezeDay, onclick: () =>
          pickDateSheet(t('איזה יום להקפיא?'), days.map((d) => ({ value: d, label: formatShort(d) })), (d) => spend('freezeDay', { date: d })) }, t('בחר יום'))),
      item(t('הקפאת שבוע'), t('שבוע חלש לא ישבור את רצף האימונים'), r.costs.freezeWeek,
        h('button', { class: 'btn', type: 'button', disabled: r.balance < r.costs.freezeWeek, onclick: () =>
          pickDateSheet(t('איזה שבוע להקפיא?'), weeks.map((s) => ({ value: s, label: tr`שבוע ${formatShort(s)}` })), (s) => spend('freezeWeek', { date: s })) }, t('בחר שבוע'))),
      item(t('10 הודעות לבוט') + ' ✦AI', tr`מעבר למגבלה היומית · יש לך ${r.chatCredits}`, r.costs.chat10,
        confirmButton(t('קנה'), t('הקש שוב לאישור'), () => buy(() => spend('chat10')), 'btn')),
      ...ACCENTS.filter((a) => a.premium).map((a) => {
        const owned = r.unlockedColors.includes(a.id);
        return item(tr`צבע ${t(a.name)}`, t('צבע מיוחד לאפליקציה'), r.costs.color,
          owned
            ? h('button', { class: 'btn', type: 'button', onclick: () => { updateSettings({ accent: a.id }); toast(t('הצבע הופעל')); } }, t('הפעל'))
            : confirmButton(t('קנה'), t('הקש שוב לאישור'), () => buy(async () => { await spend('color', { color: a.id }); updateSettings({ accent: a.id }); }), 'btn'));
      }),
    ),
    (r.frozenDays.length || r.frozenWeeks.length) ? h('p', { class: 'hint' },
      t('מוקפאים: '), [...r.frozenDays.map(formatShort), ...r.frozenWeeks.map((s) => tr`שבוע ${formatShort(s)}`)].join(', ')) : '',
  );
}

function badgesCard(r: Rewards): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('תגים')),
    h('div', { class: 'badges' }, Object.entries(BADGES).map(([id, b]) => {
      const n = r.badges[id] ?? 0;
      return h('div', { class: 'badge-tile' + (n ? '' : ' locked'), title: t(b.name) },
        h('span', { 'aria-hidden': 'true' }, b.icon), h('span', null, t(b.name)), n > 1 ? h('span', { class: 'muted' }, `×${n}`) : '');
    })),
  );
}

function leaderboardCard(): HTMLElement {
  const list = h('div', null, h('p', { class: 'muted' }, t('טוען…')));
  let period: 'week' | 'month' | 'all' = 'week';
  const seg = h('div', { class: 'seg', role: 'group', 'aria-label': t('תקופה') });
  const load = async () => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.p === period)));
    try {
      const leaders = await leaderboard(period);
      const k = period === 'all' ? 'lifetime' : period;
      const me = currentUser()?.userId;
      list.replaceChildren(...leaders.slice(0, 20).map((l: Leader, i) =>
        h('div', { class: 'leader' + (l.userId === me ? ' me' : '') },
          h('span', { class: 'rank' }, String(i + 1)),
          avatar(l.name, l.photoId, 36),
          h('span', { class: 'who' }, h('strong', null, l.name), h('span', { class: 'muted small' }, tr`רמה ${l.level} · ${levelLabel(l.levelName)}`)),
          price(l[k as 'week' | 'month' | 'lifetime']),
        )));
    } catch (e: any) { list.replaceChildren(h('p', { class: 'form-error' }, e.message)); }
  };
  ([['week', 'השבוע'], ['month', 'החודש'], ['all', 'כל הזמנים']] as const).forEach(([p, label]) => {
    const b = h('button', { type: 'button', 'aria-pressed': String(p === period), onclick: () => { period = p; load(); } }, t(label));
    b.dataset.p = p;
    seg.append(b);
  });
  load();
  return h('section', { class: 'card stack' }, h('div', { class: 'chat-head' }, h('h2', { class: 'card-title' }, t('טבלת דירוג')), seg), list);
}

function historyCard(r: Rewards): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('פעולות אחרונות')),
    r.items.length
      ? h('div', { class: 'earn-list' }, r.items.slice(0, 25).map((x) =>
          h('div', { class: 'earn-row' }, h('span', null, t(x.label.replace(/: .*$/, '')) + (x.label.includes(': ') ? ': ' + x.label.split(': ').slice(1).join(': ') : ''), ' ', h('span', { class: 'muted small' }, formatShort(x.date))),
            h('span', { class: x.amount >= 0 ? 'plus' : 'minus' }, (x.amount >= 0 ? '+' : '') + fmt(x.amount)))))
      : h('p', { class: 'muted' }, t('עוד אין פעולות. כל סימון בטבלה מתחיל לצבור.')),
    h('details', { class: 'how' }, h('summary', null, t('איך צוברים מטבעות?')),
      h('div', { class: 'earn-list' }, EARN_RULES.map(([a, b]) => h('div', { class: 'earn-row' }, h('span', null, t(a)), h('span', { class: 'price' }, coin(), b))))),
  );
}

export function renderRewards(root: HTMLElement): void {
  const r = getRewards();
  const draw = (rw: Rewards | null) => {
    if (!rw) {
      const err = rewardsError();
      const notDeployed = /לא מוכרת|Unknown action|נדרשת התחברות|Sign-in required/.test(err);
      root.replaceChildren(h('section', { class: 'card stack' },
        err
          ? h('p', null, notDeployed
              ? t('המטבעות, הדירוג והאתגרים עוד לא הופעלו בשרת. הם יופיעו כאן אחרי שמנהל האפליקציה יעדכן את קוד השרת.')
              : err)
          : h('p', { class: 'muted' }, t('טוען…')),
        err && h('button', { class: 'btn', type: 'button', onclick: () => refreshRewards().then(() => draw(getRewards())) }, t('נסה שוב')),
      ));
      return;
    }
    root.replaceChildren(
      levelCard(rw),
      h('button', { class: 'btn btn-primary', onclick: () => navigate(HASH.share) }, t('הזמן חברים וצבור מטבעות')),
      challengesCard(rw),
      shopCard(rw),
      badgesCard(rw),
      leaderboardCard(),
      historyCard(rw),
    );
  };
  draw(r);
  refreshRewards().then(() => { if (location.hash === HASH.rewards) draw(getRewards()); });
}
