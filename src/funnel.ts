/**
 * Admin funnel (team/specs/beta-metrics.md, sections 1 and 3): turns the `adminFunnel(days)`
 * response into display rows. Counts only, never names or ids.
 */

export interface FunnelResponse {
  days: number;
  from: string;
  to: string;
  visitors: { landing: number; signupOpen: number };
  cohort: {
    signedUp: number; onboarded: number; firstMark: number; firstFullDay: number;
    day3Eligible: number; day3Returned: number; day7Eligible: number; day7Returned: number;
    invitedAny: number; invitedConverted: number;
  };
  weeks: { weekStart: string; signedUp: number; firstMark: number; day7Returned: number }[];
  medianHoursToFirstMark: number | null;
}

export type StepKey = 'landing' | 'signupOpen' | 'signedUp' | 'onboarded' | 'firstMark' | 'firstFullDay' | 'day3' | 'day7' | 'invited';

export interface FunnelRow {
  key: StepKey;
  count: number;
  /** % of signed-up users (for day-3/day-7: % of eligible users). null = not applicable or too few. */
  ofSignedUp: number | null;
  /** % of the previous step. null = first step or too few. */
  ofPrev: number | null;
  /** The denominator was under the minimum, so percentages are hidden. */
  tooFew: boolean;
  /** Denominator used for `ofSignedUp` when it isn't "signed up" (eligible users). */
  base?: number;
}

/** Percentages are hidden when their denominator is under this. */
export const MIN_BASE = 5;

const pct = (n: number, base: number): number | null => (base >= MIN_BASE ? Math.round((n / base) * 100) : null);

export function funnelRows(r: FunnelResponse): FunnelRow[] {
  const c = r.cohort, v = r.visitors, s = c.signedUp;
  const raw: { key: StepKey; count: number; base?: number; visitor?: boolean }[] = [
    { key: 'landing', count: v.landing, visitor: true },
    { key: 'signupOpen', count: v.signupOpen, visitor: true },
    { key: 'signedUp', count: s },
    { key: 'onboarded', count: c.onboarded },
    { key: 'firstMark', count: c.firstMark },
    { key: 'firstFullDay', count: c.firstFullDay },
    { key: 'day3', count: c.day3Returned, base: c.day3Eligible },
    { key: 'day7', count: c.day7Returned, base: c.day7Eligible },
    { key: 'invited', count: c.invitedAny },
  ];
  return raw.map((x, i) => {
    const prev = i ? raw[i - 1].count : 0;
    const base = x.base ?? s;
    const ofSignedUp = x.visitor ? null : x.key === 'signedUp' ? (s ? 100 : null) : pct(x.count, base);
    const ofPrev = i ? pct(x.count, prev) : null;
    const tooFew = (!x.visitor && x.key !== 'signedUp' && base < MIN_BASE) || (i > 0 && prev < MIN_BASE);
    return { key: x.key, count: x.count, ofSignedUp, ofPrev, tooFew, ...(x.base !== undefined ? { base: x.base } : {}) };
  });
}

/** "3.5 h" / "40 min" / null. */
export function formatHours(h: number | null): { n: number; unit: 'min' | 'h' | 'd' } | null {
  if (h === null || !Number.isFinite(h)) return null;
  if (h < 1) return { n: Math.max(1, Math.round(h * 60)), unit: 'min' };
  if (h < 48) return { n: Math.round(h * 10) / 10, unit: 'h' };
  return { n: Math.round((h / 24) * 10) / 10, unit: 'd' };
}
