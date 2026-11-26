import { getSettings } from '../store';

let uid = 0;

/** Characters the user can pick for the assistant (3D art: Microsoft Fluent Emoji, MIT). */
export const MASCOTS: { id: string; name: string }[] = [
  { id: 'lion', name: 'אריה' },
  { id: 'tiger', name: 'נמר' },
  { id: 'fox', name: 'שועל' },
  { id: 'panda', name: 'פנדה' },
  { id: 'bear', name: 'דוב' },
  { id: 'dog', name: 'כלב' },
  { id: 'owl', name: 'ינשוף' },
  { id: 'lifter', name: 'מרים משקולות' },
  { id: 'robot', name: 'רובוט' },
];
const current = () => { const m = getSettings().mascot; return MASCOTS.some((x) => x.id === m) ? m! : 'lion'; };

/** The assistant's character, in the chosen look (animated with CSS; still under reduced motion). */
export function mascot(size = 32, extra = '', kind = current()): HTMLElement {
  if (kind === 'robot') return robot(size, extra);
  const el = document.createElement('span');
  el.className = 'mascot mascot-3d ' + extra;
  el.dataset.kind = kind;
  el.dataset.size = String(size);
  el.dataset.extra = extra;
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = size + 'px';
  const img = document.createElement('img');
  img.src = `${import.meta.env.BASE_URL}mascots/${kind}.webp`;
  img.alt = '';
  img.width = img.height = size;
  img.decoding = 'async';
  img.draggable = false;
  el.append(img);
  return el;
}

/** Swap every mascot on the page when the chosen character changes. */
export function refreshMascots(): void {
  const k = current();
  document.querySelectorAll<HTMLElement>('.mascot[data-kind]:not(.mascot-pick .mascot)').forEach((el) => {
    if (el.dataset.kind !== k) el.replaceWith(mascot(Number(el.dataset.size), el.dataset.extra ?? '', k));
  });
}

/** The original drawn robot (blinks, floats, antenna glow). */
function robot(size: number, extra: string): HTMLElement {
  const id = 'm' + ++uid;
  const el = document.createElement('span');
  el.className = 'mascot ' + extra;
  el.dataset.kind = 'robot';
  el.dataset.size = String(size);
  el.dataset.extra = extra;
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = size + 'px';
  el.innerHTML = `
<svg viewBox="0 0 100 100" width="${size}" height="${size}">
  <defs>
    <radialGradient id="${id}b" cx="38%" cy="28%" r="80%"><stop offset="0" stop-color="#9ee6d2"/><stop offset=".45" stop-color="#3fa58c"/><stop offset="1" stop-color="#5b3fb0"/></radialGradient>
    <radialGradient id="${id}f" cx="45%" cy="35%" r="75%"><stop offset="0" stop-color="#ffffff"/><stop offset="1" stop-color="#dfe9f2"/></radialGradient>
    <radialGradient id="${id}e" cx="40%" cy="35%" r="70%"><stop offset="0" stop-color="#3a3f6b"/><stop offset="1" stop-color="#11132a"/></radialGradient>
    <radialGradient id="${id}g" cx="50%" cy="50%" r="50%"><stop offset="0" stop-color="#fff6b0"/><stop offset=".55" stop-color="#ffc93c"/><stop offset="1" stop-color="#ff9d2e" stop-opacity="0"/></radialGradient>
  </defs>
  <g class="m-float">
    <line x1="50" y1="20" x2="50" y2="9" stroke="#5b3fb0" stroke-width="3.5" stroke-linecap="round"/>
    <circle class="m-glow" cx="50" cy="8" r="7" fill="url(#${id}g)"/>
    <circle cx="50" cy="8" r="3.6" fill="#ffd54a"/>
    <ellipse cx="13" cy="54" rx="6" ry="10" fill="#4b36a0"/>
    <ellipse cx="87" cy="54" rx="6" ry="10" fill="#4b36a0"/>
    <rect x="14" y="19" width="72" height="68" rx="34" fill="url(#${id}b)"/>
    <ellipse cx="36" cy="28" rx="16" ry="7" fill="#fff" opacity=".35" transform="rotate(-18 36 28)"/>
    <rect x="23" y="34" width="54" height="40" rx="20" fill="url(#${id}f)"/>
    <g class="m-eyes">
      <ellipse cx="39" cy="52" rx="7" ry="8.5" fill="url(#${id}e)"/>
      <ellipse cx="61" cy="52" rx="7" ry="8.5" fill="url(#${id}e)"/>
      <circle cx="41.5" cy="48.5" r="2.8" fill="#fff"/><circle cx="63.5" cy="48.5" r="2.8" fill="#fff"/>
      <circle cx="37" cy="55" r="1.2" fill="#fff" opacity=".8"/><circle cx="59" cy="55" r="1.2" fill="#fff" opacity=".8"/>
    </g>
    <ellipse cx="30" cy="63" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".7"/>
    <ellipse cx="70" cy="63" rx="4.5" ry="2.6" fill="#ff8fa3" opacity=".7"/>
    <path class="m-mouth" d="M43 63 Q50 70 57 63" fill="none" stroke="#11132a" stroke-width="2.6" stroke-linecap="round"/>
  </g>
</svg>`;
  return el;
}
