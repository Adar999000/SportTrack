/**
 * Community feed, stories, likes, comments, reports, meetups and blocking, ported from server.js.
 * Visibility is decided here exactly like canSeePost/hiddenFor (so admins see the same feed as everyone),
 * and again by RLS in the database for any direct access.
 * Likes, comments, story views and RSVPs are rows in their own tables (no read-modify-write of JSON cells).
 */
import { admin, adminEmails, audit, dailyCount, fail, type Me, must, removePhotos, type Req, requireVerified, savePhoto, sendMail, shortId } from './ctx.ts';
import { orderStoryGroups, planPost, STORY_MS, TEAM_ID, TEAM_NAME, visibleComments } from './logic.ts';
import { leaderList } from './rewards.ts';

interface PostRow {
  id: string; author_id: string | null; team: boolean; at: string; visibility: 'all' | 'friends'; kind: string;
  text: string; data: Record<string, unknown> | null; photo_path: string | null; status: 'ok' | 'hidden';
}
interface Person { userId: string; name: string; photoId?: string | null; frame?: string; level?: number; levelName?: string }
type Set_ = Record<string, boolean>;

const authorKey = (r: PostRow) => (r.team ? TEAM_ID : r.author_id || '');

/** Friends = people who signed up with my code, and whoever's code I used (friendsOf). */
export async function friendsOf(me: Me): Promise<Set_> {
  const set: Set_ = {};
  const rows = must(await admin().from('profiles').select('id').eq('invited_by', me.id), 'friends') as { id: string }[];
  rows.forEach((r) => (set[r.id] = true));
  if (me.p.invited_by) set[me.p.invited_by] = true;
  return set;
}

/** People hidden from me: those I blocked and those who blocked me (hiddenFor). */
export async function hiddenFor(uid: string): Promise<Set_> {
  const set: Set_ = {};
  const rows = must(await admin().from('blocks').select('blocker_id, blocked_id').or(`blocker_id.eq.${uid},blocked_id.eq.${uid}`), 'blocks') as
    { blocker_id: string; blocked_id: string }[];
  rows.forEach((r) => (set[r.blocker_id === uid ? r.blocked_id : r.blocker_id] = true));
  return set;
}

function canSeePost(uid: string, r: PostRow, friends: Set_): boolean {
  if (r.author_id === uid) return true;
  if (r.status !== 'ok') return false;
  return r.visibility === 'all' || !!friends[authorKey(r)];
}

/** Names, photos, frames and levels for authors (peopleIndex). */
async function peopleIndex(): Promise<Record<string, Person>> {
  const out: Record<string, Person> = {};
  (await leaderList()).forEach((l) => (out[l.userId] = l));
  return out;
}

/** Likes, comments, views and RSVPs of a batch of posts, in four queries. */
async function extras(ids: string[]) {
  const db = admin();
  const empty = { likes: {} as Record<string, string[]>, comments: {} as Record<string, { id: string; userId: string; text: string; at: string }[]>,
    views: {} as Record<string, string[]>, going: {} as Record<string, string[]> };
  if (!ids.length) return empty;
  const [l, c, v, g] = await Promise.all([
    db.from('post_likes').select('post_id, user_id').in('post_id', ids),
    db.from('post_comments').select('id, post_id, user_id, text, at').in('post_id', ids).order('at'),
    db.from('story_views').select('post_id, user_id').in('post_id', ids).order('at'),
    db.from('meetup_going').select('post_id, user_id').in('post_id', ids).order('at'),
  ]);
  (must(l, 'likes') as { post_id: string; user_id: string }[]).forEach((r) => (empty.likes[r.post_id] ||= []).push(r.user_id));
  (must(c, 'comments') as { id: string; post_id: string; user_id: string; text: string; at: string }[])
    .forEach((r) => (empty.comments[r.post_id] ||= []).push({ id: r.id, userId: r.user_id, text: r.text, at: r.at }));
  (must(v, 'views') as { post_id: string; user_id: string }[]).forEach((r) => (empty.views[r.post_id] ||= []).push(r.user_id));
  (must(g, 'going') as { post_id: string; user_id: string }[]).forEach((r) => (empty.going[r.post_id] ||= []).push(r.user_id));
  return empty;
}
type Extras = Awaited<ReturnType<typeof extras>>;

