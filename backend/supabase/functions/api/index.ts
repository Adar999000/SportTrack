/**
 * Mishmaat API - one Edge Function that answers the same `call(action, payload)` requests the client
 * sends to Apps Script today (route() in apps-script/server.js). One function instead of ~80 keeps
 * cold starts rare and lets the client switch transports without touching any screen.
 *
 * Request:  POST /functions/v1/api   body { action, ...payload }   Authorization: Bearer <access token | anon key>
 * Response: 200 with the action's JSON, or 200 { error: "<message>" } (same contract as Apps Script,
 *           including the "AUTH:" / "VERIFY:" prefixes the client understands).
 *
 * Deploy: supabase functions deploy api --no-verify-jwt   (sign-in actions run without a user token)
 */
import * as auth from '../_shared/auth.ts';
import { admin, authenticate, bump, fail, getSetting, type Me, must, publicUser, type Req, UserError } from '../_shared/ctx.ts';
import * as feed from '../_shared/feed.ts';
import * as rw from '../_shared/rewards.ts';
import * as sync from '../_shared/sync.ts';
import { todayStr } from '../_shared/logic.ts';

const SERVER_VERSION = 'supabase-0.1.0';

/** Allowed browser origins (comma separated secret ALLOWED_ORIGINS); empty = any (dev only). */
function cors(origin: string | null): Record<string, string> {
  const allowed = (Deno.env.get('ALLOWED_ORIGINS') || '').split(',').map((s) => s.trim()).filter(Boolean);
  const ok = !allowed.length || (origin && allowed.includes(origin));
  return {
    'Access-Control-Allow-Origin': ok ? (origin || '*') : allowed[0],
    'Access-Control-Allow-Headers': 'authorization, apikey, content-type, x-client-info',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    Vary: 'Origin',
  };
}

type Public = (req: Req, jwt: string) => Promise<unknown>;
type Private = (me: Me, req: Req) => Promise<unknown>;

/** Actions that work without signing in. */
const PUBLIC: Record<string, Public> = {
  register: (r) => auth.register(r),
  login: (r) => auth.login(r),
  login2fa: (r) => auth.login2fa(r),
  refresh: (r) => auth.refresh(r),
  requestReset: (r) => auth.requestReset(r),
  confirmReset: (r) => auth.confirmReset(r),
  publicContact: (r) => auth.publicContact(r),
  status: async () => {
    const { count } = await admin().from('profiles').select('id', { count: 'exact', head: true });
    return { ok: true, hasUsers: (count || 0) > 0, serverVersion: SERVER_VERSION };
  },
  siteConfig: async () => {
    const c = await getSetting<Record<string, string>>('SITE_CONFIG', {});
    return { config: { a11yName: c.a11yName || '', a11yPhone: c.a11yPhone || '', a11yEmail: c.a11yEmail || '', spotifyClientId: c.spotifyClientId || '' } };
  },
  clientError: async (r, jwt) => {
    let who: Me | null = null;
    try { who = jwt ? await authenticate(jwt) : null; } catch { /* signed out */ }
    return clientError(r, who);
  },
  // TODO: publicChat (OpenAI FAQ bot for visitors).
};

/** Actions for signed-in users (admin checks inside). */
const PRIVATE: Record<string, Private> = {
  me: (me) => Promise.resolve({ user: publicUser(me.p) }),
  updateProfile: auth.updateProfile,
  changePassword: auth.changePassword,
  logoutAll: (me) => auth.logoutAll(me),
  setTwoFactor: auth.setTwoFactor,
  deleteAccount: auth.deleteAccount,
  sendVerifyCode: (me) => auth.sendVerifyCode(me),
  verifyEmail: auth.verifyEmail,

  getWeeks: sync.getWeeks,
  putWeeks: sync.putWeeks,
  setWeekPhoto: sync.setWeekPhoto,
  getDocs: sync.getDocs,
  putDocs: sync.putDocs,
  getPhoto: sync.getPhoto,

  rewards: (me) => rw.rewards(me),
  spend: rw.spend,
  setFrame: rw.setFrame,
  leaderboard: rw.leaderboard,
  league: (me) => rw.league(me),
  questStatus: (me) => rw.questStatus(me),
  claimQuest: (me) => rw.claimQuest(me),
  myInvite: (me) => rw.myInvite(me),

  feed: feed.feed,
  createPost: feed.createPost,
  stories: (me) => feed.stories(me),
  viewStory: feed.viewStory,
  likePost: feed.likePost,
  commentPost: feed.commentPost,
  deleteComment: feed.deleteComment,
  deletePost: feed.deletePost,
  reportPost: feed.reportPost,
  rsvpPost: feed.rsvpPost,
  blockUser: feed.blockUser,
  myBlocks: (me) => feed.myBlocks(me),
  friends: (me) => feed.friends(me),

  track: (me, r) => track(me, r.events),
};

/**
 * Actions the client calls that are not ported yet. They answer with a clear error, so a screen that
 * uses one shows a message instead of breaking. Port them area by area (docs/SCALING.md step 3).
 */
