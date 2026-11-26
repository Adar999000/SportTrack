import { t, tr } from '../i18n';
import { call } from '../api';
import { currentUser, isAdmin, photoUrl, rememberPhoto } from '../session';
import { fileToDataUrl, pickImage } from '../image';
import { levelLabel } from '../rewards';
import { formatShort } from '../dates';
import { avatar } from './avatar';
import { confirmButton, h, openSheet, toast } from './dom';
import { HASH, navigate } from './router';
import { cardPreview, openShareAchievement, shareOutside, visibilitySelect, type Achievement } from './shareCard';

export interface Post {
  id: string; at: string; kind: string; text: string; data: any; photoId: string | null; visibility: 'all' | 'friends'; status: string; mine: boolean;
  author: { userId: string; name: string; photoId: string | null; frame: string; level: number; levelName: string };
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

function postCard(p: Post, reload: () => void): HTMLElement {
  const likeBtn = h('button', { class: 'post-act' + (p.liked ? ' on' : ''), type: 'button', 'aria-pressed': String(p.liked), 'aria-label': tr`אהבתי (${p.likes})` },
    p.liked ? '❤️' : '🤍', ' ', String(p.likes));
  likeBtn.addEventListener('click', async () => {
    try {
      const r = await call<{ likes: number; liked: boolean }>('likePost', { id: p.id });
      p.likes = r.likes; p.liked = r.liked;
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
        try { const { comment } = await call<{ comment: Post['comments'][0] }>('commentPost', { id: p.id, text: input.value }); p.comments.push(comment); drawComments(); }
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
      !p.mine && h('button', { class: 'btn', type: 'button', onclick: async () => {
        try { await call('reportPost', { id: p.id }); close(); toast(t('תודה, הדיווח נשלח למנהל')); } catch (e: any) { toast(e.message); }
      } }, '🚩 ', t('דווח על תוכן לא הולם')),
    ));
  };
  return h('article', { class: 'card post' + (p.status !== 'ok' ? ' post-hidden' : '') },
    h('header', { class: 'post-head' },
      avatar(p.author.name, p.author.photoId, 42, p.author.frame),
      h('div', { class: 'post-who' },
        h('strong', null, p.author.name),
        h('span', { class: 'muted small' }, tr`רמה ${p.author.level} · ${levelLabel(p.author.levelName)}`, ' · ', ago(p.at), ' · ', p.visibility === 'friends' ? '👥' : '🌍'),
      ),
      h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('אפשרויות'), onclick: more }, '⋯'),
    ),
    p.status !== 'ok' && h('p', { class: 'hint' }, t('הפוסט מוסתר עד שהמנהל יבדוק אותו.')),
    p.text && h('p', { class: 'post-text' }, p.text),
    p.kind === 'achievement' && p.data && cardPreview(p.data as Achievement),
    p.kind === 'event' && p.data && eventMini(p.data as CompEvent),
    p.photoId && postPhoto(p.photoId),
    h('footer', { class: 'post-actions' },
      likeBtn,
      h('button', { class: 'post-act', type: 'button', 'aria-label': tr`תגובות (${p.comments.length})`, onclick: () => { comments.hidden = !comments.hidden; if (!comments.hidden) (comments.querySelector('input') as HTMLInputElement)?.focus(); } }, '💬 ', String(p.comments.length)),
    ),
    comments,
  );
}

function composer(onPosted: () => void): HTMLElement {
  const u = currentUser()!;
  const text = h('textarea', { class: 'input', rows: 2, maxlength: 1000, placeholder: t('מה חדש? אימון, הישג, טיפ או שאלה…'), 'aria-label': t('פוסט חדש') }) as HTMLTextAreaElement;
  const vis = visibilitySelect('post-vis') as HTMLSelectElement;
  let photo: string | null = null;
  const thumb = h('div', { class: 'post-thumb', hidden: true });
  const post = h('button', { class: 'btn btn-primary', type: 'submit' }, t('פרסם'));
  return h('form', { class: 'card composer', onsubmit: async (e: Event) => {
    e.preventDefault();
    if (!text.value.trim() && !photo) return toast(t('נא לכתוב משהו'));
    (post as HTMLButtonElement).disabled = true;
    try {
      const r = await call<{ post: Post }>('createPost', { text: text.value, visibility: vis.value, photo });
      if (r.post.photoId && photo) rememberPhoto(r.post.photoId, photo);
      text.value = ''; photo = null; thumb.hidden = true; toast(t('פורסם'));
      onPosted();
    } catch (ex: any) { toast(ex.message); }
    (post as HTMLButtonElement).disabled = false;
  } },
    h('div', { class: 'composer-top' }, avatar(u.name, u.photoId, 40), text),
    thumb,
    h('div', { class: 'composer-bar' },
      h('button', { class: 'btn', type: 'button', onclick: async () => {
        const f = await pickImage(); if (!f) return;
        try { photo = await fileToDataUrl(f); thumb.replaceChildren(h('img', { src: photo, alt: '' }), h('button', { class: 'icon-btn sm', type: 'button', 'aria-label': t('הסר תמונה'), onclick: () => { photo = null; thumb.hidden = true; } }, '✕')); thumb.hidden = false; }
        catch (ex: any) { toast(ex.message); }
      } }, '📷 ', t('תמונה')),
      h('button', { class: 'btn', type: 'button', onclick: () => openShareAchievement(onPosted) }, '🏅 ', t('הישג')),
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

export function renderFeed(root: HTMLElement, tab: 'posts' | 'events'): void {
  const box = h('div', { class: 'stack' });
  const seg = h('div', { class: 'seg feed-tabs', role: 'group', 'aria-label': t('קהילה') },
    h('a', { href: HASH.feed, 'aria-current': tab === 'posts' ? 'page' : undefined }, '💬 ', t('פיד')),
    h('a', { href: HASH.events, 'aria-current': tab === 'events' ? 'page' : undefined }, '🏁 ', t('תחרויות')));
  root.replaceChildren(seg, box);
  if (tab === 'events') return eventsTab(box);

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
      list.replaceChildren(...(posts.length ? posts.map((p) => postCard(p, () => load())) : [h('section', { class: 'card empty' },
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
  box.replaceChildren(composer(() => load()), filter, list, moreBtn,
    h('p', { class: 'hint' }, t('"חברים" הם מי שהזמנת לאפליקציה ומי שהזמין אותך. אפשר לדווח על תוכן לא הולם דרך ⋯.')));
  load();
  void navigate;
}
