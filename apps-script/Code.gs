/**
 * משמעת אישית — backend (Google Apps Script web app).
 *
 * Storage: the spreadsheet below (tabs Users, Weeks, Invites) + a Drive folder for photos.
 * Deploy: Deploy → New deployment → Web app → Execute as: Me, Who has access: Anyone.
 * Script properties (Project Settings → Script properties):
 *   OPENAI_API_KEY  (required for the chat bot)
 *   OPENAI_MODEL    (optional, default below)
 *   CHAT_DAILY_LIMIT (optional, messages per user per day, default 40)
 * A signing secret is created automatically on first run.
 */
const SPREADSHEET_ID = '1WFGw04Mk0v_jP_tUkjQxoMW4ha4KxlHGLwvjCL7WV4g';
const PHOTOS_FOLDER_ID = '1EY4VKDPQ9qHajt617AbW-odV3_3K31o7';
const DEFAULT_MODEL = 'gpt-4o-mini';
const TOKEN_DAYS = 120;
const HASH_ROUNDS = 1000;

const U = { id: 0, email: 1, name: 2, role: 3, hash: 4, salt: 5, created: 6, seen: 7, photo: 8, profile: 9 };
const W = { user: 0, sunday: 1, weight: 2, workouts: 3, meals: 4, photo: 5, updated: 6, data: 7 };

// ------------------------------------------------------------------ entry points

function doPost(e) {
  let out;
  try {
    const req = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    out = route(req);
  } catch (err) {
    out = { error: String((err && err.message) || err) };
  }
  return ContentService.createTextOutput(JSON.stringify(out)).setMimeType(ContentService.MimeType.JSON);
}

function doGet() {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, app: 'mishmaat-ishit' }))
    .setMimeType(ContentService.MimeType.JSON);
}

function route(req) {
  const a = req.action;
  if (a === 'register') return register(req);
  if (a === 'login') return login(req);
  if (a === 'status') return { ok: true, hasUsers: sheet('Users').getLastRow() > 1 };

  const me = auth(req.token);
  touch(me);
  switch (a) {
    case 'me': return { user: publicUser(me) };
    case 'updateProfile': return updateProfile(me, req);
    case 'changePassword': return changePassword(me, req);
    case 'getWeeks': return { weeks: weeksOf(targetId(me, req.userId), Number(req.since) || 0) };
    case 'putWeeks': return putWeeks(me, req.weeks || []);
    case 'setWeekPhoto': return setWeekPhoto(me, req);
    case 'getPhoto': return getPhoto(me, req.photoId);
    case 'chat': return chat(me, req);
    // admin
    case 'listUsers': requireAdmin(me); return { users: listUsers() };
    case 'createInvite': requireAdmin(me); return createInvite();
    case 'listInvites': requireAdmin(me); return { invites: listInvites() };
    case 'setRole': requireAdmin(me); return setRole(me, req);
    default: throw new Error('פעולה לא מוכרת');
  }
}

// ------------------------------------------------------------------ helpers

function sheet(name) {
  return SpreadsheetApp.openById(SPREADSHEET_ID).getSheetByName(name);
}

function rows(name) {
  const sh = sheet(name);
  const n = sh.getLastRow();
  if (n < 2) return [];
  return sh.getRange(2, 1, n - 1, sh.getLastColumn()).getValues().map((r) => r.map(cell));
}

/** Sheets may turn ISO strings into Date objects; give them back as text. */
function cell(v) {
  if (v instanceof Date) {
    const iso = Utilities.formatDate(v, 'Asia/Jerusalem', "yyyy-MM-dd'T'HH:mm:ss");
    return iso.slice(11) === '00:00:00' ? iso.slice(0, 10) : iso;
  }
  return v;
}

/** Make sure the sheet has room for `extra` more rows. */
function ensureRows(sh, extra) {
  const need = sh.getLastRow() + extra - sh.getMaxRows();
  if (need > 0) sh.insertRowsAfter(sh.getMaxRows(), need + 200);
}

function appendRows(sh, values) {
  if (!values.length) return;
  ensureRows(sh, values.length);
  const start = sh.getLastRow() + 1;
  sh.getRange(start, 1, values.length, values[0].length).setValues(values);
}

function props() {
  return PropertiesService.getScriptProperties();
}

