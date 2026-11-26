import { addDays, daysBetween, formatShort, fromISO, MONTH_NAMES, todayISO } from '../dates';
import { quarterTrends, weightSegments, type WeightPoint } from '../stats';
import { h, s } from './dom';
import { t } from '../i18n';

export interface ChartOptions {
  /** Goal weight: drawn as a dashed line with 🎯. */
  goal?: number;
  /** Sundays of weeks that included a vacation: marked with 🏖️ under the axis. */
  vacations?: string[];
}

type Range = '3m' | '6m' | '1y' | '2y' | 'all';
const RANGES: [Range, string][] = [['3m', '3 חודשים'], ['6m', '6 חודשים'], ['1y', 'שנה'], ['2y', 'שנתיים'], ['all', 'הכל']];
const RANGE_DAYS: Record<Range, number> = { '3m': 92, '6m': 183, '1y': 366, '2y': 731, all: Infinity };

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}

/**
 * Weekly starting weights over time (left → right), with a period filter.
 * Weeks without a weigh-in leave a gap; dashed lines are each quarter's trend.
 */
export function weightChart(all: WeightPoint[], opts: ChartOptions = {}): HTMLElement {
  const wrap = h('div', { class: 'chart' });
  if (all.length < 2) {
    wrap.append(h('p', { class: 'muted' }, t('צריך לפחות שתי שקילות כדי להציג גרף.')));
    return wrap;
  }
  let range: Range = 'all';
  try { range = (localStorage.getItem('mishmaat-chart-range') as Range) || 'all'; } catch { /* ignore */ }
  const seg = h('div', { class: 'seg chart-range', role: 'group', 'aria-label': t('טווח זמן') });
  const summary = h('p', { class: 'chart-summary' });
  const box = h('div', { class: 'chart-box', dir: 'ltr' });
  const draw = () => {
    seg.querySelectorAll('button').forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.r === range)));
    const from = range === 'all' ? '0000' : addDays(todayISO(), -RANGE_DAYS[range]);
    let points = all.filter((p) => p.date >= from);
    if (points.length < 2) points = all.slice(-2);
    const first = points[0], last = points[points.length - 1];
    const change = Math.round((last.weight - first.weight) * 10) / 10;
    summary.textContent = t('בטווח: {a} ק"ג ב-{d1} ← {b} ק"ג ב-{d2} ({c})', {
      a: first.weight.toFixed(1), d1: formatShort(first.date), b: last.weight.toFixed(1), d2: formatShort(last.date),
      c: (change > 0 ? '+' : '') + change.toFixed(1),
    });
    box.replaceChildren(svgChart(points, opts));
  };
  for (const [r, label] of RANGES) {
    const b = h('button', { type: 'button', 'aria-pressed': String(r === range), onclick: () => { range = r; try { localStorage.setItem('mishmaat-chart-range', r); } catch { /* ignore */ } draw(); } }, t(label));
    b.dataset.r = r;
    seg.append(b);
  }
  draw();
  wrap.append(
    h('div', { class: 'chart-top' },
      seg,
      h('div', { class: 'legend' },
        h('span', { class: 'lg lg-line' }, t('משקל התחלתי')),
        h('span', { class: 'lg lg-trend' }, t('מגמה רבעונית')),
        opts.goal ? h('span', { class: 'lg lg-goal' }, '🎯 ', t('יעד')) : '',
      ),
    ),
    summary,
    box,
    h('p', { class: 'hint' }, '🚩 ', t('התחלה'), ' · 🏆 ', t('הכי נמוך'), ' · ⛰️ ', t('הכי גבוה'), ' · 📍 ', t('עכשיו'),
      opts.vacations?.length ? [' · 🏖️ ', t('חופשה')] : '', ' · ', t('שבוע בלי שקילה מופיע כרווח בקו.')),
  );
  return wrap;
}

