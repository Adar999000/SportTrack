import { addDays, formatShort, sundayOf, todayISO } from '../dates';
import { currentUser } from '../session';
import { BADGES, getRewards, leaderboard, levelLabel, refreshRewards, rewardsError, spend, wearFrame, type Leader, type Rewards } from '../rewards';
import { avatar } from './avatar';
import { confirmButton, countUp, h, openSheet, toast } from './dom';
import { aiMark } from './icons';
import { HASH, navigate } from './router';
import { t, tr } from '../i18n';
import { ACCENTS, BG_THEMES, FRAMES } from '../types';
import { getSettings, updateSettings } from '../store';
import { burst } from './confetti';
import { openShareAchievement } from './shareCard';
import { track } from '../analytics';
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

/** Numbers count up the first time the page opens. */
let counted = false;
const num = (n: number) => (counted ? fmt(n) : countUp(h('span'), n));

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
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('יתרה')), h('div', { class: 'balance' }, coin(), num(r.balance))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('השבוע')), h('div', { class: 'tile-value' }, '+' + fmt(r.week))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('החודש')), h('div', { class: 'tile-value' }, '+' + fmt(r.month))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('נצברו בסך הכל')), h('div', { class: 'tile-value' }, num(r.lifetime))),
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

type Cat = 'all' | 'useful' | 'mascot' | 'acc' | 'color' | 'bg' | 'frame' | 'effect' | 'levels';
let shopCat: Cat = 'all';
let shopOnlyAffordable = false;
const NEW_ITEMS = new Set(['mascot', 'acc']);
const POPULAR = new Set(['mascot:tiger', 'mascot:dragon', 'acc:galaxy', 'acc:rainbow', 'frame:fire', 'bg:midnight', 'color:indigo', 'effect:confetti']);

/** Try a color or background for a few seconds before buying. */
function tryOn(kind: 'color' | 'bg', id: string): void {
  const root = document.documentElement;
  const key = kind === 'color' ? 'accent' : 'bg';
  const before = root.dataset[key];
  root.dataset[key] = id;
  track('store:try');
  toast(t('תצוגה מקדימה ל-6 שניות'));
  setTimeout(() => { if (root.dataset[key] === id) { if (before === undefined) delete root.dataset[key]; else root.dataset[key] = before; } }, 6000);
}

