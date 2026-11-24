import { emptyWeek, sportFromLabel, sportMark } from '../src/model';
import type { Mark, Week } from '../src/types';

/** Build a week from compact strings: meals as 7 chars ("VVX-..." with "." = empty). */
export function week(
  sunday: string,
  opts: { b?: string; l?: string; d?: string; sport?: (string | null)[]; weight?: number; smoke?: string } = {},
): Week {
  const w = emptyWeek(sunday);
  const mark = (c: string): Mark | null => (c === '.' ? null : (c as Mark));
  for (let i = 0; i < 7; i++) {
    if (opts.b) w.days[i].breakfast = mark(opts.b[i]);
    if (opts.l) w.days[i].lunch = mark(opts.l[i]);
    if (opts.d) w.days[i].dinner = mark(opts.d[i]);
    const s = opts.sport?.[i];
    if (s !== undefined && s !== null) w.days[i].sport = s === 'X' || s === '-' ? sportMark(s) : sportFromLabel(s);
    if (opts.smoke) w.days[i].smoked = opts.smoke[i] === 'y' ? true : opts.smoke[i] === 'n' ? false : null;
  }
  if (opts.weight !== undefined) w.startWeight = opts.weight;
  return w;
}
