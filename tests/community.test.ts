import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

describe('custom trackers, feed and events', () => {
  let be: any;
  let admin: any, a: any, friend: any, stranger: any;
  const reg = (email: string, name: string, invite?: string) => be.post({ action: 'register', email, password: 'secret12', name, invite });

  beforeEach(() => {
    be = createBackend();
    be.properties.set('TEAM_SEEDED', '1'); // keep the team's welcome posts out of these counts
    admin = reg('adm@x.com', 'מנהל');
    a = reg('a@x.com', 'אלף');
    const { code } = be.post({ action: 'myInvite', token: a.token });
    friend = reg('f@x.com', 'חבר', code);
    stranger = reg('s@x.com', 'זר');
  });

  it('syncs tracker documents per user, last write wins', () => {
    const def = { id: 't:abc:def', updatedAt: 10, data: { name: 'שתייה', mode: 'week', rows: [{ id: 'r1', label: 'כוסות מים', type: 'number' }] } };
    expect(be.post({ action: 'putDocs', token: a.token, docs: [def, { id: 'bad id!', updatedAt: 1, data: {} }] }).accepted).toBe(1);
    expect(be.post({ action: 'putDocs', token: a.token, docs: [{ ...def, updatedAt: 5, data: { name: 'old' } }] }).accepted).toBe(0);
    const got = be.post({ action: 'getDocs', token: a.token, since: 0 }).docs;
    expect(got).toHaveLength(1);
    expect(got[0].data.name).toBe('שתייה');
    expect(be.post({ action: 'getDocs', token: friend.token, since: 0 }).docs).toHaveLength(0);
    expect(be.post({ action: 'putDocs', token: a.token, docs: [{ id: 't:abc:def', updatedAt: 20, data: null }] }).accepted).toBe(1);
    expect(be.post({ action: 'getDocs', token: a.token, since: 10 }).docs[0].data).toBeNull();
    expect(be.post({ action: 'putDocs', token: a.token, docs: [{ id: 't:big', updatedAt: 1, data: 'x'.repeat(46000) }] }).accepted).toBe(0);
  });

  it('shows posts by visibility: everyone vs friends only', () => {
    be.post({ action: 'createPost', token: a.token, text: 'לכולם', visibility: 'all' });
    be.post({ action: 'createPost', token: a.token, text: 'רק לחברים', visibility: 'friends' });
    const texts = (t: string) => be.post({ action: 'feed', token: t }).posts.filter((p: any) => !p.author.team).map((p: any) => p.text);
    expect(texts(a.token)).toEqual(['רק לחברים', 'לכולם']);
    expect(texts(friend.token)).toEqual(['רק לחברים', 'לכולם']);
    expect(texts(stranger.token)).toEqual(['לכולם']);
    expect(be.post({ action: 'feed', token: stranger.token }).posts.find((p: any) => !p.author.team).author.name).toBe('אלף');
    expect(be.post({ action: 'createPost', token: a.token, text: '' }).error).toMatch(/לכתוב/);
  });

  it('likes, comments, deletes and reports', () => {
    const { post } = be.post({ action: 'createPost', token: a.token, text: 'רצתי 10 ק"מ', visibility: 'all', kind: 'achievement', data: { icon: '🏃', title: 'ריצה' } });
    expect(be.post({ action: 'likePost', token: stranger.token, id: post.id })).toEqual({ likes: 1, liked: true });
    expect(be.post({ action: 'likePost', token: stranger.token, id: post.id })).toEqual({ likes: 0, liked: false });
    const { comment } = be.post({ action: 'commentPost', token: friend.token, id: post.id, text: 'כל הכבוד!' });
    expect(be.post({ action: 'feed', token: a.token }).posts[0].comments[0]).toMatchObject({ name: 'חבר', text: 'כל הכבוד!' });
    expect(be.post({ action: 'deleteComment', token: stranger.token, id: post.id, commentId: comment.id }).error).toMatch(/הרשאה/);
    expect(be.post({ action: 'deleteComment', token: a.token, id: post.id, commentId: comment.id }).ok).toBe(true); // post owner may
    expect(be.post({ action: 'deletePost', token: stranger.token, id: post.id }).error).toMatch(/הרשאה/);
    // three reports hide it from others, the admin can restore
    const x = reg('x@x.com', 'x'), y = reg('y@x.com', 'y');
    for (const u of [stranger, x, y]) be.post({ action: 'reportPost', token: u.token, id: post.id, reason: 'spam' });
    expect(be.post({ action: 'feed', token: stranger.token }).posts).toHaveLength(0);
    expect(be.post({ action: 'feed', token: a.token }).posts[0].status).toBe('hidden');
    expect(be.post({ action: 'modQueue', token: admin.token }).posts[0].reports).toHaveLength(3);
    expect(be.post({ action: 'modQueue', token: a.token }).error).toMatch(/מנהל/);
    be.post({ action: 'modAction', token: admin.token, id: post.id, do: 'restore' });
    expect(be.post({ action: 'feed', token: stranger.token }).posts).toHaveLength(1);
    be.post({ action: 'modAction', token: admin.token, id: post.id, do: 'delete' });
    expect(be.post({ action: 'feed', token: a.token }).posts).toHaveLength(0);
  });

  it('events: users suggest, the admin approves', () => {
    const future = new Date(Date.now() + 20 * 864e5).toISOString().slice(0, 10);
    expect(be.post({ action: 'suggestEvent', token: a.token, title: 'מרתון', date: '2020-01-01' }).error).toMatch(/עתידי/);
    expect(be.post({ action: 'suggestEvent', token: a.token, title: 'מרתון', date: future, url: 'http://x' }).error).toMatch(/https/);
    const { event } = be.post({ action: 'suggestEvent', token: a.token, title: 'מרתון תל אביב', date: future, type: 'run', url: 'https://example.com' });
    expect(event.status).toBe('pending');
    expect(be.post({ action: 'events', token: stranger.token }).events).toHaveLength(0);
    expect(be.post({ action: 'events', token: a.token }).events[0].mine).toBe(true);
    be.post({ action: 'setEventStatus', token: admin.token, id: event.id, status: 'approved' });
    expect(be.post({ action: 'events', token: stranger.token }).events[0].title).toBe('מרתון תל אביב');
    expect(be.post({ action: 'suggestEvent', token: admin.token, title: 'קרוספיט', date: future, type: 'crossfit' }).event.status).toBe('approved');
  });

  it('account deletion removes posts, comments and tracker docs', () => {
    const { post } = be.post({ action: 'createPost', token: stranger.token, text: 'שלום', visibility: 'all' });
    be.post({ action: 'commentPost', token: a.token, id: post.id, text: 'היי' });
    be.post({ action: 'createPost', token: a.token, text: 'שלי', visibility: 'all' });
    be.post({ action: 'putDocs', token: a.token, docs: [{ id: 't:1:def', updatedAt: 1, data: {} }] });
    expect(be.post({ action: 'deleteAccount', token: a.token, password: 'secret12' }).ok).toBe(true);
    const posts = be.post({ action: 'feed', token: stranger.token }).posts;
    expect(posts.map((p: any) => p.text)).toEqual(['שלום']);
    expect(posts[0].comments).toHaveLength(0);
  });
});