function shopCard(r: Rewards, redraw: () => void): HTMLElement {
  const today = todayISO();
  const days = Array.from({ length: 14 }, (_, i) => addDays(today, -i - 1)).filter((d) => !r.frozenDays.includes(d));
  const weeks = Array.from({ length: 5 }, (_, i) => addDays(sundayOf(today), -7 * (i + 1))).filter((s) => !r.frozenWeeks.includes(s));
  const buy = async (fn: () => Promise<void>) => { try { await fn(); track('store:buy'); toast(t('נקנה!')); burst(true); redraw(); } catch (e: any) { toast(e.message); } };
  const catalog = r.catalog ?? [];
  const item = (kind: string, id: string) => catalog.find((c) => c.kind === kind && c.id === id);
  const s = getSettings();

  interface Product { cat: Cat; key: string; name: string; desc?: string; preview: HTMLElement; price: number; base?: number; owned?: boolean; using?: boolean; action: HTMLElement; try?: () => void; minLevel?: number; locked?: boolean }
  const products: Product[] = [];
  const priceTag = (cost: number, base?: number) => cost === 0 ? h('span', { class: 'tag tag-free' }, t('חינם ברמה שלך'))
    : h('span', { class: 'price-row' }, price(cost), base && base > cost ? h('s', { class: 'muted small' }, fmt(base)) : '');
  const lacking = (cost: number) => Math.max(0, cost - r.balance);
  const buyBtn = (cost: number, fn: () => Promise<void>) => lacking(cost)
    ? h('button', { class: 'btn btn-buy', type: 'button', disabled: true }, tr`חסרים ${fmt(lacking(cost))}`)
    : confirmButton(t('קנה'), t('הקש שוב לאישור'), () => buy(fn), 'btn btn-buy');

  // useful items
  products.push(
    { cat: 'useful', key: 'freezeDay', name: t('הקפאת יום'), desc: t('יום שפספסת לא ישבור את רצף הצהריים'), price: r.costs.freezeDay, preview: h('span', { class: 'shop-emoji' }, '🧊'),
      action: lacking(r.costs.freezeDay) ? buyBtn(r.costs.freezeDay, async () => {}) : h('button', { class: 'btn btn-buy', type: 'button', onclick: () =>
        pickSheet(t('איזה יום להקפיא?'), days.map((d) => ({ value: d, label: formatShort(d) })), (d) => spend('freezeDay', { date: d })) }, t('בחר יום')) },
    { cat: 'useful', key: 'freezeWeek', name: t('הקפאת שבוע'), desc: t('שבוע חלש לא ישבור את רצף האימונים'), price: r.costs.freezeWeek, preview: h('span', { class: 'shop-emoji' }, '❄️'),
      action: lacking(r.costs.freezeWeek) ? buyBtn(r.costs.freezeWeek, async () => {}) : h('button', { class: 'btn btn-buy', type: 'button', onclick: () =>
        pickSheet(t('איזה שבוע להקפיא?'), weeks.map((w) => ({ value: w, label: tr`שבוע ${formatShort(w)}` })), (w) => spend('freezeWeek', { date: w })) }, t('בחר שבוע')) },
    { cat: 'useful', key: 'chat10', name: t('10 הודעות לבוט'), desc: tr`מעבר למגבלה היומית · יש לך ${r.chatCredits}`, price: r.costs.chat10, preview: h('span', { class: 'shop-emoji' }, aiMark(40)),
      action: buyBtn(r.costs.chat10, () => spend('chat10')) },
  );
  const cosmetic = (cat: Cat, kind: 'color' | 'bg' | 'frame' | 'effect' | 'mascot' | 'acc', id: string, name: string, preview: HTMLElement, using: boolean, use: () => void | Promise<void>, tryFn?: () => void) => {
    const c = item(kind, id);
    if (!c) return;
    const removable = using && kind !== 'color' && kind !== 'mascot';
    const action = c.locked
      ? h('button', { class: 'btn btn-buy', type: 'button', disabled: true }, '🔒 ', tr`נפתח ברמה ${c.minLevel}`)
      : c.owned
      ? h('button', { class: using ? 'btn btn-using' : 'btn btn-use', type: 'button', disabled: using && !removable, 'aria-pressed': using ? 'true' : undefined,
          onclick: async () => { try { await use(); toast(removable ? t('הוסר') : t('הופעל')); redraw(); } catch (e: any) { toast(e.message); } } },
          removable ? t('בשימוש · הסר') : using ? '✓ ' + t('בשימוש') : t('הפעל'))
      : buyBtn(c.price, () => spend('cosmetic', { kind, id }));
    products.push({ cat, key: `${kind}:${id}`, name, preview, price: c.price, base: c.base, owned: c.owned, using, action, try: c.owned ? undefined : tryFn, minLevel: c.minLevel, locked: c.locked });
  };
  MASCOTS.filter((m) => !m.free).forEach((m) => cosmetic('mascot', 'mascot', m.id, t(m.name), mascot(64, '', m.id, currentOutfit()), (s.mascot ?? 'lion') === m.id, () => updateSettings({ mascot: m.id })));
  ACCESSORIES.forEach((a) => {
    const on = currentOutfit()[a.slot] === a.id;
    cosmetic('acc', 'acc', a.id, t(a.name), mascot(64, '', s.mascot ?? 'lion', { ...currentOutfit(), [a.slot]: a.id }), on,
      () => updateSettings({ mascotOutfit: { ...(s.mascotOutfit ?? {}), [a.slot]: on ? '' : a.id } }));
  });
  ACCENTS.filter((a) => a.premium).forEach((a) => cosmetic('color', 'color', a.id, t(a.name), h('span', { class: 'swatch-preview', style: { background: a.swatch } }), s.accent === a.id, () => updateSettings({ accent: a.id }), () => tryOn('color', a.id)));
  BG_THEMES.forEach((b) => cosmetic('bg', 'bg', b.id, t(b.name), h('span', { class: `bg-preview bgp-${b.id}`, style: { background: b.swatch } }), s.bgTheme === b.id, () => updateSettings({ bgTheme: s.bgTheme === b.id ? '' : b.id }), () => tryOn('bg', b.id)));
  FRAMES.forEach((f) => cosmetic('frame', 'frame', f.id, t(f.name), avatar(currentUser()?.name ?? '?', currentUser()?.photoId, 52, f.id), r.frame === f.id, () => wearFrame(r.frame === f.id ? '' : f.id)));
  ([['confetti', 'קונפטי חגיגי', '🎉'], ['stars', 'גשם כוכבים', '🌟'], ['fireworks', 'זיקוקים', '🎆']] as const).forEach(([id, name, ic]) => {
    const using = !!s.effects && (s.effectKind ?? 'confetti') === id;
    cosmetic('effect', 'effect', id, t(name), h('span', { class: 'shop-emoji' }, ic), using,
      () => updateSettings(using ? { effects: false } : { effects: true, effectKind: id }), () => burst(true, id));
  });

  const CATS: [Cat, string, string][] = [['all', '🛍️', 'הכל'], ['levels', '🔒', 'לפי רמה'], ['useful', '🧊', 'שימושי'], ['mascot', '🦁', 'דמויות'], ['acc', '✨', 'סטייל לעוזר'], ['color', '🎨', 'צבעים'], ['bg', '🖼️', 'רקעים'], ['frame', '🖼', 'מסגרות'], ['effect', '🎉', 'אפקטים']];
  const grid = h('div', { class: 'shop' });
  const tabs = h('div', { class: 'shop-tabs', role: 'group', 'aria-label': t('קטגוריות') });
  const affordable = h('input', { type: 'checkbox', id: 'shop-afford', checked: shopOnlyAffordable }) as HTMLInputElement;
  const draw = () => {
    tabs.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.cat === shopCat)));
    const list = products
      .filter((p) => (shopCat === 'all' || p.cat === shopCat || (shopCat === 'levels' && (p.minLevel ?? 0) > 0)) && (!shopOnlyAffordable || p.owned || (!p.locked && p.price <= r.balance)))
      .sort((a, b) => (shopCat === 'levels' ? (a.minLevel ?? 0) - (b.minLevel ?? 0) || a.price - b.price : 0));
    grid.replaceChildren(...(list.length ? list.map((p) => h('div', { class: 'shop-item' + (p.owned ? ' owned' : '') + (p.using ? ' using' : '') + (p.locked ? ' locked-item' : '') },
      h('div', { class: 'shop-art' }, p.preview,
        p.locked ? h('span', { class: 'ribbon lvl' }, '🔒 ', tr`רמה ${p.minLevel}`) : !p.owned && (p.minLevel ?? 0) > 0 ? h('span', { class: 'ribbon lvl-open' }, tr`רמה ${p.minLevel}`) :
        !p.owned && NEW_ITEMS.has(p.cat) ? h('span', { class: 'ribbon' }, t('חדש')) : !p.owned && POPULAR.has(p.key) ? h('span', { class: 'ribbon hot' }, '🔥 ' + t('פופולרי')) : '',
        p.owned ? h('span', { class: 'owned-tag' }, '✓ ' + t('שלך')) : ''),
      h('strong', null, p.name),
      p.desc ? h('span', { class: 'muted small' }, p.desc) : '',
      p.owned ? '' : priceTag(p.price, p.base),
      p.locked ? h('span', { class: 'muted small' }, tr`עוד ${Math.max(0, (r.levels?.find((l) => l.n === p.minLevel)?.from ?? 0) - r.lifetime).toLocaleString('en-US')} מטבעות לרמה ${p.minLevel}`) : '',
      h('div', { class: 'shop-btns' }, p.action, p.try ? h('button', { class: 'btn btn-try', type: 'button', onclick: p.try }, '👁 ', t('נסה')) : ''),
    )) : [h('p', { class: 'muted' }, t('אין פריטים כאן כרגע.'))]));
  };
  CATS.forEach(([c, ic, name]) => {
    if (c !== 'all' && c !== 'levels' && !products.some((p) => p.cat === c)) return;
    if (c === 'levels' && !products.some((p) => (p.minLevel ?? 0) > 0)) return;
    const b = h('button', { type: 'button', 'aria-pressed': String(c === shopCat), onclick: () => { shopCat = c; draw(); } }, t(name));
    void ic;
    b.dataset.cat = c;
    tabs.append(b);
  });
  affordable.addEventListener('change', () => { shopOnlyAffordable = affordable.checked; draw(); });
  draw();
  const ownedCount = products.filter((p) => p.owned).length;
  return h('section', { class: 'card store' },
    h('div', { class: 'store-hero' },
      h('div', null, h('h2', null, t('החנות')), h('p', null, t('משדרגים את האפליקציה ואת העוזר עם המטבעות שצברת.'))),
      h('div', { class: 'store-wallet' }, h('span', { class: 'muted small' }, t('היתרה שלך')), h('b', null, coin(), fmt(r.balance)),
        r.perks?.discount ? h('span', { class: 'tag tag-sale' }, tr`${r.perks.discount}% הנחה`) : ''),
    ),
    tabs,
    h('div', { class: 'shop-filter' }, h('label', { for: 'shop-afford' }, affordable, ' ', t('רק מה שאפשר לקנות עכשיו')), h('span', { class: 'muted small' }, tr`${ownedCount} פריטים שלך`)),
    grid,
    (r.frozenDays.length || r.frozenWeeks.length) ? h('p', { class: 'hint' },
      t('מוקפאים: '), [...r.frozenDays.map(formatShort), ...r.frozenWeeks.map((w) => tr`שבוע ${formatShort(w)}`)].join(', ')) : '',
  );
}

