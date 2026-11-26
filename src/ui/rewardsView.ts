import { addDays, formatShort, sundayOf, todayISO } from '../dates';
import { currentUser } from '../session';
import { BADGES, getRewards, leaderboard, levelLabel, refreshRewards, rewardsError, spend, wearFrame, type Leader, type Rewards } from '../rewards';
import { avatar } from './avatar';
import { confirmButton, h, openSheet, toast } from './dom';
import { aiMark } from './icons';
import { HASH, navigate } from './router';
import { t, tr } from '../i18n';
import { ACCENTS, BG_THEMES, FRAMES } from '../types';
import { getSettings, updateSettings } from '../store';
import { burst } from './confetti';
import { openShareAchievement } from './shareCard';
import { ACCESSORIES, MASCOTS, currentOutfit, mascot } from './mascot';

const coin = () => h('span', { class: 'coin', 'aria-hidden': 'true' });
const fmt = (n: number) => n.toLocaleString('en-US');
const price = (n: number) => h('span', { class: 'price' }, coin(), fmt(n));
const pct = (a: number, b: number) => Math.max(0, Math.min(100, Math.round((a / b) * 100)));

const EARN_RULES: [string, string][] = [
  ['יום מלא בטבלה', '5'],
  ['אימון (פעם ביום)', '10'],
  ['שקילה שבועית', '5'],
  ['אתגר יומי: 3 ארוחות בריאות', '15'],
  ['7 ימים רצופים עם צהריים V', '20'],
  ['אתגר שבועי: 3 אימונים', '30'],
  ['4 שבועות רצופים עם 3+ אימונים', '50'],
  ['אתגר חודשי: 12 אימונים', '100'],
  ['אתגר חודשי: 80% ארוחות בריאות', '100'],
  ['אתגר שנתי: 150 אימונים', '500'],
  ['כל ק"ג בדרך למשקל היעד (עד אחד בשבוע)', '20'],
  ['הגעה למשקל היעד', '200'],
  ['שמירה על המשקל אחרי היעד (לשבוע)', '10'],
  ['הצטרפת עם קוד הזמנה', '50'],
  ['חבר נרשם בקוד שלך · משלים שבוע ראשון', '50 + 50'],
];

function levelCard(r: Rewards): HTMLElement {
  const toNext = r.level.to - r.lifetime;
  const next = r.levels?.find((l) => l.n === r.level.n + 1);
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
    next?.perks.length ? h('p', { class: 'hint' }, t('ברמה הבאה: '), next.perks.map((p) => t(p)).join(' · ')) : '',
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('יתרה')), h('div', { class: 'balance' }, coin(), fmt(r.balance))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('השבוע')), h('div', { class: 'tile-value' }, '+' + fmt(r.week))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('החודש')), h('div', { class: 'tile-value' }, '+' + fmt(r.month))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('נצברו בסך הכל')), h('div', { class: 'tile-value' }, fmt(r.lifetime))),
    ),
    r.fullHistory === false ? h('p', { class: 'hint' }, t('ההיסטוריה שלך מלפני ההצטרפות נספרת כבונוס פתיחה מוגבל (עד 500). מנהל האפליקציה יכול לאשר ספירה מלאה שלה.')) : '',
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

function pickSheet(title: string, options: { value: string; label: string }[], onPick: (v: string) => Promise<void>) {
  const body = h('div', { class: 'stack' }, ...options.map((o) => h('button', {
    class: 'btn', type: 'button',
    onclick: async () => { try { await onPick(o.value); close(); toast(t('בוצע')); } catch (e: any) { toast(e.message); } },
  }, o.label)));
  const close = openSheet(title, body);
}

