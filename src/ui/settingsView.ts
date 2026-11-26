import { owns } from '../rewards';
import { hasBackend } from '../api';
import { HASH, navigate } from './router';
import { parseDocx } from '../docx';
import { todayISO } from '../dates';
import { download, parseBackup, toBackup, toCSV } from '../io';
import { checkReminders, notificationsSupported, registerBackgroundCheck, requestPermission } from '../reminders';
import { allWeeks, getSettings, putWeeks, replaceAll, updateSettings } from '../store';
import { ACCENTS, BG_THEMES, type Theme } from '../types';
import { confirmButton, h, openSheet, toast } from './dom';
import { lang, setLang, t, tr } from '../i18n';
import { APP_VERSION, CHANGELOG } from '../version';
import { showDocxPreview } from './importPreview';
import { installButton } from './installButton';
import { MASCOTS, mascot, ownsMascot } from './mascot';
import { resetTours } from './tour';
import { IS_DEMO } from '../env';
import { clearDemo } from '../demo';

function pickFile(accept: string, onFile: (f: File) => void) {
  const input = h('input', { type: 'file', accept, class: 'sr-only' });
  input.addEventListener('change', () => input.files?.[0] && onFile(input.files[0]));
  document.body.append(input);
  input.click();
  setTimeout(() => input.remove(), 60_000);
}

function toggle(label: string, checked: boolean, onchange: (v: boolean) => void, hint?: string) {
  const id = 'tg-' + Math.random().toString(36).slice(2, 8);
  const input = h('input', { type: 'checkbox', role: 'switch', id, checked, class: 'switch' });
  input.addEventListener('change', () => onchange(input.checked));
  return h('div', { class: 'setting' },
    h('label', { for: id }, label, hint && h('small', { class: 'hint' }, hint)),
    input,
  );
}

