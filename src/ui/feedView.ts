import { verifyCard } from './verifyCard';
import { t, tr } from '../i18n';
import { call, NetworkError } from '../api';
import { onOutboxSent, postOrQueue } from '../outbox';
import { currentUser, isAdmin, photoUrl, rememberPhoto } from '../session';
import { fileToDataUrl, pickImages } from '../image';
import { levelLabel } from '../rewards';
import { formatShort } from '../dates';
import { avatar } from './avatar';
import { logo } from './icons';
import { confirmButton, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { duelsTab } from './duelsView';
import { openStoryComposer, storiesBar, workoutStory } from './storiesView';
import { listWorkouts } from '../workouts';
import { blockButton, reportButton } from './safety';
import { leagueCard } from './leagueView';
import { track } from '../analytics';
import { cardPreview, openShareAchievement, shareOutside, visibilitySelect, type Achievement } from './shareCard';

export interface Post {
  id: string; at: string; kind: string; text: string; data: any; photoId: string | null; visibility: 'all' | 'friends'; status: string; mine: boolean;
  author: { userId: string; name: string; photoId: string | null; frame: string; level: number; levelName: string; team?: boolean };
  likes: number; liked: boolean; comments: { id: string; userId: string; name: string; text: string; at: string }[];
}
export interface CompEvent { id: string; title: string; date: string; location: string; type: string; url: string; details: string; status: string; mine: boolean }

export const EVENT_TYPES: Record<string, [string, string]> = {
  run: ['🏃', 'ריצה'], crossfit: ['🏋️', 'קרוספיט'], triathlon: ['🏊', 'טריאתלון'], cycling: ['🚴', 'רכיבה'], swim: ['🌊', 'שחייה'], other: ['🏅', 'אחר'],
};

function ago(iso: string): string {
  const m = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return t('עכשיו');
  if (m < 60) return tr`לפני ${m} דק'`;
  const hr = Math.round(m / 60);
  if (hr < 24) return tr`לפני ${hr} שע'`;
  const d = Math.round(hr / 24);
  return d < 7 ? tr`לפני ${d} ימים` : formatShort(iso.slice(0, 10));
}

function postPhoto(id: string): HTMLElement {
  const img = h('img', { class: 'post-photo', alt: t('תמונה מצורפת לפוסט'), loading: 'lazy' }) as HTMLImageElement;
  photoUrl(id).then((u) => { img.src = u; }).catch(() => img.remove());
  return img;
}

/** Several photos: swipe sideways, dots show where you are. */
function postGallery(ids: string[]): HTMLElement {
  const track = h('div', { class: 'gallery-track', tabindex: '0', role: 'region', 'aria-label': tr`${ids.length} תמונות, אפשר לגלול לצדדים` }, ids.map((id) => h('div', { class: 'gallery-slide' }, postPhoto(id))));
  const dots = h('div', { class: 'gallery-dots', 'aria-hidden': 'true' }, ids.map((_, i) => h('span', { class: i ? '' : 'on' })));
  track.addEventListener('scroll', () => {
    const i = Math.round(Math.abs(track.scrollLeft) / track.clientWidth);
    dots.querySelectorAll('span').forEach((d, j) => d.classList.toggle('on', j === i));
  }, { passive: true });
  return h('div', { class: 'post-gallery' }, track, dots, h('span', { class: 'gallery-count' }, `${ids.length} 📷`));
}

function postCard(p: Post, reload: () => void): HTMLElement {
  const likeBtn = h('button', { class: 'post-act' + (p.liked ? ' on' : ''), type: 'button', 'aria-pressed': String(p.liked), 'aria-label': tr`אהבתי (${p.likes})` },
    p.liked ? '❤️' : '🤍', ' ', String(p.likes));
  likeBtn.addEventListener('click', async () => {
    try {
      const r = await call<{ likes: number; liked: boolean }>('likePost', { id: p.id });
      p.likes = r.likes; p.liked = r.liked; if (r.liked) track('post:like');
      likeBtn.replaceChildren(r.liked ? '❤️' : '🤍', ' ', String(r.likes));
      likeBtn.classList.toggle('on', r.liked); likeBtn.setAttribute('aria-pressed', String(r.liked));
      if (r.liked) likeBtn.animate?.([{ transform: 'scale(1)' }, { transform: 'scale(1.3)' }, { transform: 'scale(1)' }], { duration: 300 });
    } catch (e: any) { toast(e.message); }
  });
  const comments = h('div', { class: 'comments', hidden: !p.comments.length });
  const drawComments = () => comments.replaceChildren(
    ...p.comments.map((c) => h('div', { class: 'comment' },
      h('strong', null, c.name), ' ', h('span', null, c.text),
      (c.userId === currentUser()?.userId || p.mine || isAdmin()) && h('button', { class: 'link-btn small', type: 'button', 'aria-label': t('מחק תגובה'), onclick: async () => {
        try { await call('deleteComment', { id: p.id, commentId: c.id }); p.comments = p.comments.filter((x) => x.id !== c.id); drawComments(); } catch (e: any) { toast(e.message); }
      } }, '✕'))),
    (() => {
      const input = h('input', { class: 'input', maxlength: 500, placeholder: t('כתוב תגובה…'), 'aria-label': t('תגובה') }) as HTMLInputElement;
      return h('form', { class: 'comment-form', onsubmit: async (e: Event) => {
        e.preventDefault();
        if (!input.value.trim()) return;
        try { const { comment } = await call<{ comment: Post['comments'][0] }>('commentPost', { id: p.id, text: input.value }); p.comments.push(comment); drawComments(); track('post:comment'); }
        catch (ex: any) { toast(ex.message); }
      } }, input, h('button', { class: 'btn', type: 'submit' }, t('שלח')));
    })(),
  );
  drawComments();
  const more = () => {
    const close = openSheet(t('אפשרויות'), h('div', { class: 'stack' },
      p.kind === 'achievement' && p.mine && h('button', { class: 'btn', type: 'button', onclick: () => { close(); shareOutside(p.data as Achievement); } }, '📤 ', t('שתף לרשתות')),
      (p.mine || isAdmin()) && confirmButton(t('מחק פוסט'), t('הקש שוב למחיקה'), async () => {
        try { await call('deletePost', { id: p.id }); close(); toast(t('הפוסט נמחק')); reload(); } catch (e: any) { toast(e.message); }
      }, 'btn btn-danger'),
      !p.mine && reportButton(p.id, () => close()),
      !p.mine && !p.author.team && blockButton(p.author.userId, p.author.name, () => { close(); reload(); }),
    ));
  };
  return h('article', { class: 'card post' + (p.status !== 'ok' ? ' post-hidden' : '') },
    h('header', { class: 'post-head' },
      p.author.team ? h('span', { class: 'team-avatar', 'aria-hidden': 'true' }, logo(42)) : avatar(p.author.name, p.author.photoId, 42, p.author.frame),
      h('div', { class: 'post-who' },
        h('strong', null, p.author.name, p.author.team ? h('span', { class: 'team-badge' }, '✓ ', t('רשמי')) : ''),
        h('span', { class: 'muted small' }, p.author.team ? '' : tr`רמה ${p.author.level} · ${levelLabel(p.author.levelName)} · `, ago(p.at), ' · ', p.visibility === 'friends' ? '👥' : '🌍'),
      ),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('אפשרויות'), onclick: more }, '⋯'),
    ),
    p.status !== 'ok' && h('p', { class: 'hint' }, t('הפוסט מוסתר עד שהמנהל יבדוק אותו.')),
    p.text && h('p', { class: 'post-text' }, p.text),
    p.kind === 'achievement' && p.data && cardPreview(p.data as Achievement),
    p.kind === 'event' && p.data && eventMini(p.data as CompEvent),
    p.kind === 'meetup' && p.data && meetupCard(p),
    p.author.team && typeof p.data?.image === 'string' && /^team\/[a-z0-9-]+\.webp$/.test(p.data.image)
      ? h('img', { class: 'post-photo team-photo', src: p.data.image, alt: p.text.split('\n')[0].slice(0, 120), loading: 'lazy', width: 720, height: 900 })
      : p.data?.photos?.length > 1 ? postGallery(p.data.photos as string[]) : p.photoId && postPhoto(p.photoId),
    h('footer', { class: 'post-actions' },
      likeBtn,
      h('button', { class: 'post-act', type: 'button', 'aria-label': tr`תגובות (${p.comments.length})`, onclick: () => { comments.hidden = !comments.hidden; if (!comments.hidden) (comments.querySelector('input') as HTMLInputElement)?.focus(); } }, '💬 ', String(p.comments.length)),
    ),
    comments,
  );
}

