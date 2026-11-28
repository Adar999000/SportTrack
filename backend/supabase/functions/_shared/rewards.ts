/**
 * Coins, levels, store, quest, leaderboard and league, ported from server.js.
 * The rules themselves live in logic.ts (pure, tested against the Apps Script server);
 * this file only loads the data and writes ledger rows.
 */
import { admin, fail, getSetting, type Me, must, type Profile, type Req, rewardsStart, setSetting } from './ctx.ts';
import {
  type Invitee, INVITES_PER_USER, type LeaderRow, type LedgerEntry, leagueFor, QUEST_PRIZE, questSteps, type RewardsInput, rewardsFor, type RewardWeek,
  sortLeaders, spendPlan,
} from './logic.ts';

type Db = ReturnType<typeof admin>;

const rewardUser = (p: Profile) => ({
  id: p.id, createdAt: p.created_at, role: p.role, historyApproved: !!p.history_approved, profile: p.profile || {},
  invitedBy: p.invited_by, frame: p.frame || '', chatCredits: Number(p.chat_credits) || 0,
});

async function weeksOf(db: Db, ids: string[]): Promise<Record<string, RewardWeek[]>> {
  const by: Record<string, RewardWeek[]> = {};
  ids.forEach((id) => (by[id] = []));
  if (!ids.length) return by;
  // TODO: page through results past PostgREST's max rows (default 1000) for heavy users / big leaderboards.
  const rows = must(await db.from('weeks').select('user_id, sunday, data').in('user_id', ids), 'weeks') as { user_id: string; sunday: string; data: unknown }[];
  rows.forEach((r) => by[r.user_id]?.push({ sunday: String(r.sunday), data: r.data }));
  return by;
}

async function ledgerOf(db: Db, ids: string[]): Promise<Record<string, LedgerEntry[]>> {
  const by: Record<string, LedgerEntry[]> = {};
  ids.forEach((id) => (by[id] = []));
  if (!ids.length) return by;
  const rows = must(await db.from('ledger').select('user_id, at, amount, ref, label').in('user_id', ids).order('id'), 'ledger') as (LedgerEntry & { user_id: string })[];
  rows.forEach((r) => by[r.user_id]?.push({ at: r.at, amount: r.amount, ref: r.ref, label: r.label }));
  return by;
}

/** Load everything rewardsFor needs for one user. */
export async function rewardsInput(p: Profile): Promise<RewardsInput> {
  const db = admin(); // invitees' weeks are other people's rows
  const invited = must(await db.from('profiles').select('id, name, created_at').eq('invited_by', p.id).order('created_at').limit(INVITES_PER_USER), 'invitees') as
    { id: string; name: string; created_at: string }[];
  const weeks = await weeksOf(db, [p.id, ...invited.map((i) => i.id)]);
  const ledger = await ledgerOf(db, [p.id]);
  const invitees: Invitee[] = invited.map((i) => ({ id: i.id, name: i.name, createdAt: i.created_at, weeks: weeks[i.id] }));
  return { user: rewardUser(p), weeks: weeks[p.id], ledger: ledger[p.id], invitees, rewardsStart: await rewardsStart() };
}

export const rewardsOf = async (p: Profile) => rewardsFor(await rewardsInput(p));

export async function rewards(me: Me) {
  return { rewards: await rewardsOf(me.p) };
}

export async function spend(me: Me, req: Req) {
  const rw = await rewardsOf(me.p);
  const plan = spendPlan(req, rw);
  if (rw.balance < plan.cost) fail('אין מספיק מטבעות');
  // The unique index ledger_once_idx stops a double purchase if two requests race.
  const ins = await admin().from('ledger').insert({ user_id: me.id, amount: -plan.cost, ref: plan.ref, label: plan.label });
  if (ins.error) fail(/duplicate/i.test(ins.error.message) ? 'הפריט כבר שלך' : 'שגיאת שרת. נסו שוב.');
  // TODO: chat credits race: move to an SQL function (chat_credits = chat_credits + 10) if chat is ported.
  if (req.item === 'chat10') must(await admin().from('profiles').update({ chat_credits: (Number(me.p.chat_credits) || 0) + 10 }).eq('id', me.id), 'credits');
  return { rewards: await rewardsOf({ ...me.p, chat_credits: req.item === 'chat10' ? (Number(me.p.chat_credits) || 0) + 10 : me.p.chat_credits }) };
}

export async function setFrame(me: Me, req: Req) {
  const frame = String(req.frame || '');
  if (frame && (await rewardsOf(me.p)).unlocked.indexOf('frame:' + frame) < 0) fail('המסגרת לא שלך עדיין');
  must(await admin().from('profiles').update({ frame }).eq('id', me.id), 'frame');
  await dropLeaderboardCache();
  return { frame };
}