function secret() {
  let s = props().getProperty('TOKEN_SECRET');
  if (!s) {
    s = Utilities.getUuid() + Utilities.getUuid();
    props().setProperty('TOKEN_SECRET', s);
  }
  return s;
}

function b64url(bytes) {
  return Utilities.base64EncodeWebSafe(bytes).replace(/=+$/, '');
}

function hashPassword(password, salt) {
  let h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, salt + ':' + password, Utilities.Charset.UTF_8);
  for (let i = 0; i < HASH_ROUNDS; i++) {
    h = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, h.concat(Utilities.newBlob(salt).getBytes()));
  }
  return b64url(h);
}

function sign(userId) {
  const exp = Date.now() + TOKEN_DAYS * 864e5;
  const payload = userId + '.' + exp;
  return payload + '.' + b64url(Utilities.computeHmacSha256Signature(payload, secret()));
}

function auth(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 3) throw new Error('AUTH: נדרשת התחברות');
  const payload = parts[0] + '.' + parts[1];
  const expected = b64url(Utilities.computeHmacSha256Signature(payload, secret()));
  if (expected !== parts[2] || Number(parts[1]) < Date.now()) throw new Error('AUTH: נדרשת התחברות מחדש');
  const u = findUser((r) => r[U.id] === parts[0]);
  if (!u) throw new Error('AUTH: המשתמש לא נמצא');
  return u;
}

function findUser(pred) {
  const all = rows('Users');
  for (let i = 0; i < all.length; i++) if (pred(all[i])) return { row: i + 2, r: all[i] };
  return null;
}

function parseJSON(s, fallback) {
  try { return s ? JSON.parse(s) : fallback; } catch (e) { return fallback; }
}

function publicUser(u) {
  return {
    userId: u.r[U.id], email: u.r[U.email], name: u.r[U.name], role: u.r[U.role],
    createdAt: u.r[U.created], lastSeen: u.r[U.seen], photoId: u.r[U.photo] || null,
    profile: parseJSON(u.r[U.profile], {}),
  };
}

function touch(u) {
  const now = new Date().toISOString();
  if (String(u.r[U.seen]).slice(0, 13) !== now.slice(0, 13)) {
    sheet('Users').getRange(u.row, U.seen + 1).setValue(now);
    u.r[U.seen] = now;
  }
}

function requireAdmin(u) {
  if (u.r[U.role] !== 'admin') throw new Error('אין הרשאת מנהל');
}

function targetId(me, userId) {
  if (!userId || userId === me.r[U.id]) return me.r[U.id];
  requireAdmin(me);
  return userId;
}

function normEmail(e) {
  return String(e || '').trim().toLowerCase();
}

