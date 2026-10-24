import { isOffline } from './connectivity';

// Two sign-ins can live side by side in one browser: a shop and the platform
// owner console. Each has its own slot; every tab remembers which slot it
// uses, and the sign-in pages (/login, /owner) pick their slot. The shop slot
// keeps the original keys so existing sign-ins survive the change.
const SLOTS = {
  shop: { token: 'stockdesk_token', user: 'stockdesk_user' },
  owner: { token: 'stockdesk_owner_token', user: 'stockdesk_owner_user' },
};
const ACTIVE_SLOT_KEY = 'stockdesk_active_slot';
const OWNER_PATHS = ['/owner', '/owner-login', '/app/owner', '/app/shops', '/app/owner-billing', '/app/messages'];
const SESSION_NOTICE_KEY = 'stockdesk_session_notice';
const OFFLINE_GRACE_MS = 24 * 60 * 60 * 1000;

function setSessionNotice(message) {
  if (!message) {
    sessionStorage.removeItem(SESSION_NOTICE_KEY);
    return;
  }

  sessionStorage.setItem(SESSION_NOTICE_KEY, message);
}

export const saveSessionNotice = (message) => setSessionNotice(message);

function parseTokenPayload(token) {
  try {
    const payload = token.split('.')[1];

    if (!payload) {
      return null;
    }

    const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
    const padded = normalized.padEnd(normalized.length + ((4 - (normalized.length % 4)) % 4), '=');
    return JSON.parse(window.atob(padded));
  } catch (error) {
    return null;
  }
}

function slotForUser(user) {
  return user?.role === 'SuperAdmin' ? 'owner' : 'shop';
}

// Before slots, an owner sign-in was stored in the shop keys: move it over.
function migrateLegacyOwner() {
  try {
    const raw = localStorage.getItem(SLOTS.shop.user);
    const user = raw ? JSON.parse(raw) : null;
    if (user?.role === 'SuperAdmin') {
      localStorage.setItem(SLOTS.owner.token, localStorage.getItem(SLOTS.shop.token) || '');
      localStorage.setItem(SLOTS.owner.user, raw);
      localStorage.removeItem(SLOTS.shop.token);
      localStorage.removeItem(SLOTS.shop.user);
    }
  } catch {
    // unreadable stored user: leave it
  }
}

const hasToken = (slot) => Boolean(localStorage.getItem(SLOTS[slot].token));
const currentPath = () => (typeof window !== 'undefined' ? window.location.pathname : '/');
const isOwnerPath = (path) => OWNER_PATHS.some((p) => path === p || path.startsWith(`${p}/`));

// Which slot this tab uses. Sign-in pages always use their own slot so you can
// sign in to one while signed in to the other.
export function getActiveSlot() {
  migrateLegacyOwner();
  const path = currentPath();
  if (path === '/login' || path === '/signup') { setActiveSlot('shop'); return 'shop'; }
  if (path === '/owner' || path === '/owner-login') { setActiveSlot('owner'); return 'owner'; }
  const remembered = sessionStorage.getItem(ACTIVE_SLOT_KEY);
  if (remembered && SLOTS[remembered] && hasToken(remembered)) return remembered;
  const preferred = isOwnerPath(path) ? 'owner' : 'shop';
  const other = preferred === 'owner' ? 'shop' : 'owner';
  return hasToken(preferred) || !hasToken(other) ? preferred : other;
}

export function setActiveSlot(slot) {
  if (SLOTS[slot]) sessionStorage.setItem(ACTIVE_SLOT_KEY, slot);
}

function clearSessionData(slot = getActiveSlot()) {
  localStorage.removeItem(SLOTS[slot].token);
  localStorage.removeItem(SLOTS[slot].user);
}

function getStoredToken() {
  return localStorage.getItem(SLOTS[getActiveSlot()].token);
}

function isTokenExpired(token) {
  const payload = parseTokenPayload(token);

  if (!payload?.exp) {
    return true;
  }

  return payload.exp * 1000 <= Date.now();
}

export const saveSession = (token, user) => {
  setSessionNotice('');
  const slot = slotForUser(user);
  localStorage.setItem(SLOTS[slot].token, token);
  localStorage.setItem(SLOTS[slot].user, JSON.stringify(user));
  setActiveSlot(slot);
  window.dispatchEvent(new Event('auth-changed'));
};

export const getToken = () => {
  const token = getStoredToken();

  if (!token) {
    return null;
  }

  if (isTokenExpired(token)) {
    // Offline grace: with no connection nobody can sign in again, so an
    // expired session keeps the till usable (sales queue on the device) for
    // up to a day. The server still rejects the token; queued sales sync
    // after the next sign-in.
    const exp = parseTokenPayload(token)?.exp;
    if (isOffline() && exp && Date.now() - exp * 1000 < OFFLINE_GRACE_MS) {
      return token;
    }
    clearSessionData();
    setSessionNotice('Session expired. Please log in again.');
    window.dispatchEvent(new Event('auth-changed'));
    return null;
  }

  return token;
};

export const hasActiveSession = () => Boolean(getToken());
export const getUser = () => {
  if (!getToken()) {
    return null;
  }

  const value = localStorage.getItem(SLOTS[getActiveSlot()].user);
  return value ? JSON.parse(value) : null;
};

export const consumeSessionNotice = () => {
  const message = sessionStorage.getItem(SESSION_NOTICE_KEY);
  sessionStorage.removeItem(SESSION_NOTICE_KEY);
  return message;
};

export const logout = ({ message = '', redirectTo } = {}) => {
  const user = getUser();
  clearSessionData();
  setSessionNotice(message);
  window.dispatchEvent(new Event('auth-changed'));
  window.location.href = redirectTo || (user?.role === 'SuperAdmin' ? '/owner-login' : '/login');
};

export const updateToken = (token, user) => {
  const slot = getActiveSlot();
  localStorage.setItem(SLOTS[slot].token, token);
  if (user) {
    localStorage.setItem(SLOTS[slot].user, JSON.stringify(user));
  }
  window.dispatchEvent(new Event('auth-changed'));
};

// True when the other slot (shop vs owner console) is also signed in.
export const otherSessionUser = () => {
  const other = getActiveSlot() === 'owner' ? 'shop' : 'owner';
  try {
    const raw = hasToken(other) ? localStorage.getItem(SLOTS[other].user) : null;
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};