describe('friend challenges and analytics', () => {
  it('scores challenges from real data and pays the winner once', () => {
    let now = new Date('2026-12-01T10:00:00Z'); // a Tuesday
    const be = createBackend({ now: () => now });
    const reg = (email: string, name: string, invite?: string) => be.post({ action: 'register', email, password: 'secret12', name, invite });
    reg('adm@x.com', 'מנהל');
    const a = reg('a@x.com', 'אלף');
    const b = reg('b@x.com', 'בית', be.post({ action: 'myInvite', token: a.token }).code);
    const stranger = reg('s@x.com', 'זר');
    expect(be.post({ action: 'friends', token: a.token }).friends.map((f: any) => f.name)).toEqual(['בית']);
    const { duel } = be.post({ action: 'createDuel', token: a.token, metric: 'runs', days: 3, invite: [b.user.userId, stranger.user.userId] });
    expect(duel.standings.map((s: any) => s.status)).toEqual(['in', 'invited']); // strangers can't be invited by id
    const day = (label: string) => ({ breakfast: 'V', lunch: 'V', dinner: 'V', sport: { status: 'V', label, countsAsWorkout: true } });
    const wk = (days: any[]) => ({ sundayDate: '2026-11-29', updatedAt: Date.now(), data: { sundayDate: '2026-11-29', days }, summary: {} });
    be.post({ action: 'putWeeks', token: a.token, weeks: [wk([null, null, day('ריצה 5 ק"מ'), day('כוח')])] });
    be.post({ action: 'putWeeks', token: b.token, weeks: [wk([null, null, day('ריצה'), day('ריצה קלה')])] });
    // b hasn't accepted yet: score 0
    expect(be.post({ action: 'duels', token: a.token }).duels[0].standings[0]).toMatchObject({ name: 'אלף', score: 1 });
    expect(be.post({ action: 'respondDuel', token: b.token, id: duel.id, accept: true }).ok).toBe(true);
    // join by code
    expect(be.post({ action: 'joinDuel', token: stranger.token, code: 'nope' }).error).toMatch(/לא תקין/);
    expect(be.post({ action: 'joinDuel', token: stranger.token, code: duel.code }).ok).toBe(true);
    now = new Date('2026-12-02T10:00:00Z');
    let d = be.post({ action: 'duels', token: a.token }).duels[0];
    expect(d.standings.map((s: any) => [s.name, s.score])).toEqual([['בית', 2], ['אלף', 1], ['זר', 0]]);
    // after the end: settled, winner paid 100 once
    now = new Date('2026-12-05T10:00:00Z');
    const before = be.post({ action: 'rewards', token: b.token }).rewards.balance;
    d = be.post({ action: 'duels', token: a.token }).duels[0];
    expect(d.status).toBe('done');
    expect(d.winners).toEqual([b.user.userId]);
    be.post({ action: 'duels', token: b.token });
    expect(be.post({ action: 'rewards', token: b.token }).rewards.balance).toBe(before + 100);
  });

  it('aggregates usage per day and shows it to the admin only', () => {
    const be = createBackend();
    const adm = be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'u' });
    be.post({ action: 'track', token: u.token, events: { 'screen:week': 3, 'mark:meal': 5, 'BAD KEY!': 1 } });
    be.post({ action: 'track', token: adm.token, events: { 'screen:week': 1 } });
    be.post({ action: 'track', token: u.token, events: { 'screen:week': 1 } });
    expect(be.post({ action: 'adminAnalytics', token: u.token }).error).toMatch(/מנהל/);
    const r = be.post({ action: 'adminAnalytics', token: adm.token, days: 7 });
    expect(r.dau).toBe(2);
    expect(r.events.find((e: any) => e.event === 'mark:meal')).toMatchObject({ count: 5, users: 1 });
    expect(r.events.find((e: any) => e.event === 'screen:week')).toMatchObject({ count: 5, users: 2 });
    expect(r.events.some((e: any) => e.event === 'BAD KEY!')).toBe(false);
  });
});

