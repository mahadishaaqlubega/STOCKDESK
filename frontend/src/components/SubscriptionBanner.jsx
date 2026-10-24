import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { fetchBillingStatus } from '../utils/api';
import { fmtDate, money, planName } from '../utils/billing';

const DISMISS_KEY = 'sd-billing-dismissed';

// One-line notice at the top of every shop page: trial ending, payment due,
// read-only, or an open payment request. Staff are told to ask the owner.
export default function SubscriptionBanner({ user }) {
  const location = useLocation();
  const [data, setData] = useState(null);
  const [dismissed, setDismissed] = useState(() => {
    try { return sessionStorage.getItem(DISMISS_KEY) || ''; } catch { return ''; }
  });
  const isAdmin = user?.role === 'Admin';

  const load = useCallback(async () => {
    try {
      setData(await fetchBillingStatus());
    } catch {
      // Offline or older server: show nothing rather than an error.
    }
  }, []);

  useEffect(() => {
    load();
    const id = window.setInterval(load, 10 * 60 * 1000);
    window.addEventListener('sd:subscription', load);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('sd:subscription', load);
    };
  }, [load]);

  // Refresh after the owner pays from the Billing page.
  useEffect(() => { if (location.pathname !== '/app/billing') load(); }, [location.pathname, load]);

  if (!data?.status || location.pathname === '/app/billing') return null;
  const { status, config, openRequests = [], pendingPayments = [] } = data;
  const currency = config?.currency || 'UGX';

  let notice = null;
  if (status.state === 'expired') {
    notice = {
      tone: 'danger',
      text: isAdmin
        ? 'Your subscription has ended, so the shop is read-only. Your records are safe. Renew to start selling again.'
        : 'This shop is read-only because its StockDesk subscription ended. Ask the owner to renew it.',
      cta: 'Renew now',
    };
  } else if (status.state === 'past_due') {
    notice = {
      tone: 'warning',
      text: `Payment is due. The shop becomes read-only on ${fmtDate(status.graceEndsAt)} unless it is renewed.`,
      cta: 'Pay now',
    };
  } else if (isAdmin && openRequests.length) {
    const r = openRequests[0];
    notice = {
      tone: 'warning',
      text: `Payment request: ${money(r.amount, currency)} for the ${planName(config, r.plan)} plan${r.dueDate ? `, due ${fmtDate(r.dueDate)}` : ''}.`,
      cta: 'Pay now',
    };
  } else if (isAdmin && pendingPayments.length) {
    notice = { tone: 'info', text: 'Thanks! We received your payment details and will confirm them shortly.', cta: 'View', key: `pending-${pendingPayments[0].id}`, dismissible: true };
  } else if (status.state === 'trial' && status.daysLeft != null && status.daysLeft <= 7) {
    notice = {
      tone: 'info',
      text: `Your free trial ends ${status.daysLeft <= 1 ? 'tomorrow' : `in ${status.daysLeft} days`} (${fmtDate(status.endsAt)}).`,
      cta: 'Choose a plan',
      key: `trial-${status.daysLeft}`,
      dismissible: true,
    };
  } else if (status.state === 'active' && status.daysLeft != null && status.daysLeft <= 5) {
    notice = {
      tone: 'info',
      text: `Your plan renews ${status.daysLeft <= 1 ? 'tomorrow' : `in ${status.daysLeft} days`} (${fmtDate(status.endsAt)}).`,
      cta: 'Renew',
      key: `renew-${status.daysLeft}`,
      dismissible: true,
    };
  }

  if (!notice || (notice.dismissible && dismissed === notice.key)) return null;
  if (!isAdmin && notice.tone === 'info') return null;

  const cls = { danger: 'app-alert-danger', warning: 'app-alert-warning', info: 'app-alert-info' }[notice.tone];
  const dismiss = () => {
    setDismissed(notice.key);
    try { sessionStorage.setItem(DISMISS_KEY, notice.key); } catch { /* private mode */ }
  };

  return (
    <div className={`${cls} mb-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg px-3.5 py-2.5 text-sm`} role={notice.tone === 'danger' ? 'alert' : 'status'}>
      <span className="min-w-0 flex-1">{notice.text}</span>
      {isAdmin ? (
        <Link to="/app/billing" className="shrink-0 rounded-md bg-[var(--surface-primary)] px-3 py-1 text-xs font-semibold text-[var(--text-primary)] shadow-sm hover:opacity-90">
          {notice.cta}
        </Link>
      ) : null}
      {notice.dismissible ? (
        <button type="button" onClick={dismiss} className="shrink-0 rounded p-1 opacity-70 hover:opacity-100" aria-label="Dismiss">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><path d="M6 6l12 12M18 6 6 18" /></svg>
        </button>
      ) : null}
    </div>
  );
}
