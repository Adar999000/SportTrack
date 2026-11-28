#!/usr/bin/env node
/**
 * One-time export: Google Sheet (CSV per tab) -> Supabase.  See migrate-from-sheets.md first.
 *
 *   node backend/supabase/migrate-from-sheets.mjs --csv <folder> --rewards-start <YYYY-MM-DD> [--verify-since <ISO>] [--out <folder>]   # dry run
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... node backend/supabase/migrate-from-sheets.mjs --csv <folder> --create-users
 *
 * Step 1 (--create-users): creates one auth user per Users row through the Admin API (random password; the
 *   old hash goes to legacy_passwords, so people keep signing in with their old password) and writes
 *   <out>/id-map.json (old 8-char id -> new uuid). Without the flag, ids are faked so you can inspect the SQL.
 * Step 2 (always): writes <out>/data.sql with every other row, ids mapped. Run it in the SQL editor
 *   (or `psql "$DATABASE_URL" -f data.sql`) after schema.sql.
 * Photos: written as paths "migrated/<driveFileId>.jpg"; copy the files with the steps in the .md (TODO script).
 *
 * The keys are read from the environment only, never from files or arguments. Nothing is sent anywhere without --create-users.
 */
import { randomUUID } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = Object.fromEntries(process.argv.slice(2).map((a, i, all) => (a.startsWith('--') ? [a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : true] : null)).filter(Boolean));
const CSV_DIR = args.csv;
const OUT = args.out || 'migration-out';
const VERIFY_SINCE = args['verify-since'] || ''; // Script property VERIFY_SINCE: accounts created before it count as verified
const REWARDS_START = args['rewards-start'] || ''; // Script property REWARDS_START: keeps everyone's coin totals identical
if (!CSV_DIR || !existsSync(CSV_DIR)) {
  console.error('usage: node migrate-from-sheets.mjs --csv <folder with Users.csv, Weeks.csv, ...> [--create-users] [--verify-since ISO] [--out folder]');
  process.exit(1);
}

// ------------------------------------------------------------------ CSV (RFC 4180, as Google Sheets downloads it)