/** Display name of a store item (for the levels table). */
function itemName(kind: string, id: string): string {
  const list: Record<string, { id: string; name: string }[]> = {
    mascot: MASCOTS, acc: ACCESSORIES, color: ACCENTS, bg: BG_THEMES, frame: FRAMES,
    effect: [{ id: 'confetti', name: 'קונפטי חגיגי' }, { id: 'stars', name: 'גשם כוכבים' }, { id: 'fireworks', name: 'זיקוקים' }],
  };
  const n = list[kind]?.find((x) => x.id === id)?.name;
  return n ? t(n) : id;
}

function levelsCard(r: Rewards): HTMLElement {
  const opens = (n: number) => (r.catalog ?? []).filter((c) => c.minLevel === n).map((c) => itemName(c.kind, c.id));
  return h('section', { class: 'card' },
    h('h2', { class: 'card-title' }, t('רמות והטבות')),
    h('p', { class: 'hint' }, t('הרמה נקבעת לפי כל המטבעות שצברת אי פעם, כך שקניות בחנות לא מורידות אותה. כל רמה פותחת הטבות, וההטבות מצטברות.')),
    h('ol', { class: 'levels-list' }, (r.levels ?? []).map((l) => h('li', { class: l.n === r.level.n ? 'is-current' : l.n < r.level.n ? 'is-done' : '' },
      h('b', { class: 'lv-n' }, String(l.n)),
      h('span', { class: 'lv-main' }, h('strong', null, t(l.name)), h('span', { class: 'muted small' }, tr`מ-${fmt(l.from)} מטבעות`)),
      h('span', { class: 'lv-perks small' }, l.perks.length ? l.perks.map((p) => t(p)).join(' · ') : (opens(l.n).length ? '' : '—'),
        opens(l.n).length ? h('span', { class: 'lv-opens' }, '🔓 ', t('נפתחים בחנות: '), opens(l.n).join(', ')) : ''),
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
  counted = false;
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
      (counted = true, ''),
      h('div', { class: 'row-btns two' },
        h('button', { class: 'btn btn-primary', onclick: () => navigate(HASH.share) }, t('הזמן חברים וצבור מטבעות')),
        h('button', { class: 'btn', onclick: () => openShareAchievement() }, t('שתף הישג'))),
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
