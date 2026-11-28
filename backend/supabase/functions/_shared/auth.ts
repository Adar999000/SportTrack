/**
 * Auth actions, ported from server.js onto Supabase Auth.
 * Same action names and response shapes: { token, user } after sign-in. `refresh` is extra: the client
 * adapter (src/backend/supabase.ts) keeps it and swaps it for a new access token when the old one expires.
 *
 * Differences from Apps Script (intentional):
 *  - Passwords are bcrypt in auth.users. Old Sheet hashes are checked once (legacy_passwords) and then replaced.
 *  - "Log out everywhere" revokes refresh tokens; access tokens already issued live until they expire (≤ 1 h).
 *  - 2FA holds the new session server-side (auth_codes.payload) and releases it only after the emailed code.
 */
import {
  admin, adminEmails, anon, audit, bump, checkCode, clearCounter, dailyCount, dropCode, fail, getCode, getSetting, loadProfile, type Me, must, peekCounter,
  type Profile, publicUser, putCode, type Req, savePhoto, sendMail, twoFactorOn,
} from './ctx.ts';
import {
  checkLegacyPassword, cleanProfile, LOCK_MINUTES, LOGIN_MAX_FAILS, maskEmail, normEmail, parseJSON, passwordProblem, RESET_MAX_TRIES,
  RESET_MINUTES, sixDigits, validEmail,
} from './logic.ts';

interface Session { access_token: string; refresh_token: string }

const out = (s: Session, p: Profile) => ({ token: s.access_token, refresh: s.refresh_token, user: publicUser(p) });

async function signIn(email: string, password: string): Promise<Session | null> {
  const { data, error } = await anon().auth.signInWithPassword({ email, password });
  return error || !data.session ? null : data.session;
}

async function profileByEmail(email: string): Promise<Profile | null> {
  return must(await admin().from('profiles').select('*').eq('email', email).maybeSingle(), 'profile') as Profile | null;
}

/** Password check that also accepts (and upgrades) a hash migrated from the Sheet. */
async function passwordSession(email: string, password: string): Promise<Session | null> {
  const s = await signIn(email, password);
  if (s) return s;
  const p = await profileByEmail(email);
  if (!p) return null;
  const legacy = must(await admin().from('legacy_passwords').select('hash, salt').eq('user_id', p.id).maybeSingle(), 'legacy') as { hash: string; salt: string } | null;
  if (!legacy || !(await checkLegacyPassword(legacy.hash, legacy.salt, password))) return null;
  must(await admin().auth.admin.updateUserById(p.id, { password }), 'upgrade');
  await admin().from('legacy_passwords').delete().eq('user_id', p.id);
  await audit(p.id, 'password_migrated', '');
  return signIn(email, password);
}

/** Sign out every other session of this user (keeps `s`). */
async function revokeOthers(s: Session) {
  await admin().auth.admin.signOut(s.access_token, 'others');
}

// ------------------------------------------------------------------ register / login

export async function register(req: Req) {
  const email = normEmail(req.email);
  const name = String(req.name || '').trim();
  const password = String(req.password || '');
  if (!validEmail(email)) fail('כתובת אימייל לא תקינה');
  const pwErr = passwordProblem(password);
  if (pwErr) fail(pwErr);
  if (!name || name.length > 60) fail('נא למלא שם (עד 60 תווים)');
  const perHour = Number(await getSetting('REG_PER_HOUR', 300)) || 300;
  await bump('reg-' + new Date().toISOString().slice(0, 13), perHour, 3700, 'יותר מדי הרשמות בשעה האחרונה. נסו שוב מאוחר יותר.');

  if (await profileByEmail(email)) fail('כבר קיים משתמש עם האימייל הזה');
  // An invite code is optional and gives both sides bonus coins.
  let invitedBy: string | null = null;
  let oneTime = '';
  const code = String(req.invite || '').trim().toUpperCase();
  if (code) {
    const inv = must(await admin().from('invites').select('*').eq('code', code).maybeSingle(), 'invite') as
      { code: string; used_by: string | null; created_by: string | null; multi: boolean } | null;
    if (!inv || (!inv.multi && inv.used_by)) fail('קוד ההזמנה לא תקין. אפשר להשאיר את השדה ריק ולהירשם בלי קוד.');
    invitedBy = inv!.created_by;
    if (!inv!.multi) oneTime = inv!.code;
  }
  const { data, error } = await admin().auth.admin.createUser({ email, password, email_confirm: true, user_metadata: { name } });
  if (error || !data.user) {
    if (/already/i.test(error?.message || '')) fail('כבר קיים משתמש עם האימייל הזה');
    console.error('createUser', error?.message);
    fail('ההרשמה נכשלה. נסו שוב.');
  }
  const id = data.user!.id; // the on_auth_user_created trigger made the profile (first user = admin)
  const patch: Record<string, unknown> = { name };
  if (invitedBy) patch.invited_by = invitedBy;
  if (req.terms) { patch.consent_at = new Date().toISOString(); patch.consent = 'terms+age16'; }
  must(await admin().from('profiles').update(patch).eq('id', id), 'profile');
  if (oneTime) {
    // Mark a one-time code as used only if nobody beat us to it.
    await admin().from('invites').update({ used_by: email, used_at: new Date().toISOString() }).eq('code', oneTime).is('used_by', null);
  }
  await audit(id, 'register', invitedBy ? 'invited' : '');
  const s = await signIn(email, password);
  if (!s) fail('ההרשמה נכשלה. נסו שוב.');
  return out(s!, (await loadProfile(admin(), id))!);
}

