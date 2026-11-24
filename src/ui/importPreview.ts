import { weekRangeLabel } from '../dates';
import type { ParseResult } from '../docx';
import { allMealsRatio, workoutsInWeek } from '../stats';
import { hasWeek, putWeeks, updateSettings } from '../store';
import { fmtPct, h, openSheet, toast } from './dom';

export function showDocxPreview(result: ParseResult, filename: string): void {
  const rows = result.weeks.map((p) => ({ ...p, dup: hasWeek(p.week.sundayDate) }));
  const fresh = rows.filter((r) => !r.dup);
  const hasSmoking = fresh.some((r) => r.week.days.some((d) => typeof d.smoked === 'boolean'));

  const list = h('ol', { class: 'preview-list' },
    rows.map((r) =>
      h('li', { class: r.dup ? 'is-dup' : '' },
        h('div', { class: 'pv-head' },
          h('strong', null, weekRangeLabel(r.week.sundayDate)),
          h('span', { class: r.dup ? 'badge badge-muted' : 'badge' }, r.dup ? 'קיים — ידולג' : 'חדש'),
        ),
        h('div', { class: 'pv-stats' },
          `משקל: ${r.week.startWeight?.toFixed(1) ?? '—'} · אימונים: ${workoutsInWeek(r.week)} · ארוחות: ${fmtPct(allMealsRatio(r.week.days).pct)}`,
        ),
        r.issues.length ? h('ul', { class: 'pv-issues' }, r.issues.map((i) => h('li', null, i))) : '',
      ),
    ),
  );

  const body = h('div', { class: 'stack' },
    h('p', null, `${filename}: נמצאו ${rows.length} שבועות, ${fresh.length} חדשים, ${rows.length - fresh.length} כבר קיימים (ידולגו).`),
    result.warnings.length ? h('ul', { class: 'warnings-inline' }, result.warnings.map((w) => h('li', null, w))) : '',
    h('button', {
      class: 'btn btn-primary', disabled: !fresh.length,
      onclick: () => {
        const n = putWeeks(fresh.map((r) => r.week), 'skip-existing');
        if (hasSmoking) updateSettings({ showSmoking: true });
        close();
        toast(`נשמרו ${n} שבועות`);
      },
    }, fresh.length ? `שמור ${fresh.length} שבועות חדשים` : 'אין שבועות חדשים'),
    list,
  );
  const close = openSheet('תצוגה מקדימה — ייבוא מ-Word', body, { full: true });
}
