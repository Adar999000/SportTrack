import { t, tr, isRTL } from '../i18n';
import { allWeeks } from '../store';
import { allMealsRatio, countWorkouts, lunchStreak, weightPoints, weightSummary, workoutWeekStreak, workoutsInWeek, round1 } from '../stats';
import { sundayOf, todayISO } from '../dates';
import { BADGES, getRewards, levelLabel } from '../rewards';
import { currentUser } from '../session';
import { call } from '../api';
import { h, openSheet, toast } from './dom';
import { navigate, HASH } from './router';
import { track } from '../analytics';

/** What a shareable achievement shows (also stored as a feed post's data). */
export interface Achievement { icon: string; title: string; subtitle: string; tone?: string }

/** Achievements the user can share right now, built from their own data. */
export function availableAchievements(): Achievement[] {
  const out: Achievement[] = [];
  const weeks = allWeeks();
  const today = todayISO();
  const r = getRewards();
  if (r) {
    out.push({ icon: '🏅', title: tr`רמה ${r.level.n} · ${levelLabel(r.level.name)}`, subtitle: tr`${r.lifetime.toLocaleString('en-US')} מטבעות נצברו`, tone: 'gold' });
    for (const [id, n] of Object.entries(r.badges)) {
      const b = BADGES[id];
      if (b && n) out.push({ icon: b.icon, title: t(b.name), subtitle: n > 1 ? tr`הושג ${n} פעמים` : t('תג חדש!'), tone: 'purple' });
    }
  }
  const thisWeek = weeks.find((w) => w.sundayDate === sundayOf(today));
  if (thisWeek) {
    const wo = workoutsInWeek(thisWeek), meals = allMealsRatio(thisWeek.days).pct;
    out.push({ icon: '📅', title: t('השבוע שלי'), subtitle: tr`${wo} אימונים · ${meals === null ? '—' : Math.round(meals) + '%'} ארוחות בריאות`, tone: 'teal' });
  }
  const ws = workoutWeekStreak(weeks, today);
  if (ws.current >= 2) out.push({ icon: '🔥', title: tr`${ws.current} שבועות ברצף`, subtitle: t('3 אימונים ומעלה בכל שבוע'), tone: 'fire' });
  const ls = lunchStreak(weeks, today);
  if (ls.current >= 3) out.push({ icon: '🥗', title: tr`${ls.current} ימים ברצף`, subtitle: t('ארוחת צהריים בריאה כל יום'), tone: 'teal' });
  const total = countWorkouts(weeks);
  if (total >= 10) out.push({ icon: '💪', title: tr`${total} אימונים`, subtitle: t('מאז שהתחלתי לעקוב'), tone: 'purple' });
  const ws2 = weightSummary(weightPoints(weeks));
  if (ws2 && ws2.change !== null && ws2.change < -0.5) out.push({ icon: '📉', title: tr`ירדתי ${round1(-ws2.change)} ק"ג`, subtitle: t('מאז השקילה הראשונה'), tone: 'teal' });
  return out;
}

const TONES: Record<string, [string, string]> = {
  gold: ['#f6c343', '#d9822b'], purple: ['#8b6bff', '#4b2fb0'], teal: ['#34b89a', '#1d6f8c'], fire: ['#ff8a3d', '#d6304a'],
};

/** A 1080×1350 image (Instagram portrait) of the achievement. */
export async function cardImage(a: Achievement): Promise<Blob> {
  const W = 1080, H = 1350;
  const c = document.createElement('canvas');
  c.width = W; c.height = H;
  const g = c.getContext('2d')!;
  const [c1, c2] = TONES[a.tone ?? 'teal'] ?? TONES.teal;
  const bg = g.createLinearGradient(0, 0, W, H);
  bg.addColorStop(0, c1); bg.addColorStop(1, c2);
  g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // soft circles
  g.globalAlpha = 0.12; g.fillStyle = '#fff';
  [[180, 220, 260], [900, 1100, 340], [950, 260, 140]].forEach(([x, y, r]) => { g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill(); });
  g.globalAlpha = 1;
  const font = getComputedStyle(document.body).fontFamily || 'sans-serif';
  g.direction = isRTL ? 'rtl' : 'ltr';
  g.textAlign = 'center';
  g.fillStyle = '#fff';
  g.font = `280px ${font}`;
  g.fillText(a.icon, W / 2, 560);
  g.font = `800 96px ${font}`;
  wrap(g, a.title, W / 2, 760, 920, 110);
  g.font = `500 54px ${font}`;
  g.globalAlpha = 0.92;
  wrap(g, a.subtitle, W / 2, 940, 900, 70);
  g.globalAlpha = 0.85;
  g.font = `600 44px ${font}`;
  const name = currentUser()?.name ?? '';
  if (name) g.fillText(name, W / 2, 1150);
  g.font = `800 50px ${font}`;
  g.globalAlpha = 1;
  g.fillText('✅ ' + t('משמעת אישית'), W / 2, 1260);
  return new Promise((res) => c.toBlob((b) => res(b!), 'image/png'));
}