function withLock(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

// ------------------------------------------------------------------ auth

function register(req) {
  const email = normEmail(req.email);
  const name = String(req.name || '').trim();
  const password = String(req.password || '');
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new Error('כתובת אימייל לא תקינה');
  if (password.length < 6) throw new Error('הסיסמה צריכה להיות לפחות 6 תווים');
  if (!name) throw new Error('נא למלא שם');

  return withLock(() => {
    const first = sheet('Users').getLastRow() < 2;
    if (findUser((r) => r[U.email] === email)) throw new Error('כבר קיים משתמש עם האימייל הזה');
    let inviteRow = null;
    if (!first) {
      const code = String(req.invite || '').trim().toUpperCase();
      const inv = rows('Invites');
      for (let i = 0; i < inv.length; i++) {
        if (String(inv[i][0]).toUpperCase() === code && !inv[i][2]) { inviteRow = i + 2; break; }
      }
      if (!inviteRow) throw new Error('קוד הזמנה לא תקין או שכבר נוצל');
    }
    const id = Utilities.getUuid().slice(0, 8);
    const salt = Utilities.getUuid();
    const now = new Date().toISOString();
    appendRows(sheet('Users'), [[id, email, name, first ? 'admin' : 'user', hashPassword(password, salt), salt, now, now, '', '{}']]);
    if (inviteRow) sheet('Invites').getRange(inviteRow, 3, 1, 2).setValues([[email, now]]);
    const u = findUser((r) => r[U.id] === id);
    return { token: sign(id), user: publicUser(u) };
  });
}

function login(req) {
  const email = normEmail(req.email);
  const u = findUser((r) => r[U.email] === email);
  if (!u || hashPassword(String(req.password || ''), u.r[U.salt]) !== u.r[U.hash]) {
    Utilities.sleep(800);
    throw new Error('אימייל או סיסמה שגויים');
  }
  return { token: sign(u.r[U.id]), user: publicUser(u) };
}

function changePassword(me, req) {
  if (hashPassword(String(req.oldPassword || ''), me.r[U.salt]) !== me.r[U.hash]) throw new Error('הסיסמה הנוכחית שגויה');
  if (String(req.newPassword || '').length < 6) throw new Error('הסיסמה צריכה להיות לפחות 6 תווים');
  const salt = Utilities.getUuid();
  sheet('Users').getRange(me.row, U.hash + 1, 1, 2).setValues([[hashPassword(req.newPassword, salt), salt]]);
  return { ok: true };
}

// ------------------------------------------------------------------ profile & photos

function savePhoto(dataUrl, name, oldId) {
  if (oldId) { try { DriveApp.getFileById(oldId).setTrashed(true); } catch (e) {} }
  if (!dataUrl) return '';
  const m = /^data:(image\/[a-z+]+);base64,(.+)$/.exec(dataUrl);
  if (!m) throw new Error('תמונה לא תקינה');
  const bytes = Utilities.base64Decode(m[2]);
  if (bytes.length > 3 * 1024 * 1024) throw new Error('התמונה גדולה מדי');
  const file = DriveApp.getFolderById(PHOTOS_FOLDER_ID).createFile(Utilities.newBlob(bytes, m[1], name));
  return file.getId();
}

function updateProfile(me, req) {
  const sh = sheet('Users');
  if (typeof req.name === 'string' && req.name.trim()) sh.getRange(me.row, U.name + 1).setValue(req.name.trim());
  if (req.profile && typeof req.profile === 'object') {
    const merged = Object.assign(parseJSON(me.r[U.profile], {}), req.profile);
    sh.getRange(me.row, U.profile + 1).setValue(JSON.stringify(merged));
  }
  if (req.photo !== undefined) {
    const id = savePhoto(req.photo, 'profile-' + me.r[U.id] + '.jpg', me.r[U.photo]);
    sh.getRange(me.row, U.photo + 1).setValue(id);
  }
  return { user: publicUser(findUser((r) => r[U.id] === me.r[U.id])) };
}

function getPhoto(me, photoId) {
  if (!photoId) throw new Error('חסר מזהה תמונה');
  // owner check: the photo must belong to the caller (profile or week) unless admin
  if (me.r[U.role] !== 'admin') {
    const mine = me.r[U.photo] === photoId ||
      rows('Weeks').some((r) => r[W.user] === me.r[U.id] && r[W.photo] === photoId);
    if (!mine) throw new Error('אין גישה לתמונה');
  }
  const blob = DriveApp.getFileById(photoId).getBlob();
  return { dataUrl: 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes()) };
}

// ------------------------------------------------------------------ weeks

function weeksOf(userId, since) {
  return rows('Weeks')
    .filter((r) => r[W.user] === userId && Number(r[W.updated]) > since)
    .map((r) => ({
      sundayDate: String(r[W.sunday]),
      updatedAt: Number(r[W.updated]),
      photoId: r[W.photo] || null,
      data: parseJSON(r[W.data], null),
    }))
    .filter((w) => w.data);
}

/** Upsert; a week is replaced only if the incoming updatedAt is newer. */
function putWeeks(me, weeks) {
  if (weeks.length > 400) throw new Error('יותר מדי שבועות בבקשה אחת');
  return withLock(() => {
    const sh = sheet('Weeks');
    const all = rows('Weeks');
    const index = {};
    all.forEach((r, i) => { if (r[W.user] === me.r[U.id]) index[String(r[W.sunday])] = i; });
    const appends = [];
    let accepted = 0;
    weeks.forEach((w) => {
      if (!/^\d{4}-\d{2}-\d{2}$/.test(w.sundayDate || '')) return;
      const s = w.summary || {};
      const row = [
        me.r[U.id], w.sundayDate,
        typeof s.startWeight === 'number' ? s.startWeight : '',
        typeof s.workouts === 'number' ? s.workouts : '',
        typeof s.mealsPct === 'number' ? s.mealsPct : '',
        '', Number(w.updatedAt) || Date.now(), JSON.stringify(w.data),
      ];
      const i = index[w.sundayDate];
      if (i === undefined) {
        appends.push(row);
        accepted++;
      } else if (Number(all[i][W.updated]) < row[W.updated]) {
        row[W.photo] = all[i][W.photo];
        sh.getRange(i + 2, 1, 1, row.length).setValues([row]);
        accepted++;
      }
    });
    appendRows(sh, appends);
    return { ok: true, accepted: accepted };
  });
}

