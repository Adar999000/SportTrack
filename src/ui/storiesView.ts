/**
 * Stories: 24-hour "match cards". Not photos-first like other apps: each story is a sports
 * scorecard (today's rings, a workout with its route and stats, an achievement, a big line of
 * text, or a photo), and friends answer with a high-five instead of a heart.
 * Routes are shrunk to a 0–100 drawing box before upload, so no real location leaves the phone.
 */
import { lang, t, tr } from '../i18n';
const LOC = () => (lang === 'he' ? 'he-IL' : 'en-GB');
import { call } from '../api';
import { currentUser, photoUrl } from '../session';
import { fileToDataUrl, pickImages } from '../image';
import { allWeeks, getWeek } from '../store';
import { dayIndex, sundayOf, todayISO } from '../dates';
import { lunchStreak } from '../stats';
import { WORKOUT_TYPES, fmtDuration, fmtKm, listWorkouts, paceOrSpeed, type Workout, type WorkoutType } from '../workouts';
import { avatar } from './avatar';
import { confirmButton, h, openSheet, toast } from './dom';
import { icon, logo } from './icons';
import { availableAchievements } from './shareCard';
import { visibilitySelect } from './shareCard';
import { track } from '../analytics';
import type { Post } from './feedView';
import { blockButton, reportButton } from './safety';

export interface StoryData {
  tpl: 'photo' | 'text' | 'rings' | 'workout' | 'achievement' | 'week';
  workouts?: number; full?: number; label?: string;
  bg: string;
  meals?: number; sport?: number; week?: number; streak?: number;
  type?: WorkoutType; distanceM?: number; durationS?: number; name?: string; route?: [number, number][];
  title?: string; emoji?: string;
  /** Stats laid over a photo story. */
  ov?: { km?: number; time?: string; pace?: string; meals?: number; sport?: number };
  viewCount?: number; viewers?: string[];
}
interface Group { author: Post['author']; items: Post[] }

const BGS: [string, string][] = [['ink', 'לילה'], ['lime', 'ליים'], ['sunset', 'שקיעה'], ['ocean', 'ים'], ['berry', 'פטל'], ['forest', 'יער']];
const SEEN = () => 'stories-seen:' + (currentUser()?.userId ?? '');
function seenSet(): Set<string> { try { return new Set(JSON.parse(localStorage.getItem(SEEN()) || '[]')); } catch { return new Set(); } }
function markSeen(id: string) {
  const s = seenSet(); s.add(id);
  try { localStorage.setItem(SEEN(), JSON.stringify([...s].slice(-300))); } catch { /* ignore */ }
}

/** Route → small polyline in a 0–100 box (keeps the shape, drops the location). */
export function normalizeRoute(points: [number, number, number][] | [number, number][], max = 60): [number, number][] {
  if (points.length < 2) return [];
  const step = Math.max(1, Math.ceil(points.length / max));
  const pts = points.filter((_, i) => i % step === 0 || i === points.length - 1);
  const lats = pts.map((p) => p[0]), lngs = pts.map((p) => p[1]);
  const [a, b, c, d] = [Math.min(...lats), Math.max(...lats), Math.min(...lngs), Math.max(...lngs)];
  const span = Math.max(b - a, d - c) || 1;
  const ox = (100 - ((d - c) / span) * 80) / 2, oy = (100 - ((b - a) / span) * 80) / 2;
  return pts.map((p) => [Math.round((ox + ((p[1] - c) / span) * 80) * 10) / 10, Math.round((100 - oy - ((p[0] - a) / span) * 80) * 10) / 10]);
}

function routeSvg(route: [number, number][]): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'st-route'); svg.setAttribute('aria-hidden', 'true');
  if (route.length > 1) {
    const path = document.createElementNS(NS, 'path');
    path.setAttribute('d', route.map((p, i) => `${i ? 'L' : 'M'}${p[0]},${p[1]}`).join(''));
    const dot = document.createElementNS(NS, 'circle');
    const last = route[route.length - 1];
    dot.setAttribute('cx', String(last[0])); dot.setAttribute('cy', String(last[1])); dot.setAttribute('r', '3');
    svg.append(path, dot);
  }
  return svg;
}