export async function login(req: Req) {
  const email = normEmail(req.email);
  const failKey = 'fail-' + email;
  if ((await peekCounter(failKey)) >= LOGIN_MAX_FAILS) {
    await audit(null, 'login_locked', email);
    fail('יותר מדי ניסיונות כניסה. נסו שוב בעוד ' + LOCK_MINUTES + ' דקות, או אפסו סיסמה.');
  }
  const s = await passwordSession(email, String(req.password || ''));
  const p = await profileByEmail(email);
  if (!s || !p) {
    await bump(failKey, 1e9, LOCK_MINUTES * 60, '');
    await audit(p ? p.id : null, 'login_fail', p ? '' : 'unknown email');
    await new Promise((r) => setTimeout(r, 800));
    fail('אימייל או סיסמה שגויים');
  }
  await clearCounter(failKey);
  if (twoFactorOn(p!)) {
    const code = sixDigits();
    const challenge = crypto.randomUUID();
    await putCode('2fa:' + challenge, code, 10, p!.id, { refresh: s!.refresh_token });
    const sent = await sendMail(email, 'קוד כניסה · משמעת אישית', 'קוד הכניסה שלך: ' + code + '\n\nהקוד בתוקף ל-10 דקות. אם לא ניסית להיכנס, מומלץ להחליף סיסמה.', true);
    if (!sent) { await dropCode('2fa:' + challenge); await admin().auth.admin.signOut(s!.access_token, 'local'); fail('לא הצלחנו לשלוח את קוד הכניסה כרגע. נסו שוב בעוד כמה דקות.'); }
    await audit(p!.id, '2fa_sent', '');
    return { needCode: true, challenge, email: maskEmail(email) };
  }
  await audit(p!.id, 'login_ok', '');
  return out(s!, p!);
}

/** Second step of sign-in: the emailed code releases the held session. */
export async function login2fa(req: Req) {
  const rec = await getCode('2fa:' + String(req.challenge || ''));
  if (!rec) fail('הקוד פג תוקף. התחברו שוב.');
  if (!(await checkCode(rec!, String(req.code || ''), 5))) {
    await audit(rec!.user_id, '2fa_fail', '');
    fail('הקוד שגוי');
  }
  const { data, error } = await anon().auth.refreshSession({ refresh_token: String(parseJSON<{ refresh?: string }>(rec!.payload, {}).refresh || '') });
  if (error || !data.session) fail('הקוד פג תוקף. התחברו שוב.');
  const p = await loadProfile(admin(), rec!.user_id || '');
  if (!p) fail('המשתמש לא נמצא');
  await audit(p!.id, 'login_ok', '2fa');
  return out(data.session!, p!);
}

/** New action (no Apps Script equivalent): swap a refresh token for a fresh access token. */
export async function refresh(req: Req) {
  const { data, error } = await anon().auth.refreshSession({ refresh_token: String(req.refresh || '') });
  if (error || !data.session) fail('AUTH: נדרשת התחברות מחדש');
  return { token: data.session!.access_token, refresh: data.session!.refresh_token };
}

// ------------------------------------------------------------------ password reset by email

