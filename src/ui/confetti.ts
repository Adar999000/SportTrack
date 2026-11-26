import { getSettings } from '../store';
import { owns } from '../rewards';

/** A short confetti burst (only if the effect is owned and on, and motion isn't reduced). */
export function burst(force = false): void {
  if (!force && !(getSettings().effects && owns('effect:confetti'))) return;
  if (matchMedia('(prefers-reduced-motion: reduce)').matches || document.documentElement.classList.contains('a11y-motion')) return;
  const layer = document.createElement('div');
  layer.className = 'confetti';
  layer.setAttribute('aria-hidden', 'true');
  const colors = ['#2f6f5e', '#f6d36b', '#e8743b', '#7a5cd6', '#1f9bd1', '#e04f7a'];
  for (let i = 0; i < 46; i++) {
    const p = document.createElement('i');
    p.style.left = Math.random() * 100 + 'vw';
    p.style.background = colors[i % colors.length];
    p.style.animationDelay = Math.random() * 0.25 + 's';
    p.style.setProperty('--dx', (Math.random() * 160 - 80).toFixed(0) + 'px');
    p.style.setProperty('--rot', (Math.random() * 720).toFixed(0) + 'deg');
    layer.append(p);
  }
  document.body.append(layer);
  setTimeout(() => layer.remove(), 1900);
}
