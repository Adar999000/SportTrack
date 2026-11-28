import { describe, expect, it } from 'vitest';
import { formatHours, funnelRows, type FunnelResponse } from '../src/funnel';

const base: FunnelResponse = {
  days: 30, from: '2026-10-28', to: '2026-11-27',
  visitors: { landing: 200, signupOpen: 40 },
  cohort: { signedUp: 20, onboarded: 18, firstMark: 16, firstFullDay: 10, day3Eligible: 16, day3Returned: 8, day7Eligible: 10, day7Returned: 4, invitedAny: 6, invitedConverted: 3 },
  weeks: [], medianHoursToFirstMark: 0.1,
};
const row = (r: ReturnType<typeof funnelRows>, k: string) => r.find((x) => x.key === k)!;

describe('admin funnel rows', () => {
  it('has the nine steps in order', () => {
    expect(funnelRows(base).map((r) => r.key)).toEqual(['landing', 'signupOpen', 'signedUp', 'onboarded', 'firstMark', 'firstFullDay', 'day3', 'day7', 'invited']);
  });

  it('computes % of signed-up and % of previous step', () => {
    const r = funnelRows(base);
    expect(row(r, 'landing')).toMatchObject({ count: 200, ofSignedUp: null, ofPrev: null, tooFew: false });
    expect(row(r, 'signupOpen')).toMatchObject({ ofSignedUp: null, ofPrev: 20 });
    expect(row(r, 'signedUp')).toMatchObject({ ofSignedUp: 100, ofPrev: 50 });
    expect(row(r, 'onboarded')).toMatchObject({ ofSignedUp: 90, ofPrev: 90 });
    expect(row(r, 'firstFullDay')).toMatchObject({ ofSignedUp: 50, ofPrev: 63 });
  });

  it('uses the eligible users for day-3 and day-7 returns', () => {
    const r = funnelRows(base);
    expect(row(r, 'day3')).toMatchObject({ count: 8, base: 16, ofSignedUp: 50 });
    expect(row(r, 'day7')).toMatchObject({ count: 4, base: 10, ofSignedUp: 40 });
  });

  it('hides percentages when the denominator is under 5', () => {
    const r = funnelRows({ ...base, cohort: { ...base.cohort, signedUp: 4, onboarded: 3, day7Eligible: 2, day7Returned: 1 } });
    expect(row(r, 'onboarded')).toMatchObject({ ofSignedUp: null, ofPrev: null, tooFew: true });
    expect(row(r, 'day7')).toMatchObject({ ofSignedUp: null, tooFew: true });
    // the sign-up row itself still shows its count
    expect(row(r, 'signedUp')).toMatchObject({ count: 4, ofSignedUp: 100 });
  });

  it('handles an empty period', () => {
    const z = { ...base, visitors: { landing: 0, signupOpen: 0 }, cohort: Object.fromEntries(Object.keys(base.cohort).map((k) => [k, 0])) as FunnelResponse['cohort'] };
    const r = funnelRows(z);
    expect(r.every((x) => x.count === 0)).toBe(true);
    expect(row(r, 'signedUp').ofSignedUp).toBeNull();
  });
});

describe('median time format', () => {
  it('picks minutes, hours or days', () => {
    expect(formatHours(null)).toBeNull();
    expect(formatHours(0.1)).toEqual({ n: 6, unit: 'min' });
    expect(formatHours(3.46)).toEqual({ n: 3.5, unit: 'h' });
    expect(formatHours(72)).toEqual({ n: 3, unit: 'd' });
  });
});