function svgChart(points: WeightPoint[], opts: ChartOptions): SVGElement {
  const W = 640, H = 290;
  const m = { top: 26, right: 16, bottom: 44, left: 40 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const first = points[0].date, last = points[points.length - 1].date;
  const span = Math.max(1, daysBetween(first, last));
  const ws = points.map((p) => p.weight).concat(opts.goal && opts.goal > 0 ? [opts.goal] : []);
  let lo = Math.min(...ws), hi = Math.max(...ws);
  const pad = Math.max(1, (hi - lo) * 0.1);
  lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);
  const x = (d: string) => m.left + (daysBetween(first, d) / span) * iw; // time flows left → right
  const y = (v: number) => m.top + ih - ((v - lo) / (hi - lo)) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('גרף משקל התחלתי שבועי'), class: 'chart-svg' });
  const step = niceStep((hi - lo) / 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg.append(s('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: m.left - 6, y: y(v) + 4, class: 'axis-label', 'text-anchor': 'end' }, String(v)));
  }
  // x ticks: months for short spans, quarters for medium, years for long
  const monthsSpan = span / 30.4;
  const every = monthsSpan <= 4 ? 1 : monthsSpan <= 14 ? 2 : monthsSpan <= 30 ? 3 : 12;
  const d0 = fromISO(first);
  let yy = d0.getFullYear(), mm = d0.getMonth() + 1;
  if (every === 12) { yy++; mm = 0; }
  for (let guard = 0; guard < 200; guard++) {
    if (mm > 11) { yy += Math.floor(mm / 12); mm %= 12; }
    const tick = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
    if (tick > last) break;
    const tx = x(tick);
    svg.append(s('line', { x1: tx, x2: tx, y1: m.top + ih, y2: m.top + ih + 4, class: 'axis' }));
    svg.append(s('text', { x: tx, y: m.top + ih + 18, class: 'axis-label', 'text-anchor': 'middle' },
      every === 12 ? String(yy) : `${t(MONTH_NAMES[mm]).slice(0, 3)} ${String(yy).slice(2)}`));
    mm += every;
  }
  svg.append(s('line', { x1: m.left, x2: W - m.right, y1: m.top + ih, y2: m.top + ih, class: 'axis' }));

  // goal line
  if (opts.goal && opts.goal > lo && opts.goal < hi) {
    svg.append(s('line', { x1: m.left, x2: W - m.right, y1: y(opts.goal), y2: y(opts.goal), class: 'goal-line' }));
    svg.append(s('text', { x: W - m.right, y: y(opts.goal) - 5, class: 'emoji-label', 'text-anchor': 'end' }, `🎯 ${opts.goal}`));
  }
  // vacations under the axis
  for (const v of opts.vacations ?? []) {
    if (v < first || v > last) continue;
    svg.append(s('text', { x: x(addDays(v, 3)), y: H - 6, class: 'emoji', 'text-anchor': 'middle' }, '🏖️'));
  }
  for (const q of quarterTrends(points)) {
    svg.append(s('line', { x1: x(q.startDate), y1: y(q.startFit), x2: x(q.endDate), y2: y(q.endFit), class: 'trend' }));
  }
  for (const seg of weightSegments(points)) {
    if (seg.length > 1) svg.append(s('polyline', { points: seg.map((p) => `${x(p.date)},${y(p.weight)}`).join(' '), class: 'line' }));
  }
  for (const p of points) svg.append(s('circle', { cx: x(p.date), cy: y(p.weight), r: points.length > 120 ? 2.2 : 3, class: 'dot' }));

  // markers: start, lowest, highest, now
  let min = points[0], max = points[0];
  for (const p of points) { if (p.weight < min.weight) min = p; if (p.weight > max.weight) max = p; }
  const marks: [WeightPoint, string, string][] = [[points[0], '🚩', t('התחלה')], [min, '🏆', t('הכי נמוך')], [max, '⛰️', t('הכי גבוה')], [points[points.length - 1], '📍', t('עכשיו')]];
  const used = new Map<string, number>();
  for (const [p, e, label] of marks) {
    const k = p.date;
    const n = used.get(k) ?? 0; // two icons on the same point sit side by side
    used.set(k, n + 1);
    const above = e !== '🏆';
    svg.append(s('text', { x: Math.min(x(p.date) + n * 16, m.left + iw + 6), y: y(p.weight) + (above ? -9 : 20), class: 'emoji', 'text-anchor': 'middle' }, s('title', {}, `${label}: ${p.weight.toFixed(1)} · ${formatShort(p.date)}`), e));
  }

  // crosshair + tooltip
  const cross = s('line', { y1: m.top, y2: m.top + ih, class: 'crosshair', visibility: 'hidden' });
  const focus = s('circle', { r: 5, class: 'focus-dot', visibility: 'hidden' });
  const tipBg = s('rect', { rx: 6, class: 'tip-bg', visibility: 'hidden' });
  const tipText = s('text', { class: 'tip-text', visibility: 'hidden', 'text-anchor': 'middle' });
  svg.append(cross, focus, tipBg, tipText);
  const hit = s('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const show = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = points[0], bd = Infinity;
    for (const p of points) { const d = Math.abs(x(p.date) - px); if (d < bd) { bd = d; best = p; } }
    const cx = x(best.date), cy = y(best.weight);
    for (const el of [cross]) { el.setAttribute('x1', String(cx)); el.setAttribute('x2', String(cx)); }
    focus.setAttribute('cx', String(cx)); focus.setAttribute('cy', String(cy));
    const label = `${formatShort(best.date)} · ${best.weight.toFixed(1)} ${t('ק"ג')}`;
    tipText.textContent = label;
    const tw = label.length * 6.6 + 16;
    const tx = Math.min(Math.max(cx, m.left + tw / 2), W - m.right - tw / 2);
    tipText.setAttribute('x', String(tx)); tipText.setAttribute('y', String(m.top - 9));
    Object.entries({ x: tx - tw / 2, y: m.top - 24, width: tw, height: 21 }).forEach(([k, v]) => tipBg.setAttribute(k, String(v)));
    [cross, focus, tipBg, tipText].forEach((el) => el.setAttribute('visibility', 'visible'));
  };
  const hide = () => [cross, focus, tipBg, tipText].forEach((el) => el.setAttribute('visibility', 'hidden'));
  hit.addEventListener('pointermove', (e) => show((e as PointerEvent).clientX));
  hit.addEventListener('pointerdown', (e) => show((e as PointerEvent).clientX));
  hit.addEventListener('pointerleave', hide);
  return svg;
}
