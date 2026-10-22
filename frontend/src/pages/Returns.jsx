import { useEffect, useState } from 'react';
import { fetchSales, fetchSale, createReturn, fetchReturns, fetchSettings } from '../utils/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { formatMoney } from '../utils/format';

function SkeletonRow({ cols = 6 }) {
  return (
    <tr>
      {Array.from({ length: cols }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 animate-pulse rounded-md bg-[var(--surface-secondary)]" />
        </td>
      ))}
    </tr>
  );
}

function ReturnModal({ sale, currency, onClose, onSubmit }) {
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const items = sale?.items || [];

  const selectedItems = items
    .map((item) => ({ ...item, returnQty: Number(quantities[item.productId] || 0) }))
    .filter((item) => item.returnQty > 0);

  const refundTotal = selectedItems.reduce(
    (sum, item) => sum + Number(item.price) * item.returnQty,
    0
  );

  const handleQtyChange = (productId, value) => {
    setQuantities((prev) => ({ ...prev, [productId]: value }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (selectedItems.length === 0) {
      setError('Select at least one item to return.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({
        items: selectedItems.map((item) => ({
          productId: item.productId,
          quantity: item.returnQty,
        })),
        reason: reason || undefined,
      });
    } catch (err) {
      setError(err.message || 'Failed to process return');
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      <div className="app-panel relative z-10 w-full max-w-lg overflow-hidden rounded-2xl border shadow-2xl">
        <div className="border-b border-[var(--border-default)] px-6 py-4">
          <h2 className="text-lg font-semibold tracking-tight text-[var(--text-primary)]">
            Process Return — #{sale.id}
          </h2>
          <p className="mt-0.5 text-sm text-[var(--text-muted)]">
            Select items to return. Stock will be automatically restored.
          </p>
        </div>

        <form onSubmit={handleSubmit}>
          <div className="max-h-[50vh] overflow-y-auto px-6 py-4">
            <div className="space-y-3">
              {items.map((item) => {
                const maxQty = Number(item.quantity);
                const name = item.Product?.name || item.name || 'Product';
                const qty = quantities[item.productId] !== undefined ? quantities[item.productId] : '';
                return (
                  <div
                    key={item.productId}
                    className="flex items-center gap-4 rounded-xl border border-[var(--border-default)] px-4 py-3"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-medium text-[var(--text-primary)]">{name}</p>
                      <p className="text-xs text-[var(--text-muted)]">
                        Sold: {maxQty} × {formatMoney(currency, item.price)}
                      </p>
                    </div>
                    <div className="shrink-0">
                      <label className="sr-only">Return qty</label>
                      <input
                        type="number"
                        min={0}
                        max={maxQty}
                        step={1}
                        inputMode="numeric"
                        value={qty}
                        onChange={(e) => handleQtyChange(item.productId, e.target.value)}
                        placeholder="0"
                        className="app-input w-20 rounded-[0.9rem] border px-3 py-1.5 text-center text-sm"
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4">
              <label className="mb-1.5 block text-[13px] font-medium text-[var(--text-secondary)]">
                Reason <span className="font-normal text-[var(--text-muted)]">(optional)</span>
              </label>
              <input
                type="text"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Defective, wrong item, customer changed mind…"
                className="app-input w-full rounded-xl border px-4 py-2.5 text-sm"
              />
            </div>

            {error && (
              <p className="mt-3 rounded-[0.9rem] bg-[rgba(218,106,90,0.1)] px-3 py-2 text-sm text-[var(--danger)]">
                {error}
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-secondary)] px-6 py-4">
            <div>
              {refundTotal > 0 && (
                <p className="text-sm font-semibold text-[var(--success)]">
                  Refund: {formatMoney(currency, refundTotal)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                className="app-btn-secondary rounded-xl border px-4 py-2 text-sm font-medium"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={submitting || selectedItems.length === 0}
                className="app-btn-primary rounded-xl px-4 py-2 text-sm font-semibold disabled:opacity-50"
              >
                {submitting ? 'Processing…' : 'Process Return'}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}

function getRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return new Date(dateStr).toLocaleDateString([], { dateStyle: 'medium' });
}

function UserAvatar({ name }) {
  const initials = String(name || '?').split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[10px] font-bold text-[var(--accent)]">
      {initials}
    </span>
  );
}

export default function Returns() {
  const [view, setView] = useState('sales');
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [currency, setCurrency] = useState('USD');
  const [loading, setLoading] = useState(false);
  const [selectedSale, setSelectedSale] = useState(null);
  const [saleDetail, setSaleDetail] = useState(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [toast, setToast] = useState({ type: '', text: '' });

  useBodyScrollLock(Boolean(saleDetail));

  useEffect(() => {
    async function load() {
      try {
        setLoading(true);
        const [settings] = await Promise.all([fetchSettings()]);
        setCurrency(settings?.currency || 'USD');
      } catch (err) {
        console.error('Failed to load settings:', err.message);
      } finally { /* done */ }
    }
    load();
  }, []);

  useEffect(() => {
    if (view === 'sales') loadSales();
    else loadReturns();
  }, [view]);

  const loadSales = async () => {
    try {
      setLoading(true);
      const data = await fetchSales();
      setSales(data);
    } catch (err) {
      console.error('Failed to load sales:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const loadReturns = async () => {
    try {
      setLoading(true);
      const data = await fetchReturns();
      setReturns(data);
    } catch (err) {
      console.error('Failed to load returns:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const openReturn = async (saleId) => {
    try {
      setLoadingDetail(true);
      const detail = await fetchSale(saleId);
      setSaleDetail(detail);
      setSelectedSale(saleId);
    } catch (err) {
      showToast('error', err.message || 'Failed to load sale details');
    } finally {
      setLoadingDetail(false);
    }
  };

  const handleReturn = async (payload) => {
    await createReturn(selectedSale, payload);
    setSaleDetail(null);
    setSelectedSale(null);
    showToast('success', 'Return processed. Stock has been restored.');
    if (view === 'sales') loadSales();
    else loadReturns();
  };

  const showToast = (type, text) => {
    setToast({ type, text });
    setTimeout(() => setToast({ type: '', text: '' }), 4000);
  };

  return (
    <div className="space-y-4">
      {/* Tab bar */}
      <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-1" role="tablist">
        {[
          { key: 'sales', label: 'Process Return', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/></svg> },
          { key: 'returns', label: 'Returns History', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg> },
        ].map(({ key, label, icon }) => (
          <button
            key={key}
            type="button"
            onClick={() => setView(key)}
            className={`flex shrink-0 items-center justify-center gap-2 rounded-lg px-3.5 py-1.5 text-sm font-medium transition-all duration-150 ${
              view === key
                ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm'
                : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'
            }`}
          >
            {icon}
            {label}
          </button>
        ))}
      </div>

      {/* Toast */}
      {toast.text && (
        <div
          className={`flex items-center gap-3 rounded-xl border px-4 py-3 text-sm font-medium ${
            toast.type === 'success'
              ? 'border-[rgba(74,168,132,0.3)] bg-[rgba(74,168,132,0.08)] text-[var(--success)]'
              : 'border-[rgba(218,106,90,0.3)] bg-[rgba(218,106,90,0.08)] text-[var(--danger)]'
          }`}
        >
          {toast.text}
        </div>
      )}

      {/* Sales list */}
      {view === 'sales' && (
        <section className="app-panel overflow-hidden rounded-2xl border">
          <div className="border-b border-[var(--border-default)] px-5 py-4">
            <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Recent Sales</h2>
            <p className="mt-0.5 text-sm text-[var(--text-muted)]">
              Click "Return" on any sale to select items and record the refund.
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)]">
                  {['Receipt', 'Date', 'Cashier', 'Total', 'Payment', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 6 }).map((_, i) => <SkeletonRow key={i} />)
                ) : sales.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center text-sm text-[var(--text-muted)]">
                      No sales found
                    </td>
                  </tr>
                ) : (
                  sales.map((sale) => (
                    <tr key={sale.id} className=" transition hover:bg-[var(--surface-secondary)]">
                      <td data-label="Receipt" className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">
                        {sale.receipt?.receiptNumber || `#${sale.id}`}
                      </td>
                      <td data-label="Date" className="whitespace-nowrap px-4 py-3">
                        <p className="text-sm text-[var(--text-secondary)]">{new Date(sale.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{getRelativeTime(sale.createdAt)}</p>
                      </td>
                      <td data-label="Cashier" className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 md:justify-start">
                          <UserAvatar name={sale.cashier?.name} />
                          <span className="text-[var(--text-primary)]">{sale.cashier?.name || '—'}</span>
                        </div>
                      </td>
                      <td data-label="Total" className="px-4 py-3 font-semibold tabular-nums text-[var(--text-primary)]">
                        {formatMoney(sale.currency || currency, sale.total)}
                      </td>
                      <td data-label="Payment" className="px-4 py-3 text-[var(--text-muted)]">{sale.paymentMethod}</td>
                      <td data-label="Action" className="px-4 py-3">
                        <button
                          type="button"
                          disabled={loadingDetail}
                          onClick={() => openReturn(sale.id)}
                          className="app-btn-secondary rounded-[0.9rem] border px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                        >
                          Return
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Returns history */}
      {view === 'returns' && (
        <section className="app-panel overflow-hidden rounded-2xl border">
          <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
            <div>
              <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Returns & Refunds</h2>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                Every processed return is recorded here with the refund amount and reason.
              </p>
            </div>
            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
              {returns.length} return{returns.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div className="overflow-x-auto">
            <table className="table-cards w-full text-sm">
              <thead>
                <tr className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)]">
                  {['Date', 'Original Sale', 'Items Returned', 'Refund', 'Reason', 'Processed By'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => <SkeletonRow key={i} />)
                ) : returns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-10 text-center">
                      <p className="text-sm font-medium text-[var(--text-primary)]">No returns recorded yet</p>
                      <p className="mt-1 text-xs text-[var(--text-muted)]">
                        Use the "Sales — Process Return" tab to initiate a return.
                      </p>
                    </td>
                  </tr>
                ) : (
                  returns.map((ret) => (
                    <tr key={ret.id} className=" transition hover:bg-[var(--surface-secondary)]">
                      <td data-label="Date" className="whitespace-nowrap px-4 py-3">
                        <p className="text-xs text-[var(--text-secondary)]">{new Date(ret.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</p>
                        <p className="text-[11px] text-[var(--text-muted)]">{getRelativeTime(ret.createdAt)}</p>
                      </td>
                      <td data-label="Sale #" className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">#{ret.saleId}</td>
                      <td data-label="Items" className="px-4 py-3 text-[var(--text-secondary)]">
                        {ret.items?.map((item) => (
                          <span key={item.productId} className="inline-block">
                            {item.product?.name} ×{item.quantity}
                          </span>
                        )).reduce((prev, curr, i) => [prev, <span key={`sep-${i}`} className="text-[var(--text-muted)]">, </span>, curr]) || '—'}
                      </td>
                      <td data-label="Refund" className="px-4 py-3 font-semibold tabular-nums text-[var(--danger)]">
                        −{formatMoney(currency, ret.totalRefund)}
                      </td>
                      <td data-label="Reason" className="px-4 py-3 text-[var(--text-muted)]">{ret.reason || '—'}</td>
                      <td data-label="By" className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2 md:justify-start">
                          <UserAvatar name={ret.processedBy?.name} />
                          <span className="text-[var(--text-secondary)]">{ret.processedBy?.name || '—'}</span>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>
      )}

      {/* Return modal */}
      {saleDetail && (
        <ReturnModal
          sale={saleDetail}
          currency={currency}
          onClose={() => { setSaleDetail(null); setSelectedSale(null); }}
          onSubmit={handleReturn}
        />
      )}
    </div>
  );
}
