import { canPrompt, isIOS, isInstalled, onInstallChange, promptInstall } from '../install';
import { h, openSheet } from './dom';
import { icon } from './icons';
import { t } from '../i18n';

function instructions(): void {
  const step = (n: number, text: string, extra?: Node) => h('li', null, h('span', { class: 'step-n' }, String(n)), h('span', null, text, extra ?? ''));
  const shareIcon = h('span', { class: 'ios-share', 'aria-hidden': 'true' },
    (() => { const s = document.createElement('span'); s.innerHTML = '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>'; return s.firstElementChild!; })());
  const body = isIOS()
    ? h('ol', { class: 'install-steps' },
        step(1, t('פותחים את האתר ב-Safari (לא מתוך אפליקציה אחרת).')),
        step(2, t('לוחצים על כפתור השיתוף '), shareIcon),
        step(3, t('גוללים ובוחרים "הוסף למסך הבית".')),
        step(4, t('לוחצים "הוסף". האייקון יופיע במסך הבית ויפתח כמו אפליקציה.')))
    : h('ol', { class: 'install-steps' },
        step(1, t('בתפריט הדפדפן (⋮ או ⋯) בוחרים "התקנת אפליקציה" או "הוספה למסך הבית".')),
        step(2, t('מאשרים. האייקון יופיע במסך הבית או בתפריט האפליקציות.')));
  openSheet(t('התקנת האפליקציה'), h('div', { class: 'stack' }, body, h('p', { class: 'hint' }, t('אחרי ההתקנה האפליקציה נפתחת במסך מלא ועובדת גם בלי אינטרנט.'))));
}

/** A button that installs the app, or explains how; hidden once the app is installed. */
export function installButton(cls = 'btn'): HTMLElement {
  const btn = h('button', { class: `${cls} install-btn`, type: 'button' }, icon('download', 20), h('span', null, t('התקנת האפליקציה')));
  const sync = () => (btn.hidden = isInstalled());
  btn.addEventListener('click', async () => {
    if (canPrompt()) await promptInstall();
    else instructions();
  });
  sync();
  onInstallChange(sync);
  return btn;
}