function shopCard(r: Rewards, redraw: () => void): HTMLElement {
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i - 1)).filter((d) => !r.frozenDays.includes(d));
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(sundayOf(today), -7 * (i + 1))).filter((s) => !r.frozenWeeks.includes(s));
  const buy = async (fn: () => Promise<void>) => { try { await fn(); toast(t('נקנה!')); burst(); redraw(); } catch (e: any) { toast(e.message); } };
  const tile = (title: string, desc: string, cost: number, action: HTMLElement, preview?: HTMLElement, base?: number) =>
    h('div', { class: 'shop-item' }, preview ?? '', h('strong', null, title), desc ? h('span', { class: 'muted small' }, desc) : '',
      cost === 0 ? h('span', { class: 'badge' }, t('חינם ברמה שלך'))
        : h('span', { class: 'price-row' }, price(cost), base && base > cost ? h('s', { class: 'muted small' }, fmt(base)) : ''),
      action);
  const catalog = r.catalog ?? [];
  const item = (kind: string, id: string) => catalog.find((c) => c.kind === kind && c.id === id);
  const s = getSettings();
  const cosmetic = (kind: 'color' | 'bg' | 'frame' | 'effect' | 'mascot' | 'acc', id: string, name: string, preview: HTMLElement, using: boolean, use: () => void | Promise<void>) => {
    const c = item(kind, id);
    if (!c) return '';
    const action = c.owned
      ? (() => {
          const removable = using && kind !== 'color' && kind !== 'mascot';
          return h('button', { class: using ? 'btn btn-primary' : 'btn', type: 'button', disabled: using && !removable, 'aria-pressed': using ? 'true' : undefined,
            onclick: async () => { try { await use(); toast(removable ? t('הוסר') : t('הופעל')); redraw(); } catch (e: any) { toast(e.message); } } },
            removable ? t('בשימוש · הסר') : using ? t('בשימוש') : t('הפעל'));
        })()
      : confirmButton(t('קנה'), t('הקש שוב לאישור'), () => buy(() => spend('cosmetic', { kind, id })), 'btn');
    return tile(name, '', c.price, action, preview, c.base);
  };
  const section = (title: string, ...items: (HTMLElement | string)[]) => [h('h3', { class: 'section-title' }, title), h('div', { class: 'shop' }, ...items)];
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('חנות')),
    r.perks?.discount ? h('p', { class: 'hint' }, tr`ההנחה שלך לפי הרמה: ${r.perks.discount}%`) : '',
    ...section(t('שימושי'),
      tile(t('הקפאת יום'), t('יום שפספסת לא ישבור את רצף הצהריים'), r.costs.freezeDay,
        h('button', { class: 'btn', type: 'button', disabled: r.balance < r.costs.freezeDay, onclick: () =>
          pickSheet(t('איזה יום להקפיא?'), days.map((d) => ({ value: d, label: formatShort(d) })), (d) => spend('freezeDay', { date: d })) }, t('בחר יום'))),
      tile(t('הקפאת שבוע'), t('שבוע חלש לא ישבור את רצף האימונים'), r.costs.freezeWeek,
        h('button', { class: 'btn', type: 'button', disabled: r.balance < r.costs.freezeWeek, onclick: () =>
          pickSheet(t('איזה שבוע להקפיא?'), weeks.map((w) => ({ value: w, label: tr`שבוע ${formatShort(w)}` })), (w) => spend('freezeWeek', { date: w })) }, t('בחר שבוע'))),
      tile(t('10 הודעות לבוט'), tr`מעבר למגבלה היומית · יש לך ${r.chatCredits}`, r.costs.chat10,
        confirmButton(t('קנה'), t('הקש שוב לאישור'), () => buy(() => spend('chat10')), 'btn'), h('span', { class: 'shop-preview' }, aiMark(28))),
    ),
    ...section(t('צבעי אפליקציה'), ...ACCENTS.filter((a) => a.premium).map((a) =>
      cosmetic('color', a.id, t(a.name), h('span', { class: 'shop-preview swatch-preview', style: { background: a.swatch } }), s.accent === a.id, () => updateSettings({ accent: a.id })))),
    ...section(t('רקעים'), ...BG_THEMES.map((b) =>
      cosmetic('bg', b.id, t(b.name), h('span', { class: `shop-preview bg-preview bgp-${b.id}`, style: { background: b.swatch } }), s.bgTheme === b.id, () => updateSettings({ bgTheme: s.bgTheme === b.id ? '' : b.id })))),
    ...section(t('מסגרות פרופיל'), ...FRAMES.map((f) =>
      cosmetic('frame', f.id, t(f.name), h('span', { class: 'shop-preview' }, avatar(currentUser()?.name ?? '?', currentUser()?.photoId, 44, f.id)), r.frame === f.id, () => wearFrame(r.frame === f.id ? '' : f.id)))),
    ...section(t('דמויות לעוזר'), ...MASCOTS.filter((m) => !m.free).map((m) =>
      cosmetic('mascot', m.id, t(m.name), h('span', { class: 'shop-preview' }, mascot(56, '', m.id, currentOutfit())), (s.mascot ?? 'lion') === m.id, () => updateSettings({ mascot: m.id })))),
    ...section(t('סטייל לעוזר: הילות ותגים'), ...ACCESSORIES.map((a) => {
      const on = currentOutfit()[a.slot] === a.id;
            return cosmetic('acc', a.id, t(a.name),
        h('span', { class: 'shop-preview' }, mascot(56, '', s.mascot ?? 'lion', { ...currentOutfit(), [a.slot]: a.id })), on,
        () => updateSettings({ mascotOutfit: { ...(s.mascotOutfit ?? {}), [a.slot]: on ? '' : a.id } }));
    })),
    ...section(t('אפקטים'),
      cosmetic('effect', 'confetti', t('קונפטי חגיגי'), h('span', { class: 'shop-preview', 'aria-hidden': 'true' }, '🎉'), !!s.effects, () => updateSettings({ effects: !s.effects }))),
    (r.frozenDays.length || r.frozenWeeks.length) ? h('p', { class: 'hint' },
      t('מוקפאים: '), [...r.frozenDays.map(formatShort), ...r.frozenWeeks.map((w) => tr`שבוע ${formatShort(w)}`)].join(', ')) : '',
  );
}

