import { getSettings } from '../store';
import { owns } from '../rewards';

let uid = 0;

export type Slot = 'aura' | 'badge';
export type Outfit = Partial<Record<Slot, string>>;

/** Characters for the assistant (3D art: Microsoft Fluent Emoji, MIT). `free` ones need no purchase. */
export const MASCOTS: { id: string; name: string; free?: boolean }[] = [
  { id: 'lion', name: 'אריה', free: true },
  { id: 'robot', name: 'רובוט', free: true },
  { id: 'dog', name: 'כלב', free: true },
  { id: 'panda', name: 'פנדה', free: true },
  { id: 'cat', name: 'חתול' },
  { id: 'frog', name: 'צפרדע' },
  { id: 'tiger', name: 'נמר' },
  { id: 'fox', name: 'שועל' },
  { id: 'bear', name: 'דוב' },
  { id: 'koala', name: 'קואלה' },
  { id: 'monkey', name: 'קוף' },
  { id: 'penguin', name: 'פינגווין' },
  { id: 'owl', name: 'ינשוף' },
  { id: 'lifter', name: 'מרים משקולות' },
  { id: 'unicorn', name: 'חד־קרן' },
  { id: 'dragon', name: 'דרקון' },
];

/** Styles for the assistant: a glowing aura behind it, and a small badge in the corner. */
export const ACCESSORIES: { id: string; name: string; slot: Slot }[] = [
  { id: 'mint', name: 'הילת מנטה', slot: 'aura' },
  { id: 'ocean', name: 'הילת אוקיינוס', slot: 'aura' },
  { id: 'sunset', name: 'הילת שקיעה', slot: 'aura' },
  { id: 'gold', name: 'הילת זהב', slot: 'aura' },
  { id: 'galaxy', name: 'הילת גלקסיה', slot: 'aura' },
  { id: 'flames', name: 'הילת להבות', slot: 'aura' },
  { id: 'rainbow', name: 'הילת קשת', slot: 'aura' },
  { id: 'heart', name: 'לב נוצץ', slot: 'badge' },
  { id: 'fire', name: 'להבה', slot: 'badge' },
  { id: 'partyhat', name: 'מסיבה', slot: 'badge' },
  { id: 'star', name: 'כוכב זוהר', slot: 'badge' },
  { id: 'medal', name: 'מדליית זהב', slot: 'badge' },
  { id: 'trophy', name: 'גביע', slot: 'badge' },
];

export const ownsMascot = (id: string) => !!MASCOTS.find((m) => m.id === id)?.free || owns('mascot:' + id);
const currentKind = () => { const m = getSettings().mascot; return m && MASCOTS.some((x) => x.id === m) && ownsMascot(m) ? m : 'lion'; };
/** The accessories the user has on, keeping only ones they still own. */
export function currentOutfit(): Outfit {
  const o = getSettings().mascotOutfit ?? {};
  const out: Outfit = {};
  for (const k of ['aura', 'badge'] as Slot[]) if (o[k] && owns('acc:' + o[k])) out[k] = o[k];
  return out;
}
const sig = (kind: string, o: Outfit) => [kind, o.aura ?? '', o.badge ?? ''].join('|');

/**
 * The assistant's character in the chosen look, with its accessories.
 * Pass `kind`/`outfit` for a fixed preview (it won't follow later changes).
 */
export function mascot(size = 32, extra = '', kind?: string, outfit?: Outfit): HTMLElement {
  const fixed = kind !== undefined || outfit !== undefined;
  const k = kind ?? currentKind();
  const o = outfit ?? (fixed ? {} : currentOutfit());
  const el = document.createElement('span');
  el.className = `mascot mascot-${k === 'robot' ? 'svg' : '3d'} ${extra}`;
  Object.assign(el.dataset, { kind: k, size: String(size), extra, sig: sig(k, o) });
  if (fixed) el.dataset.fixed = '1';
  el.setAttribute('aria-hidden', 'true');
  el.style.width = el.style.height = size + 'px';
  const body = document.createElement('span');
  body.className = 'm-body';
  if (k === 'robot') body.innerHTML = robotSvg(size);
  else body.append(img(`mascots/${k}.webp`, 'm-art'));
  if (o.aura) { el.classList.add('has-aura', 'aura-' + o.aura); el.prepend(Object.assign(document.createElement('span'), { className: 'm-aura' })); }
  if (o.badge) body.append(img(`mascots/acc/${o.badge}.webp`, 'm-acc m-badge'));
  el.append(body);
  return el;
}

function img(path: string, cls: string): HTMLImageElement {
  const i = document.createElement('img');
  i.src = import.meta.env.BASE_URL + path;
  i.alt = '';
  i.className = cls;
  i.decoding = 'async';
  i.draggable = false;
  return i;
}

/** Swap every live mascot on the page when the character or outfit changes. */
export function refreshMascots(): void {
  const k = currentKind();
  const s = sig(k, currentOutfit());
  document.querySelectorAll<HTMLElement>('.mascot[data-kind]:not([data-fixed])').forEach((el) => {
    if (el.dataset.sig !== s) el.replaceWith(mascot(Number(el.dataset.size), el.dataset.extra ?? ''));
  });
}

/** The original drawn robot (blinks, antenna glow). */
function robotSvg(size: number): string {
  const id = 'm' + ++uid;
  return `
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
}
