import { h, toast } from './dom';
import { t } from '../i18n';
import { icon } from './icons';
import {
  connectSpotify, disconnectSpotify, searchTracks, embedUrl, myPlaylists, nextTrack, nowPlaying, pause, playContext, prevTrack,
  resume, savedLink, saveLink, spotifyClientId, spotifyConnected, NoDeviceError, type NowPlaying,
} from '../music';

const run = (p: Promise<unknown>) => p.catch((e) => toast(e.message));
const svg = (d: string) => { const el = document.createElementNS('http://www.w3.org/2000/svg', 'svg'); el.setAttribute('viewBox', '0 0 24 24'); el.setAttribute('width', '22'); el.setAttribute('height', '22'); el.setAttribute('fill', 'currentColor'); el.setAttribute('aria-hidden', 'true'); el.innerHTML = `<path d="${d}"/>`; return el; };
// media icons are never mirrored (as in every player); the three buttons sit left-to-right in their own group
const ICON = {
  play: 'M8 5v14l11-7z',
  pause: 'M7 5h3.5v14H7zM13.5 5H17v14h-3.5z',
  next: 'M6 6l8.5 6L6 18zM16 6h2v12h-2z',
  prev: 'M18 6l-8.5 6L18 18zM6 6h2v12H6z',
};

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
    h('div', { class: 'mp-ctl' },
      h('button', { class: 'mp-btn', type: 'button', 'aria-label': t('הקודם'), onclick: () => run(prevTrack().then(refresh)) }, svg(ICON.prev)),
      h('button', { class: 'mp-btn mp-play', type: 'button', 'aria-label': np?.playing ? t('השהיה') : t('ניגון'), onclick: () => run((np?.playing ? pause() : resume()).then(refresh)) }, svg(np?.playing ? ICON.pause : ICON.play)),
      h('button', { class: 'mp-btn', type: 'button', 'aria-label': t('הבא'), onclick: () => run(nextTrack().then(refresh)) }, svg(ICON.next))),
  );
  const refresh = () => new Promise((r) => setTimeout(r, 450)).then(nowPlaying).then((x) => { np = x; draw(); }).catch(() => draw());
  draw();
  nowPlaying().then((x) => { np = x; draw(); }).catch(() => { /* not playing / no device */ });
  const timer = setInterval(() => { if (!bar.isConnected) clearInterval(timer); else nowPlaying().then((x) => { np = x; draw(); }).catch(() => {}); }, 15000);
  return bar;
}

/** Search Spotify and play a song (or open it in Spotify when nothing is playing anywhere). */
function searchBox(openBox: HTMLElement, preview: HTMLElement): HTMLElement {
  const input = h('input', { class: 'input', type: 'search', id: 'sp-search', placeholder: t('חיפוש שיר או אמן…'), enterkeyhint: 'search', autocomplete: 'off' }) as HTMLInputElement;
  const results = h('ul', { class: 'track-list', 'aria-live': 'polite' });
  let timer = 0;
  const search = async () => {
    const q = input.value.trim();
    if (q.length < 2) { results.replaceChildren(); return; }
    try {
      const list = await searchTracks(q);
      results.replaceChildren(...(list.length ? list.map((tr0) => h('li', null, h('button', { class: 'track', type: 'button', onclick: async () => {
        try { await playContext(tr0.uri); toast(t('מנגן: ') + tr0.name); }
        catch (e: any) {
          if (!(e instanceof NoDeviceError)) { toast(e.message); return; }
          const link = 'https://open.spotify.com/track/' + tr0.id;
          window.open(link, '_blank', 'noopener');
          openBox.replaceChildren(h('a', { class: 'btn btn-primary spotify-btn', href: link, target: '_blank', rel: 'noopener' }, t('פתיחה ב-Spotify')));
          preview.replaceChildren(embed(link, true));
        }
      } },
        tr0.image ? h('img', { src: tr0.image, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-art-empty' }, icon('music')),
        h('span', { class: 'mp-meta' }, h('b', null, tr0.name), h('span', { class: 'muted small' }, tr0.artist)),
        svg(ICON.play)))) : [h('li', { class: 'muted' }, t('לא נמצאו שירים.'))]));
    } catch (e: any) { results.replaceChildren(h('li', { class: 'form-error' }, e.message)); }
  };
  input.addEventListener('input', () => { clearTimeout(timer); timer = window.setTimeout(search, 350); });
  return h('div', { class: 'stack' }, h('label', { class: 'sr-only', for: 'sp-search' }, t('חיפוש שיר או אמן')), input, results);
}

export function renderMusic(main: HTMLElement): void {
  const preview = h('div', null, embed(savedLink()));
  const spotify = h('section', { class: 'card stack' });
  const drawSpotify = async () => {
    if (spotifyConnected()) {
      const list = h('div', { class: 'playlist-grid' }, h('p', { class: 'muted' }, t('טוען…')));
      const spotifyOpen = h('div', { class: 'stack', 'aria-live': 'polite' });
      spotify.replaceChildren(
        h('div', { class: 'row-between' }, h('h2', { class: 'section-title' }, 'Spotify'),
          h('button', { class: 'link-btn', type: 'button', onclick: () => { disconnectSpotify(); drawSpotify(); } }, t('ניתוק'))),
        miniPlayer(),
        spotifyOpen,
        searchBox(spotifyOpen, preview),
        h('h3', { class: 'section-title' }, t('הפלייליסטים שלך')),
        list,
        h('p', { class: 'hint' }, t('הניגון יוצא מאפליקציית Spotify שפתוחה אצלך (טלפון, מחשב או רמקול). שליטה מכאן דורשת Premium.')),
      );
      myPlaylists().then((pls) => list.replaceChildren(...(pls.length ? pls.map((p) =>
        h('button', { class: 'playlist', type: 'button', onclick: async () => {
          const link = 'https://open.spotify.com/playlist/' + p.id;
          saveLink(link);
          try { await playContext(p.uri); toast(t('מנגן: ') + p.name); }
          catch (e: any) {
            if (!(e instanceof NoDeviceError)) { toast(e.message); return; }
            // nothing is open to play on: open the playlist in the Spotify app, and keep the embedded player here
            // (iPhone blocks opening apps after a network wait, so also offer a real tap-to-open link)
            const w = window.open(link, '_blank', 'noopener');
            spotifyOpen.replaceChildren(h('p', { class: 'muted' }, t('אין מכשיר שמנגן כרגע. פותחים את Spotify על הפלייליסט, ואז הכפתורים כאן ישלטו בניגון.')),
              h('a', { class: 'btn btn-primary spotify-btn', href: link, target: '_blank', rel: 'noopener' }, t('פתיחה ב-Spotify')));
            if (!w) toast(t('לחצו "פתיחה ב-Spotify"'));
            preview.replaceChildren(embed(link));
          }
        } },
          p.image ? h('img', { src: p.image, alt: '', loading: 'lazy' }) : h('span', { class: 'mp-art-empty' }, icon('music')),
          h('b', null, p.name), p.tracks >= 0 ? h('span', { class: 'muted small' }, t('{0} שירים').replace('{0}', String(p.tracks))) : '')) : [h('p', { class: 'muted' }, t('אין פלייליסטים בחשבון.'))])))
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
