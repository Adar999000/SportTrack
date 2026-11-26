/**
 * Onboarding: a welcome for new users, then a short guided tour the first time
 * each page is opened. Seen state is kept per user on this device.
 */
import { currentUser, isAdmin } from '../session';
import { hasBackend } from '../api';
import { parseRoute } from './router';
import { h } from './dom';
import { aiMark, icon, logo } from './icons';
import { t } from '../i18n';

interface Step { sel: string; text: string }

const TOURS: Record<string, Step[]> = {
  week: [
    { sel: '.today', text: 'כאן מסמנים את היום. כל הקשה מחליפה: V בוצע, X לא בוצע, "-" לא רלוונטי, וחזרה לריק.' },
    { sel: '.week-table', text: 'הטבלה של כל השבוע. אפשר לסמן כל יום. הקשה כפולה על תא כותבת בו טקסט, כמו "חופשה".' },
    { sel: '#start-weight', text: 'משקל התחלתי: פעם בשבוע, ביום ראשון. מזה נבנה גרף המשקל.' },
    { sel: '.fab:not([hidden])', text: 'העוזר האישי: שואלים על הנתונים, מבקשים "תסמן לי צהריים V", או פונים למנהל.' },

  ],
  history: [
    { sel: '.history-list', text: 'כל השבועות שלך עם משקל, אימונים ואחוז ארוחות. הקשה פותחת את השבוע לעריכה.' },
    { sel: '.inline-form', text: 'כאן פותחים כל שבוע לפי תאריך, גם שבוע שחסר.' },
  ],
  rewards: [
    { sel: '.level-card', text: 'הרמה, היתרה וכמה צברת. הרמה עולה לפי כל מה שצברת אי פעם, וקניות לא מורידות אותה.' },
    { sel: '.shop', text: 'החנות: הקפאת רצף, הודעות נוספות לעוזר, וצבעים מיוחדים.' },
  ],
  share: [
    { sel: '#invite-link', text: 'הקישור האישי שלך. מי שנרשם דרכו מקבל 50 מטבעות, וגם אתה.' },
    { sel: '.share-grid', text: 'שליחה מהירה בוואטסאפ, טלגרם, מייל ועוד.' },
  ],
  profile: [
    { sel: '.profile-head', text: 'הפרטים והתמונה שלך. "עריכה" כדי לשנות.' },
    { sel: '.details', text: 'נתונים אישיים: BMI, כמה נשאר ליעד, שבועות במעקב ואימונים.' },
    { sel: '.chart', text: 'גרף המשקל: שבוע בלי שקילה מופיע כרווח, והקו המקווקו הוא המגמה בכל רבעון.' },
  ],
  admin: [
    { sel: '.tiles', text: 'תמונת מצב של כל המשתמשים.' },
    { sel: '.inbox-card', text: 'פניות ממשתמשים. תשובה שלך מגיעה אליהם לאפליקציה ולמייל.' },
    { sel: '.user-row', text: 'משתמשים. מוצגים רק נתונים סטטיסטיים, בלי הערות, תמונות שבועיות ופרטים אישיים.' },
  ],
  settings: [
    { sel: '.swatches', text: 'צבע האפליקציה. הצבעים עם המנעול נפתחים במטבעות.' },
    { sel: '#lang-select', text: 'עברית או אנגלית.' },
    { sel: '.btn-grid', text: 'ייבוא מקובץ Word, גיבוי וייצוא של כל הנתונים.' },
  ],
};

const seenKey = (k: string) => `tour:${currentUser()?.userId ?? 'local'}:${k}`;
const seen = (k: string) => { try { return localStorage.getItem(seenKey(k)) === '1'; } catch { return true; } };
const markSeen = (k: string) => { try { localStorage.setItem(seenKey(k), '1'); } catch { /* ignore */ } };

export function resetTours(): void {
  try {
    const prefix = `tour:${currentUser()?.userId ?? 'local'}:`;
    Object.keys(localStorage).filter((k) => k.startsWith(prefix)).forEach((k) => localStorage.removeItem(k));
  } catch { /* ignore */ }
}

let running = false;
let timer: ReturnType<typeof setTimeout> | undefined;

/** Called after every render: shows the welcome, then the current page's tour once. */
export function maybeStartTour(): void {
  clearTimeout(timer);
  timer = setTimeout(() => {
    if (running || !hasBackend() || !currentUser()?.profile?.completed) return;
    if (document.body.classList.contains('is-landing') || document.querySelector('.backdrop')) return;
    if (!seen('welcome')) return welcome();
    const route = parseRoute(location.hash).name;
    const key = route === 'stats' ? 'profile' : route;
    if (key === 'admin' && !isAdmin()) return;
    const steps = (TOURS[key] ?? []).filter((s) => document.querySelector(s.sel));
    if (steps.length && !seen(key)) run(key, steps);
  }, 700);
}