function setWeekPhoto(me, req) {
  return withLock(() => {
    const all = rows('Weeks');
    let i = all.findIndex((r) => r[W.user] === me.r[U.id] && String(r[W.sunday]) === req.sundayDate);
    const sh = sheet('Weeks');
    if (i < 0) {
      if (!req.photo) return { photoId: null };
      appendRows(sh, [[me.r[U.id], req.sundayDate, '', '', '', '', Number(req.data && req.data.updatedAt) || Date.now(), JSON.stringify(req.data || null)]]);
      i = sh.getLastRow() - 2;
      all[i] = sh.getRange(i + 2, 1, 1, 8).getValues()[0];
    }
    const id = savePhoto(req.photo || null, 'week-' + me.r[U.id] + '-' + req.sundayDate + '.jpg', all[i][W.photo]);
    sh.getRange(i + 2, W.photo + 1).setValue(id);
    return { photoId: id || null };
  });
}

// ------------------------------------------------------------------ admin

function listUsers() {
  const weeks = rows('Weeks');
  return rows('Users').map((r) => {
    const mine = weeks.filter((w) => w[W.user] === r[U.id]).sort((a, b) => String(a[W.sunday]).localeCompare(String(b[W.sunday])));
    const weighed = mine.filter((w) => w[W.weight] !== '');
    return {
      userId: r[U.id], email: r[U.email], name: r[U.name], role: r[U.role],
      createdAt: r[U.created], lastSeen: r[U.seen], photoId: r[U.photo] || null,
      profile: parseJSON(r[U.profile], {}),
      weeks: mine.length,
      lastWeek: mine.length ? String(mine[mine.length - 1][W.sunday]) : null,
      firstWeight: weighed.length ? weighed[0][W.weight] : null,
      currentWeight: weighed.length ? weighed[weighed.length - 1][W.weight] : null,
      recentWorkouts: mine.slice(-4).reduce((s, w) => s + (Number(w[W.workouts]) || 0), 0),
      recentMealsPct: avg(mine.slice(-4).map((w) => w[W.meals]).filter((x) => x !== '')),
    };
  });
}

function avg(xs) {
  return xs.length ? Math.round(xs.reduce((a, b) => a + Number(b), 0) / xs.length) : null;
}

function createInvite() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code = '';
  for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)];
  appendRows(sheet('Invites'), [[code, new Date().toISOString(), '', '']]);
  return { code: code };
}

function listInvites() {
  return rows('Invites').map((r) => ({ code: r[0], createdAt: r[1], usedBy: r[2] || null, usedAt: r[3] || null }));
}

function setRole(me, req) {
  if (req.userId === me.r[U.id]) throw new Error('אי אפשר לשנות את התפקיד של עצמך');
  const u = findUser((r) => r[U.id] === req.userId);
  if (!u) throw new Error('המשתמש לא נמצא');
  sheet('Users').getRange(u.row, U.role + 1).setValue(req.role === 'admin' ? 'admin' : 'user');
  return { ok: true };
}

// ------------------------------------------------------------------ AI chat

const APP_GUIDE = [
  'האפליקציה "משמעת אישית" היא מעקב שבועי (ראשון עד שבת) אחר הרגלים ומשקל.',
  'שורות: ארוחת בוקר/צהריים/ערב בריאה (V=בוצע, X=לא בוצע, "-"=לא רלוונטי), פעילות ספורט (טקסט חופשי, X או "-"), ושורת "מעשן?" (כן/לא) אופציונלית.',
  'משקל התחלתי נרשם פעם בשבוע. חופשה ומנוחה לא נספרות כאימון. אחוז V מחושב רק מתאים V או X.',
  'במסכים: שבוע (טבלה + פאנל היום), היסטוריה, סטטיסטיקה (גרף משקל, רצפים, טבלה חודשית, מגמה רבעונית), פרופיל, והגדרות (ייבוא Word/JSON, ייצוא, תזכורות).',
].join('\n');

