// Is the StockDesk server reachable? navigator.onLine alone is not enough:
// a shop can be on Wi-Fi with no internet behind it. So the API layer
// reports real results here (a network error or 502/503/504 = offline, any
// other response = online), and while offline we ping the server every few
// seconds to notice when it comes back.

const listeners = new Set();
let offline = typeof navigator !== 'undefined' ? navigator.onLine === false : false;
let pingTimer = null;
let pingUrl = null;

function emit() {
  listeners.forEach((listener) => {
    try {
      listener(offline);
    } catch {
      // A broken listener must not stop the others.
    }
  });
}

function schedulePing() {
  if (pingTimer || !pingUrl || typeof window === 'undefined') return;
  pingTimer = window.setInterval(async () => {
    try {
      const response = await fetch(pingUrl, { cache: 'no-store' });
      if (response.status < 500) markOnline();
    } catch {
      // still offline
    }
  }, 15000);
}

export function configureConnectivity(apiBase) {
  pingUrl = `${String(apiBase).replace(/\/+$/, '')}`;
  if (offline) schedulePing();
}

export function isOffline() {
  return offline;
}

export function markOffline() {
  if (offline) return;
  offline = true;
  schedulePing();
  emit();
}

export function markOnline() {
  if (pingTimer) {
    window.clearInterval(pingTimer);
    pingTimer = null;
  }
  if (!offline) return;
  offline = false;
  emit();
}

export function subscribeConnectivity(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

if (typeof window !== 'undefined') {
  window.addEventListener('offline', markOffline);
  // The browser's "online" only means a network is back; confirm with a ping.
  window.addEventListener('online', () => {
    if (pingUrl) fetch(pingUrl, { cache: 'no-store' }).then((r) => { if (r.status < 500) markOnline(); }).catch(() => {});
  });
}

// Error thrown by the API layer when the server can't be reached.
export class NetworkError extends Error {
  constructor(message = 'No connection to StockDesk. Check the internet and try again.') {
    super(message);
    this.name = 'NetworkError';
    this.isNetworkError = true;
  }
}
