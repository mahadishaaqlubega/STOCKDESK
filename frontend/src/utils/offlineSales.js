// Sales made while the till is offline: queued on the device, then sent to
// the server in order once it is reachable. Each sale carries a clientRef
// so the server stores it exactly once, even if a send is retried after a
// lost response.
import { createSale } from './api';
import { queueDelete, queueList, queuePut } from './offlineStore';

const listeners = new Set();
let syncing = null;

function notify() {
  listeners.forEach((listener) => {
    try {
      listener();
    } catch {
      // ignore
    }
  });
}

export function subscribeQueue(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function newClientRef() {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}

// Short code printed on the offline receipt until the real number exists.
export function offlineReceiptNumber(clientRef) {
  return `OFFLINE-${clientRef.replace(/[^a-z0-9]/gi, '').slice(-6).toUpperCase()}`;
}

export async function queueSale({ clientRef, shopId, cashierId, payload, localSale }) {
  await queuePut({
    clientRef,
    shopId,
    cashierId,
    payload,
    localSale,
    soldAt: new Date().toISOString(),
    queuedAt: Date.now(),
    status: 'pending',
    error: null,
  });
  notify();
}

export const pendingSales = (shopId) => queueList(shopId);

export async function discardQueuedSale(clientRef) {
  await queueDelete(clientRef);
  notify();
}

// Sends queued sales oldest first. Stops at the first network error (still
// offline); a sale the server refuses (e.g. a discount over the limit) is
// marked "failed" with the reason and the rest continue.
export function syncPendingSales(shopId) {
  if (syncing) return syncing;
  syncing = (async () => {
    const result = { synced: 0, failed: 0, remaining: 0 };
    try {
      const queue = await queueList(shopId);
      for (const entry of queue) {
        if (entry.status === 'failed') {
          result.failed += 1;
          continue;
        }
        try {
          await createSale({ ...entry.payload, clientRef: entry.clientRef, offline: true, soldAt: entry.soldAt, cashierId: entry.cashierId });
          await queueDelete(entry.clientRef);
          result.synced += 1;
          notify();
        } catch (error) {
          if (error?.isNetworkError || /session|sign in|log in/i.test(error?.message || '')) {
            break; // try again later / after signing in
          }
          await queuePut({ ...entry, status: 'failed', error: error?.message || 'Rejected by the server' });
          result.failed += 1;
          notify();
        }
      }
      result.remaining = (await queueList(shopId)).length;
    } finally {
      syncing = null;
    }
    return result;
  })();
  return syncing;
}

export async function retryQueuedSale(entry) {
  await queuePut({ ...entry, status: 'pending', error: null });
  notify();
  return syncPendingSales(entry.shopId);
}
