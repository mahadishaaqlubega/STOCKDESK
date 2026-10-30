// "Install this app" support. Chrome, Edge and Android offer installation
// through a one-time beforeinstallprompt event that often fires before React
// mounts, so it is caught here at start-up and kept for whoever asks later.
// iPhones never fire it; there the user adds the app from Safari's Share menu.

let deferredPrompt = null;
const listeners = new Set();
const notify = () => listeners.forEach((fn) => fn());

export function initInstallPrompt() {
  if (typeof window === 'undefined') return;
  window.addEventListener('beforeinstallprompt', (event) => {
    // Show our own card instead of the browser's mini bar.
    event.preventDefault();
    deferredPrompt = event;
    notify();
  });
  window.addEventListener('appinstalled', () => {
    deferredPrompt = null;
    notify();
  });
}

export const canPromptInstall = () => Boolean(deferredPrompt);

// Shows the browser's install dialog. Resolves 'accepted', 'dismissed' or
// 'unavailable'.
export async function promptInstall() {
  if (!deferredPrompt) return 'unavailable';
  const event = deferredPrompt;
  deferredPrompt = null;
  event.prompt();
  const { outcome } = await event.userChoice;
  notify();
  return outcome;
}

export function subscribeInstall(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

// True when StockDesk is already running as an installed app.
export function isInstalled() {
  return Boolean(window.matchMedia?.('(display-mode: standalone)').matches || window.navigator.standalone === true);
}

export function devicePlatform() {
  const ua = window.navigator.userAgent || '';
  const iPadOS = window.navigator.platform === 'MacIntel' && window.navigator.maxTouchPoints > 1;
  if (/iPhone|iPad|iPod/.test(ua) || iPadOS) return 'ios';
  if (/Android/.test(ua)) return 'android';
  return 'desktop';
}
