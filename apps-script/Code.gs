/**
 * משמעת אישית — server loader. Paste this file into Apps Script once; it never needs to change.
 *
 * The real server code is apps-script/server.js on GitHub. This loader fetches it, caches it for
 * 10 minutes, keeps the last working copy in Drive (used if GitHub is unreachable or a new file is
 * broken) and runs it. So every push to GitHub updates the server by itself, with no redeploy.
 */
const SERVER_SOURCE = 'https://raw.githubusercontent.com/Adar999000/SportTrack/claude/personal-discipline-pwa-13qhdk/apps-script/server.js';
const LOADER_FOLDER_ID = '1MzmupyDmqJpvHMKCBcr8nH6RQJvzggRt'; // the app's Drive folder
const LOADER_FILE = 'server-last-good.js';
const LOADER_TTL = 600; // seconds
const LOADER_CHUNK = 90000; // cache values are limited to 100 KB
const LOADER_ENTRY = ['doGet', 'doPost', 'setup', 'backupNow', 'autoUpdate'];
let loadedServer = null;

/** Runs the server source in its own scope and returns its entry points (throws if it's broken). */
function compileServer(src) {
  if (src.indexOf('function doPost') < 0 || src.indexOf('function route') < 0) throw new Error('server source looks incomplete');
  const exportsList = LOADER_ENTRY.map((n) => n + ': typeof ' + n + " === 'function' ? " + n + ' : null').join(', ');
  return new Function(src + '\n;return { ' + exportsList + ' };')();
}

function cachedSource() {
  const c = CacheService.getScriptCache();
  const n = Number(c.get('srv:n'));
  if (!n) return null;
  const keys = [];
  for (let i = 0; i < n; i++) keys.push('srv:' + i);
  const parts = c.getAll(keys);
  if (keys.some((k) => parts[k] == null)) return null;
  return keys.map((k) => parts[k]).join('');
}

function cacheSource(src) {
  const c = CacheService.getScriptCache();
  const values = {};
  let n = 0;
  for (let i = 0; i < src.length; i += LOADER_CHUNK) values['srv:' + n++] = src.slice(i, i + LOADER_CHUNK);
  c.putAll(values, LOADER_TTL);
  c.put('srv:n', String(n), LOADER_TTL);
}

function goodCopy() {
  const it = DriveApp.getFolderById(LOADER_FOLDER_ID).getFilesByName(LOADER_FILE);
  return it.hasNext() ? it.next() : null;
}

function saveGoodCopy(src) {
  const p = PropertiesService.getScriptProperties();
  const hash = Utilities.base64Encode(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, src, Utilities.Charset.UTF_8));
  if (p.getProperty('SERVER_HASH') === hash) return false;
  const f = goodCopy();
  if (f) f.setContent(src);
  else DriveApp.getFolderById(LOADER_FOLDER_ID).createFile(LOADER_FILE, src, 'text/plain');
  p.setProperty('SERVER_HASH', hash);
  p.setProperty('SERVER_LOADED_AT', new Date().toISOString());
  return true;
}

/** The server, loaded once per request: cache → GitHub → last good copy in Drive. */
function server() {
  if (loadedServer) return loadedServer;
  const cached = cachedSource();
  if (cached) {
    try { loadedServer = compileServer(cached); return loadedServer; } catch (e) { /* fetch a fresh copy */ }
  }
  try {
    const r = UrlFetchApp.fetch(SERVER_SOURCE + '?t=' + Date.now(), { muteHttpExceptions: true });
    if (r.getResponseCode() === 200) {
      const src = r.getContentText();
      loadedServer = compileServer(src); // a broken file throws here and never replaces the good copy
      cacheSource(src);
      saveGoodCopy(src);
      return loadedServer;
    }
  } catch (e) { /* GitHub unreachable or the new code is broken: use the last good copy */ }
  const f = goodCopy();
  if (!f) throw new Error('השרת לא הצליח לטעון את הקוד');
  const src = f.getBlob().getDataAsString();
  loadedServer = compileServer(src);
  cacheSource(src);
  return loadedServer;
}

/** Fetch the newest code now (used by Admin → Server → "Update now" and the hourly trigger). */
function loaderRefresh() {
  const c = CacheService.getScriptCache();
  c.remove('srv:n');
  const r = UrlFetchApp.fetch(SERVER_SOURCE + '?t=' + Date.now(), { muteHttpExceptions: true });
  if (r.getResponseCode() !== 200) return { updated: false, error: 'GitHub ' + r.getResponseCode() };
  const src = r.getContentText();
  try { compileServer(src); } catch (e) { return { updated: false, error: 'הקוד החדש לא תקין, השרת ממשיך בגרסה הקודמת' }; }
  cacheSource(src);
  const changed = saveGoodCopy(src);
  return changed ? { updated: true } : { updated: false, upToDate: true };
}

function doGet(e) { return server().doGet(e); }
function doPost(e) { return server().doPost(e); }
function setup() { return server().setup(); }
function backupNow() { return server().backupNow(); }
function autoUpdate() { try { loaderRefresh(); } catch (e) { Logger.log(e); } }
