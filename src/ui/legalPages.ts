import { call } from '../api';
import { h, toast } from './dom';
import { t } from '../i18n';

const UPDATED = '26/11/2026';

function backLink(): HTMLElement {
  return h('a', { class: 'link-btn', href: '#' }, t('חזרה'));
}

export function contactForm(topic: string): HTMLElement {
  const err = h('p', { class: 'form-error', role: 'alert', hidden: true });
  const f = (id: string, label: string, attrs: Record<string, any>) => h('div', { class: 'field' }, h('label', { for: id }, label), h(attrs.rows ? 'textarea' : 'input', { id, class: 'input', ...attrs }));
  const form = h('form', { class: 'stack', novalidate: true },
    f('pc-name', t('שם'), { type: 'text', autocomplete: 'name', required: true }),
    f('pc-email', t('אימייל לחזרה'), { type: 'email', autocomplete: 'email', dir: 'ltr', required: true }),
    f('pc-text', t('תיאור הבעיה או הבקשה'), { rows: 4, required: true }),
    err,
    h('button', { class: 'btn btn-primary', type: 'submit' }, t('שליחה')),
  );
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    err.hidden = true;
    const v = (id: string) => (form.querySelector('#' + id) as HTMLInputElement).value.trim();
    try {
      await call('publicContact', { topic, name: v('pc-name'), email: v('pc-email'), text: v('pc-text') });
      form.replaceChildren(h('p', { role: 'status' }, t('הפנייה התקבלה. נחזור אליך במייל בהקדם.')));
      toast(t('הפנייה נשלחה'));
    } catch (ex: any) { err.textContent = ex.message; err.hidden = false; }
  });
  return form;
}

export function renderAccessibility(root: HTMLElement): void {
  const li = (s: string) => h('li', null, t(s));
  const coordinator = h('div', { class: 'coordinator' });
  root.replaceChildren(h('article', { class: 'card legal' },
    backLink(),
    h('h1', null, t('הצהרת נגישות')),
    h('p', { class: 'muted small' }, t('עודכן לאחרונה: {d}', { d: UPDATED })),
    h('p', null, t('אנחנו רואים חשיבות בהנגשת האפליקציה "משמעת אישית" לכל המשתמשים, כולל אנשים עם מוגבלות, ופועלים לעמוד בדרישות תקנות שוויון זכויות לאנשים עם מוגבלות (התאמות נגישות לשירות), התשע"ג-2013, ובתקן הישראלי ת"י 5568 המבוסס על הנחיות WCAG 2.0 ברמה AA.')),
    h('h2', null, t('מה הונגש')),
    h('ul', null,
      li('תפריט נגישות (סמל כיסא הגלגלים) עם הגדלת טקסט, ניגודיות גבוהה, הדגשת קישורים, גופן קריא, ריווח טקסט ועצירת אנימציות.'),
      li('ניווט מלא במקלדת, סימון ברור של הפוקוס, וקישור "דלג לתוכן הראשי".'),
      li('תמיכה בקוראי מסך: תוויות לכפתורים ולשדות, הודעות שגיאה מוקראות, וכותרות במבנה היררכי.'),
      li('התאמה לגדלי מסך שונים, ולמצב כהה ובהיר.'),
      li('לגרף המשקל יש חלופה טקסטואלית בטבלה החודשית.'),
      li('תמיכה בהגדרת המערכת להפחתת תנועה.'),
    ),
    h('h2', null, t('מגבלות ידועות')),
    h('p', null, t('ייתכן שחלקים מסוימים עדיין אינם נגישים במלואם, למשל תשובות שנוצרות על ידי עוזר ה-AI או תוכן שהמשתמשים מזינים. אנחנו ממשיכים לשפר את הנגישות באופן שוטף.')),
    h('h2', null, t('דרכי פנייה בנושא נגישות')),
    coordinator,
    h('p', null, t('נתקלתם בבעיית נגישות? נשמח לשמוע ולתקן. אפשר לפנות בטופס הבא, ונחזור אליכם בהקדם.')),
    contactForm('נגישות'),
  ));
  call<{ config: { a11yName: string; a11yPhone: string; a11yEmail: string } }>('siteConfig').then(({ config: c }) => {
    if (!c.a11yName && !c.a11yPhone && !c.a11yEmail) return;
    coordinator.replaceChildren(
      h('p', null, h('strong', null, t('רכז/ת נגישות: ')), c.a11yName || '—'),
      c.a11yPhone ? h('p', null, t('טלפון: '), h('a', { href: `tel:${c.a11yPhone.replace(/[^\d+]/g, '')}`, dir: 'ltr' }, c.a11yPhone)) : '',
      c.a11yEmail ? h('p', null, t('אימייל: '), h('a', { href: `mailto:${c.a11yEmail}`, dir: 'ltr' }, c.a11yEmail)) : '',
    );
  }).catch(() => {});
}

export function renderPrivacy(root: HTMLElement): void {
  const sec = (title: string, ...paras: string[]) => [h('h2', null, t(title)), ...paras.map((p) => h('p', null, t(p)))];
  root.replaceChildren(h('article', { class: 'card legal' },
    backLink(),
    h('h1', null, t('מדיניות פרטיות')),
    h('p', { class: 'muted small' }, t('עודכן לאחרונה: {d}', { d: UPDATED })),
    ...sec('איזה מידע נשמר', 'פרטי החשבון (שם, אימייל וסיסמה מוצפנת), פרטי פרופיל שבחרתם למלא, והנתונים שאתם מזינים: סימוני ארוחות ואימונים, משקל, הערות ותמונות.'),
    ...sec('איפה המידע נשמר', 'המידע נשמר בגיליון ובתיקייה פרטיים בחשבון Google Drive של מפעיל האפליקציה, וגם במכשיר שלכם כדי שהאפליקציה תעבוד בלי אינטרנט.'),
    ...sec('מי רואה את המידע', 'אתם רואים את כל הנתונים שלכם. מנהל האפליקציה רואה באפליקציה רק סיכומים סטטיסטיים (אימונים, אחוז ארוחות, שינוי משקל ופעילות), לא הערות, תמונות שבועיות או פרטים אישיים. בטבלת הדירוג מוצגים שם, תמונת פרופיל, רמה ומטבעות.'),
    ...sec('עוזר AI', 'כששולחים שאלה לעוזר, השאלה וסיכום של הנתונים שלכם נשלחים לשירות OpenAI כדי לייצר תשובה. לא נשלחים סיסמאות או פרטי קשר.'),
    ...sec('עוגיות ומעקב', 'האפליקציה לא משתמשת בעוגיות פרסום או בכלי מעקב. נשמרים במכשיר רק נתונים שנדרשים לפעולת האפליקציה והעדפות כמו שפה ונגישות.'),
    ...sec('אבטחה', 'סיסמאות נשמרות מוצפנות, יש הגנה מפני ניחוש סיסמאות, אפשרות לאימות דו-שלבי במייל, וניתוק כל המכשירים בשינוי סיסמה.'),
    ...sec('הזכויות שלכם', 'אפשר לייצא את כל הנתונים בכל רגע מההגדרות. לבקשה לעיון, תיקון או מחיקה של המידע, פנו אלינו בטופס.'),
    contactForm('פרטיות'),
  ));
}
