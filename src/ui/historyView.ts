import { t, tr } from '../i18n';
import { addDays, daysBetween, sundayOf, todayISO, weekRangeLabel, formatShort } from '../dates';
import { allMealsRatio, workoutsInWeek } from '../stats';
import { allWeeks } from '../store';
import { fmtPct, h } from './dom';
import { HASH, navigate } from './router';

export function renderHistory(root: HTMLElement): void {
  const weeks = allWeeks().reverse();
  const picker = h('input', { type: 'date', class: 'input', value: todayISO(), 'aria-label': t('תאריך בשבוע') });

  const list = h('ol', { class: 'history-list' });
  weeks.forEach((w, idx) => {
    const older = weeks[idx + 1];
    const ratio = allMealsRatio(w.days);
    list.append(
      h('li', null,
        h('button', { class: 'history-item', onclick: () => navigate(HASH.week(w.sundayDate)) },
          h('span', { class: 'hi-range' }, weekRangeLabel(w.sundayDate)),
          h('span', { class: 'hi-stats' },
            h('span', null, h('small', null, t('משקל ')), w.startWeight !== undefined ? w.startWeight.toFixed(1) : '—'),
            h('span', null, h('small', null, t('אימונים ')), workoutsInWeek(w)),
            h('span', null, h('small', null, t('ארוחות ')), fmtPct(ratio.pct)),
          ),
        ),
      ),
    );
    if (older) {
      const gap = daysBetween(older.sundayDate, w.sundayDate) / 7 - 1;
      if (gap > 0) {
        const first = addDays(older.sundayDate, 7);
        list.append(
          h('li', { class: 'gap' },
            h('span', null, gap === 1 ? tr`שבוע חסר (${formatShort(first)})` : tr`${gap} שבועות חסרים`),
            h('button', { class: 'link-btn', onclick: () => navigate(HASH.week(first)) }, t('הוסף')),
          ),
        );
      }
    }
  });

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('פתיחה / הוספת שבוע')),
      h('div', { class: 'inline-form' },
        picker,
        h('button', { class: 'btn btn-primary', onclick: () => picker.value && navigate(HASH.week(sundayOf(picker.value))) }, t('פתח שבוע')),
      ),
    ),
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, tr`היסטוריה · ${weeks.length} שבועות`),
      weeks.length ? list : h('p', { class: 'muted' }, t('אין עדיין שבועות. אפשר להתחיל לסמן בשבוע הנוכחי או לייבא קובץ בהגדרות.')),
    ),
  );
}