describe('server loader (Code.gs runs server.js from GitHub)', () => {
  it('serves the GitHub code, keeps a good copy, survives a broken push and GitHub being down', () => {
    const be = createBackend({ loader: true });
    const adm = be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    expect(adm.user.role).toBe('admin');
    expect(be.post({ action: 'status' }).serverVersion).toBeTruthy();
    expect(be.textFiles.get('server-last-good.js')).toContain('function doPost');
    // a push with new code: "update now" picks it up, without any redeploy
    const good = be.textFiles.get('server-last-good.js')!;
    be.setServerSource(good.replace(/const SERVER_VERSION = '[^']*'/, "const SERVER_VERSION = '9.9.9'"));
    expect(be.post({ action: 'serverUpdate', token: adm.token })).toMatchObject({ updated: true });
    be.newRequest();
    expect(be.post({ action: 'status' }).serverVersion).toBe('9.9.9');
    // a broken push is refused; the server keeps running the last good code
    be.setServerSource('function doPost( {{{ broken');
    expect(be.post({ action: 'serverUpdate', token: adm.token }).updated).toBe(false);
    be.cache.clear(); be.newRequest();
    expect(be.post({ action: 'status' }).serverVersion).toBe('9.9.9');
    // GitHub down and the cache empty: the good copy in Drive is used
    be.setGithubDown(true); be.cache.clear(); be.newRequest();
    expect(be.post({ action: 'status' }).serverVersion).toBe('9.9.9');
    // triggers still reach the server through the loader
    be.run('setup');
    expect(be.triggers).toEqual(['backupNow', 'autoUpdate']);
  });

  it('without the loader, "update now" explains what is missing', () => {
    const be = createBackend();
    const adm = be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    expect(be.post({ action: 'serverUpdate', token: adm.token }).error).toMatch(/Code\.gs/);
  });
});

describe('Strava (smart watches)', () => {
  it('connects through OAuth and imports runs with routes', () => {
    const be = createBackend();
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'דנה' });
    expect(be.post({ action: 'stravaStatus', token: u.token })).toMatchObject({ configured: false, connected: false });
    expect(be.post({ action: 'stravaAuthUrl', token: u.token }).error).toMatch(/הוגדר/);
    be.properties.set('STRAVA_CLIENT_ID', '123'); be.properties.set('STRAVA_CLIENT_SECRET', 'sec');
    const { url } = be.post({ action: 'stravaAuthUrl', token: u.token });
    expect(url).toMatch(/^https:\/\/www\.strava\.com\/oauth\/authorize\?client_id=123/);
    const state = decodeURIComponent(/state=([^&]+)/.exec(url)![1]);
    // a forged state is refused
    expect(be.get({ state: state.slice(0, -2) + 'xx', code: 'c' }).html).toMatch(/נכשל/);
    expect(be.get({ state, code: 'c' }).html).toMatch(/חובר/);
    expect(be.post({ action: 'stravaStatus', token: u.token })).toMatchObject({ configured: true, connected: true });
    const acts = be.post({ action: 'stravaImport', token: u.token }).activities;
    expect(acts).toHaveLength(1); // yoga is skipped
    expect(acts[0]).toMatchObject({ id: 's11', type: 'run', distanceM: 5012, durationS: 1800 });
    expect(acts[0].polyline).toBeTruthy();
    be.post({ action: 'stravaDisconnect', token: u.token });
    expect(be.post({ action: 'stravaStatus', token: u.token }).connected).toBe(false);
  });
});

