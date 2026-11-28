import { cycleMark } from '../model';
import type { Mark } from '../types';
import { h } from './dom';
import { aiBadge, icon, logo } from './icons';
import { lang, setLang, t, tr } from '../i18n';
import { APP_VERSION } from '../version';
import { installButton } from './installButton';
import { getSettings, updateSettings } from '../store';
import { trackLanding } from '../analytics';

function isDark(): boolean {
  const th = getSettings().theme;
  return th === 'dark' || (th === 'auto' && matchMedia('(prefers-color-scheme: dark)').matches);
}

/** Top menu: section links (scroll, not routes), theme, language, sign in / sign up; a ☰ menu on phones. */
function landingHeader(go: (to: 'login' | 'signup') => void): HTMLElement {
  const links: [string, string][] = [['features', 'תכונות'], ['peek', 'הצצה'], ['how', 'איך זה עובד'], ['coins', 'מטבעות ואתגרים'], ['trust', 'אבטחה ופרטיות'], ['faq', 'שאלות נפוצות']];
  const jump = (id: string) => {
    menu.hidden = true; burger.setAttribute('aria-expanded', 'false');
    const el = document.getElementById(id);
    el?.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
    (el?.querySelector('h2') as HTMLElement | null)?.setAttribute('tabindex', '-1');
    (el?.querySelector('h2') as HTMLElement | null)?.focus({ preventScroll: true });
  };
  const themeBtn = h('button', { class: 'icon-btn btn-on-band theme-toggle', type: 'button' });
  const drawTheme = () => {
    const dark = isDark();
    themeBtn.replaceChildren(icon(dark ? 'sun' : 'moon', 20));
    themeBtn.setAttribute('aria-label', dark ? t('מעבר למצב בהיר') : t('מעבר למצב כהה'));
    themeBtn.title = themeBtn.getAttribute('aria-label')!;
  };
  themeBtn.addEventListener('click', () => { updateSettings({ theme: isDark() ? 'light' : 'dark' }); drawTheme(); });
  drawTheme();
  const linkButtons = () => links.map(([id, label]) => h('button', { class: 'nav-link', type: 'button', onclick: () => jump(id) }, t(label)));
  const menu = h('div', { class: 'landing-menu', id: 'landing-menu', hidden: true },
    ...linkButtons(),
    h('a', { class: 'nav-link', href: '#accessibility' }, t('נגישות')),
    h('button', { class: 'nav-link', type: 'button', onclick: () => setLang(lang === 'he' ? 'en' : 'he') }, lang === 'he' ? 'English' : 'עברית'),
    h('div', { class: 'menu-cta' },
      h('button', { class: 'btn', type: 'button', onclick: () => go('login') }, t('כניסה')),
      h('button', { class: 'btn btn-primary', type: 'button', onclick: () => go('signup') }, t('הרשמה'))),
  );
  const burger = h('button', { class: 'icon-btn btn-on-band burger', type: 'button', 'aria-label': t('תפריט'), 'aria-expanded': 'false', 'aria-controls': 'landing-menu' }, '☰');
  burger.addEventListener('click', () => { menu.hidden = !menu.hidden; burger.setAttribute('aria-expanded', String(!menu.hidden)); });
  return h('header', { class: 'landing-head' },
    h('a', { class: 'landing-brand', href: '#' }, logo(34), h('span', null, t('משמעת אישית'))),
    h('nav', { class: 'landing-nav', 'aria-label': t('ניווט ראשי') }, ...linkButtons()),
    h('div', { class: 'landing-actions' },
      h('a', { class: 'icon-btn btn-on-band a11y-link', href: '#accessibility', 'aria-label': t('הצהרת נגישות'), title: t('הצהרת נגישות') }, icon('access', 20)),
      h('button', { class: 'link-btn lang-switch', type: 'button', lang: lang === 'he' ? 'en' : 'he', onclick: () => setLang(lang === 'he' ? 'en' : 'he') }, lang === 'he' ? 'English' : 'עברית'),
      themeBtn,
      h('button', { class: 'btn btn-on-band desk-only', type: 'button', onclick: () => go('login') }, t('כניסה')),
      h('button', { class: 'btn btn-white desk-only', type: 'button', onclick: () => go('signup') }, t('הרשמה')),
      burger,
    ),
    menu,
  );
}