function welcome(): void {
  running = true;
  const slides = [
    { art: logo(64), title: 'ברוכים הבאים למשמעת אישית', text: 'טבלה שבועית אחת לארוחות, אימונים ומשקל. מסמנים בהקשה, ורואים לאורך זמן מה באמת עובד.' },
    { art: icon('coin', 56), title: 'מטבעות, רמות ואתגרים', text: 'כל יום מלא, אימון ושקילה מכניסים מטבעות. עולים ברמות, משלימים אתגרים ומתחרים עם חברים.' },
    { art: aiMark(56), title: 'עוזר AI אישי', text: 'הכפתור הצף בפינה: שואלים על הנתונים, מבקשים שיסמן בשבילכם, או שולחים פנייה למנהל.' },
  ];
  let i = 0;
  const box = h('div', { class: 'welcome', role: 'dialog', 'aria-modal': 'true', 'aria-label': t('ברוכים הבאים') });
  const overlay = h('div', { class: 'tour-overlay welcome-overlay' }, box);
  const finish = () => { markSeen('welcome'); overlay.remove(); running = false; maybeStartTour(); };
  const draw = () => {
    const s = slides[i];
    box.replaceChildren(
      h('div', { class: 'welcome-art' }, s.art),
      h('h2', null, t(s.title)),
      h('p', null, t(s.text)),
      h('div', { class: 'tour-dots' }, slides.map((_, j) => h('span', { class: j === i ? 'on' : '' }))),
      h('div', { class: 'tour-actions' },
        h('button', { class: 'link-btn', type: 'button', onclick: finish }, t('דלג')),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: () => (i < slides.length - 1 ? (i++, draw()) : finish()) },
          i < slides.length - 1 ? t('הבא') : t('בואו נתחיל')),
      ),
    );
    (box.querySelector('.btn-primary') as HTMLElement).focus();
  };
  document.body.append(overlay);
  draw();
}

function run(key: string, steps: Step[]): void {
  running = true;
  let i = 0;
  const ring = h('div', { class: 'tour-ring' });
  const tip = h('div', { class: 'tour-tip', role: 'dialog', 'aria-live': 'polite' });
  const layer = h('div', { class: 'tour-layer' }, ring, tip);
  const end = () => {
    markSeen(key);
    layer.remove();
    window.removeEventListener('resize', place);
    window.removeEventListener('scroll', place, true);
    document.removeEventListener('keydown', onKey);
    running = false;
  };
  const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') end(); };
  function place() {
    if (!steps[i] || !layer.isConnected) return;
    const el = document.querySelector(steps[i].sel) as HTMLElement | null;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const pad = 6;
    Object.assign(ring.style, { top: `${r.top - pad}px`, left: `${r.left - pad}px`, width: `${r.width + pad * 2}px`, height: `${r.height + pad * 2}px` });
    const below = r.bottom + 12 + tip.offsetHeight < innerHeight;
    const top = below ? r.bottom + 12 : Math.max(12, r.top - tip.offsetHeight - 12);
    const left = Math.min(Math.max(12, r.left + r.width / 2 - tip.offsetWidth / 2), innerWidth - tip.offsetWidth - 12);
    Object.assign(tip.style, { top: `${top}px`, left: `${left}px` });
  }
  function show() {
    const el = document.querySelector(steps[i].sel) as HTMLElement | null;
    if (!el) return next();
    el.scrollIntoView({ block: 'center', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
    tip.replaceChildren(
      h('p', null, t(steps[i].text)),
      h('div', { class: 'tour-actions' },
        h('span', { class: 'muted small' }, `${i + 1} / ${steps.length}`),
        h('button', { class: 'link-btn', type: 'button', onclick: end }, t('דלג')),
        h('button', { class: 'btn btn-primary', type: 'button', onclick: next }, i < steps.length - 1 ? t('הבא') : t('הבנתי')),
      ),
    );
    setTimeout(place, 350);
    place();
    (tip.querySelector('.btn-primary') as HTMLElement).focus({ preventScroll: true });
  }
  function next() { if (++i >= steps.length) end(); else show(); }
  document.body.append(layer);
  window.addEventListener('resize', place);
  window.addEventListener('scroll', place, true);
  document.addEventListener('keydown', onKey);
  show();
}