function levelsCard(r: Rewards): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('רמות והטבות')),
    h('p', { class: 'hint' }, t('הרמה נקבעת לפי כל המטבעות שצברת אי פעם, כך שקניות בחנות לא מורידות אותה. כל רמה פותחת הטבות, וההטבות מצטברות.')),
    h('ol', { class: 'levels-list' }, (r.levels ?? []).map((l) => h('li', { class: l.n === r.level.n ? 'is-current' : l.n < r.level.n ? 'is-done' : '' },
      h('b', { class: 'lv-n' }, String(l.n)),
      h('span', { class: 'lv-main' }, h('strong', null, t(l.name)), h('span', { class: 'muted small' }, tr`מ-${fmt(l.from)} מטבעות`)),
      h('span', { class: 'lv-perks small' }, l.perks.length ? l.perks.map((p) => t(p)).join(' · ') : '—'),
    ))),
    h('p', { class: 'hint' }, t('אחרי רמה 15 מקבלים כוכב על כל 10,000 מטבעות נוספים.')),
  );
}

function scoringCard(): HTMLElement {
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('איך צוברים ומה זה נותן')),
    h('div', { class: 'earn-list' }, EARN_RULES.map(([a, b]) => h('div', { class: 'earn-row' }, h('span', null, t(a)), h('span', { class: 'price' }, coin(), b)))),
    h('h3', { class: 'section-title' }, t('מה ההשלכות')),
    h('ul', { class: 'implications' },
      h('li', null, h('strong', null, t('מטבעות')), ' – ', t('המטבע של החנות: הקפאות רצף, הודעות לעוזר, צבעים, רקעים, מסגרות ואפקטים. היתרה יורדת כשקונים.')),
      h('li', null, h('strong', null, t('רמה')), ' – ', t('לפי כל מה שצברת אי פעם. פותחת הודעות נוספות לעוזר, פריטים בחינם והנחות בחנות.')),
      h('li', null, h('strong', null, t('רצפים')), ' – ', t('ימים או שבועות ברצף נותנים בונוס. יום או שבוע מוקפא לא שובר רצף.')),
      h('li', null, h('strong', null, t('דירוג')), ' – ', t('לפי מטבעות שנצברו השבוע, החודש או בכל הזמנים. מוצגים שם, תמונה, רמה ומסגרת בלבד.')),
      h('li', null, h('strong', null, t('הוגנות')), ' – ', t('המטבעות מחושבים בשרת מתוך הנתונים עצמם, כך שאי אפשר להוסיף אותם ידנית.')),
    ),
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
      const medal = ['🥇', '🥈', '🥉'];
      list.replaceChildren(...leaders.slice(0, 20).map((l: Leader, i) =>
        h('div', { class: 'leader' + (l.userId === me ? ' me' : '') },
          h('span', { class: 'rank' }, medal[i] ?? String(i + 1)),
          avatar(l.name, l.photoId, 38, l.frame ?? ''),
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
  );
}

export function renderRewards(root: HTMLElement): void {
  const draw = (rw: Rewards | null) => {
    if (!rw) {
      const err = rewardsError();
      const notDeployed = /לא מוכרת|Unknown action|נדרשת התחברות|Sign-in required/.test(err);
      root.replaceChildren(h('section', { class: 'card stack' },
        err ? h('p', null, notDeployed ? t('המטבעות, הדירוג והאתגרים עוד לא הופעלו בשרת. הם יופיעו כאן אחרי שמנהל האפליקציה יעדכן את קוד השרת.') : err)
          : h('p', { class: 'muted' }, t('טוען…')),
        err && h('button', { class: 'btn', type: 'button', onclick: () => refreshRewards().then(() => draw(getRewards())) }, t('נסה שוב')),
      ));
      return;
    }
    root.replaceChildren(
      levelCard(rw),
      h('div', { class: 'row-btns two' },
        h('button', { class: 'btn btn-primary', onclick: () => navigate(HASH.share) }, t('הזמן חברים וצבור מטבעות')),
        h('button', { class: 'btn', onclick: () => openShareAchievement() }, '📤 ', t('שתף הישג'))),
      challengesCard(rw),
      shopCard(rw, () => draw(getRewards())),
      levelsCard(rw),
      scoringCard(),
      badgesCard(rw),
      leaderboardCard(),
      historyCard(rw),
    );
  };
  draw(getRewards());
  refreshRewards().then(() => { if (location.hash === HASH.rewards) draw(getRewards()); });
}
