/**
 * Music: connect Spotify (PKCE, no secret needed) to see your playlists and play them on your
 * Spotify device from inside the app (playback control needs Spotify Premium), or paste any
 * Spotify / Apple Music link to get an embedded player.
 */
import { call, hasBackend } from './api';
import { getSettings, updateSettings } from './store';

const KEY = 'mishmaat-spotify';
const PKCE = 'mishmaat-spotify-pkce';
const SCOPES = 'user-read-playback-state user-modify-playback-state user-read-currently-playing playlist-read-private playlist-read-collaborative';
const redirectUri = () => location.origin + location.pathname;

interface Tokens { access: string; refresh: string; exp: number }
let clientId = '';
export async function spotifyClientId(): Promise<string> {
  if (clientId || !hasBackend()) return clientId;
  try { const { config } = await call<{ config: { spotifyClientId?: string } }>('siteConfig'); clientId = config.spotifyClientId || ''; } catch { /* offline */ }
  return clientId;
}

const b64url = (buf: ArrayBuffer) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
function randomString(n = 64) {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-._~';
  return Array.from(crypto.getRandomValues(new Uint8Array(n)), (x) => chars[x % chars.length]).join('');
}

function load(): Tokens | null { try { return JSON.parse(localStorage.getItem(KEY) || 'null'); } catch { return null; } }
function save(t: Tokens | null) { try { if (t) localStorage.setItem(KEY, JSON.stringify(t)); else localStorage.removeItem(KEY); } catch { /* ignore */ } }
export const spotifyConnected = () => !!load();
export const disconnectSpotify = () => save(null);

export async function connectSpotify(): Promise<void> {
  const id = await spotifyClientId();
  if (!id) throw new Error('החיבור ל-Spotify עוד לא הוגדר באפליקציה');
  const verifier = randomString(64), state = randomString(16);
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)));
  sessionStorage.setItem(PKCE, JSON.stringify({ verifier, state }));
  const q = new URLSearchParams({ client_id: id, response_type: 'code', redirect_uri: redirectUri(), code_challenge_method: 'S256', code_challenge: challenge, scope: SCOPES, state });
  location.href = 'https://accounts.spotify.com/authorize?' + q;
}

