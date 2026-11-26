/**
 * Minimal i18n: Hebrew text is the key, English comes from the dictionary.
 * The language is read synchronously at startup (localStorage), so module-level
 * labels are already translated; switching language reloads the page.
 */
import { EN } from './i18n-en';
import type { Lang } from './types';

const LS_KEY = 'mishmaat-lang';

function readLang(): Lang {
  try {
    return localStorage.getItem(LS_KEY) === 'en' ? 'en' : 'he';
  } catch {
    return 'he';
  }
}

export const lang: Lang = readLang();
export const isRTL = lang === 'he';

export function setLang(l: Lang): void {
  try {
    localStorage.setItem(LS_KEY, l);
  } catch {
    /* ignore */
  }
  location.reload();
}

export function applyDocumentLang(): void {
  document.documentElement.lang = lang;
  document.documentElement.dir = isRTL ? 'rtl' : 'ltr';
}

/** t('נשמרו {n} שבועות', { n: 5 }) */
export function t(he: string, vars?: Record<string, string | number>): string {
  let s = lang === 'en' ? EN[he] ?? he : he;
  if (vars) for (const [k, v] of Object.entries(vars)) s = s.split(`{${k}}`).join(String(v));
  return s;
}

/** Translate messages that come back from the server (Hebrew), keeping unknown ones. */
export function tServer(msg: string): string {
  if (lang === 'he') return msg;
  if (EN[msg]) return EN[msg];
  const m = /^הגעת למגבלת ההודעות היומית לבוט \((\d+)\)/.exec(msg);
  if (m) return `You reached the assistant's daily limit (${m[1]}). Try again tomorrow or buy messages with coins.`;
  if (msg.startsWith('יותר מדי ניסיונות כניסה')) return 'Too many sign-in attempts. Try again in 15 minutes, or reset your password.';
  if (msg.startsWith('הסיסמה צריכה להיות לפחות')) return 'The password must be at least 8 characters';
  if (msg.startsWith('הסיסמה קלה מדי')) return 'That password is too easy to guess. Choose another one.';
  if (msg.startsWith('שגיאה מ-OpenAI')) return 'OpenAI error: ' + msg.split(':').slice(1).join(':').trim();
  return msg;
}

/** Tagged template: tr`נשמרו ${n} שבועות` looks up "נשמרו {0} שבועות". */
export function tr(strings: TemplateStringsArray, ...vals: unknown[]): string {
  let key = strings[0];
  const vars: Record<string, string> = {};
  vals.forEach((v, i) => {
    key += `{${i}}` + strings[i + 1];
    vars[i] = String(v);
  });
  return t(key, vars);
}
