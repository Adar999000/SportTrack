import { cycleMark } from '../model';
import type { Mark } from '../types';
import { h } from './dom';
import { icon, logo } from './icons';
import { isRTL, lang, setLang, t } from '../i18n';
import { APP_VERSION } from '../version';

/** Landing page for visitors who aren't signed in. */
export function renderLanding(root: HTMLElement, go: (to: 'login' | 'signup') => void): void {
  const days = isRTL ? ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'] : ['S', 'M', 'T', 'W', 'T', 'F', 'S'];
  const rows: { label: string; marks: (Mark | null)[] }[] = [
    { label: t('בוקר'), marks: ['V', 'V', '-', 'V', 'X', 'V', null] },
    { label: t('צהריים'), marks: ['V', 'V', 'V', 'V', 'V', 'X', null] },
    { label: t('ערב'), marks: ['X', 'V', 'X', 'V', 'V', 'V', null] },
    { label: t('ספורט'), marks: ['V', '-', 'V', '-', 'V', '-', null] },
  ];
  const cls = (m: Mark | null) => (m === 'V' ? 'mark-V' : m === 'X' ? 'mark-X' : m === '-' ? 'mark-dash' : 'mark-empty');
  const demo = h('div', { class: 'demo-table', role: 'group', 'aria-label': t('הדגמה של הטבלה השבועית. אפשר להקיש על תא.') },
    h('span', null), ...days.map((d) => h('span', { class: 'demo-day' }, d)),
    ...rows.flatMap((r) => [
      h('span', { class: 'demo-label' }, r.label),
      ...r.marks.map((m) => {
        const b = h('button', { class: `demo-cell ${cls(m)}`, type: 'button', 'aria-label': `${r.label}: ${m ?? t('ריק')}` }, m ?? '');
        let cur = m;
        b.addEventListener('click', () => {
          cur = cycleMark(cur);
          b.className = `demo-cell ${cls(cur)}`;
          b.textContent = cur ?? '';
          b.setAttribute('aria-label', `${r.label}: ${cur ?? t('ריק')}`);
        });
        return b;
      }),
    ]),
  );

  const feature = (ic: string, title: string, text: string) =>
    h('div', { class: 'feature' }, h('span', { class: 'feature-icon' }, icon(ic, 24)), h('h3', null, title), h('p', null, text));

  root.replaceChildren(
    h('div', { class: 'landing' },
      h('header', { class: 'landing-head' },
        h('a', { class: 'landing-brand', href: '#' }, logo(32), h('span', null, t('משמעת אישית'))),
        h('nav', { class: 'landing-actions', 'aria-label': t('כניסה והרשמה') },
          h('button', { class: 'link-btn lang-switch', type: 'button', onclick: () => setLang(lang === 'he' ? 'en' : 'he') }, lang === 'he' ? 'English' : 'עברית'),
          h('button', { class: 'btn', type: 'button', onclick: () => go('login') }, t('כניסה')),
          h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('signup') }, t('הרשמה')),
        ),
      ),

      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'Every journey starts with one step'),
          h('h1', null, t('טבלה שבועית אחת. הרגלים שנשארים.')),
          h('p', { class: 'lead' }, t('משמעת אישית היא הטבלה השבועית שעבדה שנים על דף, עכשיו בטלפון: ארוחות בריאות, אימונים ומשקל, סימון בהקשה אחת, וגרפים שמראים מה באמת קורה לאורך זמן.')),
          h('div', { class: 'hero-cta' },
            h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => go('signup') }, t('להרשמה')),
            h('button', { class: 'btn btn-lg', type: 'button', onclick: () => go('login') }, t('יש לי חשבון')),
          ),
          h('p', { class: 'hint' }, t('ההרשמה בהזמנה בלבד: מקבלים קישור מחבר שכבר משתמש באפליקציה.')),
        ),
        h('div', { class: 'hero-visual' },
          h('div', { class: 'demo-card' },
            h('div', { class: 'demo-title' }, t('השבוע שלי'), h('span', { class: 'muted small' }, t('הקישו על תא'))),
            demo,
            h('div', { class: 'demo-legend' },
              h('span', null, h('b', { class: 'mark-V' }, 'V'), ' ', t('בוצע')),
              h('span', null, h('b', { class: 'mark-X' }, 'X'), ' ', t('לא בוצע')),
              h('span', null, h('b', { class: 'mark-dash' }, '-'), ' ', t('לא רלוונטי')),
            ),
          ),
        ),
      ),

      h('section', { class: 'features' },
        h('h2', null, t('מה יש בפנים')),
        h('div', { class: 'feature-grid' },
          feature('week', t('טבלה שבועית בהקשה'), t('ראשון עד שבת, ארוחת בוקר, צהריים וערב, ספורט ומשקל התחלתי. הקשה כפולה כותבת טקסט חופשי, כמו "חופשה".')),
          feature('stats', t('סטטיסטיקה אמיתית'), t('גרף משקל לאורך זמן, אחוזי הצלחה לכל ארוחה, אימונים בשבוע, רצפים ומגמה לכל רבעון. עובדות, בלי הטפות.')),
          feature('chat', t('עוזר AI אישי'), t('שואלים בשפה פשוטה, למשל "באיזה חודש התאמנתי הכי הרבה?", ומקבלים תשובה מתוך הנתונים שלכם.')),
          feature('admin', t('מטבעות, רמות ואתגרים'), t('צוברים מטבעות על ימים מלאים, אימונים ורצפים, עולים ברמות ופותחים אתגרים שבועיים, חודשיים ושנתיים.')),
          feature('profile', t('חברים ודירוג'), t('מזמינים חברים בקישור אישי, מתחרים בטבלת דירוג ומקבלים מטבעות על כל חבר שמצטרף.')),
          feature('history', t('עובד גם בלי אינטרנט'), t('מתקינים כאפליקציה על הטלפון, מסמנים גם בלי קליטה, והכול מסתנכרן כשחוזרת הרשת.')),
        ),
      ),

      h('section', { class: 'steps' },
        h('h2', null, t('איך מתחילים')),
        h('ol', { class: 'step-list' },
          h('li', null, h('h3', null, t('מקבלים הזמנה')), h('p', null, t('חבר שולח לכם קישור אישי. נרשמים עם אימייל וסיסמה.'))),
          h('li', null, h('h3', null, t('מסמנים כל יום')), h('p', null, t('V, X או "-" בכל שורה. שקילה פעם בשבוע ביום ראשון.'))),
          h('li', null, h('h3', null, t('רואים את התמונה הגדולה')), h('p', null, t('גרפים, רצפים ואתגרים מראים מה עובד, שבוע אחרי שבוע.'))),
        ),
      ),

      h('section', { class: 'quote' },
        h('blockquote', null, t('אתה לא טובע מהנפילה לנהר, אלא מזה שאתה נשאר שקוע בו!')),
      ),

      h('section', { class: 'privacy-note' },
        h('h2', null, t('הנתונים שלכם')),
        h('p', null, t('הנתונים נשמרים בגיליון Google פרטי של מנהל האפליקציה. באפליקציה המנהל רואה רק סיכומים סטטיסטיים, לא הערות, תמונות שבועיות או פרטים אישיים. אפשר לייצא את כל הנתונים בכל רגע.')),
      ),

      h('section', { class: 'final-cta' },
        h('h2', null, t('מתחילים את השבוע הראשון')),
        h('div', { class: 'hero-cta' },
          h('button', { class: 'btn btn-primary btn-lg', type: 'button', onclick: () => go('signup') }, t('להרשמה')),
          h('button', { class: 'btn btn-lg', type: 'button', onclick: () => go('login') }, t('כניסה')),
        ),
      ),

      h('footer', { class: 'landing-foot' }, `${t('משמעת אישית')} · v${APP_VERSION}`),
    ),
  );
}