function ringsSvg(meals: number, sport: number, week: number): SVGSVGElement {
  const NS = 'http://www.w3.org/2000/svg';
  const svg = document.createElementNS(NS, 'svg');
  svg.setAttribute('viewBox', '0 0 100 100'); svg.setAttribute('class', 'rings st-rings'); svg.setAttribute('aria-hidden', 'true');
  svg.innerHTML = ([[42, meals / 3, 'r-meals'], [31, sport, 'r-sport'], [20, week / 7, 'r-week']] as [number, number, string][]).map(([r, p, cls]) => {
    const c = 2 * Math.PI * r;
    return `<circle cx="50" cy="50" r="${r}" class="ring-track ${cls}"/><circle cx="50" cy="50" r="${r}" class="ring-val ${cls}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, p))}" transform="rotate(-90 50 50)"/>`;
  }).join('');
  return svg;
}

/** The card itself: used by the viewer and as the live preview in the composer. */
export function storyCard(d: StoryData, text: string, photo: string | null, who: { name: string; at?: string }): HTMLElement {
  const big = (v: string, label: string) => h('div', { class: 'st-stat' }, h('b', null, v), h('span', null, label));
  let body: HTMLElement;
  if (d.tpl === 'rings') {
    body = h('div', { class: 'st-body' },
      h('p', { class: 'st-kicker' }, t('היום שלי')),
      ringsSvg(d.meals ?? 0, d.sport ?? 0, d.week ?? 0),
      h('div', { class: 'st-stats' }, big(`${d.meals ?? 0}/3`, t('ארוחות')), big(`${d.sport ?? 0}/1`, t('ספורט')), big(`${d.week ?? 0}/7`, t('ימים מלאים'))),
      d.streak ? h('p', { class: 'st-streak' }, '🔥 ', tr`${d.streak} ימים ברצף`) : '');
  } else if (d.tpl === 'workout') {
    const ty = WORKOUT_TYPES[d.type ?? 'run'];
    const ps = paceOrSpeed(d.type ?? 'run', d.distanceM ?? 0, d.durationS ?? 0);
    body = h('div', { class: 'st-body' },
      h('p', { class: 'st-kicker' }, `${ty.icon} ${d.name || t(ty.name)}`),
      d.route?.length ? routeSvg(d.route) : '',
      h('div', { class: 'st-hero-num' }, h('b', null, fmtKm(d.distanceM ?? 0)), h('span', null, t('ק"מ'))),
      h('div', { class: 'st-stats' }, big(fmtDuration(d.durationS ?? 0), t('זמן')), big(ps.value, t(ps.label))));
  } else if (d.tpl === 'week') {
    body = h('div', { class: 'st-body' },
      h('p', { class: 'st-kicker' }, d.label ? tr`סיכום ${d.label}` : t('סיכום השבוע')),
      h('div', { class: 'st-hero-num' }, h('b', null, String(d.workouts ?? 0)), h('span', null, t('אימונים'))),
      d.label ? '' : h('div', { class: 'st-week-dots', 'aria-hidden': 'true' }, Array.from({ length: 7 }, (_, i) => h('span', { class: i < (d.full ?? 0) ? 'on' : '' }))),
      h('div', { class: 'st-stats' }, big(d.label ? String(d.full ?? 0) : `${d.full ?? 0}/7`, t('ימים מלאים')), big(`${d.meals ?? 0}%`, t('ארוחות'))));
  } else if (d.tpl === 'achievement') {
    body = h('div', { class: 'st-body st-center' }, h('div', { class: 'st-emoji', 'aria-hidden': 'true' }, d.emoji || '🏆'), h('p', { class: 'st-title' }, d.title || ''));
  } else if (d.tpl === 'photo') {
    body = h('div', { class: 'st-body st-photo' }, photo ? h('img', { src: photo, alt: text || t('תמונה') }) : h('div', { class: 'st-photo-empty' }, icon('camera', 40)),
      d.ov ? h('div', { class: 'st-ov' }, d.ov.km !== undefined
        ? [h('b', null, `${fmtKm((d.ov.km ?? 0) * 1000)}`), h('span', null, t('ק"מ')), d.ov.time ? h('span', null, '· ' + d.ov.time) : '', d.ov.pace ? h('span', null, '· ' + d.ov.pace) : '']
        : [h('span', null, '🍽️ ', `${d.ov.meals ?? 0}/3`), h('span', null, '🏃 ', `${d.ov.sport ?? 0}/1`)]) : '');
  } else {
    body = h('div', { class: 'st-body st-center' }, h('p', { class: 'st-bigtext' }, text || t('מה בא לך לשתף?')));
  }
  return h('div', { class: `story-card st-bg-${d.bg}` },
    body,
    text && d.tpl !== 'text' ? h('p', { class: 'st-caption' }, text) : '',
    h('div', { class: 'st-stub' }, h('span', null, logo(16), ' ', who.name), h('span', null, (who.at ? new Date(who.at) : new Date()).toLocaleDateString(LOC(), { day: 'numeric', month: 'short' }))),
  );
}

