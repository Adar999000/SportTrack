import { h, toast } from './dom';
import { t } from '../i18n';
import { icon } from './icons';
import {
  connectSpotify, disconnectSpotify, embedUrl, myPlaylists, nextTrack, nowPlaying, pause, playContext, prevTrack,
  resume, savedLink, saveLink, spotifyClientId, spotifyConnected, type NowPlaying,
} from '../music';

const run = (p: Promise<unknown>) => p.catch((e) => toast(e.message));

function embed(link: string, compact = false): HTMLElement | '' {
  const url = embedUrl(link);
  if (!url) return '';
  return h('iframe', {
    class: 'music-embed', src: url, title: t('נגן מוזיקה'), loading: 'lazy',
    allow: 'autoplay; clipboard-write; encrypted-media; fullscreen; picture-in-picture',
    style: { height: compact ? '152px' : '352px' },
  });
}

/** Small now-playing bar with prev / play-pause / next. Used on the music screen and while recording a workout. */
export function miniPlayer(): HTMLElement {
  const bar = h('div', { class: 'mini-player', role: 'group', 'aria-label': t('נגן מוזיקה') });
  if (!spotifyConnected()) {
    const link = savedLink();
    if (link && embedUrl(link)) bar.append(embed(link, true));
    else bar.append(h('a', { class: 'link-btn', href: '#music' }, icon('music'), ' ', t('חברו מוזיקה לאימון')));
    return bar;
  }
  let np: NowPlaying | null = null;
  const draw = () => bar.replaceChildren(
    np?.image ? h('img', { src: np.image, alt: '', class: 'mp-art' }) : h('span', { class: 'mp-art mp-art-empty' }, icon('music')),
    h('div', { class: 'mp-meta' }, h('b', null, np?.title ?? t('שום דבר לא מתנגן')), h('span', { class: 'muted small' }, np?.artist ?? t('בחרו פלייליסט'))),
    h('button', { class: 'mp-btn', type: 'button', 'aria-label': t('הקודם'), onclick: () => run(prevTrack().then(refresh)) }, '⏮'),
    h('button', { class: 'mp-btn mp-play', type: 'button', 'aria-label': np?.playing ? t('השהיה') : t('ניגון'), onclick: () => run((np?.playing ? pause() : resume()).then(refresh)) }, np?.playing ? '⏸' : '▶'),
    h('button', { class: 'mp-btn', type: 'button', 'aria-label': t('הבא'), onclick: () => run(nextTrack().then(refresh)) }, '⏭'),
  );
  const refresh = () => new Promise((r) => setTimeout(r, 450)).then(nowPlaying).then((x) => { np = x; draw(); }).catch(() => draw());
  draw();
  nowPlaying().then((x) => { np = x; draw(); }).catch(() => { /* not playing / no device */ });
  const timer = setInterval(() => { if (!bar.isConnected) clearInterval(timer); else nowPlaying().then((x) => { np = x; draw(); }).catch(() => {}); }, 15000);
  return bar;
}

export function renderMusic(main: HTMLElement): void {
  const spotify = h('section', { class: 'card stack' });
  const drawSpotify = async () => {
    if (spotifyConnected()) {
      const list = h('div', { class: 'playlist-grid' }, h('p', { class: 'muted' }, t('טוען…')));
      spotify.replaceChildren(
        h('div', { class: 'row-between' }, h('h2', { class: 'section-title' }, 'Spotify'),
          h('button', { class: 'link-btn', type: 'button', onclick: () => { disconnectSpotify(); drawSpotify(); } }, t('ניתוק'))),
        miniPlayer(),
        h('h3', { class: 'section-title' }, t('הפלייליסטים שלך')),
        list,
        h('p', { class: 'hint' }, t('הניגון יוצא מאפליקציית Spotify שפתוחה אצלך (טלפון, מחשב או רמקול). שליטה מכאן דורשת Premium.')),
      );
      myPlaylists().then((pls) => list.replaceChildren(...(pls.length ? pls.map((p) =>
        h('button', { class: 'playlist', type: 'button', onclick: () => run(playContext(p.uri).then(() => { toast(t('מנגן: ') + p.name); saveLink('https://open.spotify.com/playlist/' + p.id); })) },
          p.image ? h('img', { src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-art-empty' }, icon('music')),
          h('b', null, p.name), h('span', { class: 'muted small' }, t('{0} שירים').replace('{0}', String(p.tracks))))) : [h('p', { class: 'muted' }, t('אין פלייליסטים בחשבון.'))])))
        .catch((e) => list.replaceChildren(h('p', { class: 'form-error' }, e.message)));
      return;
    }
    const id = await spotifyClientId();
    spotify.replaceChildren(
      h('h2', { class: 'section-title' }, 'Spotify'),
      h('p', null, t('מתחברים פעם אחת עם החשבון שלכם, ואז רואים כאן את הפלייליסטים ומנגנים אותם תוך כדי אימון.')),
      id
        ? h('button', { class: 'btn btn-primary spotify-btn', type: 'button', onclick: () => run(connectSpotify()) }, t('התחברות עם Spotify'))
        : h('p', { class: 'hint' }, t('החיבור ל-Spotify יופעל בקרוב. בינתיים אפשר להדביק קישור לפלייליסט למטה.')),
    );
  };
  drawSpotify();

  const preview = h('div', null, embed(savedLink()));
  const input = h('input', { class: 'input', id: 'music-link', dir: 'ltr', placeholder: 'https://open.spotify.com/playlist/…', value: savedLink(), inputmode: 'url' }) as HTMLInputElement;
  const linkCard = h('section', { class: 'card stack' },
    h('h2', { class: 'section-title' }, t('פלייליסט לאימון')),
    h('p', { class: 'muted' }, t('הדביקו קישור מ-Spotify או Apple Music (שיר, אלבום או פלייליסט). הנגן יופיע גם במסך האימון.')),
    h('div', { class: 'field' }, h('label', { for: 'music-link' }, t('קישור')), input),
    h('div', { class: 'row' },
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => {
        const v = input.value.trim();
        if (v && !embedUrl(v)) { toast(t('זה לא נראה כמו קישור של Spotify או Apple Music')); return; }
        saveLink(v); preview.replaceChildren(embed(v)); toast(t('נשמר'));
      } }, t('שמירה')),
    ),
    preview,
  );
  main.replaceChildren(h('h1', { class: 'page-title' }, icon('music'), ' ', t('מוזיקה')), spotify, linkCard);
}
