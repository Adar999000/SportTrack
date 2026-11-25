import { parseDocx } from '../docx';
import { todayISO } from '../dates';
import { download, parseBackup, toBackup, toCSV } from '../io';
import { checkReminders, notificationsSupported, registerBackgroundCheck, requestPermission } from '../reminders';
import { allWeeks, getSettings, putWeeks, replaceAll, updateSettings } from '../store';
import type { Theme } from '../types';
import { confirmButton, h, openSheet, toast } from './dom';
import { showDocxPreview } from './importPreview';
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

  const time = h('input', { type: 'time', class: 'input', value: st.reminderTime, 'aria-label': 'שעת תזכורת' });
  time.addEventListener('change', () => {
    updateSettings({ reminderTime: time.value || '21:00' });
    checkReminders();
  });

  const theme = h('select', { class: 'input', 'aria-label': 'ערכת צבעים' },
    ([['auto', 'לפי המכשיר'], ['light', 'בהיר'], ['dark', 'כהה']] as [Theme, string][]).map(([v, t]) =>
      h('option', { value: v, selected: st.theme === v }, t)),
  );
  theme.addEventListener('change', () => updateSettings({ theme: theme.value as Theme }));

  const stamp = todayISO();

  root.replaceChildren(
    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'תצוגה'),
      toggle('שורת "מעשן?"', st.showSmoking, (v) => updateSettings({ showSmoking: v })),
      h('div', { class: 'setting' }, h('label', null, 'ערכת צבעים'), theme),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'סוגי פעילות שהוספת'),
      st.customSportTypes.length
        ? h('div', { class: 'chips' }, st.customSportTypes.map((t) =>
            confirmButton(`${t} ✕`, `למחוק את "${t}"?`,
              () => updateSettings({ customSportTypes: st.customSportTypes.filter((x) => x !== t) }), 'chip')))
        : h('p', { class: 'muted' }, 'אפשר להוסיף סוג חדש מחלון הספורט ("+ סוג חדש").'),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'תזכורות'),
      toggle('תזכורת יומית: "עדכן את היום"', st.dailyReminder, (v) => enableReminder('dailyReminder', v), 'רק אם היום עדיין לא מולא'),
      h('div', { class: 'setting' }, h('label', null, 'שעה'), time),
      toggle('תזכורת ביום ראשון להזין משקל', st.weeklyWeightReminder, (v) => enableReminder('weeklyWeightReminder', v)),
      h('p', { class: 'hint' },
        perm === 'unsupported' ? 'הדפדפן לא תומך בהתראות. התזכורת לשקילה תוצג בתוך האפליקציה.'
          : perm === 'denied' ? 'התראות חסומות בהגדרות הדפדפן.'
          : 'התראות מופעלות כשהאפליקציה פתוחה. כשהיא מותקנת (Android/Chrome) הדפדפן עשוי להעיר אותה גם ברקע — לא מובטח.'),
    ),

    h('section', { class: 'card' },
      h('h2', { class: 'card-title' }, 'גיבוי וייבוא'),
      h('div', { class: 'btn-grid' },
        h('button', { class: 'btn', disabled: IS_DEMO, onclick: () => download(`mishmaat-backup-${stamp}.json`, JSON.stringify(toBackup(allWeeks(), getSettings()), null, 1), 'application/json') }, 'ייצוא JSON'),
        h('button', { class: 'btn', disabled: IS_DEMO, onclick: () => download(`mishmaat-${stamp}.csv`, toCSV(allWeeks()), 'text/csv;charset=utf-8') }, 'ייצוא CSV'),
        h('button', {
          class: 'btn', onclick: () => pickFile('.json,application/json', async (f) => {
            try {
              const data = parseBackup(await f.text());
              await clearDemo();
              const body = h('div', { class: 'stack' },
                h('p', null, `בקובץ ${data.weeks.length} שבועות${data.skipped ? ` (${data.skipped} לא תקינים דולגו)` : ''}.`),
                h('button', { class: 'btn btn-primary', onclick: () => { const n = putWeeks(data.weeks, 'skip-existing'); close(); toast(`נוספו ${n} שבועות`); } }, 'מיזוג — הוסף רק שבועות חדשים'),
                confirmButton('החלפת כל הנתונים', 'הקש שוב: כל הנתונים הנוכחיים יימחקו', () => { replaceAll(data.weeks, data.settings); close(); toast('הנתונים שוחזרו'); }, 'btn btn-danger'),
              );
              const close = openSheet('ייבוא גיבוי JSON', body);
            } catch (e: any) {
              toast(e.message || 'שגיאה בקריאת הקובץ');
            }
          }),
        }, 'ייבוא JSON'),
        h('button', {
          class: 'btn btn-primary', onclick: () => pickFile('.docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document', async (f) => {
            try {
              const result = parseDocx(await f.arrayBuffer());
              if (!result.weeks.length) return toast('לא נמצאו שבועות בקובץ');
              await clearDemo();
              showDocxPreview(result, f.name);
            } catch (e: any) {
              toast(e.message || 'שגיאה בקריאת הקובץ');
            }
          }),
        }, 'ייבוא מקובץ Word'),
      ),
      h('p', { class: 'hint' }, IS_DEMO
        ? 'בתצוגה המקדימה אי אפשר להוריד קבצים, לכן הייצוא כבוי. באפליקציה המותקנת הוא עובד.'
        : 'הנתונים נשמרים רק במכשיר הזה. מומלץ לייצא גיבוי מדי פעם.'),
    ),
    h('p', { class: 'muted center' }, `משמעת אישית · ${allWeeks().length} שבועות שמורים`),
  );
}
