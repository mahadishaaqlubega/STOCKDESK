import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { isOffline, subscribeConnectivity } from '../utils/connectivity';
import { pendingSales, subscribeQueue, syncPendingSales } from '../utils/offlineSales';

/**
 * Connection status for the whole app, plus the offline sale queue: shows
 * when the till is offline and how many sales are waiting, and sends them
 * automatically as soon as StockDesk is reachable again.
 */
export default function OfflineBar({ shopId }) {
  const [offline, setOffline] = useState(isOffline());
  const [queue, setQueue] = useState([]);
  const [syncing, setSyncing] = useState(false);
  const [justSynced, setJustSynced] = useState(0);

  const refresh = useCallback(async () => {
    if (!shopId) return;
    setQueue(await pendingSales(shopId));
  }, [shopId]);

  const sync = useCallback(async () => {
    if (!shopId || isOffline()) return;
    setSyncing(true);
    try {
      const result = await syncPendingSales(shopId);
      if (result.synced) {
        setJustSynced(result.synced);
        window.setTimeout(() => setJustSynced(0), 6000);
        window.dispatchEvent(new CustomEvent('stockdesk:sales-synced', { detail: result }));
      }
    } finally {
      setSyncing(false);
      refresh();
    }
  }, [shopId, refresh]);

  useEffect(() => {
    refresh();
    const offQueue = subscribeQueue(refresh);
    const offConn = subscribeConnectivity((value) => {
      setOffline(value);
      if (!value) sync();
    });
    // On start-up (e.g. after signing in again), send anything left over.
    if (!isOffline()) sync();
    // Safety net: retry every 2 minutes while sales are waiting.
    const timer = window.setInterval(() => { if (!isOffline()) sync(); }, 120000);
    return () => {
      offQueue();
      offConn();
      window.clearInterval(timer);
    };
  }, [refresh, sync]);

  const waiting = queue.filter((e) => e.status !== 'failed').length;
  const failed = queue.length - waiting;

  if (!offline && !queue.length && !justSynced) return null;

  let tone = 'bg-slate-500/10 text-slate-800 border-slate-500/30 dark:text-slate-200';
  let text;
  if (offline) {
    tone = 'bg-amber-500/15 text-amber-900 border-amber-500/40 dark:text-amber-100';
    text = waiting
      ? `You're offline. ${waiting} sale${waiting === 1 ? ' is' : 's are'} saved on this device and will sync when the connection is back.`
      : "You're offline. You can keep selling with cash, card or mobile money; sales will sync when the connection is back.";
  } else if (syncing) {
    text = `Sending ${waiting} offline sale${waiting === 1 ? '' : 's'}…`;
  } else if (failed) {
    tone = 'bg-red-500/10 text-red-800 border-red-500/30 dark:text-red-200';
    text = `${failed} offline sale${failed === 1 ? '' : 's'} could not be saved. Open the till to review.`;
  } else if (waiting) {
    text = `${waiting} offline sale${waiting === 1 ? '' : 's'} waiting to sync.`;
  } else {
    tone = 'bg-emerald-500/10 text-emerald-800 border-emerald-500/30 dark:text-emerald-200';
    text = `Back online. ${justSynced} offline sale${justSynced === 1 ? '' : 's'} saved.`;
  }

  return (
    <div className={`mb-4 flex flex-col gap-2 rounded-xl border px-4 py-2.5 text-sm sm:flex-row sm:items-center sm:justify-between ${tone}`} role="status">
      <span className="flex items-center gap-2">
        <span className={`h-2 w-2 shrink-0 rounded-full ${offline ? 'bg-amber-500' : failed ? 'bg-red-500' : 'animate-pulse bg-emerald-500'}`} aria-hidden="true" />
        {text}
      </span>
      <span className="flex shrink-0 gap-2">
        {failed ? <Link to="/app/pos" className="rounded-lg border border-black/15 px-3 py-1 dark:border-white/25 text-xs font-medium hover:bg-black/5">Review</Link> : null}
        {!offline && waiting ? (
          <button type="button" onClick={sync} disabled={syncing} className="rounded-lg border border-black/15 px-3 py-1 dark:border-white/25 text-xs font-medium hover:bg-black/5 disabled:opacity-60">
            {syncing ? 'Syncing…' : 'Sync now'}
          </button>
        ) : null}
      </span>
    </div>
  );
}