async function tokenRequest(body: Record<string, string>): Promise<Tokens> {
  const r = await fetch('https://accounts.spotify.com/api/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body: new URLSearchParams(body) });
  const j = await r.json();
  if (!r.ok || !j.access_token) throw new Error('החיבור ל-Spotify נכשל');
  const prev = load();
  return { access: j.access_token, refresh: j.refresh_token || prev?.refresh || '', exp: Date.now() + (j.expires_in - 60) * 1000 };
}

/** Back from Spotify's login page: finish the connection. Returns true if it handled a redirect. */
export async function handleSpotifyRedirect(): Promise<boolean> {
  const q = new URLSearchParams(location.search);
  if (!q.get('state')) return false;
  let pk: { verifier: string; state: string } | null = null;
  try { pk = JSON.parse(sessionStorage.getItem(PKCE) || 'null'); } catch { /* ignore */ }
  if (!pk || pk.state !== q.get('state')) return false;
  sessionStorage.removeItem(PKCE);
  history.replaceState(null, '', location.pathname + '#music');
  if (!q.get('code')) return true;
  save(await tokenRequest({ grant_type: 'authorization_code', code: q.get('code')!, redirect_uri: redirectUri(), client_id: await spotifyClientId(), code_verifier: pk.verifier }));
  return true;
}

async function token(): Promise<string> {
  const t = load();
  if (!t) throw new Error('Spotify לא מחובר');
  if (t.exp > Date.now()) return t.access;
  const n = await tokenRequest({ grant_type: 'refresh_token', refresh_token: t.refresh, client_id: await spotifyClientId() });
  save(n);
  return n.access;
}

/** Spotify's own error text, e.g. "Insufficient client scope" or "Check settings on developer.spotify.com/dashboard, the user may not be registered." */
async function spotifyError(r: Response): Promise<string> {
  try { const j = await r.clone().json(); return String(j?.error?.message || j?.error_description || j?.error || ''); } catch { return ''; }
}

async function api<T = any>(path: string, opts: RequestInit = {}): Promise<T | null> {
  let r: Response;
  try {
    r = await fetch('https://api.spotify.com/v1' + path, { ...opts, headers: { Authorization: 'Bearer ' + await token(), 'Content-Type': 'application/json' } });
  } catch {
    throw new Error('אין חיבור ל-Spotify. בדקו את האינטרנט ונסו שוב.');
  }
  if (r.status === 204 || r.status === 202) return null;
  const detail = r.ok ? '' : await spotifyError(r);
  if (r.status === 401) { save(null); throw new Error('החיבור ל-Spotify פג, צריך להתחבר מחדש'); }
  if (r.status === 403) {
    if (/registered|user may not|developer\.spotify/i.test(detail)) throw new Error('החשבון הזה לא רשום באפליקציית ה-Spotify. מוסיפים אותו ב-developer.spotify.com ← האפליקציה ← Settings ← User Management.');
    if (/premium/i.test(detail) || path.startsWith('/me/player')) throw new Error('שליטה בניגון דורשת Spotify Premium. אפשר לנגן דרך הנגן המוטמע.');
    throw new Error('Spotify חסם את הבקשה (403)' + (detail ? ': ' + detail : ''));
  }
  if (r.status === 404 && path.startsWith('/me/player')) throw new Error('פתחו את Spotify בטלפון או במחשב, ואז נסו שוב');
  if (r.status === 429) throw new Error('יותר מדי בקשות ל-Spotify. נסו שוב בעוד דקה.');
  if (!r.ok) throw new Error(`Spotify לא זמין כרגע (${r.status}${detail ? ': ' + detail : ''})`);
  const txt = await r.text();
  return txt ? JSON.parse(txt) : null;
}

export interface Playlist { id: string; name: string; uri: string; image: string; tracks: number }
export async function myPlaylists(): Promise<Playlist[]> {
  const j = await api<{ items: any[] }>('/me/playlists?limit=40');
  return (j?.items ?? []).filter(Boolean).map((p) => ({ id: p.id, name: p.name, uri: p.uri, image: p.images?.[0]?.url ?? '', tracks: p.tracks?.total ?? p.items?.total ?? -1 }));
}
export interface NowPlaying { title: string; artist: string; image: string; playing: boolean }
export async function nowPlaying(): Promise<NowPlaying | null> {
  const j = await api<any>('/me/player/currently-playing');
  if (!j?.item) return null;
  return { title: j.item.name, artist: (j.item.artists ?? []).map((a: any) => a.name).join(', '), image: j.item.album?.images?.[2]?.url ?? j.item.album?.images?.[0]?.url ?? '', playing: !!j.is_playing };
}
/** Thrown when no Spotify app is open anywhere to play on. */
export class NoDeviceError extends Error {}
/** Play on the active device; if none is active, wake the first available one; if there is none, NoDeviceError. */
export async function playContext(uri: string): Promise<void> {
  return playBody(JSON.stringify(uri.startsWith('spotify:track:') ? { uris: [uri] } : { context_uri: uri }));
}
async function playBody(body: string): Promise<void> {
  try { await api('/me/player/play', { method: 'PUT', body }); return; } catch (e: any) {
    if (!/פתחו את Spotify/.test(e.message)) throw e;
  }
  const d = await api<{ devices: { id: string; is_restricted: boolean }[] }>('/me/player/devices');
  const dev = (d?.devices ?? []).find((x) => !x.is_restricted);
  if (!dev) throw new NoDeviceError('no device');
  await api('/me/player/play?device_id=' + encodeURIComponent(dev.id), { method: 'PUT', body });
}
export interface Track { uri: string; id: string; name: string; artist: string; image: string }
export async function searchTracks(q: string): Promise<Track[]> {
  // Spotify lowered the max `limit` for apps in development mode; try smaller pages before giving up
  let j: { tracks: { items: any[] } } | null = null;
  for (const limit of ['10', '5', '']) {
    try { j = await api('/search?type=track' + (limit ? '&limit=' + limit : '') + '&q=' + encodeURIComponent(q)); break; }
    catch (e: any) { if (!/limit/i.test(String(e.message)) || !limit) throw e; }
  }
  return (j?.tracks?.items ?? []).filter(Boolean).map((x) => ({ uri: x.uri, id: x.id, name: x.name, artist: (x.artists ?? []).map((a: any) => a.name).join(', '), image: x.album?.images?.[2]?.url ?? x.album?.images?.[0]?.url ?? '' }));
}
export const resume = () => api('/me/player/play', { method: 'PUT' });
export const pause = () => api('/me/player/pause', { method: 'PUT' });
export const nextTrack = () => api('/me/player/next', { method: 'POST' });
export const prevTrack = () => api('/me/player/previous', { method: 'POST' });

/** An embeddable player for a Spotify or Apple Music link, or null if the link isn't one. */
export function embedUrl(link: string): string | null {
  const sp = /open\.spotify\.com\/(?:intl-[a-z]+\/)?(playlist|album|track|artist|show)\/([A-Za-z0-9]+)/.exec(link);
  if (sp) return `https://open.spotify.com/embed/${sp[1]}/${sp[2]}?utm_source=mishmaat`;
  const spUri = /^spotify:(playlist|album|track):([A-Za-z0-9]+)$/.exec(link.trim());
  if (spUri) return `https://open.spotify.com/embed/${spUri[1]}/${spUri[2]}`;
  const am = /music\.apple\.com\/(.+)$/.exec(link);
  if (am) return 'https://embed.music.apple.com/' + am[1].split('?')[0];
  return null;
}
export const savedLink = () => getSettings().musicLink ?? '';
export const saveLink = (l: string) => updateSettings({ musicLink: l });