export function parseCsv(text) {
  const rows = [];
  let row = [], cell = '', q = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"' && text[i + 1] === '"') { cell += '"'; i++; }
      else if (c === '"') q = false;
      else cell += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') {
      if (c === '\r' && text[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows;
}

/**
 * Column order of each tab, exactly as server.js reads it (by position: the U, W, D, P, DU, DC, M, E, AN constants).
 * The header row is skipped and its wording ignored (Users/Weeks/Invites headers were typed by hand).
 */
const COLUMNS = {
  Users: ['id', 'email', 'name', 'role', 'hash', 'salt', 'created', 'seen', 'photo', 'profile', 'extra'],
  Weeks: ['userId', 'sundayDate', 'startWeight', 'workouts', 'mealsPct', 'photoId', 'updatedAt', 'data'],
  Docs: ['userId', 'docId', 'updatedAt', 'json'],
  Posts: ['id', 'userId', 'at', 'visibility', 'kind', 'text', 'data', 'photoId', 'likes', 'comments', 'reports', 'status'],
  Duels: ['id', 'createdBy', 'title', 'metric', 'start', 'end', 'members', 'code', 'status', 'createdAt', 'winners'],
  DuelChat: ['duelId', 'userId', 'at', 'text', 'id'],
  Ledger: ['userId', 'at', 'amount', 'ref', 'label'],
  Events: ['id', 'title', 'date', 'location', 'type', 'url', 'details', 'status', 'createdBy', 'createdAt'],
  Messages: ['id', 'userId', 'at', 'from', 'subject', 'text', 'status'],
  Analytics: ['day', 'event', 'count', 'users'],
  Invites: ['code', 'createdAt', 'usedBy', 'usedAt', 'createdBy', 'multi'],
};

/** Rows of a tab as objects (by column position); missing tab = []. */
function tab(name) {
  const f = join(CSV_DIR, name + '.csv');
  if (!existsSync(f)) { console.warn(`(no ${name}.csv, skipped)`); return []; }
  const [, ...rows] = parseCsv(readFileSync(f, 'utf8'));
  return rows.filter((r) => r.some((x) => x !== '')).map((r) => Object.fromEntries(COLUMNS[name].map((h, i) => [h, r[i] ?? ''])));
}

const json = (s, fb) => { try { return s ? JSON.parse(s) : fb; } catch { return fb; } };
const lit = (v) => (v === null || v === undefined || v === '' ? 'null' : `'${String(v).replace(/'/g, "''")}'`);
const str = (v) => `'${String(v ?? '').replace(/'/g, "''")}'`; // NOT NULL text: '' stays ''
const jlit = (v) => (v === null || v === undefined ? 'null' : `${lit(JSON.stringify(v))}::jsonb`);
const num = (v) => (v === '' || v === null || v === undefined || isNaN(Number(v)) ? 'null' : String(Number(v)));
const ts = (v) => (v ? lit(v) + '::timestamptz' : 'now()');
const photo = (id) => (id ? `migrated/${id}.jpg` : null);

// ------------------------------------------------------------------ users -> auth users + id map

const users = tab('Users'); // id,email,name,role,hash,salt,created,seen,photo,profile,extra
const mapFile = join(OUT, 'id-map.json');
mkdirSync(OUT, { recursive: true });
const idMap = existsSync(mapFile) ? json(readFileSync(mapFile, 'utf8'), {}) : {};

if (args['create-users']) {
  const url = process.env.SUPABASE_URL, key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) { console.error('Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment.'); process.exit(1); }
  for (const u of users) {
    if (idMap[u.id]) continue; // re-runnable
    const r = await fetch(url.replace(/\/$/, '') + '/auth/v1/admin/users', {
      method: 'POST',
      headers: { apikey: key, Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: u.email, password: randomUUID() + randomUUID(), email_confirm: true, user_metadata: { name: u.name } }),
    });
    const out = await r.json();
    if (!r.ok || !out.id) { console.error('createUser failed for row', u.id, r.status, out.msg || out.message || ''); continue; }
    idMap[u.id] = out.id;
    writeFileSync(mapFile, JSON.stringify(idMap, null, 2)); // after each user, so a crash loses nothing
  }
  console.log(`auth users: ${Object.keys(idMap).length}/${users.length}`);
} else {
  users.forEach((u) => { idMap[u.id] ??= '00000000-0000-4000-8000-' + Buffer.from(u.id).toString('hex').padEnd(12, '0').slice(0, 12); });
  writeFileSync(join(OUT, 'id-map.dry.json'), JSON.stringify(idMap, null, 2)); // for inspection; a real run never reads it
  console.log('dry run: fake uuids (use --create-users for real ones)');
}
const uid = (old) => (old && idMap[old] ? lit(idMap[old]) : 'null');

// ------------------------------------------------------------------ data.sql

const sql = ['-- generated by migrate-from-sheets.mjs; run after schema.sql', 'begin;'];
const add = (s) => sql.push(s);

for (const u of users) {
  const x = json(u.extra, {});
  const verified = !!x.emailVerified || (!!VERIFY_SINCE && String(u.created) < VERIFY_SINCE);
  add(`update public.profiles set legacy_id=${lit(u.id)}, name=${lit(String(u.name).slice(0, 60) || 'משתמש')}, role=${lit(u.role === 'admin' ? 'admin' : 'user')}, created_at=${ts(u.created)}, last_seen=${ts(u.seen)}, ` +
    `photo_path=${lit(photo(u.photo))}, profile=${jlit(json(u.profile, {}))}, invited_by=${uid(x.invitedBy)}, email_verified=${verified}, ` +
    `two_factor=${typeof x.twoFactor === 'boolean' ? x.twoFactor : 'null'}, history_approved=${x.historyApproved === true}, frame=${str(x.frame || '')}, ` +
    `chat_credits=${Number(x.chatCredits) || 0}, consent_at=${x.consentAt ? ts(x.consentAt) : 'null'}, consent=${lit(x.consent)} where id=${uid(u.id)};`);
  if (u.hash) add(`insert into public.legacy_passwords (user_id, hash, salt) values (${uid(u.id)}, ${lit(u.hash)}, ${lit(u.salt)}) on conflict do nothing;`);
  for (const b of x.blocks || []) if (idMap[b]) add(`insert into public.blocks (blocker_id, blocked_id) values (${uid(u.id)}, ${uid(b)}) on conflict do nothing;`);
  if (x.strava && x.strava.refresh) {
    add(`insert into public.strava_tokens (user_id, access, refresh, expires, athlete) values (${uid(u.id)}, ${lit(x.strava.access)}, ${lit(x.strava.refresh)}, ${Number(x.strava.expires) || 0}, ${str(x.strava.name || '')}) on conflict do nothing;`);
  }
}