/** A 12-second muted loop of the real app. Pausable (WCAG 2.2.2); still image when motion is reduced; plays only while visible. */
function demoVideo(): HTMLElement {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion');
  const v = h('video', { class: 'demo-video', muted: true, loop: true, playsinline: true, preload: 'none', poster: 'demo-poster.webp', width: 360, height: 612,
    'aria-label': t('סרטון קצר: סימון ארוחה, מסך ההתקדמות וסטורי של אימון') }, h('source', { src: 'demo.mp4', type: 'video/mp4' })) as HTMLVideoElement;
  v.muted = true; v.setAttribute('muted', '');
  const btn = h('button', { class: 'demo-toggle', type: 'button' });
  const draw = () => { btn.textContent = v.paused ? '▶ ' + t('הפעלה') : '❚❚ ' + t('השהיה'); btn.setAttribute('aria-pressed', String(!v.paused)); };
  let userPaused = reduce;
  btn.addEventListener('click', () => { if (v.paused) { userPaused = false; v.play().catch(() => {}); } else { userPaused = true; v.pause(); } });
  v.addEventListener('play', draw); v.addEventListener('pause', draw);
  draw();
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(([e]) => { if (e.isIntersecting && !userPaused) v.play().catch(() => {}); else if (!e.isIntersecting) v.pause(); }, { threshold: 0.4 }).observe(v);
  }
  return h('div', { class: 'demo-wrap' }, h('div', { class: 'demo-phone' }, v), btn);
}

/** A small, working copy of the app's Today screen: tap a task to cycle V / X / – and the rings follow. */
function todayMock(live: HTMLElement): HTMLElement {
  const tasks: { label: string; mark: Mark | null }[] = [
    { label: t('בוקר'), mark: 'V' }, { label: t('צהריים'), mark: 'V' }, { label: t('ערב'), mark: null }, { label: t('ספורט'), mark: null },
  ];
  const NS = 'http://www.w3.org/2000/svg';
  const rings = document.createElementNS(NS, 'svg');
  rings.setAttribute('viewBox', '0 0 100 100'); rings.setAttribute('class', 'rings mock-rings'); rings.setAttribute('aria-hidden', 'true');
  const grid = h('div', { class: 'mock-grid' });
  const note = h('p', { class: 'mock-next' });
  const draw = () => {
    const meals = tasks.slice(0, 3).filter((x) => x.mark === 'V').length;
    const sport = tasks[3].mark === 'V' ? 1 : 0;
    const full = tasks.every((x) => x.mark);
    rings.innerHTML = ([[42, meals / 3, 'r-meals'], [31, sport, 'r-sport'], [20, (4 + (full ? 1 : 0)) / 7, 'r-week']] as [number, number, string][]).map(([r, p, cls]) => {
      const c = 2 * Math.PI * r;
      return `<circle cx="50" cy="50" r="${r}" class="ring-track ${cls}"/><circle cx="50" cy="50" r="${r}" class="ring-val ${cls}" stroke-dasharray="${c}" stroke-dashoffset="${c * (1 - Math.min(1, p))}" transform="rotate(-90 50 50)"/>`;
    }).join('');
    const next = tasks.find((x) => !x.mark);
    note.textContent = full ? t('היום סגור! +5 מטבעות') : tr`הבא בתור: ${next!.label}`;
    grid.replaceChildren(...tasks.map((x) => {
      const b = h('button', { class: `today-btn ${cls(x.mark)}`, type: 'button', 'aria-label': `${x.label}: ${x.mark ?? t('ריק')}` },
        h('span', { class: 'today-title' }, x.label), x.mark ? h('span', { class: 'today-val' }, x.mark) : h('span', { class: 'today-empty' }, t('לא סומן')));
      b.addEventListener('click', () => { x.mark = cycleMark(x.mark); draw(); live.textContent = `${x.label}: ${x.mark ?? t('ריק')}`; (grid.children[tasks.indexOf(x)] as HTMLElement)?.focus(); });
      return b;
    }));
  };
  const cls = (m: Mark | null) => (m === 'V' ? 'mark-V' : m === 'X' ? 'mark-X' : m === '-' ? 'mark-dash' : 'mark-empty');
  draw();
  return h('div', { class: 'mock-today', role: 'group', 'aria-label': t('דוגמה למסך "היום". אפשר להקיש על משימה.') },
    h('div', { class: 'mock-head' }, h('div', null, h('p', { class: 'greet' }, t('בוקר טוב')), h('strong', null, t('היום')), note), rings),
    grid);
}