// ---------------------------------------------------------------- viewer

function openViewer(groups: Group[], gi: number, onClose: () => void): void {
  let ii = 0;
  const seen = seenSet();
  ii = Math.max(0, groups[gi].items.findIndex((p) => !seen.has(p.id)));
  const bars = h('div', { class: 'sv-bars', 'aria-hidden': 'true' });
  const head = h('div', { class: 'sv-head' });
  const stage = h('div', { class: 'sv-stage' });
  const foot = h('div', { class: 'sv-foot' });
  const live = h('p', { class: 'sr-only', 'aria-live': 'polite' });
  const box = h('div', { class: 'story-viewer', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('סטורי'), tabindex: '-1' }, bars, head, stage, foot, live);
  let timer = 0, startAt = 0, left = 6000, paused = false;
  const DUR = 6000;
  const close = () => { clearTimeout(timer); box.remove(); document.removeEventListener('keydown', onKey); onClose(); };
  const go = (dir: 1 | -1) => {
    clearTimeout(timer);
    ii += dir;
    if (ii >= groups[gi].items.length) { gi++; ii = 0; }
    if (ii < 0) { gi--; ii = gi >= 0 ? groups[gi].items.length - 1 : 0; }
    if (gi < 0 || gi >= groups.length) return close();
    show();
  };
  const run = (ms: number) => { startAt = Date.now(); left = ms; timer = window.setTimeout(() => go(1), ms); };
  const pause = () => { if (paused) return; paused = true; clearTimeout(timer); left -= Date.now() - startAt; box.classList.add('paused'); };
  const resume = () => { if (!paused) return; paused = false; box.classList.remove('paused'); run(left); };
  function show() {
    const g = groups[gi], p = g.items[ii];
    const d = (p.data || { tpl: 'text', bg: 'ink' }) as StoryData;
    markSeen(p.id);
    if (!p.mine) call('viewStory', { id: p.id }).catch(() => {});
    bars.replaceChildren(...g.items.map((_, j) => h('span', { class: j < ii ? 'done' : j === ii ? 'now' : '' }, h('i', { style: j === ii ? { animationDuration: DUR + 'ms' } : {} }))));
    head.replaceChildren(
      avatar(g.author.name, g.author.photoId, 34, g.author.frame),
      h('div', { class: 'sv-who' }, h('b', null, g.author.name), h('span', null, new Date(p.at).toLocaleTimeString(LOC(), { hour: '2-digit', minute: '2-digit' }))),
      !p.mine ? h('button', { class: 'sv-x', type: 'button', 'aria-label': t('אפשרויות'), onclick: () => {
        pause();
        const shut = openSheet(t('אפשרויות'), h('div', { class: 'stack' },
          reportButton(p.id, () => { shut(); go(1); }, t('דיווח על הסטורי')),
          blockButton(g.author.userId, g.author.name, () => { shut(); groups.splice(gi, 1); ii = -1; if (!groups.length) close(); else { gi = Math.min(gi, groups.length - 1); ii = 0; show(); } })));
      } }, '⋯') : '',
      h('button', { class: 'sv-x', type: 'button', 'aria-label': t('סגירה'), onclick: close }, '✕'));
    const card = storyCard(d, p.text, null, { name: g.author.name, at: p.at });
    if (d.tpl === 'photo' && p.photoId) {
      const img = card.querySelector('.st-photo') as HTMLElement;
      photoUrl(p.photoId).then((u) => (img.querySelector('img, .st-photo-empty') as HTMLElement | null)?.replaceWith(h('img', { src: u, alt: p.text || t('תמונה') }))).catch(() => {});
    }
    stage.replaceChildren(card,
      h('button', { class: 'sv-tap sv-prev', type: 'button', 'aria-label': t('הקודם'), onclick: () => go(-1) }),
      h('button', { class: 'sv-tap sv-next', type: 'button', 'aria-label': t('הבא'), onclick: () => go(1) }));
    const five = h('button', { class: 'sv-five' + (p.liked ? ' on' : ''), type: 'button', 'aria-pressed': String(p.liked), 'aria-label': t('כיף! (היי פייב)') },
      h('span', { 'aria-hidden': 'true' }, '🙌'), ' ', p.mine ? String(p.likes) : p.liked ? t('נשלח') : t('היי פייב'));
    five.addEventListener('click', async () => {
      if (p.mine) return;
      try {
        const r = await call<{ likes: number; liked: boolean }>('likePost', { id: p.id });
        p.liked = r.liked; p.likes = r.likes;
        five.classList.toggle('on', r.liked); five.setAttribute('aria-pressed', String(r.liked));
        five.lastChild!.textContent = r.liked ? t('נשלח') : t('היי פייב');
        if (r.liked) { five.classList.remove('burst'); void five.offsetWidth; five.classList.add('burst'); navigator.vibrate?.(15); }
      } catch (e: any) { toast(e.message); }
    });
    const reply = h('form', { class: 'sv-reply' },
      h('input', { class: 'sv-reply-in', maxlength: 300, placeholder: tr`תגובה פרטית ל${g.author.name.split(' ')[0]}…`, 'aria-label': t('תגובה פרטית') }),
      h('button', { class: 'sv-send', type: 'submit', 'aria-label': t('שליחה') }, '➤'));
    const rin = reply.querySelector('input') as HTMLInputElement;
    rin.addEventListener('focus', pause);
    rin.addEventListener('blur', () => { if (!rin.value) resume(); });
    reply.addEventListener('submit', async (e) => {
      e.preventDefault();
      const text = rin.value.trim();
      if (!text) return;
      try { await call('commentPost', { id: p.id, text }); rin.value = ''; rin.blur(); toast(t('התגובה נשלחה')); resume(); } catch (ex: any) { toast(ex.message); }
    });
    const replies = p.mine && p.comments.length ? h('button', { class: 'sv-views', type: 'button', onclick: () => {
      pause();
      openSheet(tr`תגובות (${p.comments.length})`, h('ul', { class: 'plain-list sv-replies' }, p.comments.map((c) => h('li', null, h('b', null, c.name), ': ', c.text))));
    } }, '💬 ', String(p.comments.length)) : '';
    foot.replaceChildren(p.mine ? '' : reply, five, replies,
      p.mine ? h('button', { class: 'sv-views', type: 'button', onclick: () => {
        pause();
        openSheet(tr`צפו ${d.viewCount ?? 0}`, h('div', { class: 'stack' }, (d.viewers ?? []).length ? h('ul', { class: 'plain-list' }, (d.viewers ?? []).map((n) => h('li', null, n))) : h('p', { class: 'muted' }, t('עוד אף אחד.'))));
      } }, '👁 ', String(d.viewCount ?? 0)) : '',
      p.mine ? confirmButton(t('מחיקה'), t('בטוח?'), async () => {
        try { await call('deletePost', { id: p.id }); g.items.splice(ii, 1); toast(t('נמחק')); if (!g.items.length) groups.splice(gi, 1); ii--; go(1); } catch (e: any) { toast(e.message); }
      }, 'sv-del') : '');
    live.textContent = `${g.author.name}: ${p.text || d.title || d.name || ''}`;
    paused = false; box.classList.remove('paused');
    run(DUR);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
    else if (e.key === 'ArrowLeft') go(document.dir === 'rtl' ? 1 : -1);
    else if (e.key === 'ArrowRight') go(document.dir === 'rtl' ? -1 : 1);
    else if (e.key === ' ') { e.preventDefault(); paused ? resume() : pause(); }
  };
  // hold to pause, swipe down to close
  let y0 = 0;
  stage.addEventListener('pointerdown', (e) => { y0 = e.clientY; pause(); });
  stage.addEventListener('pointerup', (e) => { if (e.clientY - y0 > 90) close(); else resume(); });
  stage.addEventListener('pointercancel', resume);
  document.addEventListener('keydown', onKey);
  document.body.append(box);
  box.focus();
  show();
  track('story:view');
}