for (const w of tab('Weeks')) { // userId,sundayDate,startWeight,workouts,mealsPct,photoId,updatedAt,data
  if (!idMap[w.userId]) continue;
  add(`insert into public.weeks (user_id, sunday, start_weight, workouts, meals_pct, photo_path, updated_at, data) values (${uid(w.userId)}, ${lit(String(w.sundayDate).slice(0, 10))}, ` +
    `${num(w.startWeight)}, ${num(w.workouts)}, ${num(w.mealsPct)}, ${lit(photo(w.photoId))}, ${Number(w.updatedAt) || 0}, ${jlit(json(w.data, null))}) on conflict do nothing;`);
}

for (const d of tab('Docs')) { // userId,docId,updatedAt,json
  if (!idMap[d.userId]) continue;
  add(`insert into public.docs (user_id, doc_id, updated_at, data) values (${uid(d.userId)}, ${lit(d.docId)}, ${Number(d.updatedAt) || 0}, ${jlit(json(d.json, null))}) on conflict do nothing;`);
}

for (const p of tab('Posts')) { // id,userId,at,visibility,kind,text,data,photoId,likes,comments,reports,status
  const team = p.userId === 'team';
  if (!team && !idMap[p.userId]) continue;
  const data = json(p.data, null);
  const views = data && data.views ? data.views : [];
  const going = data && data.going ? data.going : [];
  if (data) { delete data.views; delete data.going; if (Array.isArray(data.photos)) data.photos = data.photos.map(photo); }
  add(`insert into public.posts (id, author_id, team, at, visibility, kind, text, data, photo_path, status) values (${lit(p.id)}, ${team ? 'null' : uid(p.userId)}, ${team}, ${ts(p.at)}, ` +
    `${lit(p.visibility === 'friends' ? 'friends' : 'all')}, ${lit(p.kind || 'text')}, ${str(p.text || '')}, ${jlit(data)}, ${lit(photo(p.photoId))}, ${lit(p.status === 'hidden' ? 'hidden' : 'ok')}) on conflict do nothing;`);
  for (const l of json(p.likes, [])) if (idMap[l]) add(`insert into public.post_likes (post_id, user_id) values (${lit(p.id)}, ${uid(l)}) on conflict do nothing;`);
  for (const c of json(p.comments, [])) if (idMap[c.userId]) add(`insert into public.post_comments (id, post_id, user_id, text, at) values (${lit(c.id)}, ${lit(p.id)}, ${uid(c.userId)}, ${lit(c.text)}, ${ts(c.at)}) on conflict do nothing;`);
  for (const r of json(p.reports, [])) if (idMap[r.userId]) add(`insert into public.post_reports (post_id, user_id, reason, at) values (${lit(p.id)}, ${uid(r.userId)}, ${str(r.reason || '')}, ${ts(r.at)}) on conflict do nothing;`);
  for (const v of views) if (idMap[v]) add(`insert into public.story_views (post_id, user_id) values (${lit(p.id)}, ${uid(v)}) on conflict do nothing;`);
  for (const g of going) if (idMap[g]) add(`insert into public.meetup_going (post_id, user_id) values (${lit(p.id)}, ${uid(g)}) on conflict do nothing;`);
}

for (const d of tab('Duels')) { // id,createdBy,title,metric,start,end,members,code,status,createdAt,winners
  if (!idMap[d.createdBy]) continue;
  const winners = json(d.winners, []).filter((w) => idMap[w]).map((w) => idMap[w]);
  add(`insert into public.duels (id, created_by, title, metric, start_date, end_date, code, status, created_at, winners) values (${lit(d.id)}, ${uid(d.createdBy)}, ${lit(d.title)}, ${lit(d.metric)}, ` +
    `${lit(String(d.start).slice(0, 10))}, ${lit(String(d.end).slice(0, 10))}, ${lit(d.code)}, ${lit(d.status === 'done' ? 'done' : 'active')}, ${ts(d.createdAt)}, ${lit('{' + winners.join(',') + '}')}::uuid[]) on conflict do nothing;`);
  for (const m of json(d.members, [])) if (idMap[m.userId]) add(`insert into public.duel_members (duel_id, user_id, status) values (${lit(d.id)}, ${uid(m.userId)}, ${lit(m.status)}) on conflict do nothing;`);
}