/** The post object the client expects (postOut). */
function postOut(r: PostRow, uid: string, people: Record<string, Person>, ex: Extras, hidden: Set_ = {}) {
  const key = authorKey(r);
  const a: Person & { team?: boolean } = r.team ? { userId: TEAM_ID, name: TEAM_NAME, team: true } : (people[key] || { userId: key, name: '—' });
  const likes = ex.likes[r.id] || [];
  const comments = visibleComments(ex.comments[r.id] || [], r.kind, r.author_id, uid, hidden)
    .map((c) => ({ id: c.id, userId: c.userId, name: people[c.userId]?.name || '—', text: c.text, at: c.at }));
  const data: Record<string, unknown> | null = r.data ? { ...r.data } : null;
  if (r.kind === 'meetup' && data) data.going = ex.going[r.id] || [];
  if (r.kind === 'story' && data && r.author_id === uid) {
    const views = ex.views[r.id] || [];
    data.viewCount = views.length;
    data.viewers = views.slice(-30).map((v) => people[v]?.name || '—');
  }
  return {
    id: r.id, at: r.at, kind: r.kind, text: r.text, data, photoId: r.photo_path || null,
    visibility: r.visibility, status: r.status, mine: r.author_id === uid,
    author: { userId: key, name: a.name, photoId: a.photoId || null, frame: a.frame || '', level: a.level || 1, levelName: a.levelName || '', team: !!a.team },
    likes: likes.length, liked: likes.indexOf(uid) >= 0, comments,
  };
}

/** Newest posts matching `pick`, scanning at most `max` rows (tailRows) in pages. */
async function scan(kindStory: boolean, before: string, since: string | null, max: number, want: number, pick: (r: PostRow) => boolean): Promise<PostRow[]> {
  const got: PostRow[] = [];
  let cursor = before;
  for (let seen = 0; seen < max && got.length < want;) {
    let q = admin().from('posts').select('*').lt('at', cursor).order('at', { ascending: false }).limit(200);
    q = kindStory ? q.eq('kind', 'story') : q.neq('kind', 'story');
    if (since) q = q.gte('at', since);
    const page = must(await q, 'posts') as PostRow[];
    page.forEach((r) => { if (got.length < want && pick(r)) got.push(r); });
    seen += page.length;
    if (page.length < 200) break;
    cursor = page[page.length - 1].at;
  }
  return got;
}

export async function feed(me: Me, req: Req) {
  // TODO: team welcome posts (ensureTeamPosts) are copied from the Sheet by the migration, not seeded here.
  const uid = me.id;
  const [friends, hidden] = await Promise.all([friendsOf(me), hiddenFor(uid)]);
  const b = String(req.before || '');
  const before = b && !isNaN(Date.parse(b)) ? b : '9999-12-31T00:00:00Z';
  const only = String(req.only || '');
  const list = await scan(false, before, null, 4000, 20, (r) =>
    !hidden[authorKey(r)] && canSeePost(uid, r, friends) &&
    (only === 'mine' ? r.author_id === uid : only === 'friends' ? !!friends[authorKey(r)] || r.author_id === uid : true));
  const [people, ex] = await Promise.all([peopleIndex(), extras(list.map((r) => r.id))]);
  return { posts: list.map((r) => postOut(r, uid, people, ex, hidden)), more: list.length === 20 };
}

/** Live stories (last 24h) I may see, grouped by person; mine first (stories). */
export async function stories(me: Me) {
  const uid = me.id;
  const [friends, hidden] = await Promise.all([friendsOf(me), hiddenFor(uid)]);
  const since = new Date(Date.now() - STORY_MS).toISOString();
  const live = (await scan(true, '9999-12-31T00:00:00Z', since, 1500, 1500, (r) => !hidden[authorKey(r)] && canSeePost(uid, r, friends)))
    .sort((a, b) => a.at.localeCompare(b.at));
  const [people, ex] = await Promise.all([peopleIndex(), extras(live.map((r) => r.id))]);
  const groups: Record<string, ReturnType<typeof postOut>[]> = {};
  const order: string[] = [];
  live.forEach((r) => {
    const k = authorKey(r);
    if (!groups[k]) { groups[k] = []; order.push(k); }
    groups[k].push(postOut(r, uid, people, ex, hidden));
  });
  const lastAt: Record<string, string> = {};
  order.forEach((k) => (lastAt[k] = groups[k][groups[k].length - 1].at));
  return { groups: orderStoryGroups(order, lastAt, uid).map((k) => ({ author: groups[k][0].author, items: groups[k] })) };
}

