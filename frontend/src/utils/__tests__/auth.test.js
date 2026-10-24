import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  saveSession,
  getToken,
  hasActiveSession,
  getUser,
  logout,
  consumeSessionNotice,
  saveSessionNotice,
  getActiveSlot,
  otherSessionUser,
} from '../auth';

function createToken(expOffsetMs) {
  const payload = { exp: Math.floor((Date.now() + expOffsetMs) / 1000) };
  const body = btoa(JSON.stringify(payload));
  return `header.${body}.sig`;
}

describe('auth utils', () => {
  beforeEach(() => {
    localStorage.clear();
    sessionStorage.clear();
  });

  it('saveSession stores token and user, getToken retrieves valid token', () => {
    const token = createToken(60_000);
    const user = { id: 1, name: 'Test', role: 'Admin' };

    saveSession(token, user);

    expect(getToken()).toBe(token);
    expect(hasActiveSession()).toBe(true);
    expect(getUser()).toEqual(user);
  });

  it('getToken returns null for expired token', () => {
    const token = createToken(-10_000);
    const user = { id: 1, name: 'Test', role: 'Admin' };

    saveSession(token, user);
    expect(getToken()).toBeNull();
    expect(hasActiveSession()).toBe(false);
  });

  it('logout clears session and stores notice', () => {
    const token = createToken(60_000);
    const user = { id: 1, name: 'Test', role: 'Admin' };
    saveSession(token, user);

    logout({ message: 'Test logout' });

    expect(getToken()).toBeNull();
    expect(getUser()).toBeNull();
    expect(consumeSessionNotice()).toBe('Test logout');
  });

  it('saveSessionNotice and consumeSessionNotice round-trip', () => {
    saveSessionNotice('hello');
    expect(consumeSessionNotice()).toBe('hello');
    expect(consumeSessionNotice()).toBeNull();
  });

  it('getUser returns null when no session', () => {
    expect(getUser()).toBeNull();
    expect(hasActiveSession()).toBe(false);
  });

  describe('shop and owner console signed in side by side', () => {
    const go = (path) => window.history.pushState({}, '', path);
    const shopUser = { id: 1, name: 'Kato', role: 'Admin', shop: { name: 'Kato Store' } };
    const ownerUser = { id: 99, name: 'Owner', role: 'SuperAdmin' };

    it('keeps both sessions and picks the slot from the page', () => {
      go('/login');
      saveSession(createToken(60_000), shopUser);
      go('/owner');
      saveSession(createToken(60_000), ownerUser);

      expect(getUser().role).toBe('SuperAdmin');
      go('/login');
      expect(getUser().name).toBe('Kato');
      expect(otherSessionUser().role).toBe('SuperAdmin');
      go('/app/pos');
      expect(getActiveSlot()).toBe('shop');
    });

    it('signing out of one keeps the other', () => {
      go('/login');
      saveSession(createToken(60_000), shopUser);
      go('/owner');
      saveSession(createToken(60_000), ownerUser);
      const assign = vi.spyOn(window, 'location', 'get');
      assign.mockReturnValue({ ...window.location, pathname: '/app/owner', href: '' });
      logout();
      assign.mockRestore();
      go('/login');
      expect(getUser()?.name).toBe('Kato');
      go('/owner');
      expect(getUser()).toBeNull();
    });

    it('moves an old owner sign-in out of the shop slot', () => {
      localStorage.setItem('stockdesk_token', createToken(60_000));
      localStorage.setItem('stockdesk_user', JSON.stringify(ownerUser));
      go('/owner');
      expect(getUser()?.role).toBe('SuperAdmin');
      go('/login');
      expect(getUser()).toBeNull();
    });
  });
});
