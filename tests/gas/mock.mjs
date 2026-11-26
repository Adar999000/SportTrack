/**
 * In-memory stand-ins for the Apps Script services used by apps-script/Code.gs,
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

export function createBackend({ openaiReply = 'תשובה לדוגמה', now } = {}) {
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
  const cache = new Map();
  const fetches = [];
  const backups = [];
  const triggers = [];
  const iter = (arr) => { let i = 0; return { hasNext: () => i < arr.length, next: () => arr[i++] }; };
  const folderApi = () => ({
    getName: () => 'תמונות',
    createFile: (blob) => {
      const id = 'file-' + (files.size + 1);
      files.set(id, { bytes: blob.getBytes(), type: blob.type, trashed: false });
      return { getId: () => id };
    },
    getFoldersByName: () => iter([folderApi()]),
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
    CacheService: { getScriptCache: () => ({ get: (k) => cache.get(k) ?? null, put: (k, v) => cache.set(k, v), remove: (k) => cache.delete(k) }) },
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
      newTrigger: (h) => { const b = { timeBased: () => b, everyDays: () => b, atHour: () => b, create: () => triggers.push(h) }; return b; },
    },
    UrlFetchApp: {
      fetch: (url, opts = {}) => {
        fetches.push({ url, opts });
        return {
          getResponseCode: () => 200,
          getContentText: () => {
            const msg = typeof openaiReply === 'function' ? openaiReply(JSON.parse(opts.payload)) : { content: openaiReply };
            return JSON.stringify({ choices: [{ message: msg }], usage: { prompt_tokens: 2000, completion_tokens: 300 } });
          },
        };
      },
    },
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
  vm.runInContext(readFileSync(new URL('../../apps-script/Code.gs', import.meta.url), 'utf8'), ctx);

  const post = (body) => JSON.parse(ctx.doPost({ postData: { contents: JSON.stringify(body) } }).text);
  const run = (fn) => ctx[fn]();
  return { post, sheets, files, properties, fetches, mails, backups, triggers, run };
}
