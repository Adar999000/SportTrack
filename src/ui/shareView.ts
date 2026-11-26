import { myInvite } from '../rewards';
import { currentUser } from '../session';
import { h, toast } from './dom';
import { t, tr } from '../i18n';

const SITE = 'https://adar999000.github.io/SportTrack/';

/** Invite friends with a personal link (the invite code is inside it). */
export function renderShare(root: HTMLElement): void {
  const box = h('div', { class: 'stack' }, h('p', { class: 'muted' }, t('טוען…')));
  root.replaceChildren(
    h('section', { class: 'card stack' },
      h('h2', { class: 'card-title' }, t('הזמנת חברים')),
      h('p', null, t('שלח לחברים את הקישור או הקוד האישי שלך. כשחבר נרשם איתו, שניכם מקבלים 50 מטבעות, ואתה מקבל עוד 50 כשהוא משלים שבוע ראשון. הקוד עובד לכמה חברים שתרצה; מטבעות על הזמנות ניתנים עד 5 חברים.')),
      box,
    ),
  );
  myInvite().then((inv) => {
    const link = `${SITE}#join-${inv.code}`;
    const name = currentUser()?.name ?? '';
    const text = tr`${name} מזמין אותך למשמעת אישית: מעקב שבועי פשוט אחר אימונים, ארוחות ומשקל. ההרשמה בקישור:`;
    const msg = `${text} ${link}`;
    const enc = encodeURIComponent;
    const input = h('input', { class: 'input', readonly: true, value: link, 'aria-label': t('הקישור שלך'), id: 'invite-link' });
    const copy = async () => {
      try { await navigator.clipboard.writeText(link); toast(t('הקישור הועתק')); } catch { input.select(); }
    };
    const a = (label: string, href: string, color: string) =>
      h('a', { class: 'share-btn', href, target: '_blank', rel: 'noopener' }, h('span', { class: 'dot', style: { background: color } }), label);
    box.replaceChildren(
      h('div', { class: 'invite-link' }, input, h('button', { class: 'btn', type: 'button', onclick: copy }, t('העתק'))),
      h('p', null, t('הקוד שלך: '), h('b', { dir: 'ltr', class: 'code-inline' }, inv.code)),
      h('p', { class: 'hint' }, tr`הצטרפו עם הקוד שלך: ${inv.used} · קיבלת מטבעות על ${inv.rewarded} מתוך ${inv.cap}`),
      'share' in navigator
        ? h('button', { class: 'btn btn-primary', type: 'button', onclick: () => navigator.share({ title: t('משמעת אישית'), text, url: link }).catch(() => {}) }, t('שתף…'))
        : '',
      h('div', { class: 'share-grid' },
        a('WhatsApp', `https://wa.me/?text=${enc(msg)}`, '#25d366'),
        a('Telegram', `https://t.me/share/url?url=${enc(link)}&text=${enc(text)}`, '#229ed9'),
        a(t('מייל'), `mailto:?subject=${enc(t('הזמנה למשמעת אישית'))}&body=${enc(msg)}`, '#888'),
        a('LinkedIn', `https://www.linkedin.com/sharing/share-offsite/?url=${enc(link)}`, '#0a66c2'),
        a('Facebook', `https://www.facebook.com/sharer/sharer.php?u=${enc(link)}`, '#1877f2'),
        a('X', `https://twitter.com/intent/tweet?text=${enc(text)}&url=${enc(link)}`, '#111'),
        a('SMS', `sms:?&body=${enc(msg)}`, '#4caf50'),
      ),
    );
  }).catch((e) => box.replaceChildren(h('p', { class: 'form-error' }, e.message)));
}
