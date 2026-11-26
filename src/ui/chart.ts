import { isRTL, t, tr } from '../i18n';
import { daysBetween, formatShort, fromISO, MONTH_NAMES } from '../dates';
import { quarterTrends, weightSegments, type WeightPoint } from '../stats';
import { h, s } from './dom';

/**
 * Weekly starting weights as a line that breaks wherever a week has no
 * weigh-in (no interpolation), with a dashed least-squares trend per quarter.
 */
export function weightChart(points: WeightPoint[]): HTMLElement {
  const wrap = h('div', { class: 'chart' });
  if (points.length < 2) {
    wrap.append(h('p', { class: 'muted' }, t('צריך לפחות שתי שקילות כדי להציג גרף.')));
    return wrap;
  }
  const W = 640, H = 260;
  const m = { top: 12, right: 12, bottom: 28, left: 40 };
  const iw = W - m.left - m.right, ih = H - m.top - m.bottom;
  const first = points[0].date, last = points[points.length - 1].date;
  const span = Math.max(1, daysBetween(first, last));
  let lo = Math.min(...points.map((p) => p.weight)), hi = Math.max(...points.map((p) => p.weight));
  const pad = Math.max(1, (hi - lo) * 0.08);
  lo = Math.floor(lo - pad); hi = Math.ceil(hi + pad);

  // Time follows the reading direction: in Hebrew the newest point is on the left.
  const x = (d: string) => (isRTL ? m.left + iw - (daysBetween(first, d) / span) * iw : m.left + (daysBetween(first, d) / span) * iw);
  const y = (v: number) => m.top + ih - ((v - lo) / (hi - lo)) * ih;

  const svg = s('svg', { viewBox: `0 0 ${W} ${H}`, role: 'img', 'aria-label': t('גרף משקל התחלתי שבועי'), class: 'chart-svg' });

  // grid + y labels
  const step = niceStep((hi - lo) / 4);
  for (let v = Math.ceil(lo / step) * step; v <= hi; v += step) {
    svg.append(s('line', { x1: m.left, x2: W - m.right, y1: y(v), y2: y(v), class: 'grid' }));
    svg.append(s('text', { x: m.left - 6, y: y(v) + 4, class: 'axis-label', 'text-anchor': 'end' }, String(v)));
  }
  // x ticks: every 2 months for spans under ~16 months, otherwise each Jan 1
  const monthly = span < 500;
  const d0 = fromISO(first);
  let yy = d0.getFullYear(), mm = monthly ? d0.getMonth() + 1 : 0; // mm: 0-based
  if (!monthly) yy++;
  for (;;) {
    if (mm > 11) { yy += Math.floor(mm / 12); mm %= 12; }
    const tick = `${yy}-${String(mm + 1).padStart(2, '0')}-01`;
    if (tick > last) break;
    const tx = x(tick);
    svg.append(s('line', { x1: tx, x2: tx, y1: m.top + ih, y2: m.top + ih + 4, class: 'axis' }));
    svg.append(s('text', { x: tx, y: H - 8, class: 'axis-label', 'text-anchor': 'middle' },
      monthly ? `${t(MONTH_NAMES[mm]).slice(0, 3)} ${String(yy).slice(2)}` : String(yy)));
    if (monthly) mm += 2; else yy++;
  }
  svg.append(s('line', { x1: m.left, x2: W - m.right, y1: m.top + ih, y2: m.top + ih, class: 'axis' }));

  // quarter trend lines
  for (const q of quarterTrends(points)) {
    svg.append(s('line', { x1: x(q.startDate), y1: y(q.startFit), x2: x(q.endDate), y2: y(q.endFit), class: 'trend' }));
  }
  // weight segments (gaps stay gaps) + markers
  for (const seg of weightSegments(points)) {
    if (seg.length > 1) svg.append(s('polyline', { points: seg.map((p) => `${x(p.date)},${y(p.weight)}`).join(' '), class: 'line' }));
  }
  for (const p of points) svg.append(s('circle', { cx: x(p.date), cy: y(p.weight), r: 2.6, class: 'dot' }));

  // crosshair + tooltip
  const cross = s('line', { y1: m.top, y2: m.top + ih, class: 'crosshair', visibility: 'hidden' });
  const focus = s('circle', { r: 5, class: 'focus-dot', visibility: 'hidden' });
  svg.append(cross, focus);
  const tip = h('div', { class: 'tooltip', hidden: true });
  const hit = s('rect', { x: m.left, y: m.top, width: iw, height: ih, fill: 'transparent' });
  svg.append(hit);
  const show = (clientX: number) => {
    const r = svg.getBoundingClientRect();
    const px = ((clientX - r.left) / r.width) * W;
    let best = points[0], bd = Infinity;
    for (const p of points) {
      const d = Math.abs(x(p.date) - px);
      if (d < bd) { bd = d; best = p; }
    }
    const cx = x(best.date), cy = y(best.weight);
    cross.setAttribute('x1', String(cx)); cross.setAttribute('x2', String(cx));
    focus.setAttribute('cx', String(cx)); focus.setAttribute('cy', String(cy));
    cross.setAttribute('visibility', 'visible'); focus.setAttribute('visibility', 'visible');
    tip.textContent = tr`${formatShort(best.date)} · ${best.weight.toFixed(1)} ק"ג`;
    tip.hidden = false;
    const left = (cx / W) * r.width;
    tip.style.left = `${Math.min(Math.max(left, 60), r.width - 60)}px`;
  };
  const hide = () => {
    cross.setAttribute('visibility', 'hidden'); focus.setAttribute('visibility', 'hidden'); tip.hidden = true;
  };
  hit.addEventListener('pointermove', (e) => show((e as PointerEvent).clientX));
  hit.addEventListener('pointerdown', (e) => show((e as PointerEvent).clientX));
  hit.addEventListener('pointerleave', hide);

  wrap.append(
    h('div', { class: 'legend' },
      h('span', { class: 'lg lg-line' }, t('משקל התחלתי')),
      h('span', { class: 'lg lg-trend' }, t('מגמה רבעונית')),
    ),
    h('div', { class: 'chart-box' }, svg, tip),
    h('p', { class: 'hint' }, t('שבוע בלי שקילה מופיע כרווח בקו.')),
  );
  return wrap;
}

function niceStep(raw: number): number {
  const p = Math.pow(10, Math.floor(Math.log10(raw)));
  const n = raw / p;
  return (n <= 1 ? 1 : n <= 2 ? 2 : n <= 5 ? 5 : 10) * p;
}
