/** Admin "Feedback" card: day-3 / day-7 survey results (spec: team/specs/beta-feedback.md §1.4). */
import { t, tr } from '../i18n';
import { call } from '../api';
import { dist5, isUnknownAction, MIN_ANSWERS, shownAverage, type FeedbackAgg, type FeedbackItem, type FeedbackResponse, type SurveyId } from '../survey';
import { formatShort } from '../dates';
import { h } from './dom';

const SURVEY_TITLE = (s: SurveyId) => (s === 'd3' ? t('יום 3: כמה קל היה להתחיל') : t('יום 7: כמה האפליקציה עוזרת להתמיד'));

function item(it: FeedbackItem, openReply: (messageId: string, firstName: string) => void): HTMLElement {
  return h('li', { class: 'fb-item' },
    h('div', { class: 'fb-meta muted small' },
      h('strong', null, it.firstName || t('בלי שם')),
      it.day ? ' · ' + tr`יום ${it.day}` : '',
      ' · ', tr`ציון ${it.score}/5`,
      ' · ', formatShort(String(it.at).slice(0, 10))),
    h('p', { class: 'fb-text' }, it.text),
    it.wantsReply && it.messageId
      ? h('button', { class: 'link-btn fb-reply', type: 'button', onclick: () => openReply(it.messageId!, it.firstName) }, '✉️ ', t('בקשה לתשובה: לשרשור בפניות'))
      : it.wantsReply ? h('span', { class: 'muted small' }, '✉️ ', t('בקשה לתשובה')) : '');
}

function surveyBlock(s: SurveyId, a: FeedbackAgg | undefined, openReply: (messageId: string, firstName: string) => void): HTMLElement {
  const id = 'fb-' + s;
  if (!a || !a.count) {
    return h('section', { class: 'fb-survey', 'aria-labelledby': id }, h('h3', { class: 'section-title', id }, SURVEY_TITLE(s)), h('p', { class: 'muted' }, t('עוד אין תשובות.')));
  }
  const avg = shownAverage(a);
  const d = dist5(a.distribution);
  const max = Math.max(1, ...d);
  const texts = (a.latest ?? []).filter((x) => x.text);
  return h('section', { class: 'fb-survey', 'aria-labelledby': id },
    h('h3', { class: 'section-title', id }, SURVEY_TITLE(s)),
    h('div', { class: 'tiles' },
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('תשובות')), h('div', { class: 'tile-value' }, String(a.count))),
      h('div', { class: 'tile' }, h('div', { class: 'tile-label' }, t('ממוצע')),
        h('div', { class: 'tile-value' }, avg !== null ? `${avg}/5` : h('span', { class: 'fb-few' }, tr`מעט מדי תשובות (פחות מ-${MIN_ANSWERS})`)))),
    h('table', { class: 'data-table fb-dist' },
      h('caption', { class: 'sr-only' }, tr`התפלגות הציונים: ${SURVEY_TITLE(s)}`),
      h('thead', null, h('tr', null, h('th', { scope: 'col' }, t('ציון')), h('th', { scope: 'col' }, t('תשובות')))),
      h('tbody', null, d.map((n, i) => h('tr', null,
        h('th', { scope: 'row' }, h('span', { class: 'an-name' }, String(i + 1)), h('span', { class: 'an-bar', 'aria-hidden': 'true', style: { width: Math.round((n / max) * 100) + '%' } })),
        h('td', null, String(n)))))),
    texts.length
      ? [h('h4', { class: 'fb-sub' }, t('תשובות אחרונות')), h('ul', { class: 'fb-list' }, texts.map((x) => item(x, openReply)))]
      : h('p', { class: 'muted small' }, t('אין עדיין תשובות כתובות.')));
}

/** `openReply` opens the inbox thread that holds the given message (provided by the admin screen). */
export function feedbackCard(openReply: (messageId: string, firstName: string) => void): HTMLElement {
  const body = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  const card = h('section', { class: 'card feedback-card', 'aria-labelledby': 'fb-h' },
    h('h2', { class: 'card-title', id: 'fb-h' }, t('משוב מהמשתמשים')), body);
  call<FeedbackResponse>('adminFeedback')
    .then((r) => body.replaceChildren(
      surveyBlock('d3', r.surveys?.d3, openReply),
      surveyBlock('d7', r.surveys?.d7, openReply),
      h('p', { class: 'hint' }, t('התשובות גלויות רק למנהל. מוצג שם פרטי בלבד, בלי מייל.'))))
    // a server without the survey actions: no card at all
    .catch((e) => { if (isUnknownAction(e)) card.remove(); else body.replaceChildren(h('p', { class: 'form-error' }, e.message)); });
  return card;
}
