import { photoUrl } from '../session';
import { h } from './dom';

/** Round avatar: the user's photo, or their initial. Loads the photo lazily. */
export function avatar(name: string, photoId: string | null | undefined, size = 48): HTMLElement {
  const el = h('span', { class: 'avatar', style: { width: `${size}px`, height: `${size}px`, fontSize: `${size * 0.42}px` }, 'aria-hidden': 'true' },
    (name.trim()[0] || '?').toUpperCase());
  if (photoId) {
    photoUrl(photoId).then((url) => {
      el.textContent = '';
      el.append(h('img', { src: url, alt: '' }));
    }).catch(() => {});
  }
  return el;
}