export async function createPost(me: Me, req: Req) {
  await requireVerified(me);
  const plan = planPost(req, me.id, me.p.role === 'admin');
  if (plan.kind === 'story') await dailyCount('story-' + me.id, 10, 'אפשר להעלות עד 10 סטוריז ביום');
  else await dailyCount('post-' + me.id, 15, 'אפשר לפרסם עד 15 פוסטים ביום');
  const id = shortId(10);
  const ids: string[] = [];
  for (let i = 0; i < plan.photos.length; i++) ids.push(await savePhoto(plan.photos[i], me.id + '/post-' + id + (i ? '-' + i : '') + '.jpg'));
  let data = plan.data;
  const going = data && Array.isArray(data.going) ? data.going as string[] : null;
  if (data && going) { data = { ...data }; delete data.going; } // RSVPs live in meetup_going
  if (ids.length > 1) data = { ...(data || {}), photos: ids };
  const row = {
    id, author_id: plan.asTeam ? null : me.id, team: plan.asTeam, visibility: plan.visibility, kind: plan.kind,
    text: plan.text, data, photo_path: ids[0] || null, status: 'ok',
  };
  const saved = must(await admin().from('posts').insert(row).select('*').single(), 'post') as PostRow;
  if (going) must(await admin().from('meetup_going').insert({ post_id: id, user_id: me.id }), 'going');
  if (plan.asTeam) await audit(me.id, 'team_post', id);
  return { post: postOut(saved, me.id, await peopleIndex(), await extras([id])) };
}

/** A post the caller can see (admins: any post), or throws (findPost). */
async function findPost(me: Me, id: unknown): Promise<PostRow> {
  const r = must(await admin().from('posts').select('*').eq('id', String(id || '')).maybeSingle(), 'post') as PostRow | null;
  if (!r) fail('הפוסט לא נמצא');
  if (!canSeePost(me.id, r!, await friendsOf(me)) && me.p.role !== 'admin') fail('הפוסט לא נמצא');
  return r!;
}

export async function viewStory(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  if (p.kind !== 'story') fail('הסטורי לא נמצא');
  if (p.author_id === me.id) return { ok: true };
  const { count } = await admin().from('story_views').select('user_id', { count: 'exact', head: true }).eq('post_id', p.id);
  if ((count || 0) < 2000) await admin().from('story_views').upsert({ post_id: p.id, user_id: me.id }, { ignoreDuplicates: true });
  return { ok: true };
}

export async function likePost(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  const db = admin();
  const del = must(await db.from('post_likes').delete().eq('post_id', p.id).eq('user_id', me.id).select('user_id'), 'like') as unknown[];
  if (!del.length) await db.from('post_likes').upsert({ post_id: p.id, user_id: me.id }, { ignoreDuplicates: true });
  const { count } = await db.from('post_likes').select('user_id', { count: 'exact', head: true }).eq('post_id', p.id);
  return { likes: count || 0, liked: !del.length };
}

export async function commentPost(me: Me, req: Req) {
  await requireVerified(me);
  const text = String(req.text || '').trim().slice(0, 500);
  if (!text) fail('נא לכתוב תגובה');
  await dailyCount('cmt-' + me.id, 60, 'אפשר להגיב עד 60 פעמים ביום');
  const p = await findPost(me, req.id);
  if (p.author_id && (await hiddenFor(me.id))[p.author_id]) fail('הפוסט לא נמצא');
  const { count } = await admin().from('post_comments').select('id', { count: 'exact', head: true }).eq('post_id', p.id);
  if ((count || 0) >= 100) fail('הגעת למספר התגובות המרבי לפוסט');
  const c = must(await admin().from('post_comments').insert({ post_id: p.id, user_id: me.id, text }).select('id, at').single(), 'comment') as { id: string; at: string };
  return { comment: { name: me.p.name, id: c.id, userId: me.id, text, at: c.at } };
}

export async function deleteComment(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  const c = must(await admin().from('post_comments').select('user_id').eq('id', String(req.commentId || '')).eq('post_id', p.id).maybeSingle(), 'comment') as { user_id: string } | null;
  if (!c) fail('התגובה לא נמצאה');
  if (c!.user_id !== me.id && p.author_id !== me.id && me.p.role !== 'admin') fail('אין הרשאה');
  must(await admin().from('post_comments').delete().eq('id', String(req.commentId)), 'comment');
  return { ok: true };
}

