import { cycleMark } from '../model';
import type { Mark } from '../types';
import { h } from './dom';
import { aiBadge, aiMark, icon, logo } from './icons';
import { isRTL, lang, setLang, t } from '../i18n';
import { APP_VERSION } from '../version';
import { installButton } from './installButton';

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
        let cur = m;
        const b = h('button', { class: `demo-cell ${cls(m)}`, type: 'button', 'aria-label': `${r.label}: ${m ?? t('ריק')}` }, m ?? '');
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
  const signup = (label = t('להרשמה בחינם'), extra = '') => h('button', { class: `btn btn-primary btn-lg ${extra}`, type: 'button', onclick: () => go('signup') }, label);
  const feature = (ic: string, title: string, text: string, ai = false) =>
    h('div', { class: 'feature' }, h('span', { class: 'feature-icon' }, icon(ic, 24)), h('h3', null, title, ai ? [' ', aiBadge()] : ''), h('p', null, text));
  const faq = (q: string, a: string) => h('details', { class: 'faq-item' }, h('summary', null, q), h('p', null, a));

  const sticky = h('div', { class: 'sticky-cta', hidden: true }, signup(t('להרשמה בחינם'), 'sticky-btn'));
  const page = h('div', { class: 'landing' },
    h('div', { class: 'hero-band' },
      h('header', { class: 'landing-head' },
        h('a', { class: 'landing-brand', href: '#' }, logo(34), h('span', null, t('משמעת אישית'))),
        h('nav', { class: 'landing-actions', 'aria-label': t('כניסה והרשמה') },
          h('button', { class: 'link-btn lang-switch', type: 'button', onclick: () => setLang(lang === 'he' ? 'en' : 'he') }, lang === 'he' ? 'English' : 'עברית'),
          h('button', { class: 'btn btn-on-band', type: 'button', onclick: () => go('login') }, t('כניסה')),
        ),
      ),
      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow' }, 'Every journey starts with one step'),
          h('h1', null, t('טבלה שבועית אחת. הרגלים שנשארים.')),
          h('p', { class: 'lead' }, t('ארוחות בריאות, אימונים ומשקל. מסמנים בהקשה, צוברים מטבעות, ועוזר AI שמכיר את הנתונים שלכם עוזר לראות מה באמת עובד.')),
          h('div', { class: 'hero-cta' },
            signup(),
            h('button', { class: 'btn btn-lg btn-on-band', type: 'button', onclick: () => go('login') }, t('יש לי חשבון')),
          ),
          h('ul', { class: 'hero-points' },
            h('li', null, '✓ ', t('חינם')), h('li', null, '✓ ', t('עובד גם בלי אינטרנט')), h('li', null, '✓ ', t('עברית ואנגלית')), h('li', null, '✓ ', t('נגיש'))),
        ),
        h('div', { class: 'hero-visual' },
          h('div', { class: 'phone' },
            h('div', { class: 'phone-top' }, h('span', { class: 'phone-brand' }, logo(20), t('השבוע שלי')), h('span', { class: 'coin-pill' }, h('span', { class: 'coin' }), '520 · ', t('רמה'), ' 3')),
            demo,
            h('div', { class: 'phone-chat' },
              h('div', { class: 'bubble bubble-user' }, t('תסמן לי צהריים V היום')),
              h('div', { class: 'bubble bubble-assistant' }, h('span', { class: 'bubble-ai' }, aiMark(14)), t('סימנתי. זה היום החמישי ברצף עם צהריים V, ועוד 2 ימים לבונוס הרצף.')),
            ),
          ),
          h('span', { class: 'float-chip chip-a', 'aria-hidden': 'true' }, '🔥 ', t('רצף 5 ימים')),
          h('span', { class: 'float-chip chip-b', 'aria-hidden': 'true' }, '+15 ', h('span', { class: 'coin' }), ' ', t('אתגר יומי')),
        ),
      ),
    ),

    h('section', { class: 'origin' },
      h('p', null, t('האפליקציה נולדה מטבלה שבועית שמולאה ידנית במשך יותר משלוש שנים. אותו עיקרון פשוט, עכשיו עם גרפים, אתגרים ועוזר חכם.')),
    ),

    h('section', { class: 'features' },
      h('h2', null, t('הכול במקום אחד')),
      h('div', { class: 'feature-grid' },
        feature('week', t('טבלה שבועית בהקשה'), t('ראשון עד שבת, ארוחת בוקר, צהריים וערב, ספורט ומשקל התחלתי. הקשה כפולה כותבת טקסט חופשי, כמו "חופשה".')),
        feature('stats', t('סטטיסטיקה אמיתית'), t('גרף משקל לאורך זמן, אחוזי הצלחה לכל ארוחה, אימונים בשבוע, רצפים ומגמה לכל רבעון. עובדות, בלי הטפות.')),
        feature('chat', t('עוזר AI שגם עושה'), t('שואלים בשפה פשוטה ומקבלים תשובה מהנתונים, או מבקשים "תסמן לי אימון ריצה אתמול" והוא מסמן.'), true),
        feature('coin', t('מטבעות, רמות ואתגרים'), t('צוברים מטבעות על ימים מלאים, אימונים ורצפים, עולים ברמות ומשלימים אתגרים יומיים, שבועיים, חודשיים ושנתיים.')),
        feature('profile', t('חברים ודירוג'), t('מזמינים חברים בקוד אישי, מתחרים בטבלת דירוג, ושניכם מקבלים מטבעות כשחבר מצטרף.')),
        feature('history', t('עובד גם בלי אינטרנט'), t('מתקינים כאפליקציה על הטלפון, מסמנים גם בלי קליטה, והכול מסתנכרן כשחוזרת הרשת.')),
      ),
    ),

    h('section', { class: 'levels-band' },
      h('div', null,
        h('h2', null, t('כל יום שווה משהו')),
        h('p', null, t('יום מלא 5 מטבעות, אימון 10, אתגר יומי 15, רצף של שבוע 20. המטבעות פותחים הקפאת רצף, צבעים מיוחדים והודעות נוספות לעוזר.')),
      ),
      h('ol', { class: 'level-ladder', 'aria-label': t('רמות') },
        ...['מתחיל', 'מתמיד', 'ממושמע', 'לוחם', 'אלוף השכונה', 'אגדה'].map((n, i) => h('li', null, h('b', null, String([1, 2, 3, 4, 5, 9][i])), t(n)))),
    ),

    h('section', { class: 'steps' },
      h('h2', null, t('איך מתחילים')),
      h('ol', { class: 'step-list' },
        h('li', null, h('h3', null, t('נרשמים')), h('p', null, t('אימייל וסיסמה, ומתקינים על הטלפון בלחיצה. עם קוד הזמנה מחבר מקבלים 50 מטבעות.'))),
        h('li', null, h('h3', null, t('מסמנים כל יום')), h('p', null, t('V, X או "-" בכל שורה. שקילה פעם בשבוע ביום ראשון.'))),
        h('li', null, h('h3', null, t('רואים את התמונה הגדולה')), h('p', null, t('גרפים, רצפים ואתגרים מראים מה עובד, שבוע אחרי שבוע.'))),
      ),
    ),

    h('section', { class: 'trust' },
      h('h2', null, t('בטוח, פרטי ונגיש')),
      h('div', { class: 'trust-grid' },
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('admin', 26)), h('h3', null, t('אבטחה בכמה שכבות')),
          h('p', null, t('סיסמאות מוצפנות, חסימה אחרי ניסיונות כושלים, אימות דו-שלבי במייל וניתוק כל המכשירים בלחיצה.'))),
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('profile', 26)), h('h3', null, t('הנתונים שלכם נשארים שלכם')),
          h('p', null, t('המנהל רואה רק סיכומים סטטיסטיים, בלי הערות ותמונות. אפשר לייצא הכול בכל רגע.'))),
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('info', 26)), h('h3', null, t('נגיש לכולם')),
          h('p', null, t('תפריט נגישות, ניווט במקלדת ותמיכה בקוראי מסך, לפי התקן הישראלי ת"י 5568.'))),
      ),
    ),

    h('section', { class: 'quote' }, h('blockquote', null, t('אתה לא טובע מהנפילה לנהר, אלא מזה שאתה נשאר שקוע בו!'))),

    h('section', { class: 'faq' },
      h('h2', null, t('שאלות נפוצות')),
      faq(t('כמה זה עולה?'), t('האפליקציה חינמית.')),
      faq(t('הנתונים שלי פרטיים?'), t('הנתונים נשמרים בגיליון Google פרטי של מנהל האפליקציה. באפליקציה המנהל רואה רק סיכומים סטטיסטיים, לא הערות, תמונות שבועיות או פרטים אישיים. אפשר לייצא את כל הנתונים בכל רגע.')),
      faq(t('צריך להוריד מחנות אפליקציות?'), t('לא. פותחים את האתר ובוחרים "התקנת האפליקציה". היא מופיעה במסך הבית כמו כל אפליקציה ועובדת גם בלי אינטרנט.')),
      faq(t('יש לי טבלה ישנה בקובץ Word. אפשר להעביר?'), t('כן. בהגדרות יש ייבוא מקובץ Word: השבועות, המשקל והסימונים נטענים עם תצוגה מקדימה לפני השמירה.')),
      faq(t('מה העוזר יודע ומה לא?'), t('העוזר מכיר את האפליקציה ואת הנתונים שלך בלבד, ועונה רק על שאלות שקשורות אליהם. הוא לא נותן ייעוץ רפואי.')),
    ),

    h('section', { class: 'final-cta' },
      h('h2', null, t('מתחילים את השבוע הראשון')),
      h('div', { class: 'hero-cta' }, signup(), h('button', { class: 'btn btn-lg', type: 'button', onclick: () => go('login') }, t('כניסה'))),
      installButton('btn btn-lg btn-ghost'),
    ),

    h('footer', { class: 'landing-foot' },
      h('div', null, `${t('משמעת אישית')} · v${APP_VERSION}`),
      h('nav', { class: 'foot-links', 'aria-label': t('מידע משפטי') },
        h('a', { href: '#accessibility' }, t('הצהרת נגישות')), ' · ', h('a', { href: '#privacy' }, t('מדיניות פרטיות'))),
      h('div', { class: 'credit' }, t('פותח על ידי'), ' ', h('strong', null, 'AZ Creative')),
    ),
    sticky,
  );
  root.replaceChildren(page);
  // Mobile: a sign-up bar appears once the hero buttons scroll away.
  const heroCta = page.querySelector('.hero-cta');
  if (heroCta && 'IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => (sticky.hidden = e.isIntersecting || !document.body.contains(page))).observe(heroCta);
  }
}
