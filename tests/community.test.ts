import { beforeEach, describe, expect, it } from 'vitest';
// @ts-expect-error plain JS helper
import { createBackend } from './gas/mock.mjs';

describe('custom trackers, feed and events', () => {
  let be: any;
  let admin: any, a: any, friend: any, stranger: any;
  const reg = (email: string, name: string, invite?: string) => be.post({ action: 'register', email, password: 'secret12', name, invite });

  beforeEach(() => {
    be = createBackend();
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
    const texts = (t: string) => be.post({ action: 'feed', token: t }).posts.map((p: any) => p.text);
    expect(texts(a.token)).toEqual(['רק לחברים', 'לכולם']);
    expect(texts(friend.token)).toEqual(['רק לחברים', 'לכולם']);
    expect(texts(stranger.token)).toEqual(['לכולם']);
    expect(be.post({ action: 'feed', token: stranger.token }).posts[0].author.name).toBe('אלף');
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