describe('meetups, team posts and challenge chat', () => {
  it('seeds team posts once, lets the admin post as the team, and handles meetup RSVPs', () => {
    const be = createBackend();
    const adm = be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'דנה' });
    const v = be.post({ action: 'register', email: 'v@x.com', password: 'secret12', name: 'יוסי' });
    let posts = be.post({ action: 'feed', token: u.token }).posts;
    expect(posts.filter((p: any) => p.author.team)).toHaveLength(3);
    be.post({ action: 'feed', token: u.token });
    expect(be.post({ action: 'feed', token: u.token }).posts.filter((p: any) => p.author.team)).toHaveLength(3); // only once
    // only admins can post as the team
    expect(be.post({ action: 'createPost', token: u.token, text: 'x', asTeam: true }).post.author.team).toBe(false);
    expect(be.post({ action: 'createPost', token: adm.token, text: 'עדכון מהצוות', asTeam: true }).post.author).toMatchObject({ team: true, name: 'צוות משמעת אישית' });
    // meetups
    const soon = new Date(Date.now() + 2 * 864e5).toISOString().slice(0, 16);
    expect(be.post({ action: 'createPost', token: u.token, kind: 'meetup', data: { title: 'ריצה', when: '2020-01-01T07:00' } }).error).toMatch(/עתידי/);
    const { post } = be.post({ action: 'createPost', token: u.token, kind: 'meetup', data: { title: 'ריצה קבוצתית', when: soon, location: 'פארק הירקון', sport: 'run' } });
    expect(post.data.going).toEqual([u.user.userId]);
    expect(be.post({ action: 'rsvpPost', token: v.token, id: post.id })).toEqual({ going: 2, me: true });
    expect(be.post({ action: 'rsvpPost', token: v.token, id: post.id })).toEqual({ going: 1, me: false });
    const text = be.post({ action: 'createPost', token: u.token, text: 'רגיל' }).post;
    expect(be.post({ action: 'rsvpPost', token: v.token, id: text.id }).error).toMatch(/מפגש/);
  });

  it('challenge members chat among themselves; others cannot read', () => {
    const be = createBackend();
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אלף' });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בית', invite: be.post({ action: 'myInvite', token: a.token }).code });
    const c = be.post({ action: 'register', email: 'c@x.com', password: 'secret12', name: 'גימל' });
    const { duel } = be.post({ action: 'createDuel', token: a.token, metric: 'workouts', days: 7, invite: [b.user.userId] });
    expect(be.post({ action: 'duelSay', token: b.token, id: duel.id, text: 'אני בפנים?' }).error).toMatch(/לא נמצא/); // invited, not joined yet
    be.post({ action: 'respondDuel', token: b.token, id: duel.id, accept: true });
    be.post({ action: 'duelSay', token: a.token, id: duel.id, text: 'יאללה 💪' });
    be.post({ action: 'duelSay', token: b.token, id: duel.id, text: 'בטח!' });
    const msgs = be.post({ action: 'duelChat', token: a.token, id: duel.id }).messages;
    expect(msgs.map((m: any) => [m.name, m.text, m.mine])).toEqual([['אלף', 'יאללה 💪', true], ['בית', 'בטח!', false]]);
    expect(be.post({ action: 'duelChat', token: a.token, id: duel.id, after: msgs[0].id }).messages).toHaveLength(1);
    expect(be.post({ action: 'duelChat', token: c.token, id: duel.id }).error).toMatch(/לא נמצא/);
  });
});

