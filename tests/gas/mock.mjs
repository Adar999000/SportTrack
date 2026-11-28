/**
 * In-memory stand-ins for the Apps Script services used by apps-script/server.js (and the Code.gs loader),
 * so the real backend code can run under Node (tests + local mock server).
 */
import { createHash, createHmac, randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const signed = (buf) => Array.from(buf, (b) => (b > 127 ? b - 256 : b));
const unsigned = (arr) => Buffer.from(arr.map((b) => (b < 0 ? b + 256 : b)));
const toBuf = (v) => (typeof v === 'string' ? Buffer.from(v, 'utf8') : unsigned(v));

class Sheet {
  constructor(name, header, maxRows = 1000) {
    this.name = name;
    this.data = [header];
    this.maxRows = maxRows;
  }
  getLastRow() { return this.data.length; }
  getLastColumn() { return Math.max(...this.data.map((r) => r.length)); }
  getMaxRows() { return this.maxRows; }
  insertRowsAfter(_after, n) { this.maxRows += n; }
  deleteRow(r) { this.data.splice(r - 1, 1); }
  getRange(row, col, nr = 1, nc = 1) {
    if (typeof row === 'string') return { setNumberFormat() {} };
    if (row + nr - 1 > this.maxRows) throw new Error('The coordinates of the range are outside the dimensions of the sheet.');
    const sh = this;
    return {
      getValues() {
        return Array.from({ length: nr }, (_, i) => Array.from({ length: nc }, (_, j) => sh.data[row - 1 + i]?.[col - 1 + j] ?? ''));
      },
      setValues(vals) {
        vals.forEach((r, i) => {
          sh.data[row - 1 + i] ??= [];
          r.forEach((v, j) => (sh.data[row - 1 + i][col - 1 + j] = v));
        });
      },
      setValue(v) { this.setValues([[v]]); },
      setNumberFormat() {},
    };
  }
}

export function createBackend({ openaiReply = 'תשובה לדוגמה', now, loader = false, serverSource } = {}) {
  const serverFile = () => serverSource ?? readFileSync(new URL('../../apps-script/server.js', import.meta.url), 'utf8');
  const textFiles = new Map(); // Drive text files by name (the loader's last good copy)
  let githubDown = false;
  const sheets = {
    Users: new Sheet('Users', ['userId', 'email', 'name', 'role', 'passHash', 'salt', 'createdAt', 'lastSeen', 'photoId', 'profile', 'extra']),
    Weeks: new Sheet('Weeks', ['userId', 'sundayDate', 'startWeight', 'workouts', 'mealsPct', 'photoId', 'updatedAt', 'data']),
    Invites: new Sheet('Invites', ['code', 'createdAt', 'usedBy', 'usedAt', 'createdBy', 'multi'], 200),
    Ledger: new Sheet('Ledger', ['userId', 'at', 'amount', 'ref', 'label']),
    Messages: new Sheet('Messages', ['id', 'userId', 'at', 'from', 'subject', 'text', 'status']),
    Audit: new Sheet('Audit', ['at', 'userId', 'event', 'detail'], 5000),
  };
  const files = new Map();
  const properties = new Map();
  properties.set('VERIFY_POSTING', '0');
  properties.set('TEAM_DRIP_N', '99'); // the team content calendar is tested on its own // tests opt in to email verification explicitly
  const cache = new Map();
  const fetches = [];
  const backups = [];
  const triggers = [];
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folderApi = () => ({
    getName: () => 'תמונות',
    createFile: (blob, content, mime) => {
      if (typeof blob === 'string') { textFiles.set(blob, String(content)); return { getId: () => 'txt-' + blob }; }
      const id = 'file-' + (files.size + 1);
      files.set(id, { bytes: blob.getBytes(), type: blob.type, trashed: false });
      return { getId: () => id };
    },
    getFoldersByName: () => iter([folderApi()]),
    getFilesByName: (name) => iter(textFiles.has(name) ? [{ setContent: (c) => textFiles.set(name, String(c)), getBlob: () => ({ getDataAsString: () => textFiles.get(name) }) }] : []),
    createFolder: () => folderApi(),
    getFiles: () => iter(backups.filter((b) => !b.trashed).map((b) => ({ getId: () => b.id, getName: () => b.name, getDateCreated: () => b.at }))),
  });
  const mails = [];

  const ctx = {
    console,
    SpreadsheetApp: { openById: () => ({ getSheetByName: (n) => sheets[n] ?? null, insertSheet: (n) => (sheets[n] = new Sheet(n, [])) }) },
    PropertiesService: {
      getScriptProperties: () => ({
        getProperty: (k) => properties.get(k) ?? null,
        setProperty: (k, v) => properties.set(k, String(v)),
      }),
    },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k),
      getAll: (keys) => Object.fromEntries(keys.filter((k) => cache.has(k)).map((k) => [k, cache.get(k)])), putAll: (o) => Object.entries(o).forEach(([k, v]) => cache.set(k, v)) }) },
    MailApp: { sendEmail: (m) => mails.push(m), getRemainingDailyQuota: () => 100 },
    Utilities: {
      DigestAlgorithm: { SHA_256: 'sha256' },
      Charset: { UTF_8: 'utf8' },
      computeDigest: (_alg, v) => signed(createHash('sha256').update(toBuf(v)).digest()),
      computeHmacSha256Signature: (v, key) => signed(createHmac('sha256', key).update(v).digest()),
      base64EncodeWebSafe: (b) => unsigned(b).toString('base64').replace(/\+/g, '-').replace(/\//g, '_'),
      base64Encode: (b) => unsigned(b).toString('base64'),
      base64Decode: (s) => signed(Buffer.from(s, 'base64')),
      newBlob: (v, type, name) => ({ getBytes: () => signed(toBuf(v)), type, name }),
      getUuid: () => randomUUID(),
      sleep() {},
      formatDate: (d, _tz, fmt) => (fmt.includes('HH') ? d.toISOString().slice(0, 19) : d.toISOString().slice(0, 10)),
    },
    DriveApp: {
      getFolderById: () => folderApi(),
      getFileById: (id) => {
        if (id === '1WFGw04Mk0v_jP_tUkjQxoMW4ha4KxlHGLwvjCL7WV4g') {
          return { makeCopy: (name) => { const cid = 'copy-' + (backups.length + 1); backups.push({ id: cid, name, at: new Date(Date.now() + backups.length * 1000), trashed: false }); return { getId: () => cid }; } };
        }
        const b = backups.find((x) => x.id === id);
        if (b) return { setTrashed: (t) => (b.trashed = t) };
        const f = files.get(id);
        if (!f) throw new Error('no file');
        return { setTrashed: (t) => (f.trashed = t), getBlob: () => ({ getContentType: () => f.type, getBytes: () => f.bytes }) };
      },
    },
    ScriptApp: {
      getProjectTriggers: () => triggers.map((h) => ({ getHandlerFunction: () => h })),
      newTrigger: (h) => { const b = { timeBased: () => b, everyDays: () => b, everyHours: () => b, atHour: () => b, create: () => triggers.push(h) }; return b; },
      getScriptId: () => 'script-123',
      getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/TEST/exec' }),
      getOAuthToken: () => 'oauth-token',
    },
    UrlFetchApp: {
      fetch: (url, opts = {}) => {
        fetches.push({ url, opts });
        // self-update: GitHub raw files come from this checkout; the Apps Script API answers with a version
        if (url.startsWith('https://raw.githubusercontent.com/')) {
          if (githubDown) return { getResponseCode: () => 503, getContentText: () => '' };
          return { getResponseCode: () => 200, getContentText: () => serverFile() };
        }
        if (url.startsWith('https://www.strava.com/oauth/token')) {
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify({ access_token: 'acc', refresh_token: 'ref', expires_at: Math.floor(Date.now() / 1000) + 3600, athlete: { firstname: 'דנה', lastname: 'כ' } }) };
        }
        if (url.startsWith('https://www.strava.com/api/v3/athlete/activities')) {
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify([
            { id: 11, name: 'ריצת בוקר', sport_type: 'Run', start_date: '2026-11-20T05:00:00Z', moving_time: 1800, distance: 5012.3, map: { summary_polyline: '_p~iF~ps|U_ulLnnqC' } },
            { id: 12, name: 'יוגה', sport_type: 'Yoga', start_date: '2026-11-21T05:00:00Z', moving_time: 1200, distance: 0, map: {} },
          ]) };
        }
        if (url.startsWith('https://script.googleapis.com/')) {
          const web = (id, v) => ({ deploymentId: id, deploymentConfig: { versionNumber: v }, entryPoints: [{ entryPointType: 'WEB_APP' }] });
          const body = url.includes('/versions?') ? { versions: [{ versionNumber: 5 }, { versionNumber: 6 }] }
            : url.endsWith('/versions') ? { versionNumber: 7 }
            : url.endsWith('/deployments') && (opts.method || 'get') === 'get'
              ? { deployments: [{ deploymentId: 'HEAD', deploymentConfig: {} }, web('old-url', 3), web('new-url', 7)] } : {};
          return { getResponseCode: () => 200, getContentText: () => JSON.stringify(body) };
        }
        return {
          getResponseCode: () => 200,
          getContentText: () => {
            const msg = typeof openaiReply === 'function' ? openaiReply(JSON.parse(opts.payload)) : { content: openaiReply };
            return JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 2000, completion_tokens: 300 } });
          },
        };
      },
    },
    HtmlService: { createHtmlOutput: (html) => ({ html, setTitle() { return this; } }) },
    ContentService: {
      MimeType: { JSON: 'json' },
      createTextOutput: (text) => ({ text, setMimeType() { return this; } }),
    },
    Logger: { log() {} },
  };
  if (now) {
    const RealDate = Date;
    // `now` may be a fixed date or a function (a clock the test can move)
    const at = () => new RealDate(typeof now === 'function' ? now() : now).getTime();
    ctx.Date = class extends RealDate { constructor(...a) { super(...(a.length ? a : [at()])); } static now() { return at(); } };
  }
  vm.createContext(ctx);
  vm.runInContext(loader ? readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8') : serverFile(), ctx);

  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const run = (fn) => ctx[fn]();
  const get = (parameter) => ctx.doGet({ parameter });
  const setServerSource = (src) => { serverSource = src; };
  const setGithubDown = (v) => { githubDown = v; };
  /** A new request: Apps Script runs the files fresh each time (the loader keeps nothing in memory). */
  const newRequest = () => vm.runInContext('loadedServer = null;', ctx);
  return { post, get, sheets, files, properties, fetches, mails, backups, triggers, run, cache, textFiles, setServerSource, setGithubDown, newRequest };
}