export const NOT_PORTED = [
  // TODO duels & challenge chat: duels, createDuel, respondDuel, joinDuel, leaveDuel, duelChat, duelSay (+ nightly settleDuels)
  'duels', 'createDuel', 'respondDuel', 'joinDuel', 'leaveDuel', 'duelChat', 'duelSay',
  // TODO events: events, suggestEvent, adminEvents, setEventStatus
  'events', 'suggestEvent', 'adminEvents', 'setEventStatus',
  // TODO support messages: contactAdmin, myMessages, unreadCount, adminInbox, adminThread, adminReply
  'contactAdmin', 'myMessages', 'unreadCount', 'adminInbox', 'adminThread', 'adminReply',
  // TODO moderation & admin: modQueue, modAction, listUsers, userSummary, createInvite, listInvites, setRole, approveHistory,
  //      auditLog, adminSettings, setSiteConfig, adminErrors, adminAnalytics
  'modQueue', 'modAction', 'listUsers', 'userSummary', 'createInvite', 'listInvites', 'setRole', 'approveHistory',
  'auditLog', 'adminSettings', 'setSiteConfig', 'adminErrors', 'adminAnalytics',
  // TODO AI assistant (OpenAI, monthly budget): chat
  'chat',
  // TODO team content calendar (dripTeamPost, server 6.2.0) belongs with feed(): seed via a scheduled job instead.
  // TODO Strava OAuth (callback becomes its own function `strava-callback`)
  'stravaStatus', 'stravaAuthUrl', 'stravaImport', 'stravaDisconnect',
  // TODO 6.10.0 additions: landing counters (T21, public), adminFunnel/setTestAccount (T22), beta survey (T26)
  'landing', 'adminFunnel', 'setTestAccount', 'surveyStatus', 'submitSurvey', 'dismissSurvey', 'adminFeedback',
  // Apps Script only, no Supabase equivalent: backupNow (Supabase backups), serverUpdate (deploys via CLI)
  'backupNow', 'serverUpdate',
];

async function route(body: Req, jwt: string): Promise<unknown> {
  const a = String(body.action || '');
  if (PUBLIC[a]) return PUBLIC[a](body, jwt);
  if (!PRIVATE[a] && !NOT_PORTED.includes(a)) fail('פעולה לא מוכרת');
  const me = await authenticate(jwt);
  if (!PRIVATE[a]) fail('הפעולה עוד לא זמינה בשרת החדש');
  return PRIVATE[a](me, body);
}

// ------------------------------------------------------------------ small actions kept here

/** Client crash reports, emails scrubbed, at most 500 an hour (clientError). */
async function clientError(req: Req, me: Me | null) {
  try { await bump('err-' + new Date().toISOString().slice(0, 13), 500, 3700, 'flood'); } catch { return { ok: true }; }
  const clip = (x: unknown, k: number) => String(x || '').replace(/[\w.+-]+@[\w-]+\.[\w.]+/g, '[email]').slice(0, k);
  await admin().from('errors').insert({
    version: clip(req.version, 20), screen: clip(req.screen, 40), message: clip(req.message, 300), stack: clip(req.stack, 900),
    agent: clip(req.agent, 160), user_id: me ? me.id : null,
  });
  return { ok: true };
}

/** Count feature use per day: totals and distinct users; no content (track). */
async function track(me: Me, events: unknown) {
  if (!events || typeof events !== 'object') return { ok: true };
  const ev = events as Record<string, unknown>;
  const keys = Object.keys(ev).filter((k) => /^[a-z0-9:_\-]{1,40}$/.test(k)).slice(0, 60);
  if (!keys.length) return { ok: true };
  const day = todayStr();
  const db = admin();
  // TODO: one SQL function (insert ... on conflict do update set count = count + n) to avoid the read here.
  const cur = must(await db.from('analytics').select('event, count').eq('day', day).in('event', keys), 'analytics') as { event: string; count: number }[];
  const have: Record<string, number> = {};
  cur.forEach((r) => (have[r.event] = r.count));
  const rows = keys.map((k) => ({ day, event: k, count: (have[k] || 0) + Math.max(1, Math.min(500, Math.round(Number(ev[k]) || 1))) }));
  must(await db.from('analytics').upsert(rows), 'analytics');
  must(await db.from('analytics_users').upsert(keys.map((k) => ({ day, event: k, user_id: me.id })), { ignoreDuplicates: true }), 'analytics');
  return { ok: true };
}

// ------------------------------------------------------------------ HTTP

Deno.serve(async (request) => {
  const headers = { ...cors(request.headers.get('origin')), 'Content-Type': 'application/json' };
  if (request.method === 'OPTIONS') return new Response('ok', { headers });
  if (request.method !== 'POST') return new Response(JSON.stringify({ ok: true, app: 'mishmaat-ishit' }), { headers });
  let out: unknown;
  try {
    const body = (await request.json().catch(() => ({}))) as Req;
    const jwt = (request.headers.get('authorization') || '').replace(/^Bearer\s+/i, '');
    // The anon key is also sent as a bearer token when signed out; it is not a user.
    const userJwt = jwt && jwt !== Deno.env.get('SUPABASE_ANON_KEY') ? jwt : '';
    out = await route(body, userJwt);
  } catch (e) {
    if (!(e instanceof UserError)) console.error(e);
    // Rule errors (UserError, or the Hebrew messages thrown by logic.ts) go to the user; anything else stays in the log.
    const msg = String((e as Error)?.message || e);
    out = { error: e instanceof UserError || /[\u0590-\u05FF]/.test(msg) ? msg : 'שגיאת שרת. נסו שוב.' };
  }
  return new Response(JSON.stringify(out), { headers });
});