describe('stories, goals and music settings', () => {
  it('posts 24h stories outside the feed, counts views for the owner only, and expires them', () => {
    let clock = Date.parse('2026-11-20T10:00:00Z');
    const be = createBackend({ now: () => clock });
    be.properties.set('TEAM_SEEDED', '1');
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אלף' });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בית' });
    const { post } = be.post({ action: 'createPost', token: a.token, kind: 'story', text: 'בוקר טוב',
      data: { tpl: 'workout', bg: 'nope', type: 'run', distanceM: 5000, durationS: 1500, route: [[10, 20], [300, -5]], lat: 32.1 } });
    expect(post.data).toMatchObject({ tpl: 'workout', bg: 'ink', distanceM: 5000, route: [[10, 20], [100, 0]] });
    expect(post.data.lat).toBeUndefined();
    expect(be.post({ action: 'feed', token: b.token }).posts).toHaveLength(0); // stories stay out of the feed
    let g = be.post({ action: 'stories', token: b.token }).groups;
    expect(g).toHaveLength(1);
    expect(g[0].author.name).toBe('אלף');
    expect(g[0].items[0].data.viewCount).toBeUndefined();
    be.post({ action: 'viewStory', token: b.token, id: post.id });
    be.post({ action: 'viewStory', token: b.token, id: post.id });
    be.post({ action: 'viewStory', token: a.token, id: post.id });
    expect(be.post({ action: 'likePost', token: b.token, id: post.id }).liked).toBe(true);
    const mine = be.post({ action: 'stories', token: a.token }).groups[0].items[0];
    expect(mine.data).toMatchObject({ viewCount: 1, viewers: ['בית'] });
    expect(mine.likes).toBe(1);
    clock += 25 * 3600 * 1000;
    expect(be.post({ action: 'stories', token: b.token }).groups).toHaveLength(0);
  });

  it('keeps only known onboarding goals and validates the Spotify client id', () => {
    const be = createBackend();
    const adm = be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'דנה' });
    const { user } = be.post({ action: 'updateProfile', token: u.token, profile: { goals: ['lose', 'hack', 'fit'], completed: true } });
    expect(user.profile.goals).toEqual(['lose', 'fit']);
    expect(be.post({ action: 'updateProfile', token: u.token, profile: { gender: 'female' } }).user.profile.gender).toBe('female');
    expect(be.post({ action: 'updateProfile', token: u.token, profile: { gender: 'robot' } }).user.profile.gender).toBe('');
    expect(be.post({ action: 'setSiteConfig', token: adm.token, spotifyClientId: 'not-an-id' }).error).toMatch(/32/);
    be.post({ action: 'setSiteConfig', token: adm.token, spotifyClientId: 'a'.repeat(32) });
    expect(be.post({ action: 'siteConfig' }).config.spotifyClientId).toBe('a'.repeat(32));
    expect(be.post({ action: 'setSiteConfig', token: u.token, spotifyClientId: 'b'.repeat(32) }).error).toBeTruthy();
  });
});