/** Always answers ok, so it doesn't reveal which emails exist. */
export async function requestReset(req: Req) {
  const email = normEmail(req.email);
  const p = await profileByEmail(email);
  if (!p) return { ok: true };
  const prev = await getCode('reset:' + email);
  if (prev && Date.now() - Date.parse(prev.sent_at) < 60_000) return { ok: true };
  const code = sixDigits();
  await putCode('reset:' + email, code, RESET_MINUTES, p.id);
  await audit(p.id, 'reset_request', '');
  const text = 'שלום ' + p.name + ',\n\nהקוד לאיפוס הסיסמה שלך: ' + code + '\n\nהקוד בתוקף ל-' + RESET_MINUTES + ' דקות. אם לא ביקשת איפוס, אפשר להתעלם מההודעה.\n\nמשמעת אישית';
  const html = '<div dir="rtl" style="font-family:Arial,sans-serif;font-size:15px"><p>שלום ' + escapeHtml(p.name) + ',</p><p>הקוד לאיפוס הסיסמה שלך:</p>' +
    '<p style="font-size:28px;font-weight:bold;letter-spacing:6px">' + code + '</p><p>הקוד בתוקף ל-' + RESET_MINUTES + ' דקות. אם לא ביקשת איפוס, אפשר להתעלם מההודעה.</p><p>משמעת אישית</p></div>';
  if (!(await sendMail(email, 'קוד לאיפוס סיסמה · משמעת אישית', text, true, html))) {
    fail('לא הצלחנו לשלוח מייל כרגע (מכסת המיילים היומית נגמרה). נסו שוב מחר או פנו למנהל.');
  }
  return { ok: true };
}

export async function confirmReset(req: Req) {
  const email = normEmail(req.email);
  const rec = await getCode('reset:' + email);
  if (!rec) fail('הקוד לא תקין או שפג תוקפו. אפשר לבקש קוד חדש.');
  const pwErr = passwordProblem(req.newPassword);
  if (pwErr) fail(pwErr);
  if (!(await checkCode(rec!, String(req.code || ''), RESET_MAX_TRIES))) fail('הקוד לא תקין או שפג תוקפו. אפשר לבקש קוד חדש.');
  const p = await profileByEmail(email);
  if (!p) fail('המשתמש לא נמצא');
  return newPassword(p!, String(req.newPassword), 'reset_done');
}

async function newPassword(p: Profile, password: string, event: string) {
  must(await admin().auth.admin.updateUserById(p.id, { password }), 'password');
  await admin().from('legacy_passwords').delete().eq('user_id', p.id);
  const s = await signIn(p.email, password);
  if (!s) fail('שגיאת שרת. נסו שוב.');
  await revokeOthers(s!); // signs out other devices
  await audit(p.id, event, '');
  return out(s!, p);
}

export async function changePassword(me: Me, req: Req) {
  if (!(await passwordSession(me.p.email, String(req.oldPassword || '')))) fail('הסיסמה הנוכחית שגויה');
  const pwErr = passwordProblem(req.newPassword);
  if (pwErr) fail(pwErr);
  const r = await newPassword(me.p, String(req.newPassword), 'password_change');
  return { ok: true, token: r.token, refresh: r.refresh };
}

export async function logoutAll(me: Me) {
  await admin().auth.admin.signOut(me.jwt, 'others');
  await audit(me.id, 'logout_all', '');
  return { token: me.jwt };
}

export async function setTwoFactor(me: Me, req: Req) {
  if (!(await passwordSession(me.p.email, String(req.password || '')))) fail('הסיסמה שגויה');
  must(await admin().from('profiles').update({ two_factor: !!req.enabled }).eq('id', me.id), 'profile');
  await audit(me.id, req.enabled ? '2fa_on' : '2fa_off', '');
  return { user: publicUser({ ...me.p, two_factor: !!req.enabled }) };
}

// ------------------------------------------------------------------ email verification

export async function sendVerifyCode(me: Me) {
  if (me.p.email_verified) return { ok: true, verified: true };
  const key = 'verify:' + me.id;
  const prev = await getCode(key);
  if (prev && Date.now() - Date.parse(prev.sent_at) < 60_000) return { ok: true };
  await dailyCount('ver-mail-' + me.id, 5, 'נשלחו כבר 5 קודים היום. נסו שוב מחר.');
  const code = sixDigits();
  await putCode(key, code, 30, me.id);
  if (!(await sendMail(me.p.email, 'קוד אימות · משמעת אישית', 'שלום ' + me.p.name + ',\n\nקוד האימות שלך: ' + code + '\n\nהקוד בתוקף ל-30 דקות.', true))) {
    fail('לא הצלחנו לשלוח מייל כרגע. נסו שוב מאוחר יותר.');
  }
  return { ok: true };
}

