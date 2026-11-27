/** "Training plans": pick a ready-made plan, see its weeks, stop it. */
import { lang, t, tr } from '../i18n';
import { DAY_NAMES, todayISO } from '../dates';
import { activePlan, newPlan, planDef, PLANS, saveActivePlan, stopPlan, DEFAULT_DAYS, type PlanDef } from '../plans';
import { confirmButton, h, toast } from './dom';
import { HASH, navigate } from './router';
import { progressBar } from './planCard';
import { track } from '../analytics';

const SHORT_DAYS = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/** Three weekday toggles; returns the element and the chosen days. */
function dayPicker(p: PlanDef, id: string): { el: HTMLElement; value: () => number[] } {
  const chosen = new Set(DEFAULT_DAYS);
  const note = h('p', { class: 'hint', id: id + '-hint', 'aria-live': 'polite' });
  const btns = DAY_NAMES.map((n, i) => {
    const b = h('button', { class: 'chip plan-day', type: 'button', 'aria-pressed': String(chosen.has(i)), 'aria-label': t(n) },
      h('span', { 'aria-hidden': 'true' }, lang === 'en' ? t(n).slice(0, 3) : SHORT_DAYS[i]));
    b.addEventListener('click', () => {
      if (chosen.has(i)) chosen.delete(i);
      else if (chosen.size < p.perWeek) chosen.add(i);
      else { note.textContent = tr`אפשר לבחור ${p.perWeek} ימים. קודם מבטלים יום אחר.`; return; }
      b.setAttribute('aria-pressed', String(chosen.has(i)));
      note.textContent = '';
    });
    return b;
  });
  const el = h('div', { class: 'stack' },
    h('p', { class: 'small', id: id + '-lbl' }, tr`בחר/י ${p.perWeek} ימי אימון בשבוע:`),
    h('div', { class: 'plan-days', role: 'group', 'aria-labelledby': id + '-lbl', 'aria-describedby': id + '-hint' }, btns),
    note);
  return { el, value: () => [...chosen] };
}

function weekList(p: PlanDef): HTMLElement {
  return h('details', { class: 'plan-weeks' },
    h('summary', null, t('מה יש בכל שבוע')),
    h('ol', null, Array.from({ length: p.weeks }, (_, w) =>
      h('li', null, h('strong', null, tr`שבוע ${w + 1}: `), p.session(w * p.perWeek).headline))));
}

export function renderPlans(main: HTMLElement): void {
  const draw = () => {
    const a = activePlan();
    const cur = a ? planDef(a.planId)! : null;
    const activeCard = a && cur ? h('section', { class: 'card stack plan-active', 'aria-label': t('התוכנית הפעילה') },
      h('h2', { class: 'card-title' }, h('span', { 'aria-hidden': 'true' }, cur.icon + ' '), cur.name()),
      progressBar(a, cur),
      h('p', { class: 'muted small' }, tr`ימי אימון: ${a.days.map((d) => t(DAY_NAMES[d])).join(', ')}`),
      h('div', { class: 'row-btns two' },
        h('a', { class: 'btn btn-primary plan-btn', href: HASH.week() }, t('לאימון של היום')),
        confirmButton(t('עצירת התוכנית'), t('הקש/י שוב לעצירה'), () => { stopPlan(); track('plan:stop'); toast(t('התוכנית נעצרה')); draw(); }, 'btn btn-danger plan-btn')),
      h('p', { class: 'hint' }, t('האימונים שכבר סומנו נשארים בטבלה.'))) : '';

    const cards = PLANS.map((p) => {
      const isCur = a?.planId === p.id;
      const picker = dayPicker(p, 'pd-' + p.id);
      const start = h('button', { class: 'btn btn-primary plan-btn', type: 'button' }, a ? t('להחליף לתוכנית הזאת') : t('להתחיל את התוכנית'));
      start.addEventListener('click', () => {
        const days = picker.value();
        if (days.length !== p.perWeek) { toast(tr`צריך לבחור ${p.perWeek} ימים`); return; }
        saveActivePlan(newPlan(p.id, todayISO(), days));
        track('plan:start:' + p.id);
        toast(t('התוכנית התחילה. האימון יופיע בדף היום.'));
        navigate(HASH.week());
      });
      return h('section', { class: 'card stack plan-option', 'aria-labelledby': 'plan-h-' + p.id },
        h('h2', { class: 'card-title', id: 'plan-h-' + p.id }, h('span', { 'aria-hidden': 'true' }, p.icon + ' '), p.name()),
        h('p', null, p.desc()),
        h('p', { class: 'muted small' }, tr`${p.weeks} שבועות · ${p.perWeek} אימונים בשבוע`),
        weekList(p),
        isCur ? h('p', { class: 'plan-headline' }, '✓ ', t('זו התוכנית הפעילה שלך')) : [picker.el, start]);
    });

    main.replaceChildren(
      h('h1', { class: 'page-title' }, t('תוכניות אימון')),
      h('p', { class: 'muted' }, t('בוחרים תוכנית, והאימון של היום מופיע בדף היום. מסמנים שסיימת, והוא נכנס לטבלה.')),
      activeCard,
      ...cards,
    );
  };
  draw();
}