describe('leagues and story replies', () => {
  it('keeps story replies private and puts people in a weekly league', () => {
    const be = createBackend();
    be.properties.set('TEAM_SEEDED', '1');
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אלף' });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בית' });
    const c = be.post({ action: 'register', email: 'c@x.com', password: 'secret12', name: 'גימל' });
    const { post } = be.post({ action: 'createPost', token: a.token, kind: 'story', data: { tpl: 'week', workouts: 4, full: 5, meals: 88 } });
    expect(post.data).toMatchObject({ tpl: 'week', workouts: 4, full: 5, meals: 88 });
    expect(post.author.name).toBe('אלף'); // new user, name shown even before the leaderboard cache refreshes
    be.post({ action: 'commentPost', token: b.token, id: post.id, text: 'כל הכבוד' });
    be.post({ action: 'commentPost', token: c.token, id: post.id, text: 'וואו' });
    const story = (tok: string) => be.post({ action: 'stories', token: tok }).groups[0].items[0];
    expect(story(a.token).comments).toHaveLength(2);
    expect(story(b.token).comments.map((x: any) => x.text)).toEqual(['כל הכבוד']);
    const lg = be.post({ action: 'league', token: b.token });
    expect(lg.members.length).toBe(4);
    expect(lg.members.filter((m: any) => m.me)).toHaveLength(1);
    expect(lg.tier).toBe('זהב');
  });
});

describe('photo posts', () => {
  it('saves up to 4 photos per post, lets viewers load each, and trashes them all on delete', () => {
    const be = createBackend();
    be.properties.set('TEAM_SEEDED', '1');
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אלף' });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בית' });
    const img = 'data:image/jpeg;base64,' + Buffer.from('jpegbytes').toString('base64');
    const { post } = be.post({ action: 'createPost', token: a.token, text: 'ריצה', photos: [img, img, img, img, img] });
    expect(post.data.photos).toHaveLength(4);
    expect(post.photoId).toBe(post.data.photos[0]);
    expect(be.post({ action: 'getPhoto', token: b.token, photoId: post.data.photos[3] }).dataUrl).toMatch(/^data:image/);
    const story = be.post({ action: 'createPost', token: a.token, kind: 'story', data: { tpl: 'photo', ov: { km: 5.2, time: '28:10' } }, photos: [img, img] }).post;
    expect(story.data.photos).toBeUndefined(); // stories keep one photo
    expect(story.data.ov).toMatchObject({ km: 5.2, time: '28:10' });
    const day = be.post({ action: 'createPost', token: a.token, kind: 'story', data: { tpl: 'photo', ov: { meals: 2, sport: 1 } }, photo: img }).post;
    expect(day.data.ov).toEqual({ meals: 2, sport: 1 });
    be.post({ action: 'deletePost', token: a.token, id: post.id });
    expect(post.data.photos.every((id: string) => be.files.get(id).trashed)).toBe(true);
  });
});