/** Landing page for visitors who aren't signed in. */
export function renderLanding(root: HTMLElement, goTo: (to: 'login' | 'signup') => void): void {
  trackLanding('landing:view');
  const go = (to: 'login' | 'signup') => { if (to === 'signup') trackLanding('landing:cta'); goTo(to); };
  const demoLive = h('span', { class: 'sr-only', 'aria-live': 'polite' });
  const signup = (label = t('להרשמה בחינם'), extra = '') => h('button', { class: `btn btn-primary btn-lg ${extra}`, type: 'button', onclick: () => go('signup') }, label);
  const feature = (ic: string, title: string, text: string, ai = false) =>
    h('div', { class: 'feature' }, h('span', { class: 'feature-icon' }, icon(ic, 24)), h('h3', null, title, ai ? [' ', aiBadge()] : ''), h('p', null, text));
  const faq = (q: string, a: string) => h('details', { class: 'faq-item' }, h('summary', null, q), h('p', null, a));

  const sticky = h('div', { class: 'sticky-cta', hidden: true }, signup(t('להרשמה בחינם'), 'sticky-btn'));
  const page = h('div', { class: 'landing' },
    h('div', { class: 'hero-band' },
      landingHeader(go),
      h('section', { class: 'hero' },
        h('div', { class: 'hero-copy' },
          h('p', { class: 'eyebrow', lang: 'en', dir: 'ltr' }, 'Every journey starts with one step'),
          h('h1', null, t('ההרגלים שלך.'), h('br'), h('span', { class: 'hero-accent' }, t('החברים שדוחפים.'))),
          h('p', { class: 'lead' }, t('30 שניות ביום: מסמנים ארוחות ואימון בהקשה, והטבעות מראות את ההתקדמות. ואם רוצים, מתחרים עם חבר אחד באתגר.')),
          h('div', { class: 'hero-cta' },
            signup(),
            h('button', { class: 'btn btn-lg btn-on-band', type: 'button', onclick: () => go('login') }, t('יש לי חשבון')),
          ),
          h('ul', { class: 'hero-points' },
            h('li', null, '✓ ', t('חינם')), h('li', null, '✓ ', t('עובד גם בלי אינטרנט')), h('li', null, '✓ ', t('עברית ואנגלית')), h('li', null, '✓ ', t('נגיש'))),
        ),
        h('div', { class: 'hero-visual' },
          h('p', { class: 'mock-label' }, t('דוגמה: כך נראה מסך היום')),
          h('div', { class: 'phone' },
            h('div', { class: 'phone-top' }, h('span', { class: 'phone-brand' }, logo(20), t('משמעת אישית')), h('span', { class: 'coin-pill' }, h('span', { class: 'coin' }), '520 · ', t('רמה'), ' 3')),
            todayMock(demoLive), demoLive,
            h('div', { class: 'mock-story' }, h('span', { class: 'mock-story-ring' }, '🏃'), h('span', null, t('סטורי לדוגמה: 8.1 ק"מ')), h('span', { class: 'mock-five' }, '🙌')),
          ),
          h('span', { class: 'float-chip chip-a', 'aria-hidden': 'true' }, '🔥 ', t('רצף 5 ימים')),
          h('span', { class: 'float-chip chip-b', 'aria-hidden': 'true' }, '🏆 ', t('ליגת זהב · מקום 2')),
        ),
      ),
    ),

    h('section', { class: 'origin' },
      h('p', null, t('האפליקציה נולדה מטבלה שבועית שמולאה ידנית במשך יותר משלוש שנים. אותו עיקרון פשוט, עכשיו עם גרפים, אתגרים ועוזר חכם.')),
    ),

    h('section', { class: 'steps', id: 'how' },
      h('h2', null, t('איך מתחילים')),
      h('ol', { class: 'step-list' },
        h('li', null, h('h3', null, t('נרשמים ובוחרים מטרות')), h('p', null, t('אימייל וסיסמה, בוחרים מה חשוב לכם (ירידה במשקל, כושר, שינה ועוד) ומתקינים על הטלפון. משימות השבוע הראשון שוות 100 מטבעות.'))),
        h('li', null, h('h3', null, t('מסמנים את היום')), h('p', null, t('במסך "היום" מקישים על כל משימה: V עשיתי, X לא הפעם. שקילה פעם בשבוע, ואימון אפשר להקליט עם GPS.'))),
        h('li', null, h('h3', null, t('מתקדמים עם חברים')), h('p', null, t('גרפים וסיכום שבועי מראים מה עובד. מזמינים חברים, פותחים אתגר או יעד קבוצתי, ומשתפים סטורי.'))),
      ),
    ),

    h('section', { class: 'features', id: 'features' },
      h('h2', null, t('הכול במקום אחד')),
      h('div', { class: 'feature-grid' },
        feature('week', t('טבלה שבועית בהקשה'), t('ראשון עד שבת, ארוחת בוקר, צהריים וערב, ספורט ומשקל התחלתי. הקשה כפולה כותבת טקסט חופשי, כמו "חופשה".')),
        feature('stats', t('סטטיסטיקה אמיתית'), t('גרף משקל לאורך זמן, אחוזי הצלחה לכל ארוחה, אימונים בשבוע, רצפים ומגמה לכל רבעון. עובדות, בלי הטפות.')),
        feature('feed', t('סטוריז וקהילה'), t('סטורי ל-24 שעות עם נתוני האימון או תמונה מהגלריה, פיד עם חברים, מפגשי ריצה משותפים, והיי פייב במקום לייק.')),
        feature('history', t('עובד גם בלי אינטרנט'), t('מתקינים כאפליקציה על הטלפון, מסמנים גם בלי קליטה, והכול מסתנכרן כשחוזרת הרשת.')),
      ),
      h('details', { class: 'more-features' }, h('summary', null, t('עוד תכונות')),
        h('div', { class: 'feature-grid' },
          feature('chat', t('עוזר AI שגם עושה'), t('שואלים בשפה פשוטה ומקבלים תשובה מהנתונים, או מבקשים "תסמן לי אימון ריצה אתמול" והוא מסמן.'), true),
          feature('coin', t('מטבעות, רמות ואתגרים'), t('צוברים מטבעות על ימים מלאים, אימונים ורצפים, עולים ברמות ומשלימים אתגרים יומיים, שבועיים, חודשיים ושנתיים.')),
          feature('week', t('אימונים עם GPS ושעונים'), t('מקליטים ריצה, הליכה או רכיבה: מרחק, זמן, קצב ומסלול על המפה. או מחברים Strava ומייבאים מ-Garmin, Apple Watch, Polar ועוד.')),
          feature('profile', t('אתגרים, ליגות וחברים'), t('אתגר "מי מנצח" או "יעד קבוצתי", ליגה שבועית עם עלייה וירידה, וצ\'אט לכל אתגר. מזמינים בקוד אישי ושניכם מקבלים מטבעות.')),
          feature('music', t('מוזיקה לאימון'), t('מחברים Spotify ורואים את הפלייליסטים, מחפשים שירים ושולטים בניגון, או מדביקים קישור מ-Apple Music. הנגן מופיע גם במסך האימון.')),
          feature('access', t('נגיש ובעברית'), t('עברית ואנגלית, לשון זכר או נקבה, הגדלת טקסט, ניגודיות גבוהה ועצירת אנימציות. בנוי לפי תקן הנגישות.')),
        ),
      ),
    ),

    h('section', { class: 'levels-band', id: 'coins' },
      h('div', null,
        h('h2', null, t('כל יום שווה משהו')),
        h('p', null, t('יום מלא 5 מטבעות, אימון 10, אתגר יומי 15, רצף של שבוע 20. בחנות קונים סקינים לאפליקציה, דמויות לעוזר, מסגרות פרופיל, אפקטים וצבעים, ויש פריטים שנפתחים רק מרמות גבוהות.')),
      ),
      h('ol', { class: 'level-ladder', 'aria-label': t('רמות') },
        ...([[1, 'מתחיל'], [3, 'ממושמע'], [5, 'אלוף השכונה'], [10, 'יהלום'], [11, 'אגדה'], [15, 'משמעת אישית']] as const).map(([n, name]) => h('li', null, h('b', null, String(n)), t(name)))),
    ),

    h('section', { class: 'shots', id: 'peek', 'aria-labelledby': 'shots-title' },
      h('h2', { id: 'shots-title' }, t('הצצה לאפליקציה')),
      demoVideo(),
      h('div', { class: 'shots-row', tabindex: '0', role: 'region', 'aria-label': t('צילומי מסך, אפשר לגלול לצדדים') },
        ...([['today', 'היום: מסמנים בהקשה, וטבעות מראות כמה נשאר'], ['progress', 'התקדמות: משקל, אימונים וימים מלאים'], ['story', 'סטורי של אימון: מסלול ונתונים, בלי מיקום'], ['store', 'רמות, מטבעות וחנות']] as const).map(([n, cap]) =>
          h('figure', { class: 'shot' }, h('img', { src: `shots/${n}.webp`, alt: t(cap), loading: 'lazy', width: 300, height: 512 }), h('figcaption', null, t(cap))))),
    ),

    h('section', { class: 'install-guide', id: 'install', 'aria-labelledby': 'install-title' },
      h('h2', { id: 'install-title' }, t('מתקינים בלי חנות אפליקציות')),
      h('div', { class: 'install-cols' },
        h('div', { class: 'install-col' }, h('h3', null, 'iPhone'), h('ol', null,
          h('li', null, t('פותחים את האתר ב-Safari')),
          h('li', null, t('לוחצים על כפתור השיתוף (ריבוע עם חץ למעלה)')),
          h('li', null, t('גוללים ובוחרים "הוסף למסך הבית"')),
          h('li', null, t('לוחצים "הוסף", והאייקון מופיע כמו אפליקציה')))),
        h('div', { class: 'install-col' }, h('h3', null, 'Android'), h('ol', null,
          h('li', null, t('פותחים את האתר ב-Chrome')),
          h('li', null, t('לוחצים על "התקנה" שמופיע למטה, או בתפריט ⋮ על "התקנת אפליקציה"')),
          h('li', null, t('האפליקציה נפתחת ממסך הבית, גם בלי אינטרנט')))),
      ),
    ),

    h('section', { class: 'trust', id: 'trust' },
      h('h2', null, t('בטוח, פרטי ונגיש')),
      h('div', { class: 'trust-grid' },
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('admin', 26)), h('h3', null, t('אבטחה בכמה שכבות')),
          h('p', null, t('סיסמאות מוצפנות, חסימה אחרי ניסיונות כושלים, אימות דו-שלבי במייל וניתוק כל המכשירים בלחיצה.'))),
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('profile', 26)), h('h3', null, t('הנתונים שלכם נשארים שלכם')),
          h('p', null, t('המנהל רואה רק סיכומים סטטיסטיים, לא הערות ולא תמונות שבועיות. בכל פוסט בוחרים מי רואה, סטורי נעלם אחרי 24 שעות, ואפשר לייצא הכול בכל רגע.'))),
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('feed', 26)), h('h3', null, t('קהילה בטוחה')),
          h('p', null, t('אימות מייל לכל חשבון חדש, דיווח על תוכן, חסימת משתמשים ותנאי שימוש ברורים. המסלול שלכם לא נחשף בסטוריז.'))),
        h('div', { class: 'trust-item' }, h('span', { class: 'trust-icon' }, icon('info', 26)), h('h3', null, t('נגיש לכולם')),
          h('p', null, t('תפריט נגישות, ניווט במקלדת ותמיכה בקוראי מסך, לפי התקן הישראלי ת"י 5568.'))),
      ),
    ),

    h('section', { class: 'quote' }, h('blockquote', null, t('אתה לא טובע מהנפילה לנהר, אלא מזה שאתה נשאר שקוע בו!'))),

    h('section', { class: 'faq', id: 'faq' },
      h('h2', null, t('שאלות נפוצות')),
      faq(t('כמה זה עולה?'), t('חינם. אין מנוי ואין תשלום בכסף בתוך האפליקציה. מטבעות נצברים במשחק ונקנים בחנות.')),
      faq(t('צריך חברים כדי להתחיל?'), t('לא. הסימון, הטבלה והסטטיסטיקה עובדים לבד. אתגרים וקהילה הם בחירה, לא חובה.')),
      faq(t('מה אם פספסתי יום?'), t('כל יום בשבוע נפרד. פשוט ממשיכים מהיום הבא, בלי לבנות מחדש.')),
      faq(t('הנתונים שלי פרטיים?'), t('הנתונים נשמרים בגיליון Google פרטי של מנהל האפליקציה. באפליקציה המנהל רואה רק סיכומים סטטיסטיים, לא הערות, תמונות שבועיות או פרטים אישיים. אפשר לייצא את כל הנתונים בכל רגע.')),
      faq(t('צריך להוריד מחנות אפליקציות?'), t('לא. פותחים את האתר ובוחרים "התקנת האפליקציה". היא מופיעה במסך הבית כמו כל אפליקציה ועובדת גם בלי אינטרנט.')),
      faq(t('יש לי טבלה ישנה בקובץ Word. אפשר להעביר?'), t('כן. בהגדרות יש ייבוא מקובץ Word: השבועות, המשקל והסימונים נטענים עם תצוגה מקדימה לפני השמירה.')),
      faq(t('מי רואה את התמונות והסטוריז שלי?'), t('אתם בוחרים בכל פוסט: כל הקהילה או רק חברים. סטורי נעלם אחרי 24 שעות, ואפשר לחסום כל משתמש. התמונות נשמרות בתיקייה פרטית.')),
      faq(t('האם האפליקציה חושפת איפה אני רץ?'), t('לא. המסלול נשמר רק אצלכם. בסטורי של אימון מוצגת רק צורת המסלול, בלי מפה ובלי מיקום.')),
      faq(t('צריך Spotify Premium?'), t('לא. בלי Premium מקבלים נגן מוטמע של הפלייליסט. עם Premium אפשר גם לשלוט בניגון מתוך האפליקציה.')),
      faq(t('יש לי שעון חכם. זה עובד?'), t('כן, דרך Strava: מחברים פעם אחת, והאימונים מהשעון נכנסים עם המרחק, הזמן והמסלול.')),
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
        h('a', { href: '#accessibility' }, t('הצהרת נגישות')), ' · ', h('a', { href: '#privacy' }, t('מדיניות פרטיות')), ' · ', h('a', { href: '#terms' }, t('תנאי שימוש'))),
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
