// Device storage for working offline: cached lists (products, customers,
// settings) and the queue of sales made while offline. IndexedDB survives
// reloads, sign-out and browser restarts; if it is unavailable (some private
// windows) we fall back to localStorage so a queued sale is never lost.

const DB_NAME = 'stockdesk-offline';
const DB_VERSION = 1;
const FALLBACK_KEY = 'stockdesk_offline_fallback';

let dbPromise = null;

function openDb() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains('cache')) db.createObjectStore('cache', { keyPath: 'key' });
      if (!db.objectStoreNames.contains('queue')) {
        const queue = db.createObjectStore('queue', { keyPath: 'clientRef' });
        queue.createIndex('shopId', 'shopId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  }).catch((error) => {
    dbPromise = null;
    throw error;
  });
  return dbPromise;
}

function tx(storeName, mode, run) {
  return openDb().then((db) => new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    let result;
    Promise.resolve(run(store)).then((value) => { result = value; });
    transaction.oncomplete = () => resolve(result);
    transaction.onerror = () => reject(transaction.error);
    transaction.onabort = () => reject(transaction.error);
  }));
}

const asPromise = (request) => new Promise((resolve, reject) => {
  request.onsuccess = () => resolve(request.result);
  request.onerror = () => reject(request.error);
});

// ---- localStorage fallback
function fallbackRead() {
  try {
    return JSON.parse(localStorage.getItem(FALLBACK_KEY) || '{"cache":{},"queue":{}}');
  } catch {
    return { cache: {}, queue: {} };
  }
}
function fallbackWrite(data) {
  try {
    localStorage.setItem(FALLBACK_KEY, JSON.stringify(data));
  } catch {
    // Storage full: the cache is best-effort; queue writes surface the error.
    throw new Error('This device has no storage space left for offline sales.');
  }
}

// ---- cache
export async function cacheSet(key, value) {
  try {
    await tx('cache', 'readwrite', (store) => store.put({ key, value, savedAt: Date.now() }));
  } catch {
    try {
      const data = fallbackRead();
      // Only small items in localStorage (5 MB limit): skip big lists.
      if (JSON.stringify(value).length < 1_000_000) {
        data.cache[key] = { value, savedAt: Date.now() };
        fallbackWrite(data);
      }
    } catch {
      // Caching is best-effort.
    }
  }
}

export async function cacheGet(key) {
  try {
    const row = await tx('cache', 'readonly', (store) => asPromise(store.get(key)));
    if (row) return row;
  } catch {
    // fall through
  }
  const row = fallbackRead().cache[key];
  return row ? { key, ...row } : null;
}

// ---- sale queue
export async function queuePut(entry) {
  try {
    await tx('queue', 'readwrite', (store) => store.put(entry));
  } catch {
    const data = fallbackRead();
    data.queue[entry.clientRef] = entry;
    fallbackWrite(data);
  }
}

export async function queueDelete(clientRef) {
  try {
    await tx('queue', 'readwrite', (store) => store.delete(clientRef));
  } catch {
    // ignore, also clear the fallback below
  }
  const data = fallbackRead();
  if (data.queue[clientRef]) {
    delete data.queue[clientRef];
    fallbackWrite(data);
  }
}

export async function queueList(shopId) {
  let rows = [];
  try {
    rows = await tx('queue', 'readonly', (store) => asPromise(store.index('shopId').getAll(shopId)));
  } catch {
    rows = [];
  }
  const fallback = Object.values(fallbackRead().queue).filter((e) => e.shopId === shopId);
  const merged = new Map([...fallback, ...rows].map((e) => [e.clientRef, e]));
  return [...merged.values()].sort((a, b) => a.queuedAt - b.queuedAt);
}
