/** "Install the app": the system prompt where supported (Android/Chrome/Edge), instructions elsewhere (iPhone). */
let deferred: any = null;
const listeners = new Set<() => void>();

export function initInstall(): void {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault();
    deferred = e;
    listeners.forEach((l) => l());
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    listeners.forEach((l) => l());
  });
}

export const onInstallChange = (l: () => void) => (listeners.add(l), () => listeners.delete(l));

export function isInstalled(): boolean {
  return matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
}

export const isIOS = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
export const canPrompt = () => !!deferred;

/** Returns true when the system dialog was shown. */
export async function promptInstall(): Promise<boolean> {
  if (!deferred) return false;
  deferred.prompt();
  await deferred.userChoice.catch(() => null);
  deferred = null;
  listeners.forEach((l) => l());
  return true;
}
