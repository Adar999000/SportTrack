/** Today's session from the active training plan, shown on Today. */
import { t, tr } from '../i18n';
import { DAY_NAMES, dayIndex, sundayOf, todayISO } from '../dates';
import { editWeek, getWeek } from '../store';
import { activePlan, planDef, planWeek, saveActivePlan, todayState, totalSessions, withDone, nextIndex, type ActivePlan, type PlanDef } from '../plans';
import { h, toast } from './dom';
import { celebrate } from './celebrate';
import { HASH } from './router';
import { track } from '../analytics';

/** Rest-day "do it today anyway" choice, for this visit only. */
let anywayOn = '';

/** Write the session into today's sport row and advance the plan. False when the day is locked. */
export function markSessionDone(a: ActivePlan, p: PlanDef, today = todayISO()): boolean {
  const s = p.session(nextIndex(a));
  const sunday = sundayOf(today), i = dayIndex(today);
  editWeek(sunday, (w) => { w.days[i].sport = { status: 'V', label: s.label, countsAsWorkout: true }; });
  if (getWeek(sunday).days[i].sport.label !== s.label) return false; // locked: the store already told the user
  const next = withDone(a, p, today);
  saveActivePlan(next);
  track('plan:done');
  if (nextIndex(next) >= totalSessions(p)) celebrate('week', t('סיימת את התוכנית!'), p.name(), { icon: p.icon });
  else toast(t('כל הכבוד! האימון סומן בטבלה'));
  return true;
}

export function progressBar(a: ActivePlan, p: PlanDef): HTMLElement {
  const n = nextIndex(a), total = totalSessions(p);
  return h('div', { class: 'plan-progress' },
    h('div', { class: 'row-between small' },
      h('span', null, tr`שבוע ${planWeek(a, p)}/${p.weeks}`),
      h('span', { class: 'muted' }, tr`${n} מתוך ${total} אימונים`)),
    h('div', { class: 'bar', role: 'progressbar', 'aria-valuenow': n, 'aria-valuemin': 0, 'aria-valuemax': total, 'aria-label': t('התקדמות בתוכנית') },
      h('span', { style: { width: (n / total) * 100 + '%' } })));
}

const dayName = (iso: string) => t(DAY_NAMES[dayIndex(iso)]);

export function planCard(): HTMLElement | '' {
  const a = activePlan();
  if (!a) return '';
  const p = planDef(a.planId)!;
  const today = todayISO();
  let st = todayState(a, p, today);
  if (st.state === 'rest' && anywayOn === today) st = { state: 'due', index: st.index };

  const head = h('div', { class: 'row-between' },
    h('h2', { class: 'card-title' }, h('span', { 'aria-hidden': 'true' }, p.icon + ' '), p.name()),
    h('a', { class: 'link-btn plan-link', href: HASH.plans }, t('לתוכנית')));

  let body: (HTMLElement | string)[];
  if (st.state === 'finished') {
    body = [h('p', { class: 'plan-headline' }, '🎉 ', t('סיימת את כל האימונים בתוכנית!')),
      h('a', { class: 'btn btn-primary plan-btn', href: HASH.plans }, t('לבחור תוכנית חדשה'))];
  } else if (st.state === 'doneToday') {
    body = [h('p', { class: 'plan-headline' }, h('span', { class: 'plan-ok', 'aria-hidden': 'true' }, '✓ '), t('האימון של היום בוצע')),
      st.nextDate ? h('p', { class: 'muted small' }, tr`האימון הבא: יום ${dayName(st.nextDate)}`) : ''];
  } else if (st.state === 'rest') {
    const s = p.session(st.index);
    body = [h('p', { class: 'plan-headline' }, t('היום יום מנוחה')),
      h('p', { class: 'muted small' }, tr`האימון הבא ביום ${dayName(st.nextDate)}: ${s.headline}`),
      h('button', { class: 'btn plan-btn', type: 'button', onclick: () => { anywayOn = today; card.replaceWith(planCard() || ''); } }, t('לעשות אותו היום'))];
  } else {
    const s = p.session(st.index);
    const done = h('button', { class: 'btn' + (s.kind === 'run' ? '' : ' btn-primary') + ' plan-btn', type: 'button', onclick: () => markSessionDone(a, p, today) },
      '✓ ', t('סיימתי את האימון'));
    body = [
      h('p', { class: 'plan-sub muted small' }, tr`האימון של היום · כ-${s.minutes} דק׳`),
      h('ol', { class: 'plan-steps' }, s.steps.map((x) => h('li', null, x))),
      h('div', { class: 'plan-actions' },
        s.kind === 'run' ? h('a', { class: 'btn btn-primary plan-btn', href: HASH.workout() }, h('span', { 'aria-hidden': 'true' }, '▶ '), t('התחל אימון עם GPS')) : '',
        done),
      s.kind === 'run' ? h('p', { class: 'hint' }, t('אחרי הריצה חוזרים לכאן ומסמנים שסיימת.')) : '',
    ];
  }
  const card = h('section', { class: 'card plan-card', 'aria-label': t('תוכנית האימון שלי') }, head, progressBar(a, p), ...body);
  return card;
}
