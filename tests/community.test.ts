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
