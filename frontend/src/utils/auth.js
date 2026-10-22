import { isOffline } from './connectivity';

const STORAGE_KEY = 'stockdesk_token';
const USER_KEY = 'stockdesk_user';
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

function clearSessionData() {
  localStorage.removeItem(STORAGE_KEY);
  localStorage.removeItem(USER_KEY);
}

function getStoredToken() {
  return localStorage.getItem(STORAGE_KEY);
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
  localStorage.setItem(STORAGE_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
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

  const value = localStorage.getItem(USER_KEY);
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
  localStorage.setItem(STORAGE_KEY, token);
  if (user) {
    localStorage.setItem(USER_KEY, JSON.stringify(user));
  }
  window.dispatchEvent(new Event('auth-changed'));
};
