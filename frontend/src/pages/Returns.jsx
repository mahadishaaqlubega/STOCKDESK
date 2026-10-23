import { useEffect, useState } from 'react';
import { fetchSales, fetchSale, createReturn, fetchReturns, fetchSettings } from '../utils/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { formatMoney, formatAmount } from '../utils/format';
import { Badge, EmptyState, Modal, Panel, SearchInput, SkeletonRows, Tabs, Toast } from '../components/ui';

const PAGE_SIZE = 50;

const receiptNo = (sale) => sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`;

function relativeTime(dateStr) {
  const mins = Math.floor((Date.now() - new Date(dateStr).getTime()) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(dateStr).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function ReturnModal({ sale, currency, onClose, onSubmit }) {
  const [quantities, setQuantities] = useState({});
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const items = sale?.items || [];
  const selected = items
    .map((item) => ({ ...item, returnQty: Number(quantities[item.productId] || 0) }))
    .filter((item) => item.returnQty > 0);
  const refundTotal = selected.reduce((sum, item) => sum + Number(item.price) * item.returnQty, 0);
  const owed = Number(sale.balanceDue || 0);
  const debtReduction = Math.min(owed, refundTotal);
  const cashBack = refundTotal - debtReduction;

  const setQty = (productId, value, max) => {
    const next = Math.max(0, Math.min(max, Number(value) || 0));
    setQuantities((prev) => ({ ...prev, [productId]: next }));
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!selected.length) {
      setError('Choose at least one item to return.');
      return;
    }
    setError('');
    setSubmitting(true);
    try {
      await onSubmit({ items: selected.map((item) => ({ productId: item.productId, quantity: item.returnQty })), reason: reason || undefined });
    } catch (err) {
      setError(err.message || 'Could not process the return.');
      setSubmitting(false);
    }
  };

  return (
    <Modal
      title={`Return items · ${receiptNo(sale)}`}
      subtitle={`${new Date(sale.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}${sale.customer?.name && sale.customer.name !== 'Walk-in Customer' ? ` · ${sale.customer.name}` : ''}`}
      onClose={onClose}
      footer={(
        <>
          <button type="button" onClick={onClose} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
          <button type="submit" form="return-form" disabled={submitting || !selected.length} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">
            {submitting ? 'Processing…' : selected.length ? `Refund ${formatMoney(currency, refundTotal)}` : 'Choose items'}
          </button>
        </>
      )}
    >
      <form id="return-form" onSubmit={handleSubmit} className="space-y-4">
        <ul className="divide-y divide-[var(--border-default)] rounded-lg border border-[var(--border-default)]">
          {items.map((item) => {
            const max = Number(item.quantity);
            const qty = Number(quantities[item.productId] || 0);
            return (
              <li key={item.productId} className="flex items-center gap-3 px-3.5 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium text-[var(--text-primary)]">{item.Product?.name || item.name || 'Item'}</p>
                  <p className="num text-xs text-[var(--text-muted)]">Bought {max} × {formatMoney(currency, item.price)}</p>
                </div>
                <div className="flex items-center rounded-lg border border-[var(--border-strong)]">
                  <button type="button" onClick={() => setQty(item.productId, qty - 1, max)} className="flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]" aria-label="One less">−</button>
                  <span className="num w-8 text-center text-sm font-medium">{qty}</span>
                  <button type="button" onClick={() => setQty(item.productId, qty + 1, max)} className="flex h-8 w-8 items-center justify-center text-[var(--text-secondary)] hover:bg-[var(--surface-secondary)]" aria-label="One more">+</button>
                </div>
                <button type="button" onClick={() => setQty(item.productId, max, max)} className="text-xs font-medium text-[var(--accent)] hover:underline">All</button>
              </li>
            );
          })}
        </ul>

        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          Reason <span className="font-normal text-[var(--text-muted)]">(optional)</span>
          <input type="text" value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Faulty, wrong item, changed mind…" className="app-input mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm" />
        </label>

        {refundTotal > 0 ? (
          <div className="space-y-1 rounded-lg bg-[var(--panel-soft-bg)] px-3.5 py-3 text-sm">
            <div className="flex justify-between"><span className="text-[var(--text-muted)]">Refund value</span><span className="num font-medium">{formatMoney(currency, refundTotal)}</span></div>
            {debtReduction > 0 ? (
              <div className="flex justify-between"><span className="text-[var(--text-muted)]">Taken off what they owe</span><span className="num">−{formatMoney(currency, debtReduction)}</span></div>
            ) : null}
            <div className="flex justify-between border-t border-[var(--border-default)] pt-1.5 font-medium"><span>Cash to hand back</span><span className="num">{formatMoney(currency, cashBack)}</span></div>
            <p className="pt-1 text-xs text-[var(--text-muted)]">Returned goods go back into stock automatically.</p>
          </div>
        ) : null}

        {error ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{error}</p> : null}
      </form>
    </Modal>
  );
}

export default function Returns() {
  const [view, setView] = useState('sales');
  const [sales, setSales] = useState([]);
  const [returns, setReturns] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [saleDetail, setSaleDetail] = useState(null);
  const [toast, setToast] = useState('');

  useBodyScrollLock(Boolean(saleDetail));

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 4500);
  };

  useEffect(() => {
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
  }, []);

  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);

  // Sales are searched and paged on the server, so this stays fast for shops
  // with tens of thousands of sales.
  const loadSales = async (q, offset = 0) => {
    const page = await fetchSales({ q, limit: PAGE_SIZE, offset });
    setHasMore(page.length === PAGE_SIZE);
    setSales((prev) => (offset ? [...prev, ...page] : page));
  };

  const load = async (which = view) => {
    try {
      setLoading(true);
      if (which === 'sales') await loadSales(search.trim());
      else setReturns(await fetchReturns());
    } catch (err) {
      flash(err.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (view !== 'sales') {
      load(view);
      return undefined;
    }
    const handle = setTimeout(() => load('sales'), search ? 300 : 0);
    return () => clearTimeout(handle);
  }, [view, search]);

  const loadMore = async () => {
    setLoadingMore(true);
    try {
      await loadSales(search.trim(), sales.length);
    } catch (err) {
      flash(err.message);
    } finally {
      setLoadingMore(false);
    }
  };

  const filteredSales = sales;

  const openReturn = async (saleId) => {
    try {
      setSaleDetail(await fetchSale(saleId));
    } catch (err) {
      flash(err.message || 'Could not load that sale.');
    }
  };

  const handleReturn = async (payload) => {
    const result = await createReturn(saleDetail.id, payload);
    setSaleDetail(null);
    const parts = [`Return recorded · ${formatMoney(currency, result.totalRefund)}`];
    if (result.creditReduction > 0) parts.push(`${formatMoney(currency, result.creditReduction)} off the customer's balance`);
    parts.push(`hand back ${formatMoney(currency, result.cashRefund ?? result.totalRefund)}`);
    flash(parts.join(' · '));
    load(view);
  };

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Tabs
          label="Returns"
          value={view}
          onChange={setView}
          tabs={[
            { key: 'sales', label: 'New return' },
            { key: 'returns', label: 'Return history' },
          ]}
        />
        {view === 'sales' ? <SearchInput value={search} onChange={setSearch} placeholder="Receipt no., customer or cashier" className="sm:w-80" /> : null}
      </div>

      <Panel>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : view === 'sales' ? (
          filteredSales.length === 0 ? (
            <EmptyState title={search ? 'No sale matches that search' : 'No sales yet'} message="Search by receipt number (e.g. SD-000477 or 477), customer name or cashier." />
          ) : (
            <>
              <div className="overflow-x-auto">
                <table className="table-cards min-w-full text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">Receipt</th>
                      <th className="px-4 py-2.5 font-medium">When</th>
                      <th className="px-4 py-2.5 font-medium">Customer</th>
                      <th className="px-4 py-2.5 font-medium">Cashier</th>
                      <th className="px-4 py-2.5 font-medium">Payment</th>
                      <th className="px-4 py-2.5 text-right font-medium">Total ({currency})</th>
                      <th className="px-4 py-2.5"><span className="sr-only">Action</span></th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {filteredSales.map((sale) => (
                      <tr key={sale.id} className="app-row-hover">
                        <td data-label="Receipt" className="px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]">{receiptNo(sale)}</td>
                        <td data-label="When" className="px-4 py-2.5 text-[var(--text-muted)]">{relativeTime(sale.createdAt)}</td>
                        <td data-label="Customer" className="px-4 py-2.5 text-[var(--text-primary)]">{sale.customer?.name && sale.customer.name !== 'Walk-in Customer' ? sale.customer.name : <span className="text-[var(--text-muted)]">Walk-in</span>}</td>
                        <td data-label="Cashier" className="px-4 py-2.5 text-[var(--text-secondary)]">{sale.cashier?.name || '-'}</td>
                        <td data-label="Payment" className="px-4 py-2.5">
                          {sale.paymentMethod === 'Credit' ? <Badge tone={Number(sale.balanceDue) > 0 ? 'warning' : 'success'}>{Number(sale.balanceDue) > 0 ? 'Credit · owing' : 'Credit · paid'}</Badge> : <span className="text-[var(--text-secondary)]">{sale.paymentMethod}</span>}
                        </td>
                        <td data-label="Total" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, sale.total)}</td>
                        <td data-label="Action" className="px-4 py-2.5 text-right">
                          <button type="button" onClick={() => openReturn(sale.id)} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-xs font-medium">Return items</button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {hasMore ? (
                <div className="border-t border-[var(--border-default)] p-3 text-center">
                  <button type="button" onClick={loadMore} disabled={loadingMore} className="app-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium disabled:opacity-60">
                    {loadingMore ? 'Loading…' : 'Show older sales'}
                  </button>
                </div>
              ) : null}
            </>
          )
        ) : returns.length === 0 ? (
          <EmptyState title="No returns yet" message="Returned items and refunds will be listed here." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-2.5 font-medium">When</th>
                  <th className="px-4 py-2.5 font-medium">Original sale</th>
                  <th className="px-4 py-2.5 font-medium">Items returned</th>
                  <th className="px-4 py-2.5 font-medium">Reason</th>
                  <th className="px-4 py-2.5 font-medium">By</th>
                  <th className="px-4 py-2.5 text-right font-medium">Refund ({currency})</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {returns.map((ret) => (
                  <tr key={ret.id} className="app-row-hover">
                    <td data-label="When" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">{relativeTime(ret.createdAt)}</td>
                    <td data-label="Original sale" className="px-4 py-2.5 font-mono text-xs text-[var(--text-secondary)]">SD-{String(ret.saleId).padStart(6, '0')}</td>
                    <td data-label="Items returned" className="px-4 py-2.5 text-[var(--text-primary)]">
                      {(ret.items || []).map((item) => `${item.quantity} × ${item.product?.name || 'Item'}`).join(', ') || '-'}
                    </td>
                    <td data-label="Reason" className="px-4 py-2.5 text-[var(--text-secondary)]">{ret.reason || <span className="text-[var(--text-muted)]">-</span>}</td>
                    <td data-label="By" className="px-4 py-2.5 text-[var(--text-secondary)]">{ret.processedBy?.name || '-'}</td>
                    <td data-label="Refund" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, ret.totalRefund)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {saleDetail ? <ReturnModal sale={saleDetail} currency={currency} onClose={() => setSaleDetail(null)} onSubmit={handleReturn} /> : null}
      <Toast text={toast} />
    </div>
  );
}
