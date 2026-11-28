import { beforeEach, describe, expect, it, vi } from 'vitest';

const store = new Map<string, unknown>();
const calls: { action: string; payload: any }[] = [];
let mode: 'ok' | 'offline' | 'refuse' | 'unknown' = 'ok';
let statusReply: any = { survey: 'd3' };

vi.mock('../src/db', () => ({
  kvGet: async (k: string) => store.get(k),
  kvSet: async (k: string, v: unknown) => { store.set(k, structuredClone(v)); },
}));
vi.mock('../src/api', () => {
  class NetworkError extends Error {}
  return {
    NetworkError,
    hasBackend: () => true,
    call: async (action: string, payload: any = {}) => {
      if (mode === 'offline') throw new NetworkError('offline');
      if (mode === 'unknown') throw new Error('פעולה לא מוכרת: ' + action);
      if (mode === 'refuse') throw new Error('כבר ענית');
      calls.push({ action, payload });
      return action === 'surveyStatus' ? statusReply : { ok: true };
    },
  };
});

const S = await import('../src/survey');

beforeEach(() => { store.clear(); calls.length = 0; mode = 'ok'; statusReply = { survey: 'd3' }; });

describe('survey answer', () => {
  it('needs a whole score from 1 to 5', () => {
    expect(S.buildAnswer('d3', null, '', false)).toBeNull();
    expect(S.buildAnswer('d3', 0, '', false)).toBeNull();
    expect(S.buildAnswer('d3', 6, '', false)).toBeNull();
    expect(S.buildAnswer('d3', 2.5, '', false)).toBeNull();
    expect(S.buildAnswer('d7', 4, '', false)).toEqual({ survey: 'd7', score: 4 });
  });

  it('trims the text to 500 and sends "contact me" only with text', () => {
    expect(S.buildAnswer('d3', 3, '   ', true)).toEqual({ survey: 'd3', score: 3 });
    const a = S.buildAnswer('d3', 3, ' x'.repeat(400), true)!;
    expect(a.text!.length).toBe(S.TEXT_MAX);
    expect(a.wantsReply).toBe(true);
    expect(S.buildAnswer('d3', 5, 'נהדר', false)).toEqual({ survey: 'd3', score: 5, text: 'נהדר', wantsReply: false });
  });
});

describe('admin aggregates', () => {
  it('hides the average under 5 answers', () => {
    expect(S.shownAverage({ count: 4, average: 4.2, distribution: [0, 0, 1, 1, 2], latest: [] })).toBeNull();
    expect(S.shownAverage({ count: 5, average: 3.66, distribution: [], latest: [] })).toBe(3.7);
  });
  it('computes the average from the distribution when the server omits it', () => {
    expect(S.shownAverage({ count: 6, distribution: [1, 0, 1, 2, 2], latest: [] })).toBe(3.7);
  });
  it('normalizes the distribution to 5 numbers', () => {
    expect(S.dist5([1, 2])).toEqual([1, 2, 0, 0, 0]);
    expect(S.dist5(undefined)).toEqual([0, 0, 0, 0, 0]);
  });
  it('recognizes a server without the survey actions', () => {
    expect(S.isUnknownAction(new Error('פעולה לא מוכרת: surveyStatus'))).toBe(true);
    expect(S.isUnknownAction(new Error('Unknown action'))).toBe(true);
    expect(S.isUnknownAction(new Error('כבר ענית'))).toBe(false);
  });
});

describe('sending and the offline queue', () => {
  it('sends right away when online', async () => {
    expect(await S.sendSurvey({ survey: 'd3', score: 4 })).toBe('sent');
    expect(calls).toEqual([{ action: 'submitSurvey', payload: { survey: 'd3', score: 4 } }]);
  });

  it('queues offline, keeps one entry per survey, and sends exactly once when back online', async () => {
    mode = 'offline';
    expect(await S.sendSurvey({ survey: 'd3', score: 2 })).toBe('queued');
    expect(await S.sendSurvey({ survey: 'd3', score: 5, text: 'אחרי שינוי' })).toBe('queued');
    expect(await S.sendSurvey({ survey: 'd7', skip: 'later' })).toBe('queued');
    expect((store.get('outbox-survey') as unknown[]).length).toBe(2);
    mode = 'ok';
    expect(await S.flushSurveyQueue()).toBe(2);
    expect(calls.map((c) => c.payload)).toEqual([{ survey: 'd3', score: 5, text: 'אחרי שינוי' }, { survey: 'd7', skip: 'later' }]);
    expect(await S.flushSurveyQueue()).toBe(0);
    expect(calls.length).toBe(2);
  });

  it('drops an answer the server refuses instead of retrying forever', async () => {
    mode = 'refuse';
    expect(await S.sendSurvey({ survey: 'd3', score: 1 })).toBe('dropped');
    expect(store.get('outbox-survey')).toBeUndefined();
  });
});

describe('status', () => {
  it('asks the server once and shows the survey it names', async () => {
    const onChange = vi.fn();
    S.setSurveyChangeHandler(onChange);
    expect(S.currentSurvey('u1')).toBeNull(); // unknown until the server answers
    await new Promise((r) => setTimeout(r, 0));
    expect(S.currentSurvey('u1')).toBe('d3');
    expect(onChange).toHaveBeenCalledOnce();
    expect(calls.filter((c) => c.action === 'surveyStatus').length).toBe(1);
    S.closeSurvey('u1');
    expect(S.currentSurvey('u1')).toBeNull();
  });

  it('stays hidden when the server has no survey actions', async () => {
    mode = 'unknown';
    expect(S.currentSurvey('u2')).toBeNull();
    await new Promise((r) => setTimeout(r, 0));
    mode = 'ok';
    expect(S.currentSurvey('u2')).toBeNull();
    expect(calls.length).toBe(0);
  });
});
