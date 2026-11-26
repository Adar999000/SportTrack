import { getSettings } from '../store';
import { owns } from '../rewards';

export type EffectKind = 'confetti' | 'stars' | 'fireworks';

/**
 * A short celebration (the effect the user owns and chose), unless motion is reduced.
 * `force` plays it anyway (store preview / purchase); `kind` overrides the chosen one.
 */
export function burst(force = false, kind?: EffectKind): void {
  const s = getSettings();
  const k: EffectKind = kind ?? s.effectKind ?? 'confetti';
  if (!force && !(s.effects && owns('effect:' + k))) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion')) return;
  const layer = document.createElement('div');
  layer.className = 'confetti fx-' + k;
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#2f6f5e', '#f6d36b', '#e8743b', '#7a5cd6', '#1f9bd1', '#e04f7a'];
  if (k === 'stars') {
    for (let i = 0; i < 22; i++) {
      const p = document.createElement('i');
      p.textContent = ['⭐', '✨', '🌟'][i % 3];
      p.style.left = Math.random() * 100 + 'vw';
      p.style.animationDelay = Math.random() * 0.5 + 's';
      p.style.fontSize = 16 + Math.random() * 18 + 'px';
      layer.append(p);
    }
  } else if (k === 'fireworks') {
    for (let b = 0; b < 3; b++) {
      const cx = 20 + b * 30 + Math.random() * 10, cy = 25 + Math.random() * 20;
      for (let i = 0; i < 18; i++) {
        const p = document.createElement('i');
        const a = (i / 18) * Math.PI * 2, r = 80 + Math.random() * 40;
        p.style.left = cx + 'vw'; p.style.top = cy + 'vh';
        p.style.background = colors[(i + b) % colors.length];
        p.style.setProperty('--x', Math.cos(a) * r + 'px');
        p.style.setProperty('--y', Math.sin(a) * r + 'px');
        p.style.animationDelay = b * 0.35 + 's';
        layer.append(p);
      }
    }
  } else {
    for (let i = 0; i < 46; i++) {
      const p = document.createElement('i');
      p.style.left = Math.random() * 100 + 'vw';
      p.style.background = colors[i % colors.length];
      p.style.animationDelay = Math.random() * 0.25 + 's';
      p.style.setProperty('--dx', (Math.random() * 160 - 80).toFixed(0) + 'px');
      p.style.setProperty('--rot', (Math.random() * 720).toFixed(0) + 'deg');
      layer.append(p);
    }
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 2200);
}