export interface Meetup { title: string; when: string; location: string; sport: string; going: string[] }
const REMIND_KEY = () => 'meetups:' + (currentUser()?.userId ?? '');
/** Meetups I'm going to, kept on the device for reminders. */
export function myMeetups(): { id: string; title: string; when: string; location: string }[] {
  try { return JSON.parse(localStorage.getItem(REMIND_KEY()) || '[]'); } catch { return []; }
}
function rememberMeetup(id: string, m: Meetup, on: boolean) {
  const list = myMeetups().filter((x) => x.id !== id && Date.parse(x.when) > Date.now() - 864e5);
  if (on) list.push({ id, title: m.title, when: m.when, location: m.location });
  try { localStorage.setItem(REMIND_KEY(), JSON.stringify(list)); } catch { /* ignore */ }
}

function icsFile(m: Meetup) {
  const start = new Date(m.when);
  const end = new Date(start.getTime() + 3600000);
  const f = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//mishmaat//meetup//HE', 'BEGIN:VEVENT', `DTSTART:${f(start)}`, `DTEND:${f(end)}`,
    `SUMMARY:${m.title}`, `LOCATION:${m.location}`, 'BEGIN:VALARM', 'TRIGGER:-PT1H', 'ACTION:DISPLAY', `DESCRIPTION:${m.title}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
  const url = URL.createObjectURL(new Blob([ics], { type: 'text/calendar' }));
  const a = h('a', { href: url, download: 'meetup.ics' });
  document.body.append(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

function meetupCard(p: Post): HTMLElement {
  const m = p.data as Meetup;
  const me = currentUser()?.userId ?? '';
  let going = m.going?.length ?? 0, iGo = !!m.going?.includes(me);
  const [ic, typeName] = EVENT_TYPES[m.sport] ?? EVENT_TYPES.other;
  const when = new Date(m.when);
  const past = when.getTime() < Date.now();
  const btn = h('button', { class: 'btn' + (iGo ? ' btn-primary' : ''), type: 'button', disabled: past }) as HTMLButtonElement;
  const drawBtn = () => btn.replaceChildren(iGo ? '✓ ' + t('אני בא') : t('אני בא'), h('span', { class: 'go-count' }, ` · ${going}`));
  drawBtn();
  btn.addEventListener('click', async () => {
    try {
      const r = await call<{ going: number; me: boolean }>('rsvpPost', { id: p.id });
      going = r.going; iGo = r.me; drawBtn(); btn.classList.toggle('btn-primary', iGo);
      rememberMeetup(p.id, m, iGo);
      if (iGo) { toast(t('מעולה! נזכיר לך ביום המפגש')); track('meetup:rsvp'); }
    } catch (e: any) { toast(e.message); }
  });
  return h('div', { class: 'meetup' + (past ? ' past' : '') },
    h('div', { class: 'ev-date', 'aria-hidden': 'true' }, h('b', null, String(when.getDate())), h('span', null, when.toLocaleDateString(undefined, { month: 'short' }))),
    h('div', { class: 'ev-body' },
      h('strong', null, `${ic} ${m.title}`),
      h('span', { class: 'muted small' }, `${t(typeName)} · ${when.toLocaleDateString(undefined, { weekday: 'long' })} ${when.toTimeString().slice(0, 5)}`),
      m.location ? h('a', { class: 'link-btn small', href: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(m.location), target: '_blank', rel: 'noopener noreferrer' }, '📍 ', m.location) : '',
      h('div', { class: 'meetup-actions' }, btn, !past && h('button', { class: 'btn', type: 'button', onclick: () => icsFile(m) }, '🗓 ', t('ליומן'))),
    ));
}

function meetupForm(onDone: () => void): void {
  const f = (id: string, label: string, el: HTMLElement) => h('div', { class: 'field' }, h('label', { for: id }, label), el);
  const title = h('input', { class: 'input', id: 'mt-title', maxlength: 80, required: true, placeholder: t('לדוגמה: ריצת בוקר קבוצתית') }) as HTMLInputElement;
  const when = h('input', { class: 'input', id: 'mt-when', type: 'datetime-local', required: true }) as HTMLInputElement;
  const loc = h('input', { class: 'input', id: 'mt-loc', maxlength: 120, placeholder: t('לדוגמה: פארק הירקון, הכניסה מרוקח') }) as HTMLInputElement;
  const type = h('select', { class: 'input', id: 'mt-type' }, Object.entries(EVENT_TYPES).map(([k, [ic, n]]) => h('option', { value: k }, `${ic} ${t(n)}`))) as HTMLSelectElement;
  const vis = visibilitySelect('mt-vis') as HTMLSelectElement;
  const text = h('textarea', { class: 'input', id: 'mt-text', rows: 2, maxlength: 1000, placeholder: t('פרטים: קצב, מרחק, למי מתאים…') }) as HTMLTextAreaElement;
  const close = openSheet(t('מפגש חדש'), h('form', { class: 'stack', onsubmit: async (e: Event) => {
    e.preventDefault();
    try {
      const { post } = await call<{ post: Post }>('createPost', { kind: 'meetup', text: text.value, visibility: vis.value, data: { title: title.value, when: when.value, location: loc.value, sport: type.value } });
      rememberMeetup(post.id, post.data as Meetup, true);
      close(); toast(t('המפגש פורסם בקהילה')); track('meetup:create'); onDone();
    } catch (ex: any) { toast(ex.message); }
  } },
    f('mt-title', t('שם המפגש'), title), f('mt-when', t('מתי'), when), f('mt-loc', t('איפה'), loc), f('mt-type', t('סוג'), type),
    f('mt-text', t('פרטים (לא חובה)'), text), f('mt-vis', t('מי יראה'), vis),
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('פרסם מפגש')),
  ));
}

function composer(onPosted: () => void): HTMLElement {
  const u = currentUser()!;
  const text = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: t('מה חדש? אימון, הישג, טיפ או שאלה…'), 'aria-label': t('פוסט חדש') }) as HTMLTextAreaElement;
  const vis = visibilitySelect('post-vis') as HTMLSelectElement;
  let photos: string[] = [];
  const thumb = h('div', { class: 'post-thumbs', hidden: true });
  const drawThumbs = () => {
    thumb.hidden = !photos.length;
    thumb.replaceChildren(...photos.map((src, i) => h('div', { class: 'post-thumb' }, h('img', { src, alt: tr`תמונה ${i + 1}` }),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': tr`הסר תמונה ${i + 1}`, onclick: () => { photos.splice(i, 1); drawThumbs(); } }, '✕'))));
  };
  const post = h('button', { class: 'btn btn-primary', type: 'submit' }, t('פרסם'));
  return h('form', { class: 'card composer', onsubmit: async (e: Event) => {
    e.preventDefault();
    if (!text.value.trim() && !photos.length) return toast(t('נא לכתוב משהו'));
    (post as HTMLButtonElement).disabled = true;
    try {
      const asTeam = !!(document.getElementById('as-team') as HTMLInputElement | null)?.checked;
      const payload = { text: text.value, visibility: vis.value, photos, asTeam };
      let r: { post: Post } | null = null;
      try { r = await call<{ post: Post }>('createPost', payload); }
      catch (ex) { if (!(ex instanceof NetworkError)) throw ex; await postOrQueue(payload); }
      if (r) { const ids: string[] = r.post.data?.photos ?? (r.post.photoId ? [r.post.photoId] : []); ids.forEach((id, i) => photos[i] && rememberPhoto(id, photos[i])); }
      text.value = ''; photos = []; drawThumbs(); toast(r ? t('פורסם') : t('אין חיבור כרגע. הפוסט יישלח לבד כשיחזור האינטרנט.')); track(r ? 'post:create' : 'post:queued');
      onPosted();
    } catch (ex: any) { toast(ex.message); }
    (post as HTMLButtonElement).disabled = false;
  } },
    h('div', { class: 'composer-top' }, avatar(u.name, u.photoId, 40), text),
    thumb,
    h('div', { class: 'composer-bar' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        if (photos.length >= 4) return toast(t('עד 4 תמונות בפוסט'));
        const files = await pickImages(4 - photos.length); if (!files.length) return;
        try { for (const f of files) photos.push(await fileToDataUrl(f)); drawThumbs(); }
        catch (ex: any) { toast(ex.message); }
      } }, '🖼️ ', t('תמונות')),
      h('button', { class: 'btn', type: 'button', onclick: () => openShareAchievement(onPosted) }, '🏅 ', t('הישג')),
      h('button', { class: 'btn', type: 'button', onclick: () => meetupForm(onPosted) }, '📅 ', t('מפגש')),
      isAdmin() && h('label', { class: 'team-toggle' }, h('input', { type: 'checkbox', id: 'as-team' }), ' ', t('בשם הצוות')),
      vis,
      post,
    ),
  );
}

function eventMini(e: CompEvent): HTMLElement {
  const [ic, name] = EVENT_TYPES[e.type] ?? EVENT_TYPES.other;
  return h('div', { class: 'event-mini' }, h('span', { class: 'ev-icon', 'aria-hidden': 'true' }, ic),
    h('div', null, h('strong', null, e.title), h('div', { class: 'muted small' }, `${t(name)} · ${formatShort(e.date)}${e.location ? ' · ' + e.location : ''}`)));
}

function eventCard(e: CompEvent): HTMLElement {
  const [ic, name] = EVENT_TYPES[e.type] ?? EVENT_TYPES.other;
  const [y, m, d] = e.date.split('-');
  return h('article', { class: 'card event' },
    h('div', { class: 'ev-date', 'aria-hidden': 'true' }, h('b', null, String(Number(d))), h('span', null, `${m}/${y.slice(2)}`)),
    h('div', { class: 'ev-body' },
      h('strong', null, `${ic} ${e.title}`),
      h('div', { class: 'muted small' }, `${t(name)} · ${formatShort(e.date)}${e.location ? ' · ' + e.location : ''}`),
      e.details && h('p', { class: 'small' }, e.details),
      e.status === 'pending' && h('span', { class: 'badge' }, t('ממתין לאישור המנהל')),
      e.url && h('a', { class: 'link-btn', href: e.url, target: '_blank', rel: 'noopener noreferrer' }, t('לפרטים והרשמה ↗')),
    ),
  );
}

export function eventForm(onDone: () => void, admin = false): void {
  const f = (id: string, label: string, el: HTMLElement) => h('div', { class: 'field' }, h('label', { for: id }, label), el);
  const title = h('input', { class: 'input', id: 'ev-title', maxlength: 120, required: true }) as HTMLInputElement;
  const date = h('input', { class: 'input', id: 'ev-date', type: 'date', required: true, min: new Date().toISOString().slice(0, 10) }) as HTMLInputElement;
  const type = h('select', { class: 'input', id: 'ev-type' }, Object.entries(EVENT_TYPES).map(([k, [ic, n]]) => h('option', { value: k }, `${ic} ${t(n)}`))) as HTMLSelectElement;
  const loc = h('input', { class: 'input', id: 'ev-loc', maxlength: 120 }) as HTMLInputElement;
  const url = h('input', { class: 'input', id: 'ev-url', type: 'url', dir: 'ltr', placeholder: 'https://', maxlength: 300 }) as HTMLInputElement;
  const details = h('textarea', { class: 'input', id: 'ev-details', rows: 3, maxlength: 1000 }) as HTMLTextAreaElement;
  const close = openSheet(admin ? t('הוספת תחרות') : t('הצעת תחרות'), h('form', { class: 'stack', onsubmit: async (e: Event) => {
    e.preventDefault();
    try {
      await call('suggestEvent', { title: title.value, date: date.value, type: type.value, location: loc.value, url: url.value, details: details.value });
      close(); toast(admin ? t('התחרות פורסמה') : t('תודה! ההצעה נשלחה לאישור המנהל')); onDone();
    } catch (ex: any) { toast(ex.message); }
  } },
    f('ev-title', t('שם התחרות'), title), f('ev-date', t('תאריך'), date), f('ev-type', t('סוג'), type),
    f('ev-loc', t('מקום'), loc), f('ev-url', t('קישור להרשמה (לא חובה)'), url), f('ev-details', t('פרטים'), details),
    h('button', { class: 'btn btn-primary', type: 'submit' }, admin ? t('פרסם') : t('שלח לאישור')),
  ));
}

function eventsTab(box: HTMLElement): void {
  box.replaceChildren(h('p', { class: 'muted' }, t('טוען…')));
  const load = () => call<{ events: CompEvent[] }>('events').then(({ events }) => {
    box.replaceChildren(
      h('div', { class: 'feed-head' }, h('p', { class: 'hint' }, t('תחרויות ריצה, קרוספיט, טריאתלון ועוד. מכירים תחרות? הציעו אותה.')),
        h('button', { class: 'btn', type: 'button', onclick: () => eventForm(load, isAdmin()) }, isAdmin() ? t('+ הוסף תחרות') : t('+ הצע תחרות'))),
      ...(events.length ? events.map(eventCard) : [h('section', { class: 'card empty' }, h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '🏁'), h('p', null, t('עוד אין תחרויות קרובות. הן יופיעו כאן ברגע שיתווספו.')))]),
    );
  }).catch((e) => box.replaceChildren(h('p', { class: 'form-error' }, e.message)));
  load();
}

/** Empty "all" tab: the easiest next steps instead of "be the first to post". */
function emptyAll(onPosted: () => void): HTMLElement {
  const last = listWorkouts()[0];
  return h('section', { class: 'card empty feed-empty' },
    h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '👋'),
    h('p', null, t('הקהילה עוד שקטה. הכי קל להתחיל עם חבר.')),
    h('div', { class: 'feed-empty-actions' },
      h('a', { class: 'btn btn-primary', href: HASH.share }, t('הזמנת חבר (50 מטבעות לשניכם)')),
      last ? h('button', { class: 'btn', type: 'button', onclick: () => openStoryComposer(workoutStory(last), onPosted) }, t('שיתוף האימון האחרון')) : ''));
}

export function renderFeed(root: HTMLElement, tab: 'posts' | 'events' | 'duels'): void {
  const box = h('div', { class: 'stack' });
  const seg = h('div', { class: 'seg feed-tabs', role: 'group', 'aria-label': t('קהילה') },
    h('a', { href: HASH.feed, 'aria-current': tab === 'posts' ? 'page' : undefined }, t('פיד')),
    h('a', { href: HASH.duels, 'aria-current': tab === 'duels' ? 'page' : undefined }, t('אתגרים')),
    h('a', { href: HASH.events, 'aria-current': tab === 'events' ? 'page' : undefined }, t('תחרויות')));
  root.replaceChildren(seg, box);
  if (tab === 'events') return eventsTab(box);
  if (tab === 'duels') { root.replaceChildren(seg, leagueCard(), box); return duelsTab(box); }

  let only = '';
  let posts: Post[] = [];
  const list = h('div', { class: 'stack' });
  const moreBtn = h('button', { class: 'btn', type: 'button', hidden: true }, t('עוד פוסטים'));
  const filter = h('div', { class: 'seg', role: 'group', 'aria-label': t('סינון') });
  const load = async (append = false) => {
    if (!append) list.replaceChildren(h('p', { class: 'muted' }, t('טוען…')));
    try {
      const r = await call<{ posts: Post[]; more: boolean }>('feed', { only, before: append && posts.length ? posts[posts.length - 1].at : undefined });
      posts = append ? posts.concat(r.posts) : r.posts;
      list.replaceChildren(...(posts.length ? posts.map((p) => postCard(p, () => load())) : [only === 'friends'
        ? h('section', { class: 'card empty' },
            h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '👯'),
            h('p', null, t('כאן יופיעו הפוסטים של החברים שלך. מזמינים חבר בקישור אישי, ושניכם מקבלים 50 מטבעות.')),
            h('a', { class: 'btn btn-primary', href: HASH.share }, t('הזמנת חברים')))
        : only === '' ? emptyAll(() => load())
        : h('section', { class: 'card empty' },
            h('p', { class: 'empty-icon', 'aria-hidden': 'true' }, '👋'), h('p', null, t('עוד אין פוסטים. היו הראשונים לשתף אימון או הישג!')))]));
      moreBtn.hidden = !r.more;
    } catch (e: any) {
      const old = /לא מוכרת|Unknown action/.test(e.message);
      list.replaceChildren(h('p', { class: 'form-error' }, old ? t('הקהילה עוד לא הופעלה בשרת. היא תופיע אחרי שמנהל האפליקציה יעדכן את קוד השרת.') : e.message));
    }
  };
  ([['', 'הכל'], ['friends', 'חברים'], ['mine', 'שלי']] as const).forEach(([k, label]) => {
    filter.append(h('button', { type: 'button', 'aria-pressed': String(only === k), onclick: (e: Event) => {
      only = k; filter.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b === e.currentTarget))); load();
    } }, t(label)));
  });
  moreBtn.addEventListener('click', () => load(true));
  // Unverified email: the verify card takes the composer's place, then the composer appears in place.
  const slot = h('div', { class: 'stack' });
  const fillSlot = () => slot.replaceChildren((!isAdmin() && verifyCard({ reason: t('כדי לפרסם צריך לאמת את המייל. זה לוקח 20 שניות.'), onVerified: () => { fillSlot(); setTimeout(() => document.querySelector<HTMLElement>('.composer textarea')?.focus(), 50); } })) || composer(() => load()));
  fillSlot();
  box.replaceChildren(storiesBar(), slot, filter, list, moreBtn,
    h('p', { class: 'hint' }, t('"חברים" הם מי שהזמנת לאפליקציה ומי שהזמין אותך. אפשר לדווח על תוכן לא הולם דרך ⋯.')));
  load();
  const off = onOutboxSent(() => { if (list.isConnected) load(); else off(); });
  void navigate;
}