// ---------------------------------------------------------------- composer

function todayRings(): StoryData {
  const today = todayISO();
  const w = getWeek(sundayOf(today));
  const d = w.days[dayIndex(today)];
  const done = (x: typeof d) => (['breakfast', 'lunch', 'dinner'] as const).filter((k) => x[k] || x.text?.[k]).length + (x.sport.status ? 1 : 0);
  return {
    tpl: 'rings', bg: 'ink',
    meals: (['breakfast', 'lunch', 'dinner'] as const).filter((k) => d[k] === 'V').length,
    sport: d.sport.status === 'V' ? 1 : 0,
    week: w.days.filter((x) => done(x) >= 4).length,
    streak: lunchStreak(allWeeks(), today).current,
  };
}

export function workoutStory(w: Workout): StoryData {
  return { tpl: 'workout', bg: 'lime', type: w.type, distanceM: Math.round(w.distanceM), durationS: Math.round(w.durationS), name: w.name ?? '', route: normalizeRoute(w.points) };
}

/** Pick a template, see it live, post it for 24 hours. */
export function openStoryComposer(preset?: StoryData, onPosted?: () => void, gallery: string[] = []): void {
  let d: StoryData = preset ?? (gallery.length ? { tpl: 'photo', bg: 'ink' } : todayRings());
  let queue: string[] = gallery.slice(0, 5);
  let photo: string | null = queue[0] ?? null;
  const me = currentUser()!;
  const text = h('input', { class: 'input', maxlength: 140, placeholder: t('כמה מילים (לא חובה)'), 'aria-label': t('טקסט לסטורי') }) as HTMLInputElement;
  const vis = visibilitySelect('story-vis') as HTMLSelectElement;
  const preview = h('div', { class: 'story-preview' });
  const extra = h('div', { class: 'stack' });
  const draw = () => preview.replaceChildren(storyCard(d, text.value.trim(), photo, { name: me.name }));
  text.addEventListener('input', draw);
  const workouts = listWorkouts().slice(0, 6);
  const achievements = availableAchievements().slice(0, 6);
  const tpls: [StoryData['tpl'], string, string][] = [['photo', '🖼️', 'מהגלריה'], ['rings', '⭕', 'היום שלי'], ['workout', '🏃', 'אימון'], ['achievement', '🏆', 'הישג'], ['text', 'Aa', 'טקסט']];
  const tplBar = h('div', { class: 'chips story-tpls', role: 'radiogroup', 'aria-label': t('סוג') });
  const setTpl = (k: StoryData['tpl']) => {
    const bg = d.bg;
    if (k === 'rings') d = { ...todayRings(), bg };
    else if (k === 'workout') {
      if (!workouts.length) { toast(t('עוד אין אימונים מוקלטים. אפשר להקליט מ"התקדמות".')); return; }
      d = { ...workoutStory(workouts[0]), bg };
    } else if (k === 'achievement') {
      if (!achievements.length) { toast(t('עוד אין הישגים לשתף. ממשיכים לסמן ויגיעו!')); return; }
      d = { tpl: 'achievement', bg, title: achievements[0].title, emoji: achievements[0].icon };
    } else d = { tpl: k, bg };
    drawTpls(); drawExtra(); draw();
  };
  const drawTpls = () => tplBar.replaceChildren(...tpls.map(([k, e, label]) =>
    h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(d.tpl === k), onclick: () => setTpl(k) }, h('span', { 'aria-hidden': 'true' }, e), ' ', t(label))));
  const drawExtra = () => {
    if (d.tpl === 'workout') {
      extra.replaceChildren(h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('איזה אימון') }, workouts.map((w) =>
        h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(d.distanceM === Math.round(w.distanceM) && d.durationS === Math.round(w.durationS)),
          onclick: () => { d = { ...workoutStory(w), bg: d.bg }; drawExtra(); draw(); } },
          `${WORKOUT_TYPES[w.type].icon} ${fmtKm(w.distanceM)} ${t('ק"מ')} · ${new Date(w.start).toLocaleDateString(LOC(), { day: 'numeric', month: 'numeric' })}`))));
    } else if (d.tpl === 'achievement') {
      extra.replaceChildren(h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('הישג') }, achievements.map((a) =>
        h('button', { type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(d.title === a.title), onclick: () => { d = { ...d, title: a.title, emoji: a.icon }; drawExtra(); draw(); } }, `${a.icon} ${a.title}`))));
    } else if (d.tpl === 'photo') {
      const lastWo = workouts[0];
      const today = todayRings();
      const ovs: [string, StoryData['ov'] | undefined][] = [['בלי נתונים', undefined], ...(lastWo ? [['האימון האחרון', { km: Math.round(lastWo.distanceM / 10) / 100, time: fmtDuration(lastWo.durationS), pace: paceOrSpeed(lastWo.type, lastWo.distanceM, lastWo.durationS).value }]] as [string, StoryData['ov']][] : []), ['נתוני היום', { meals: today.meals, sport: today.sport }]];
      extra.replaceChildren(
        h('button', { class: 'btn', type: 'button', onclick: async () => {
          const files = await pickImages(5);
          if (!files.length) return;
          try { queue = []; for (const f of files) queue.push(await fileToDataUrl(f, 1080)); photo = queue[0]; drawExtra(); draw(); } catch (e: any) { toast(e.message); }
        } }, '🖼️ ', queue.length ? t('בחירה מחדש מהגלריה') : t('בחירה מהגלריה (עד 5)')),
        queue.length > 1 ? h('div', { class: 'story-queue', role: 'radiogroup', 'aria-label': t('התמונות שנבחרו') }, queue.map((src, i) => h('button', {
          type: 'button', role: 'radio', 'aria-checked': String(photo === src), 'aria-label': tr`תמונה ${i + 1}`,
          onclick: () => { photo = src; drawExtra(); draw(); },
        }, h('img', { src, alt: '' })))) : '',
        h('div', { class: 'chips', role: 'radiogroup', 'aria-label': t('נתונים על התמונה') }, ovs.map(([label, ov]) => h('button', {
          type: 'button', class: 'chip', role: 'radio', 'aria-checked': String(JSON.stringify(d.ov) === JSON.stringify(ov)),
          onclick: () => { d = { ...d, ov }; drawExtra(); draw(); },
        }, t(label)))),
      );
    } else extra.replaceChildren();
  };
  const bgBar = h('div', { class: 'story-bgs', role: 'radiogroup', 'aria-label': t('רקע') });
  const drawBgs = () => bgBar.replaceChildren(...BGS.map(([k, label]) => h('button', {
    type: 'button', class: `story-bg st-bg-${k}`, role: 'radio', 'aria-checked': String(d.bg === k), 'aria-label': t(label),
    onclick: () => { d = { ...d, bg: k }; drawBgs(); draw(); },
  })));
  const post = h('button', { class: 'btn btn-primary', type: 'button' }, t('העלאה ל-24 שעות'));
  post.addEventListener('click', async () => {
    if (d.tpl === 'photo' && !queue.length) { toast(t('נא לבחור תמונה')); return; }
    if (d.tpl === 'text' && !text.value.trim()) { toast(t('נא לכתוב משהו')); return; }
    post.disabled = true;
    try {
      const shots = d.tpl === 'photo' ? queue : [null];
      for (const ph of shots) await call('createPost', { kind: 'story', text: text.value.trim(), data: d, visibility: vis.value, ...(ph ? { photo: ph } : {}) });
      close(); toast(shots.length > 1 ? tr`${shots.length} סטוריז עלו 🎉` : t('הסטורי עלה 🎉')); track('story:post:' + d.tpl); onPosted?.();
    } catch (e: any) { toast(e.message); post.disabled = false; }
  });
  drawTpls(); drawExtra(); drawBgs(); draw();
  const close = openSheet(t('סטורי חדש'), h('div', { class: 'stack story-composer' },
    tplBar, preview, extra, bgBar, text,
    h('div', { class: 'field' }, h('label', { for: 'story-vis' }, t('מי יראה')), vis),
    h('p', { class: 'hint' }, t('נעלם אחרי 24 שעות. במסלול מוצגת רק הצורה, בלי מפה ובלי מיקום.')),
    post), { full: true });
}

