/** Day-3 / day-7 survey card on Today (spec: team/specs/beta-feedback.md §1.3). */
import { isRTL, t, tr } from '../i18n';
import { currentUser } from '../session';
import { notifyChange } from '../store';
import { track } from '../analytics';
import { buildAnswer, closeSurvey, currentSurvey, sendSurvey, setSurveyChangeHandler, TEXT_MAX, type SurveyId } from '../survey';
import { h } from './dom';

setSurveyChangeHandler(notifyChange);

/** Thank-you shown for a few seconds after sending, then the card is gone. */
let thanked: SurveyId | null = null;

function questions(s: SurveyId) {
  return s === 'd3'
    ? { q: t('כמה קל היה להתחיל?'), low: t('קשה'), high: t('קל מאוד'), text: t('מה הכי הפריע או בלבל?') }
    : { q: t('כמה האפליקציה עוזרת לך להתמיד?'), low: t('בכלל לא'), high: t('מאוד'), text: t('מה הדבר האחד שהיית רוצה שנוסיף או נתקן?') };
}

/** Five buttons in a radiogroup with a roving tab stop (arrows move, Space/Enter or click picks). */
function scale(id: string, labelId: string, low: string, high: string, onPick: (n: number) => void) {
  let value: number | null = null;
  const btns = [1, 2, 3, 4, 5].map((n) => h('button', {
    class: 'sv-score', type: 'button', role: 'radio', 'aria-checked': 'false', tabindex: n === 1 ? 0 : -1,
    'aria-label': n === 1 ? `1, ${low}` : n === 5 ? `5, ${high}` : String(n),
  }, String(n)));
  const pick = (n: number, focus = true) => {
    value = n;
    btns.forEach((b, i) => { b.setAttribute('aria-checked', String(i + 1 === n)); b.tabIndex = i + 1 === n ? 0 : -1; });
    if (focus) btns[n - 1].focus();
    onPick(n);
  };
  btns.forEach((b, i) => {
    b.addEventListener('click', () => pick(i + 1));
    b.addEventListener('keydown', (e) => {
      const fwd = isRTL ? 'ArrowLeft' : 'ArrowRight', back = isRTL ? 'ArrowRight' : 'ArrowLeft';
      const cur = i + 1;
      let n = 0;
      if (e.key === fwd || e.key === 'ArrowDown') n = Math.min(5, cur + 1);
      else if (e.key === back || e.key === 'ArrowUp') n = Math.max(1, cur - 1);
      else if (e.key === 'Home') n = 1;
      else if (e.key === 'End') n = 5;
      if (n) { e.preventDefault(); pick(n); }
    });
  });
  const el = h('div', { class: 'sv-scale-wrap' },
    h('div', { class: 'sv-scale', role: 'radiogroup', id, 'aria-labelledby': labelId, 'aria-required': 'true' }, btns),
    h('div', { class: 'sv-ends', 'aria-hidden': 'true' }, h('span', null, `1 · ${low}`), h('span', null, `5 · ${high}`)));
  return { el, focus: () => btns[(value ?? 1) - 1].focus() };
}

/** Hide while onboarding, a workout recording, or any sheet/dialog/tour is open. */
function blocked(): boolean {
  if (!currentUser()?.profile?.completed) return true;
  if (document.querySelector('.backdrop, .tour-overlay, .tour-layer, [role="dialog"][aria-modal="true"]')) return true;
  try { if (localStorage.getItem('mishmaat-workout-session')) return true; } catch { /* ignore */ }
  return false;
}

export function surveyCard(): HTMLElement | '' {
  const u = currentUser();
  if (!u) return '';
  if (thanked) {
    return h('section', { class: 'card survey-card sv-thanks', 'aria-live': 'polite' }, h('p', null, '💚 ', t('תודה! זה עוזר לנו')));
  }
  const survey = currentSurvey(u.userId);
  if (!survey || blocked()) return '';

  const q = questions(survey);
  const id = 'sv-' + survey;
  let score: number | null = null;
  const err = h('p', { class: 'field-error', id: id + '-err', hidden: true });
  const sc = scale(id + '-scale', id + '-q', q.low, q.high, (n) => { score = n; err.hidden = true; });
  const text = h('textarea', { class: 'input', id: id + '-text', rows: 2, maxlength: TEXT_MAX, 'aria-describedby': id + '-count' }) as HTMLTextAreaElement;
  const count = h('span', { class: 'muted small', id: id + '-count' }, tr`${0}/${TEXT_MAX}`);
  const reply = h('input', { type: 'checkbox', id: id + '-reply' }) as HTMLInputElement;
  const replyRow = h('label', { class: 'check', for: id + '-reply', hidden: true }, reply, t('אפשר לחזור אליי'));
  text.addEventListener('input', () => { count.textContent = tr`${text.value.length}/${TEXT_MAX}`; replyRow.hidden = !text.value.trim(); });

  const done = (how: string) => { closeSurvey(u.userId); track('survey:' + survey + ':' + how); };
  const card = h('section', { class: 'card survey-card', 'aria-labelledby': id + '-h' });
  const form = h('form', { class: 'stack', novalidate: true },
    h('p', { class: 'sv-q', id: id + '-q' }, q.q),
    sc.el,
    err,
    h('div', { class: 'field' },
      h('label', { for: id + '-text' }, q.text, ' ', h('span', { class: 'muted' }, t('(לא חובה)'))),
      text, count),
    replyRow,
    h('div', { class: 'sv-actions' },
      h('button', { class: 'btn btn-primary', type: 'submit' }, t('שליחה')),
      h('button', { class: 'btn', type: 'button', onclick: () => { void sendSurvey({ survey, skip: 'later' }); done('later'); card.remove(); } }, t('לא עכשיו'))));
  form.addEventListener('submit', (e) => {
    e.preventDefault();
    const a = buildAnswer(survey, score, text.value, reply.checked);
    if (!a) { err.textContent = t('בחר/י ציון מ-1 עד 5'); err.hidden = false; sc.focus(); return; }
    void sendSurvey(a); // offline: queued and sent later; the thank-you shows right away
    done('answer');
    thanked = survey;
    const thanks = surveyCard() as HTMLElement;
    card.replaceWith(thanks);
    setTimeout(() => { thanked = null; thanks.remove(); }, 6000);
  });
  card.append(
    h('div', { class: 'row-between' },
      h('h2', { class: 'card-title', id: id + '-h' }, t('שתי שאלות קצרות')),
      h('button', { class: 'icon-btn sv-close', type: 'button', 'aria-label': t('לא להציג שוב'), title: t('לא להציג שוב'),
        onclick: () => { void sendSurvey({ survey, skip: 'never' }); done('never'); card.remove(); } }, '✕')),
    h('p', { class: 'muted small' }, t('בלי פרטים אישיים. התשובות עוזרות לנו לשפר.')),
    form,
  );
  return card;
}
