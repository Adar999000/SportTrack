import { mascot } from './mascot';
/** Small stroke icon set (24×24, currentColor). */
const P: Record<string, string> = {
  week: '<rect x="3" y="4.5" width="18" height="16" rx="2.5"/><path d="M3 9.5h18M8 2.5v4M16 2.5v4M8 13.5h2M14 13.5h2M8 17h2"/>',
  history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/><path d="M12 7.5V12l3 2"/>',
  stats: '<path d="M4 20V11M10 20V5M16 20v-6M21 20H3"/>',
  chat: '<path d="M12 3.5l1.8 4.7 4.7 1.8-4.7 1.8L12 16.5l-1.8-4.7L5.5 10l4.7-1.8z"/><path d="M18.5 15.5l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  feed: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.6-3.2 3.2-5 6.5-5s5.9 1.8 6.5 5"/><circle cx="17" cy="9" r="2.6"/><path d="M16.5 14.2c2.7.1 4.6 1.6 5 4.3"/>',
  mail: '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="M3.5 6.5l8.5 6.5 8.5-6.5"/>',
  profile: '<circle cx="12" cy="8" r="4"/><path d="M4 20.5c.8-3.6 4-5.5 8-5.5s7.2 1.9 8 5.5"/>',
  admin: '<path d="M12 3l8 3v6c0 4.8-3.4 7.9-8 9-4.6-1.1-8-4.2-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  settings: '<path d="M4 6h10M18 6h2M4 12h4M12 12h8M4 18h12M20 18h0"/><circle cx="16" cy="6" r="2"/><circle cx="10" cy="12" r="2"/><circle cx="18" cy="18" r="2"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20.5 14.2A8.5 8.5 0 1 1 9.8 3.5a6.8 6.8 0 0 0 10.7 10.7z"/>',
  camera: '<path d="M4 8.5h3l1.8-2.5h6.4L17 8.5h3a1 1 0 0 1 1 1V19a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9.5a1 1 0 0 1 1-1z"/><circle cx="12" cy="13.5" r="3.5"/>',
  coin: '<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5v9M9.5 9.5c0-1 1.1-1.6 2.5-1.6s2.5.7 2.5 1.7c0 2.4-5 1.4-5 3.8 0 1 1.1 1.7 2.5 1.7s2.5-.6 2.5-1.6"/>',
  download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 7.5v.5"/>',
};

export function icon(name: keyof typeof P | string, size = 22): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true" focusable="false">${P[name] ?? ''}</svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/** The app mark: a checked weekly grid on a green tile. */
export function logo(size = 32): SVGSVGElement {
  const wrap = document.createElement('span');
  wrap.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="${size}" height="${size}" aria-hidden="true" focusable="false"><rect width="512" height="512" rx="112" fill="var(--brand, #2f6f5e)"/><g fill="none" stroke="#fff" stroke-opacity=".35" stroke-width="14"><rect x="96" y="112" width="320" height="288" rx="28"/><path d="M96 192h320M202 112v288M310 112v288"/></g><path d="M168 300l62 58 128-150" fill="none" stroke="#fff" stroke-width="40" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  return wrap.firstElementChild as SVGSVGElement;
}

/** The mark used on everything AI-related: sparkles + "AI". */
export function aiMark(size = 16): HTMLElement {
  const el = mascot(Math.round(size * 1.25));
  el.classList.add('ai-mark');
  return el;
}

/** A small "AI" pill for buttons and titles. */
export function aiBadge(): HTMLElement {
  const el = document.createElement('span');
  el.className = 'ai-badge';
  el.append(icon('chat', 12), document.createTextNode('AI'));
  return el;
}