export function renderSettings(root: HTMLElement): void {
  const st = getSettings();
  const perm = notificationsSupported() ? Notification.permission : 'unsupported';

  const enableReminder = async (key: 'dailyReminder' | 'weeklyWeightReminder', v: boolean) => {
    if (v && notificationsSupported()) {
      const p = await requestPermission();
      if (p !== 'granted') toast('התראות חסומות בדפדפן — התזכורת תוצג רק בתוך האפליקציה');
    }
    updateSettings({ [key]: v });
    await registerBackgroundCheck();
    checkReminders();
  };

  const time = h('input', { type: 'time', class: 'input', value: st.reminderTime, 'aria-label': t('שעת תזכורת') });
  time.addEventListener('change', () => {
    updateSettings({ reminderTime: time.value || '21:00' });
    checkReminders();
  });

  const theme = h('select', { class: 'input', 'aria-label': t('ערכת צבעים') },
    ([['auto', t('לפי המכשיר')], ['light', t('בהיר')], ['dark', t('כהה')]] as [Theme, string][]).map(([v, label]) =>
      h('option', { value: v, selected: st.theme === v }, label)),
  );
  theme.addEventListener('change', () => updateSettings({ theme: theme.value as Theme }));

  const langSel = h('select', { class: 'input', id: 'lang-select', 'aria-label': t('שפה') },
    h('option', { value: 'he', selected: lang === 'he' }, t('עברית')),
    h('option', { value: 'en', selected: lang === 'en' }, 'English'),
  );
  langSel.addEventListener('change', () => setLang(langSel.value === 'en' ? 'en' : 'he'));

  const showChangelog = () => openSheet(t('מה חדש'), h('div', { class: 'stack' },
    ...CHANGELOG.map((r) => h('section', { class: 'release' },
      h('h3', null, t('גרסה {v}', { v: r.version }), ' ', h('span', { class: 'muted small' }, r.date)),
      h('ul', null, r.items.map((i) => h('li', null, t(i))))))));

  const stamp = todayISO();

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('תצוגה')),
      toggle(t('שורת "מעשן?"'), st.showSmoking, (v) => updateSettings({ showSmoking: v })),
      h('div', { class: 'setting' }, h('label', null, t('ערכת צבעים')), theme),
      h('div', { class: 'setting setting-col' },
        h('span', { id: 'accent-label' }, t('צבע האפליקציה')),
        h('div', { class: 'swatches', role: 'radiogroup', 'aria-labelledby': 'accent-label' },
          ACCENTS.filter((a) => !a.premium || hasBackend()).map((a) => {
            const locked = !!a.premium && !owns('color:' + a.id);
            return h('button', {
              class: 'swatch' + (locked ? ' locked' : ''), type: 'button', role: 'radio',
              'aria-checked': String((st.accent ?? 'green') === a.id),
              'aria-label': locked ? tr`${t(a.name)} (נפתח במטבעות)` : t(a.name), title: locked ? tr`${t(a.name)} (נפתח במטבעות)` : t(a.name),
              style: { background: a.swatch },
              onclick: () => {
                if (locked) { toast(t('את הצבע הזה פותחים במטבעות בחנות')); navigate(HASH.rewards); return; }
                updateSettings({ accent: a.id });
              },
            });
          })),
      ),
      hasBackend() && h('div', { class: 'setting setting-col' },
        h('span', { id: 'bg-label' }, t('רקע')),
        h('div', { class: 'swatches', role: 'radiogroup', 'aria-labelledby': 'bg-label' },
          [{ id: '', name: 'רגיל', swatch: 'var(--bg)' }, ...BG_THEMES].map((b) => {
            const locked = !!b.id && !owns('bg:' + b.id);
            const label = locked ? tr`${t(b.name)} (נפתח במטבעות)` : t(b.name);
            return h('button', {
              class: 'swatch swatch-bg' + (locked ? ' locked' : ''), type: 'button', role: 'radio',
              'aria-checked': String((st.bgTheme ?? '') === b.id), 'aria-label': label, title: label,
              style: { background: b.swatch },
              onclick: () => {
                if (locked) { toast(t('את הרקע הזה פותחים במטבעות בחנות')); navigate(HASH.rewards); return; }
                updateSettings({ bgTheme: b.id });
              },
            });
          })),
      ),
      hasBackend() && owns('effect:confetti') && toggle(t('קונפטי ביום מלא'), !!st.effects, (v) => updateSettings({ effects: v })),
      h('div', { class: 'setting setting-col' },
        h('span', { id: 'mascot-label' }, t('דמות העוזר')),
        h('div', { class: 'mascot-pick', role: 'radiogroup', 'aria-labelledby': 'mascot-label' },
          MASCOTS.filter((m) => m.free || hasBackend()).map((m) => {
            const locked = !ownsMascot(m.id);
            const label = locked ? tr`${t(m.name)} (נפתח במטבעות)` : t(m.name);
            return h('button', {
              class: 'mascot-opt' + (locked ? ' locked' : ''), type: 'button', role: 'radio', title: label, 'aria-label': label,
              'aria-checked': String((st.mascot ?? 'lion') === m.id),
              onclick: () => {
                if (locked) { toast(t('את הדמות הזאת פותחים במטבעות בחנות')); navigate(HASH.rewards); return; }
                updateSettings({ mascot: m.id });
              },
            }, mascot(44, '', m.id, {}));
          })),
        hasBackend() && h('small', { class: 'hint' }, t('דמויות נוספות, הילות ותגים לעוזר בחנות המטבעות.')),
      ),
      h('div', { class: 'setting' }, h('label', { for: 'lang-select' }, t('שפה / Language')), langSel),
      installButton('btn install-setting'),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('סוגי פעילות שהוספת')),
      st.customSportTypes.length
        ? h('div', { class: 'chips' }, st.customSportTypes.map((ct) =>
            confirmButton(`${ct} ✕`, tr`למחוק את "${ct}"?`,
              () => updateSettings({ customSportTypes: st.customSportTypes.filter((x) => x !== ct) }), 'chip')))
        : h('p', { class: 'muted' }, t('אפשר להוסיף סוג חדש מחלון הספורט ("+ סוג חדש").')),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('תזכורות')),
      toggle(t('תזכורת יומית: "עדכן את היום"'), st.dailyReminder, (v) => enableReminder('dailyReminder', v), t('רק אם היום עדיין לא מולא')),
      h('div', { class: 'setting' }, h('label', null, t('שעה')), time),
      toggle(t('תזכורת ביום ראשון להזין משקל'), st.weeklyWeightReminder, (v) => enableReminder('weeklyWeightReminder', v)),
      h('p', { class: 'hint' },
        perm === 'unsupported' ? t('הדפדפן לא תומך בהתראות. התזכורת לשקילה תוצג בתוך האפליקציה.')
          : perm === 'denied' ? t('התראות חסומות בהגדרות הדפדפן.')
          : t('התראות מופעלות כשהאפליקציה פתוחה. כשהיא מותקנת (Android/Chrome) הדפדפן עשוי להעיר אותה גם ברקע — לא מובטח.')),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, t('גיבוי וייבוא')),
      h('div', { class: 'btn-grid' },
        h('button', { class: 'btn', disabled: IS_DEMO, onclick: () => download(`mishmaat-backup-${stamp}.json`, JSON.stringify(toBackup(allWeeks(), getSettings()), null, 1), 'application/json') }, t('ייצוא JSON')),
        h('button', { class: 'btn', disabled: IS_DEMO, onclick: () => download(`mishmaat-${stamp}.csv`, toCSV(allWeeks()), 'text/csv;charset=utf-8') }, t('ייצוא CSV')),
        h('button', {
          class: 'btn', onclick: () => pickFile('.json,application/json', async (f) => {
            try {
              const data = parseBackup(await f.text());
              await clearDemo();
              const body = h('div', { class: 'stack' },
                h('p', null, tr`בקובץ ${data.weeks.length} שבועות.` + (data.skipped ? ' ' + tr`${data.skipped} לא תקינים דולגו.` : '')),
                h('button', { class: 'btn btn-primary', onclick: () => { const n = putWeeks(data.weeks, 'skip-existing'); close(); toast(tr`נוספו ${n} שבועות`); } }, t('מיזוג — הוסף רק שבועות חדשים')),
                confirmButton(t('החלפת כל הנתונים'), t('הקש שוב: כל הנתונים הנוכחיים יימחקו'), () => { replaceAll(data.weeks, data.settings); close(); toast('הנתונים שוחזרו'); }, 'btn btn-danger'),
              );
              const close = openSheet('ייבוא גיבוי JSON', body);
            } catch (e: any) {
              toast(e.message || t('שגיאה בקריאת הקובץ'));
            }
          }),
        }, t('ייבוא JSON')),
        h('button', {
          class: 'btn btn-primary', onclick: () => pickFile('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', async (f) => {
            try {
              const result = parseDocx(await f.arrayBuffer());
              if (!result.weeks.length) return toast('לא נמצאו שבועות בקובץ');
              await clearDemo();
              showDocxPreview(result, f.name);
            } catch (e: any) {
              toast(e.message || t('שגיאה בקריאת הקובץ'));
            }
          }),
        }, t('ייבוא מקובץ Word')),
      ),
      h('p', { class: 'hint' }, IS_DEMO
        ? t('בתצוגה המקדימה אי אפשר להוריד קבצים, לכן הייצוא כבוי. באפליקציה המותקנת הוא עובד.')
        : t('הנתונים נשמרים רק במכשיר הזה. מומלץ לייצא גיבוי מדי פעם.')),
    ),
    h('section', { class: 'card' },
      h('div', { class: 'setting' },
        h('label', null, tr`גרסה ${APP_VERSION}`, h('small', { class: 'hint' }, tr`${allWeeks().length} שבועות שמורים`)),
        h('button', { class: 'btn', type: 'button', onclick: showChangelog }, t('מה חדש')),
      ),
      h('div', { class: 'setting' },
        h('label', null, t('מדריכי היכרות')),
        h('button', { class: 'btn', type: 'button', onclick: () => { resetTours(); toast(t('המדריכים יוצגו שוב בכל מסך')); location.hash = '#week'; } }, t('הצג שוב')),
      ),
      h('p', { class: 'credit' }, h('a', { href: '#accessibility' }, t('הצהרת נגישות')), ' · ', h('a', { href: '#privacy' }, t('מדיניות פרטיות'))),
      h('p', { class: 'credit' }, t('פותח על ידי'), ' ', h('strong', null, 'AZ Creative')),
    ),
  );
}