describe('blocking, first-week quest and group challenges', () => {
  it('hides blocked people both ways in feed, stories, comments and chat', () => {
    const be = createBackend();
    be.properties.set('TEAM_SEEDED', '1');
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const a = be.post({ action: 'register', email: 'a@x.com', password: 'secret12', name: 'אלף' });
    const b = be.post({ action: 'register', email: 'b@x.com', password: 'secret12', name: 'בית' });
    const pa = be.post({ action: 'createPost', token: a.token, text: 'שלום' }).post;
    be.post({ action: 'createPost', token: b.token, text: 'היי' });
    be.post({ action: 'createPost', token: b.token, kind: 'story', data: { tpl: 'text' }, text: 'סטורי' });
    be.post({ action: 'commentPost', token: b.token, id: pa.id, text: 'תגובה' });
    expect(be.post({ action: 'blockUser', token: a.token, userId: b.user.userId }).blocked.map((x: any) => x.name)).toEqual(['בית']);
    expect(be.post({ action: 'feed', token: a.token }).posts.map((p: any) => p.text)).toEqual(['שלום']);
    expect(be.post({ action: 'feed', token: a.token }).posts[0].comments).toHaveLength(0);
    expect(be.post({ action: 'stories', token: a.token }).groups).toHaveLength(0);
    expect(be.post({ action: 'feed', token: b.token }).posts.map((p: any) => p.text)).toEqual(['היי']); // both ways
    expect(be.post({ action: 'commentPost', token: b.token, id: pa.id, text: 'עוד' }).error).toBeTruthy();
    expect(be.post({ action: 'blockUser', token: a.token, userId: a.user.userId }).error).toBeTruthy();
    be.post({ action: 'blockUser', token: a.token, userId: b.user.userId, on: false });
    expect(be.post({ action: 'feed', token: a.token }).posts).toHaveLength(2);
  });

  it('pays the first-week quest once, only when all four steps are done', () => {
    const be = createBackend();
    be.post({ action: 'register', email: 'adm@x.com', password: 'secret12', name: 'מנהל' });
    const u = be.post({ action: 'register', email: 'u@x.com', password: 'secret12', name: 'דנה' });
    expect(be.post({ action: 'claimQuest', token: u.token }).error).toMatch(/לא כל/);
    const sunday = new Date(); sunday.setUTCDate(sunday.getUTCDate() - sunday.getUTCDay());
    const sd = sunday.toISOString().slice(0, 10);
    be.post({ action: 'putWeeks', token: u.token, weeks: [{ sundayDate: sd, updatedAt: Date.now(), data: { sundayDate: sd, startWeight: 80, days: [{ breakfast: 'V', lunch: 'V', dinner: 'V', sport: { status: 'V', label: 'ריצה', countsAsWorkout: true } }] }, summary: {} }] });
    expect(be.post({ action: 'questStatus', token: u.token }).steps).toEqual({ meal: true, weight: true, sport: true, full: true });
    const before = be.post({ action: 'rewards', token: u.token }).rewards.balance;
    expect(be.post({ action: 'claimQuest', token: u.token }).paid).toBe(true);
    be.post({ action: 'claimQuest', token: u.token });
    expect(be.post({ action: 'rewards', token: u.token }).rewards.balance).toBe(before + 100);
  });

  it('runs a group challenge toward one shared goal and pays everyone who helped', () => {
    let now = new Date('2026-12-01T10:00:00Z');
    const be = createBackend({ now: () => now });
    const reg = (email: string, name: string, invite?: string) => be.post({ action: 'register', email, password: 'secret12', name, invite });
    reg('adm@x.com', 'מנהל');
    const a = reg('a@x.com', 'אלף');
    const b = reg('b@x.com', 'בית', be.post({ action: 'myInvite', token: a.token }).code);
    expect(be.post({ action: 'createDuel', token: a.token, metric: 'workouts', days: 3, team: true, target: 0 }).error).toMatch(/יעד/);
    const { duel } = be.post({ action: 'createDuel', token: a.token, metric: 'workouts', days: 3, team: true, target: 3, invite: [b.user.userId] });
    expect(duel).toMatchObject({ team: true, target: 3, metric: 'workouts', total: 0 });
    be.post({ action: 'respondDuel', token: b.token, id: duel.id, accept: true });
    const day = { breakfast: 'V', sport: { status: 'V', label: 'כוח', countsAsWorkout: true } };
    const wk = (days: any[]) => ({ sundayDate: '2026-11-29', updatedAt: Date.now(), data: { sundayDate: '2026-11-29', days }, summary: {} });
    be.post({ action: 'putWeeks', token: a.token, weeks: [wk([null, null, day, day])] });
    be.post({ action: 'putWeeks', token: b.token, weeks: [wk([null, null, day])] });
    now = new Date('2026-12-02T10:00:00Z');
    expect(be.post({ action: 'duels', token: a.token }).duels[0].total).toBe(3);
    now = new Date('2026-12-05T10:00:00Z');
    const ba = be.post({ action: 'rewards', token: a.token }).rewards.balance;
    const d = be.post({ action: 'duels', token: a.token }).duels[0];
    expect(d.status).toBe('done');
    expect(d.winners.sort()).toEqual([a.user.userId, b.user.userId].sort());
    expect(be.post({ action: 'rewards', token: a.token }).rewards.balance).toBe(ba + 50);
  });
});
