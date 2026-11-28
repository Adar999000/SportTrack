/**
 * Weeks and tracker documents (offline-first sync), ported from server.js.
 * Upserts run as the caller through SQL functions put_weeks/put_docs (schema.sql): one statement each,
 * "newer updatedAt wins", RLS limits them to the caller's rows. No global lock needed.
 */
import { admin, fail, type Me, must, photoDataUrl, type Req, savePhoto } from './ctx.ts';

export async function getWeeks(me: Me, req: Req) {
  const since = Number(req.since) || 0;
  const rows = must(await me.db.from('weeks').select('sunday, updated_at, photo_path, data').eq('user_id', me.id).gt('updated_at', since), 'weeks') as
    { sunday: string; updated_at: number; photo_path: string | null; data: unknown }[];
  return {
    weeks: rows.filter((r) => r.data).map((r) => ({ sundayDate: String(r.sunday), updatedAt: Number(r.updated_at), photoId: r.photo_path || null, data: r.data })),
  };
}

export async function putWeeks(me: Me, req: Req) {
  const weeks = Array.isArray(req.weeks) ? req.weeks : [];
  if (weeks.length > 400) fail('יותר מדי שבועות בבקשה אחת');
  const accepted = must(await me.db.rpc('put_weeks', { p_weeks: weeks }), 'put_weeks') as number;
  return { ok: true, accepted };
}

export async function setWeekPhoto(me: Me, req: Req) {
  const sunday = String(req.sundayDate || '');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(sunday)) fail('תאריך לא תקין');
  const row = must(await me.db.from('weeks').select('photo_path').eq('user_id', me.id).eq('sunday', sunday).maybeSingle(), 'week') as { photo_path: string | null } | null;
  if (!row) {
    if (!req.photo) return { photoId: null };
    must(await me.db.from('weeks').insert({
      user_id: me.id, sunday, updated_at: Number(req.data && req.data.updatedAt) || Date.now(), data: req.data || null,
    }), 'week');
  }
  const path = await savePhoto(req.photo || null, me.id + '/week-' + sunday + '-' + crypto.randomUUID().slice(0, 6) + '.jpg', row?.photo_path);
  must(await me.db.from('weeks').update({ photo_path: path || null }).eq('user_id', me.id).eq('sunday', sunday), 'week');
  return { photoId: path || null };
}

export async function getDocs(me: Me, req: Req) {
  const since = Number(req.since) || 0;
  const rows = must(await me.db.from('docs').select('doc_id, updated_at, data').eq('user_id', me.id).gt('updated_at', since), 'docs') as
    { doc_id: string; updated_at: number; data: unknown }[];
  return { docs: rows.map((r) => ({ id: r.doc_id, updatedAt: Number(r.updated_at), data: r.data ?? null })) };
}

export async function putDocs(me: Me, req: Req) {
  if (!Array.isArray(req.docs) || req.docs.length > 300) fail('יותר מדי מסמכים בבקשה אחת');
  const accepted = must(await me.db.rpc('put_docs', { p_docs: req.docs }), 'put_docs') as number;
  return { accepted };
}

/**
 * A photo as a data URL. Allowed: my own photos, anyone's profile photo, and photos of posts I can see (getPhoto).
 * TODO: return short-lived signed URLs instead (needs a small client change in the image loader).
 */
export async function getPhoto(me: Me, req: Req) {
  const path = String(req.photoId || '');
  if (!path) fail('חסר מזהה תמונה');
  const db = admin();
  let ok = path.startsWith(me.id + '/');
  if (!ok) ok = !!(must(await db.from('profiles').select('id').eq('photo_path', path).limit(1), 'photo') as unknown[]).length;
  if (!ok) {
    // RLS on posts decides visibility (status, all/friends, blocking); `me.db` acts as the caller.
    const a = must(await me.db.from('posts').select('id').eq('photo_path', path).limit(1), 'photo') as unknown[];
    const b = a.length ? a : must(await me.db.from('posts').select('id').contains('data', { photos: [path] }).limit(1), 'photo') as unknown[];
    ok = b.length > 0;
  }
  if (!ok) fail('אין גישה לתמונה');
  return { dataUrl: await photoDataUrl(path) };
}