for (const c of tab('DuelChat')) { // duelId,userId,at,text,id
  if (!idMap[c.userId]) continue;
  add(`insert into public.duel_chat (id, duel_id, user_id, at, text) values (${lit(c.id)}, ${lit(c.duelId)}, ${uid(c.userId)}, ${ts(c.at)}, ${lit(c.text)}) on conflict do nothing;`);
}

for (const l of tab('Ledger')) { // userId,at,amount,ref,label
  if (!idMap[l.userId]) continue;
  add(`insert into public.ledger (user_id, at, amount, ref, label) values (${uid(l.userId)}, ${ts(l.at)}, ${Number(l.amount) || 0}, ${lit(l.ref)}, ${str(l.label || '')}) on conflict do nothing;`);
}

for (const e of tab('Events')) { // id,title,date,location,type,url,details,status,createdBy,createdAt
  add(`insert into public.events (id, title, date, location, type, url, details, status, created_by, created_at) values (${lit(e.id)}, ${lit(e.title)}, ${lit(String(e.date).slice(0, 10))}, ` +
    `${str(e.location || '')}, ${lit(e.type || 'other')}, ${str(e.url || '')}, ${str(e.details || '')}, ${lit(e.status || 'pending')}, ${uid(e.createdBy)}, ${ts(e.createdAt)}) on conflict do nothing;`);
}

for (const m of tab('Messages')) { // id,userId,at,from,subject,text,status
  const guest = String(m.userId).startsWith('guest:') ? String(m.userId).slice(6) : null;
  if (!guest && !idMap[m.userId]) continue;
  add(`insert into public.messages (id, user_id, guest_email, at, "from", subject, text, status) values (${lit(m.id)}, ${guest ? 'null' : uid(m.userId)}, ${lit(guest)}, ${ts(m.at)}, ` +
    `${lit(m.from === 'admin' ? 'admin' : 'user')}, ${str(m.subject || '')}, ${lit(m.text)}, ${lit(m.status || 'new')}) on conflict do nothing;`);
}

for (const a of tab('Analytics')) { // day,event,count,users
  add(`insert into public.analytics (day, event, count) values (${lit(String(a.day).slice(0, 10))}, ${lit(a.event)}, ${Number(a.count) || 0}) on conflict do nothing;`);
  for (const u of json(a.users, [])) if (idMap[u]) add(`insert into public.analytics_users (day, event, user_id) values (${lit(String(a.day).slice(0, 10))}, ${lit(a.event)}, ${uid(u)}) on conflict do nothing;`);
}

for (const i of tab('Invites')) { // code,createdAt,usedBy,usedAt,createdBy,multi
  const code = String(i.code).trim().toUpperCase();
  if (!code) continue;
  add(`insert into public.invites (code, created_at, used_by, used_at, created_by, multi) values (${lit(code)}, ${ts(i.createdAt)}, ${lit(i.usedBy)}, ` +
    `${i.usedAt ? ts(i.usedAt) : 'null'}, ${uid(i.createdBy)}, ${String(i.multi) === '1'}) on conflict do nothing;`);
}

// Errors and Audit are diagnostics: not copied (keep the Sheet read-only for 30 days instead).
add("insert into public.settings (key, value) values ('VERIFY_POSTING', '\"1\"') on conflict do nothing;");
if (REWARDS_START) add(`insert into public.settings (key, value) values ('REWARDS_START', ${jlit(REWARDS_START)}) on conflict (key) do update set value = excluded.value;`);
else console.warn('WARNING: no --rewards-start; coin totals of users without approved history would change.');
add('commit;');
writeFileSync(join(OUT, 'data.sql'), sql.join('\n') + '\n');
console.log(`wrote ${join(OUT, 'data.sql')} (${sql.length} statements)`);