// ------------------------------------------------------------------ leaderboard (cached 5 minutes, like lb-v1)

const LB_KEY = 'lb-v1';
export async function dropLeaderboardCache() { await admin().from('settings').delete().eq('key', LB_KEY); }

/**
 * Everyone's coins. Same O(users × weeks) work as Apps Script, cached for 5 minutes.
 * TODO (scale): keep a `leaderboard` table updated by a nightly/hourly scheduled function instead.
 */
export async function leaderList(): Promise<LeaderRow[]> {
  const cached = await getSetting<{ at: number; list: LeaderRow[] } | null>(LB_KEY, null);
  if (cached && Date.now() - cached.at < 300_000) return cached.list;
  const db = admin();
  const users = must(await db.from('profiles').select('*'), 'users') as Profile[];
  const ids = users.map((u) => u.id);
  const weeks = await weeksOf(db, ids);
  const ledger = await ledgerOf(db, ids);
  const start = await rewardsStart();
  const byInviter: Record<string, Profile[]> = {};
  users.forEach((u) => { if (u.invited_by) (byInviter[u.invited_by] ||= []).push(u); });
  const list = users.map((u) => {
    const invitees = (byInviter[u.id] || []).map((i) => ({ id: i.id, name: i.name, createdAt: i.created_at, weeks: weeks[i.id] }));
    const rw = rewardsFor({ user: rewardUser(u), weeks: weeks[u.id], ledger: ledger[u.id], invitees, rewardsStart: start });
    return { userId: u.id, name: u.name, photoId: u.photo_path || null, frame: u.frame || '', level: rw.level.n, levelName: rw.level.name, week: rw.week, month: rw.month, lifetime: rw.lifetime };
  });
  await setSetting(LB_KEY, { at: Date.now(), list });
  return list;
}

export async function leaderboard(_me: Me, req: Req) {
  return { leaders: sortLeaders(await leaderList(), String(req.period || 'week')) };
}

export async function league(me: Me) {
  return leagueFor(sortLeaders(await leaderList(), 'all'), me.id);
}

// ------------------------------------------------------------------ first-week quest

export async function questStatus(me: Me) {
  const weeks = must(await me.db.from('weeks').select('data').eq('user_id', me.id), 'weeks') as { data: unknown }[];
  const paid = !!(must(await me.db.from('ledger').select('id').eq('user_id', me.id).eq('ref', 'quest:firstweek').limit(1), 'ledger') as unknown[]).length;
  const created = Date.parse(String(me.p.created_at)) || 0;
  return { steps: questSteps(weeks.map((w) => w.data)), paid, claimed: paid, open: !paid && Date.now() - created < 14 * 864e5, expiresAt: new Date(created + 14 * 864e5).toISOString(), prize: QUEST_PRIZE };
}

export async function claimQuest(me: Me) {
  const q = await questStatus(me);
  if (q.paid) return q;
  if (!q.open) fail('תקופת משימות הפתיחה הסתיימה');
  if (!Object.values(q.steps).every(Boolean)) fail('עוד לא כל המשימות הושלמו');
  const ins = await admin().from('ledger').insert({ user_id: me.id, amount: QUEST_PRIZE, ref: 'quest:firstweek', label: 'משימות השבוע הראשון' });
  if (ins.error && !/duplicate/i.test(ins.error.message)) fail('שגיאת שרת. נסו שוב.'); // duplicate = already paid by a parallel call
  await dropLeaderboardCache();
  return { ...q, paid: true, claimed: true, open: false };
}

// ------------------------------------------------------------------ invites

/** The user's permanent personal invite code (myInvite). */
export async function myInvite(me: Me) {
  const db = admin();
  const mine = must(await db.from('invites').select('code').eq('created_by', me.id).eq('multi', true).limit(1), 'invite') as { code: string }[];
  let code = mine[0]?.code || '';
  for (let i = 0; !code && i < 5; i++) {
    const c = newCode();
    if (!(await db.from('invites').insert({ code: c, created_by: me.id, multi: true })).error) code = c;
  }
  if (!code) fail('שגיאת שרת. נסו שוב.');
  const { count } = await db.from('profiles').select('id', { count: 'exact', head: true }).eq('invited_by', me.id);
  const used = count || 0;
  return { code, used, rewarded: Math.min(used, INVITES_PER_USER), cap: INVITES_PER_USER };
}

export function newCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const a = new Uint32Array(6);
  crypto.getRandomValues(a);
  return Array.from(a, (n) => chars[n % chars.length]).join('');
}