function wrap(g: CanvasRenderingContext2D, text: string, x: number, y: number, max: number, lh: number) {
  const words = text.split(' ');
  let line = '';
  for (const w of words) {
    const test = line ? line + ' ' + w : w;
    if (g.measureText(test).width > max && line) { g.fillText(line, x, y); line = w; y += lh; }
    else line = test;
  }
  g.fillText(line, x, y);
}

/** Share outside the app: the phone's share sheet (Instagram, WhatsApp…) or download. */
export async function shareOutside(a: Achievement): Promise<void> {
  track('share:outside');
  const blob = await cardImage(a);
  const file = new File([blob], 'mishmaat.png', { type: 'image/png' });
  const text = `${a.icon} ${a.title} · ${a.subtitle}\n${t('משמעת אישית')}`;
  try {
    if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], text }); return; }
  } catch (e: any) { if (e?.name === 'AbortError') return; }
  const url = URL.createObjectURL(blob);
  const link = h('a', { href: url, download: 'mishmaat.png' });
  document.body.append(link); link.click(); link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  try { await navigator.clipboard.writeText(text); } catch { /* ignore */ }
  toast(t('התמונה ירדה למכשיר. אפשר להעלות אותה לאינסטגרם או לכל רשת.'));
}

export function cardPreview(a: Achievement): HTMLElement {
  const [c1, c2] = TONES[a.tone ?? 'teal'] ?? TONES.teal;
  return h('div', { class: 'ach-card', style: { background: `linear-gradient(135deg, ${c1}, ${c2})` } },
    h('span', { class: 'ach-icon', 'aria-hidden': 'true' }, a.icon),
    h('strong', null, a.title),
    h('span', null, a.subtitle));
}

export const visibilitySelect = (id: string) => h('select', { class: 'input', id, 'aria-label': t('מי יראה') },
  h('option', { value: 'all' }, '🌍 ' + t('כל הקהילה')),
  h('option', { value: 'friends' }, '👥 ' + t('רק חברים')));

/** Pick an achievement, then post it in the app and/or share it outside. */
export function openShareAchievement(onPosted?: () => void): void {
  const list = availableAchievements();
  if (!list.length) { toast(t('עוד אין הישגים לשתף. ממשיכים לסמן ויגיעו!')); return; }
  let chosen = list[0];
  const preview = h('div', null, cardPreview(chosen));
  const vis = visibilitySelect('ach-vis') as HTMLSelectElement;
  const text = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: t('כמה מילים (לא חובה)'), 'aria-label': t('טקסט לפוסט') }) as HTMLTextAreaElement;
  const close = openSheet(t('שיתוף הישג'), h('div', { class: 'stack' },
    h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('הישג') }, list.map((a, i) => {
      const b = h('button', { class: 'chip', type: 'button', role: 'radio', 'aria-checked': String(i === 0), onclick: () => {
        chosen = a; preview.replaceChildren(cardPreview(a));
        b.parentElement!.querySelectorAll('button').forEach((x) => x.setAttribute('aria-checked', String(x === b)));
      } }, `${a.icon} ${a.title}`);
      return b;
    })),
    preview,
    text,
    h('div', { class: 'field' }, h('label', { for: 'ach-vis' }, t('מי יראה בקהילה')), vis),
    h('button', { class: 'btn btn-primary', type: 'button', onclick: async (e: Event) => {
      (e.currentTarget as HTMLButtonElement).disabled = true;
      try {
        await call('createPost', { kind: 'achievement', data: chosen, text: text.value, visibility: vis.value });
        close(); toast(t('פורסם בקהילה')); track('share:achievement'); onPosted ? onPosted() : navigate(HASH.feed);
      } catch (ex: any) { toast(ex.message); (e.currentTarget as HTMLButtonElement).disabled = false; }
    } }, '👥 ', t('פרסם בקהילה')),
    h('button', { class: 'btn', type: 'button', onclick: () => shareOutside(chosen) }, '📤 ', t('שתף לאינסטגרם, וואטסאפ ועוד')),
    h('p', { class: 'hint' }, t('בטלפון נפתח חלון השיתוף של המכשיר. במחשב התמונה יורדת ואפשר להעלות אותה לכל רשת.')),
  ));
}