export async function deletePost(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  if (p.author_id !== me.id && me.p.role !== 'admin') fail('אין הרשאה');
  const extra = (p.data && Array.isArray(p.data.photos) ? p.data.photos : []) as string[];
  await removePhotos([p.photo_path, ...extra]);
  must(await admin().from('posts').delete().eq('id', p.id), 'post'); // likes/comments/views/RSVPs cascade
  if (p.author_id !== me.id) await audit(me.id, 'post_deleted', p.id);
  return { ok: true };
}

/** Three reports hide a post until the admin looks at it (trigger hide_reported_post). */
export async function reportPost(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  if (p.author_id === me.id) fail('אי אפשר לדווח על פוסט שלך');
  const ins = await admin().from('post_reports').insert({ post_id: p.id, user_id: me.id, reason: String(req.reason || '').slice(0, 200) });
  if (ins.error) return { ok: true }; // already reported by me
  const { count } = await admin().from('post_reports').select('user_id', { count: 'exact', head: true }).eq('post_id', p.id);
  if (count === 1) for (const a of await adminEmails()) await sendMail(a, 'דיווח על פוסט בפיד', 'התקבל דיווח על פוסט בפיד. אפשר לבדוק בלוח המנהל ← פיד.');
  return { ok: true };
}

export async function rsvpPost(me: Me, req: Req) {
  const p = await findPost(me, req.id);
  if (p.kind !== 'meetup') fail('זה לא מפגש');
  const db = admin();
  const del = must(await db.from('meetup_going').delete().eq('post_id', p.id).eq('user_id', me.id).select('user_id'), 'going') as unknown[];
  if (!del.length) {
    const { count } = await db.from('meetup_going').select('user_id', { count: 'exact', head: true }).eq('post_id', p.id);
    if ((count || 0) >= 200) fail('המפגש מלא');
    await db.from('meetup_going').upsert({ post_id: p.id, user_id: me.id }, { ignoreDuplicates: true });
  }
  const { count } = await db.from('meetup_going').select('user_id', { count: 'exact', head: true }).eq('post_id', p.id);
  return { going: count || 0, me: !del.length };
}

// ------------------------------------------------------------------ blocking & friends

export async function blockUser(me: Me, req: Req) {
  const other = String(req.userId || '');
  if (!other || other === me.id || other === TEAM_ID) fail('אי אפשר לחסום את המשתמש הזה');
  const exists = must(await admin().from('profiles').select('id').eq('id', other).maybeSingle(), 'user');
  if (!exists) fail('המשתמש לא נמצא');
  if (req.on !== false) {
    const { count } = await me.db.from('blocks').select('blocked_id', { count: 'exact', head: true }).eq('blocker_id', me.id);
    if ((count || 0) < 500) must(await me.db.from('blocks').upsert({ blocker_id: me.id, blocked_id: other }, { ignoreDuplicates: true }), 'block');
  } else {
    must(await me.db.from('blocks').delete().eq('blocker_id', me.id).eq('blocked_id', other), 'block');
  }
  await audit(me.id, req.on !== false ? 'block' : 'unblock', other);
  return myBlocks(me);
}

export async function myBlocks(me: Me) {
  const rows = must(await me.db.from('blocks').select('blocked_id, created_at').eq('blocker_id', me.id).order('created_at'), 'blocks') as { blocked_id: string }[];
  const ids = rows.map((r) => r.blocked_id);
  const names = ids.length ? must(await admin().from('profiles').select('id, name').in('id', ids), 'names') as { id: string; name: string }[] : [];
  const by: Record<string, string> = {};
  names.forEach((n) => (by[n.id] = n.name));
  return { blocked: ids.map((id) => ({ userId: id, name: by[id] || '—' })) };
}

export async function friends(me: Me) {
  const f = Object.keys(await friendsOf(me));
  const rows = f.length ? must(await admin().from('profiles').select('id, name, photo_path').in('id', f), 'friends') as { id: string; name: string; photo_path: string | null }[] : [];
  return { friends: rows.map((r) => ({ userId: r.id, name: r.name, photoId: r.photo_path || null })) };
}