export async function verifyEmail(me: Me, req: Req) {
  const rec = await getCode('verify:' + me.id);
  if (!rec) fail('הקוד פג. שלחו קוד חדש.');
  if (rec!.tries >= 5) { await dropCode(rec!.key); fail('יותר מדי ניסיונות. שלחו קוד חדש.'); }
  if (!(await checkCode(rec!, String(req.code || ''), 6))) fail('הקוד לא נכון');
  must(await admin().from('profiles').update({ email_verified: true }).eq('id', me.id), 'profile');
  await audit(me.id, 'email_verified', '');
  return { user: publicUser({ ...me.p, email_verified: true }) };
}

// ------------------------------------------------------------------ profile

export async function updateProfile(me: Me, req: Req) {
  const patch: Record<string, unknown> = {};
  if (typeof req.name === 'string' && req.name.trim()) patch.name = req.name.trim().slice(0, 60);
  if (req.profile && typeof req.profile === 'object') patch.profile = { ...parseJSON(me.p.profile, {}), ...cleanProfile(req.profile) };
  if (req.photo !== undefined) patch.photo_path = (await savePhoto(req.photo || null, me.id + '/profile-' + crypto.randomUUID().slice(0, 8) + '.jpg', me.p.photo_path)) || null;
  // The caller's own client: RLS + column grants allow exactly these columns on their own row.
  if (Object.keys(patch).length) must(await me.db.from('profiles').update(patch).eq('id', me.id), 'profile');
  return { user: publicUser((await loadProfile(admin(), me.id))!) };
}

/** Permanently delete the caller's account and all their data (password required). */
export async function deleteAccount(me: Me, req: Req) {
  if (!(await passwordSession(me.p.email, String(req.password || '')))) fail('הסיסמה שגויה');
  if (me.p.role === 'admin') {
    const { count } = await admin().from('profiles').select('id', { count: 'exact', head: true }).eq('role', 'admin');
    if ((count || 0) < 2) fail('אי אפשר למחוק את המנהל היחיד. קודם צריך למנות מנהל נוסף.');
  }
  // Photos: everything under the user's folder.
  const store = admin().storage.from('photos');
  const files = must(await store.list(me.id, { limit: 1000 }), 'photos') as { name: string }[];
  if (files.length) await store.remove(files.map((f) => me.id + '/' + f.name));
  // Rows: ON DELETE CASCADE from profiles/auth.users removes weeks, docs, posts, likes, comments, ledger, messages, ...
  must(await admin().auth.admin.deleteUser(me.id), 'delete');
  await audit(me.id, 'account_deleted', '');
  return { ok: true };
}

// ------------------------------------------------------------------ visitors

/** Contact form for visitors who aren't signed in (publicContact). */
export async function publicContact(req: Req) {
  const name = String(req.name || '').trim().slice(0, 60);
  const email = normEmail(req.email).slice(0, 120);
  const text = String(req.text || '').trim().slice(0, 2000);
  const topic = String(req.topic || 'פנייה').trim().slice(0, 60);
  if (!name || !text) fail('נא למלא שם ותוכן הפנייה');
  if (!validEmail(email)) fail('כתובת אימייל לא תקינה');
  const day = new Date().toISOString().slice(0, 10);
  const msg = 'נשלחו יותר מדי פניות היום. נסו שוב מחר.';
  await bump('pc-' + day, 30, 6 * 3600, msg);
  await bump('pc-' + day + email, 3, 6 * 3600, msg);
  must(await admin().from('messages').insert({ guest_email: email, from: 'user', subject: (topic + ' · ' + name).slice(0, 120), text, status: 'new' }), 'message');
  for (const a of await adminEmails()) await sendMail(a, 'פנייה מהאתר (' + topic + '): ' + name, 'מאת: ' + name + ' <' + email + '>\n\n' + text);
  await audit(null, 'public_contact', topic);
  return { ok: true };
}

function escapeHtml(s: string) {
  return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));
}
