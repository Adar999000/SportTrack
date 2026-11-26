/** Accessibility preferences (per device), applied as classes on <html>. */
export interface A11yPrefs { text: 0 | 1 | 2 | 3; contrast: boolean; links: boolean; font: boolean; motion: boolean; spacing: boolean }
const KEY = 'mishmaat-a11y';
export const DEFAULT_A11Y: A11yPrefs = { text: 0, contrast: false, links: false, font: false, motion: false, spacing: false };

export function getA11y(): A11yPrefs {
  try { return { ...DEFAULT_A11Y, ...JSON.parse(localStorage.getItem(KEY) || '{}') }; } catch { return { ...DEFAULT_A11Y }; }
}

export function setA11y(p: A11yPrefs): void {
  try { localStorage.setItem(KEY, JSON.stringify(p)); } catch { /* ignore */ }
  applyA11y(p);
}

export function applyA11y(p: A11yPrefs = getA11y()): void {
  const c = document.documentElement.classList;
  c.remove('a11y-text-1', 'a11y-text-2', 'a11y-text-3');
  if (p.text) c.add(`a11y-text-${p.text}`);
  c.toggle('a11y-contrast', p.contrast);
  c.toggle('a11y-links', p.links);
  c.toggle('a11y-font', p.font);
  c.toggle('a11y-motion', p.motion || matchMedia('(prefers-reduced-motion: reduce)').matches);
  c.toggle('a11y-spacing', p.spacing);
}