function weekLine(r) {
  const d = parseJSON(r[W.data], null);
  const sports = d && d.days ? d.days.map((x) => (x.sport && x.sport.status === 'V' ? x.sport.label || 'V' : null)).filter(Boolean) : [];
  return [
    String(r[W.sunday]),
    r[W.weight] !== '' ? 'משקל ' + r[W.weight] : 'ללא שקילה',
    'אימונים ' + (r[W.workouts] === '' ? '?' : r[W.workouts]),
    'ארוחות ' + (r[W.meals] === '' ? '?' : r[W.meals] + '%'),
    sports.length ? 'ספורט: ' + sports.join(', ') : '',
    d && d.note ? 'הערה: ' + d.note : '',
  ].filter(Boolean).join(' | ');
}

function userContext(userRow, weeks, maxWeeks) {
  const p = parseJSON(userRow[U.profile], {});
  const mine = weeks.filter((w) => w[W.user] === userRow[U.id])
    .sort((a, b) => String(a[W.sunday]).localeCompare(String(b[W.sunday])))
    .slice(-maxWeeks);
  return [
    '### ' + userRow[U.name] + ' (' + userRow[U.email] + ')',
    'פרופיל: ' + JSON.stringify(p),
    'שבועות (' + mine.length + ' אחרונים):',
    mine.map(weekLine).join('\n') || 'אין נתונים',
  ].join('\n');
}

function chat(me, req) {
  const key = props().getProperty('OPENAI_API_KEY');
  if (!key) throw new Error('הבוט עדיין לא הוגדר (חסר מפתח OpenAI)');
  const limit = Number(props().getProperty('CHAT_DAILY_LIMIT')) || 40;
  const cache = CacheService.getScriptCache();
  const ck = 'chat-' + me.r[U.id] + '-' + new Date().toISOString().slice(0, 10);
  const used = Number(cache.get(ck)) || 0;
  if (used >= limit) throw new Error('הגעת למגבלת ההודעות היומית לבוט');

  const weeks = rows('Weeks');
  const isAdmin = me.r[U.role] === 'admin';
  let context;
  if (isAdmin && req.scope === 'all') {
    context = 'אתה עוזר למנהל האפליקציה. נתוני כל המשתמשים:\n\n' +
      rows('Users').map((u) => userContext(u, weeks, 26)).join('\n\n');
  } else {
    const target = isAdmin && req.userId ? findUser((r) => r[U.id] === req.userId).r : me.r;
    context = 'נתוני המשתמש:\n\n' + userContext(target, weeks, 200);
  }
  const system = [
    'אתה העוזר של אפליקציית "משמעת אישית". ענה בעברית, קצר וברור.',
    'הצג עובדות ונתונים מתוך ההיסטוריה. בלי הטפה ובלי שיפוטיות. אינך רופא או דיאטן; אם נשאלת שאלה רפואית, הצע להתייעץ עם איש מקצוע.',
    'היום: ' + Utilities.formatDate(new Date(), 'Asia/Jerusalem', 'yyyy-MM-dd'),
    APP_GUIDE,
    context,
  ].join('\n\n');

  const history = (req.messages || []).slice(-12).map((m) => ({
    role: m.role === 'assistant' ? 'assistant' : 'user',
    content: String(m.content || '').slice(0, 2000),
  }));
  const res = UrlFetchApp.fetch('https://api.openai.com/v1/chat/completions', {
    method: 'post',
    contentType: 'application/json',
    headers: { Authorization: 'Bearer ' + key },
    muteHttpExceptions: true,
    payload: JSON.stringify({
      model: props().getProperty('OPENAI_MODEL') || DEFAULT_MODEL,
      messages: [{ role: 'system', content: system }].concat(history),
    }),
  });
  const body = parseJSON(res.getContentText(), {});
  if (res.getResponseCode() !== 200) {
    throw new Error('שגיאה מ-OpenAI: ' + ((body.error && body.error.message) || res.getResponseCode()));
  }
  cache.put(ck, String(used + 1), 6 * 3600);
  return { reply: body.choices[0].message.content };
}

/** Run once from the editor to grant permissions (Spreadsheet, Drive, external requests). */
function setup() {
  secret();
  sheet('Users').getLastRow();
  DriveApp.getFolderById(PHOTOS_FOLDER_ID).getName();
  UrlFetchApp.fetch('https://api.openai.com', { muteHttpExceptions: true });
  Logger.log('OK');
}