// ---------------------------------------------------------------- bar

/** The row of people with live stories, at the top of the feed. */
export function storiesBar(): HTMLElement {
  const row = h('div', { class: 'stories-bar', role: 'list', 'aria-label': t('סטוריז') });
  const me = currentUser()!;
  const load = async () => {
    let groups: Group[] = [];
    try { groups = (await call<{ groups: Group[] }>('stories')).groups; } catch { /* old server: show just "+" */ }
    const seen = seenSet();
    const mine = groups.find((g) => g.author.userId === me.userId);
    const bubble = (g: Group | null, i: number) => {
      const unseen = g ? g.items.filter((p) => !seen.has(p.id)).length : 0;
      const segs = g ? g.items.length : 0;
      const ringStyle = segs ? { '--segs': String(Math.min(segs, 12)) } as any : {};
      return h('div', { role: 'listitem' }, h('button', {
        class: 'story-bubble' + (g && unseen ? ' unseen' : '') + (g ? '' : ' add'), type: 'button', style: ringStyle,
        'aria-label': g ? tr`הסטורי של ${g.author.name}${unseen ? ', ' + t('חדש') : ''}` : t('סטורי חדש'),
        onclick: () => (g ? openViewer(groups, i, load) : openStoryComposer(undefined, load)),
      },
      h('span', { class: 'sb-ring' }, avatar(g ? g.author.name : me.name, g ? g.author.photoId : me.photoId, 58), !g || g.author.userId === me.userId ? h('span', { class: 'sb-plus', 'aria-hidden': 'true' }, '+') : ''),
      h('span', { class: 'sb-name' }, g ? (g.author.userId === me.userId ? t('שלך') : g.author.name.split(' ')[0]) : t('שלך'))));
    };
    const galleryBtn = h('div', { role: 'listitem' }, h('button', { class: 'story-bubble gallery', type: 'button', 'aria-label': t('סטורי מהגלריה'), onclick: async () => {
      const files = await pickImages(5);
      if (!files.length) return;
      try { const srcs: string[] = []; for (const f of files) srcs.push(await fileToDataUrl(f, 1080)); openStoryComposer(undefined, load, srcs); } catch (e: any) { toast(e.message); }
    } }, h('span', { class: 'sb-ring sb-gallery', 'aria-hidden': 'true' }, '🖼️'), h('span', { class: 'sb-name' }, t('גלריה'))));
    row.replaceChildren(
      mine ? bubble(mine, groups.indexOf(mine)) : bubble(null, -1),
      galleryBtn,
      ...groups.map((g, i) => (g === mine ? null : bubble(g, i))).filter(Boolean) as HTMLElement[],
    );
    if (mine) {
      // long-press-free way to add another one
      row.firstElementChild!.append(h('button', { class: 'sb-add-more', type: 'button', 'aria-label': t('סטורי חדש'), onclick: () => openStoryComposer(undefined, load) }, '+'));
    }
  };
  load();
  return row;
}
