import { useEffect, useMemo, useState } from 'react';
import {
  createCustomer,
  deleteCustomer,
  fetchCustomers,
  updateCustomer,
  fetchCustomerSales,
  fetchSettings,
  fetchCustomerCredit,
  recordCreditPayment,
} from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMoney as formatCurrency } from '../utils/format';
import { StatTile, statIcons } from '../components/ui';

const initialForm = {
  id: null,
  name: '',
  phone: '',
  email: '',
  address: '',
  notes: '',
  creditLimit: '',
  isActive: true,
};

const paymentMethods = ['Cash', 'Mobile Money', 'Card'];

export default function Customers() {
  const [customers, setCustomers] = useState([]);
  const [search, setSearch] = useState('');
  const [form, setForm] = useState(initialForm);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);
  const currentUser = getUser();
  const canDelete = currentUser?.role === 'Admin';
  const [currency, setCurrency] = useState('UGX');
  const [historyCustomer, setHistoryCustomer] = useState(null);
  const [historyData, setHistoryData] = useState([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [owingOnly, setOwingOnly] = useState(false);
  const [creditCustomer, setCreditCustomer] = useState(null);
  const [creditData, setCreditData] = useState(null);
  const [creditLoading, setCreditLoading] = useState(false);
  const [paymentForm, setPaymentForm] = useState({ amount: '', method: 'Cash', notes: '' });
  const [paymentMessage, setPaymentMessage] = useState('');
  const [paymentSaving, setPaymentSaving] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [savingCustomer, setSavingCustomer] = useState(false);

  useBodyScrollLock(Boolean(historyCustomer) || Boolean(deleteTarget) || Boolean(creditCustomer) || drawerOpen);

  const owing = useMemo(() => customers.filter((customer) => Number(customer.balance || 0) > 0), [customers]);
  const totalOwed = useMemo(() => owing.reduce((sum, customer) => sum + Number(customer.balance || 0), 0), [owing]);
  const repeatCustomers = useMemo(() => customers.filter((customer) => Number(customer.salesCount || 0) > 1).length, [customers]);

  useEffect(() => {
    loadCustomers();
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
  }, []);

  const filteredCustomers = useMemo(() => {
    const query = search.trim().toLowerCase();
    const base = owingOnly ? owing : customers;
    if (!query) {
      return base;
    }

    return base.filter((customer) =>
      [customer.name, customer.phone, customer.email].filter(Boolean).some((value) => value.toLowerCase().includes(query))
    );
  }, [customers, owing, owingOnly, search]);

  async function loadCustomers() {
    try {
      setLoading(true);
      const data = await fetchCustomers();
      setCustomers(data);
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  function resetForm() {
    setForm(initialForm);
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (savingCustomer) return;
    setSavingCustomer(true);
    try {
      if (form.id) {
        await updateCustomer(form.id, form);
        setMessage('Customer updated successfully.');
      } else {
        await createCustomer(form);
        setMessage('Customer added successfully.');
      }

      resetForm();
      setDrawerOpen(false);
      await loadCustomers();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setSavingCustomer(false);
    }
  }

  const openNewCustomer = () => {
    setForm(initialForm);
    setMessage('');
    setDrawerOpen(true);
  };

  const openEditCustomer = (customer) => {
    setForm({
      id: customer.id,
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      address: customer.address || '',
      notes: customer.notes || '',
      creditLimit: customer.creditLimit ?? '',
      isActive: customer.isActive !== false,
    });
    setMessage('');
    setDrawerOpen(true);
  };

  async function handleDelete(customer) {
    if (!canDelete) {
      setMessage('You do not have permission to delete customers.');
      return;
    }

    try {
      await deleteCustomer(customer.id);
      setMessage('Customer deleted successfully.');
      await loadCustomers();
    } catch (error) {
      setMessage(error.message);
    }
  }
  const openHistory = async (customer) => {
    setHistoryCustomer(customer);
    setHistoryData([]);
    setHistoryLoading(true);
    try {
      const sales = await fetchCustomerSales(customer.id);
      setHistoryData(sales);
    } catch {
      setHistoryData([]);
    } finally {
      setHistoryLoading(false);
    }
  };

  const openCredit = async (customer) => {
    setCreditCustomer(customer);
    setCreditData(null);
    setPaymentMessage('');
    setCreditLoading(true);
    try {
      const data = await fetchCustomerCredit(customer.id);
      setCreditData(data);
      setPaymentForm({ amount: data.balance > 0 ? String(data.balance) : '', method: 'Cash', notes: '' });
    } catch (error) {
      setPaymentMessage(error.message);
    } finally {
      setCreditLoading(false);
    }
  };

  const submitPayment = async (event) => {
    event.preventDefault();
    if (!creditCustomer) return;
    setPaymentSaving(true);
    setPaymentMessage('');
    try {
      const result = await recordCreditPayment(creditCustomer.id, {
        amount: Number(paymentForm.amount),
        method: paymentForm.method,
        notes: paymentForm.notes || undefined,
      });
      setPaymentMessage(
        result.balance > 0
          ? `Payment of ${formatMoney(result.amount)} recorded. Still owes ${formatMoney(result.balance)}.`
          : `Payment of ${formatMoney(result.amount)} recorded. Account fully paid.`
      );
      const data = await fetchCustomerCredit(creditCustomer.id);
      setCreditData(data);
      setPaymentForm({ amount: data.balance > 0 ? String(data.balance) : '', method: paymentForm.method, notes: '' });
      loadCustomers();
    } catch (error) {
      setPaymentMessage(error.message);
    } finally {
      setPaymentSaving(false);
    }
  };

  const formatMoney = (value) => formatCurrency(currency, value);
  const field = 'app-input mt-1.5 w-full rounded-lg border px-3 py-2.5 text-sm';
  const label = 'block text-sm font-medium text-[var(--text-secondary)]';
  const isSuccess = /success/i.test(message);

  return (
    <div className="space-y-5">
      <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile label="Customers" value={customers.length.toLocaleString()} hint="Saved profiles" onClick={() => setOwingOnly(false)} active={!owingOnly} icon={statIcons.users} />
        <StatTile label="Owed to you" value={formatMoney(totalOwed)} hint={`${owing.length} customer${owing.length === 1 ? '' : 's'} on credit`} tone={totalOwed > 0 ? 'warning' : 'default'} iconTone="warning" onClick={() => setOwingOnly(true)} active={owingOnly} icon={statIcons.credit} />
        <StatTile label="Repeat buyers" value={repeatCustomers.toLocaleString()} hint="More than one purchase" iconTone="violet" icon={statIcons.repeat} />
        <StatTile label="Active" value={customers.filter((c) => c.isActive !== false).length.toLocaleString()} hint="Available at checkout" iconTone="success" icon={statIcons.check} />
      </section>

      {message && !drawerOpen ? (
        <div className={`rounded-lg px-4 py-2.5 text-sm ${isSuccess ? 'app-alert-success' : 'app-alert-danger'}`} role="status">{message}</div>
      ) : null}

      <section className="app-panel rounded-2xl border">
        <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 flex-1 flex-col gap-2 sm:flex-row sm:items-center">
            <div className="relative min-w-0 flex-1 sm:max-w-sm">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--text-muted)]"><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search name, phone or email"
                aria-label="Search customers"
                className="app-input w-full rounded-lg border py-2 pl-9 pr-3 text-sm"
              />
            </div>
            <div className="inline-flex rounded-lg border border-[var(--border-default)] bg-[var(--surface-secondary)] p-0.5 text-sm" role="tablist" aria-label="Customer filter">
              {[
                { key: false, label: 'All' },
                { key: true, label: `Owing · ${owing.length}` },
              ].map((tab) => (
                <button
                  key={String(tab.key)}
                  type="button"
                  role="tab"
                  aria-selected={owingOnly === tab.key}
                  onClick={() => setOwingOnly(tab.key)}
                  className={`rounded-md px-3 py-1 font-medium ${owingOnly === tab.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)]'}`}
                >
                  {tab.label}
                </button>
              ))}
            </div>
          </div>
          <button type="button" onClick={openNewCustomer} className="app-btn-primary inline-flex items-center justify-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
            Add customer
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="table-cards min-w-full text-left text-sm">
            <thead className="app-table-head">
              <tr>
                <th className="px-4 py-2.5 font-medium">Customer</th>
                <th className="px-4 py-2.5 font-medium">Contact</th>
                <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                <th className="px-4 py-2.5 text-right font-medium">Balance</th>
                <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {loading ? (
                <tr><td colSpan="5" className="px-4 py-8 text-center text-[var(--text-muted)]">Loading customers…</td></tr>
              ) : filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan="5" className="px-4 py-14 text-center">
                    <p className="text-sm font-medium text-[var(--text-primary)]">{owingOnly ? 'Nobody owes you money' : 'No customers found'}</p>
                    <p className="mt-1 text-sm text-[var(--text-muted)]">{owingOnly ? 'Credit sales will appear here.' : 'Try another search, or add a customer.'}</p>
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((customer) => {
                  const balance = Number(customer.balance || 0);
                  return (
                    <tr key={customer.id} className="app-row-hover">
                      <td data-label="Customer" className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="hidden h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)] md:flex">
                            {String(customer.name || 'C').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">
                              {customer.name}
                              {customer.isActive === false ? <span className="ml-2 rounded-full bg-[var(--surface-secondary)] px-1.5 py-0.5 text-[11px] font-normal text-[var(--text-muted)]">Inactive</span> : null}
                            </p>
                            <p className="text-xs text-[var(--text-muted)]">Since {new Date(customer.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Contact" className="px-4 py-2.5">
                        <p className="text-[var(--text-secondary)]">{customer.phone || '—'}</p>
                        {customer.email ? <p className="text-xs text-[var(--text-muted)]">{customer.email}</p> : null}
                      </td>
                      <td data-label="Sales" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(customer.salesCount || 0).toLocaleString()}</td>
                      <td data-label="Balance" className="num px-4 py-2.5 text-right">
                        {balance > 0 ? <span className="font-semibold text-amber-600 dark:text-amber-300">{formatMoney(balance)}</span> : <span className="text-[var(--text-muted)]">—</span>}
                      </td>
                      <td data-label="Actions" className="px-4 py-2.5">
                        <div className="flex items-center justify-end gap-1">
                          {balance > 0 ? (
                            <button type="button" onClick={() => openCredit(customer)} className="app-btn-primary mr-1 rounded-lg px-2.5 py-1.5 text-xs">Receive payment</button>
                          ) : null}
                          <button type="button" onClick={() => openCredit(customer)} title="Credit account" aria-label={`Credit account for ${customer.name}`} className={`h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] ${balance > 0 ? 'hidden' : 'flex'}`}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /></svg>
                          </button>
                          <button type="button" onClick={() => openHistory(customer)} title="Purchase history" aria-label={`Purchase history for ${customer.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>
                          </button>
                          <button type="button" onClick={() => openEditCustomer(customer)} title="Edit" aria-label={`Edit ${customer.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]">
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 1 1 3 3L7 19l-4 1 1-4Z" /></svg>
                          </button>
                          {canDelete ? (
                            <button type="button" onClick={() => setDeleteTarget(customer)} title="Delete" aria-label={`Delete ${customer.name}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--danger-soft)] hover:text-[var(--danger)]">
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 6h18" /><path d="M8 6V4h8v2" /><path d="M19 6l-1 14H6L5 6" /></svg>
                            </button>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </section>

      {drawerOpen ? (
        <div className="app-overlay fixed inset-0 z-50 flex justify-end" onClick={(e) => { if (e.target === e.currentTarget) setDrawerOpen(false); }}>
          <form onSubmit={handleSubmit} className="app-modal flex h-full w-full max-w-md flex-col border-l" role="dialog" aria-modal="true" aria-labelledby="customer-drawer-title">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
              <h2 id="customer-drawer-title" className="text-base font-semibold text-[var(--text-primary)]">{form.id ? 'Edit customer' : 'New customer'}</h2>
              <button type="button" onClick={() => setDrawerOpen(false)} className="rounded-lg p-1.5 text-[var(--text-muted)] hover:bg-[var(--surface-secondary)]" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6 6 18" /></svg>
              </button>
            </div>
            <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
              <label className={label}>
                Name
                <input autoFocus required value={form.name} onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))} placeholder="Full name" className={field} />
              </label>
              <div className="grid grid-cols-2 gap-3">
                <label className={label}>
                  Phone
                  <input type="tel" value={form.phone} onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))} placeholder="07…" className={field} />
                </label>
                <label className={label}>
                  Email
                  <input type="email" value={form.email} onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))} placeholder="Optional" className={field} />
                </label>
              </div>
              <label className={label}>
                Address
                <input value={form.address} onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))} placeholder="Optional" className={field} />
              </label>
              {canDelete ? (
                <label className={label}>
                  Credit limit ({currency})
                  <input type="number" min="0" step="any" inputMode="decimal" value={form.creditLimit} onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))} placeholder="No limit" className={field} />
                  <span className="mt-1 block text-xs font-normal text-[var(--text-muted)]">The most this customer can owe when buying on credit.</span>
                </label>
              ) : null}
              <label className={label}>
                Notes
                <textarea rows="3" value={form.notes} onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))} placeholder="Preferences, delivery details…" className={field} />
              </label>
              <label className="flex items-center gap-2.5 text-sm text-[var(--text-secondary)]">
                <input type="checkbox" checked={form.isActive} onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))} />
                Show at checkout (active)
              </label>
              {message && !isSuccess ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{message}</p> : null}
            </div>
            <div className="flex gap-2 border-t border-[var(--border-default)] px-5 py-4">
              <button type="button" onClick={() => setDrawerOpen(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={savingCustomer} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{savingCustomer ? 'Saving…' : form.id ? 'Save changes' : 'Add customer'}</button>
            </div>
          </form>
        </div>
      ) : null}

      {/* Purchase History Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setHistoryCustomer(null); }}>
          <div className="app-panel w-full max-w-2xl rounded-2xl border p-6">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4">
              <div>
                <h3 className="text-lg font-semibold text-[var(--text-primary)]">{historyCustomer.name} · Purchase History</h3>
                <p className="mt-1 text-sm text-[var(--text-muted)]">{historyData.length} transaction{historyData.length !== 1 ? 's' : ''} found</p>
              </div>
              <button type="button" onClick={() => setHistoryCustomer(null)} className="app-btn-subtle rounded-full p-2">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>
            <div className="mt-4 max-h-96 overflow-y-auto space-y-3">
              {historyLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-16 animate-pulse rounded-xl bg-[var(--surface-secondary)]" />)
              ) : historyData.length === 0 ? (
                <div className="py-8 text-center text-sm text-[var(--text-muted)]">No sales found for this customer.</div>
              ) : historyData.map((sale) => (
                <div key={sale.id} className="app-panel-soft rounded-2xl border p-4">
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-semibold text-[var(--text-primary)]">{formatMoney(sale.total)}</span>
                    <span className="text-xs text-[var(--text-muted)]">{new Date(sale.createdAt).toLocaleDateString()}</span>
                  </div>
                  <div className="mt-2 flex gap-3 text-xs text-[var(--text-muted)]">
                    <span>#{sale.id}</span>
                    <span>{sale.paymentMethod}</span>
                    {sale.cashier && <span>by {sale.cashier.name}</span>}
                  </div>
                  {sale.items && sale.items.length > 0 && (
                    <div className="mt-2 space-y-1">
                      {sale.items.map((item) => (
                        <div key={item.productId} className="flex justify-between text-xs text-[var(--text-secondary)]">
                          <span>{item.Product?.name || `Product #${item.productId}`}</span>
                          <span>x{item.quantity}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {creditCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setCreditCustomer(null); }}>
          <div className="app-panel flex max-h-[92vh] w-full max-w-2xl flex-col rounded-2xl border p-6" role="dialog" aria-modal="true" aria-labelledby="credit-title">
            <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] pb-4">
              <div>
                <h3 id="credit-title" className="text-lg font-semibold text-[var(--text-primary)]">{creditCustomer.name} · Credit account</h3>
                {creditData ? (
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    Owes <strong className={creditData.balance > 0 ? 'text-amber-600' : 'text-[var(--text-primary)]'}>{formatMoney(creditData.balance)}</strong>
                    {creditData.creditLimit != null ? ` · limit ${formatMoney(creditData.creditLimit)} · ${formatMoney(creditData.availableCredit)} available` : ' · no credit limit'}
                  </p>
                ) : null}
              </div>
              <button type="button" onClick={() => setCreditCustomer(null)} className="app-btn-subtle rounded-full p-2" aria-label="Close">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M6 6l12 12M18 6L6 18" /></svg>
              </button>
            </div>

            <div className="mt-4 flex-1 space-y-5 overflow-y-auto">
              {creditLoading ? (
                Array.from({ length: 3 }).map((_, i) => <div key={i} className="h-14 animate-pulse rounded-xl bg-[var(--surface-secondary)]" />)
              ) : creditData ? (
                <>
                  {creditData.balance > 0 ? (
                    <form onSubmit={submitPayment} className="app-panel-soft space-y-3 rounded-xl border p-4">
                      <p className="text-sm font-semibold text-[var(--text-primary)]">Receive a payment</p>
                      <div className="grid gap-3 sm:grid-cols-[1fr_auto]">
                        <input
                          type="number"
                          min="0.01"
                          step="0.01"
                          max={creditData.balance}
                          inputMode="decimal"
                          required
                          value={paymentForm.amount}
                          onChange={(e) => setPaymentForm((prev) => ({ ...prev, amount: e.target.value }))}
                          className="app-input w-full rounded-lg border px-4 py-3"
                          aria-label="Amount received"
                        />
                        <select
                          value={paymentForm.method}
                          onChange={(e) => setPaymentForm((prev) => ({ ...prev, method: e.target.value }))}
                          className="app-btn-secondary rounded-lg border px-4 py-3"
                          aria-label="Payment method"
                        >
                          {paymentMethods.map((m) => <option key={m} value={m}>{m}</option>)}
                        </select>
                      </div>
                      <input
                        value={paymentForm.notes}
                        onChange={(e) => setPaymentForm((prev) => ({ ...prev, notes: e.target.value }))}
                        placeholder="Note (optional), e.g. MoMo transaction ID"
                        className="app-input w-full rounded-lg border px-4 py-3 text-sm"
                      />
                      <p className="text-xs text-[var(--text-muted)]">Payments clear the oldest unpaid sales first.</p>
                      <button type="submit" disabled={paymentSaving} className="app-btn-primary w-full rounded-lg px-4 py-3 text-sm font-medium disabled:opacity-60">
                        {paymentSaving ? 'Saving…' : 'Record payment'}
                      </button>
                    </form>
                  ) : (
                    <div className="app-alert-success rounded-xl px-4 py-3 text-sm">This customer has no unpaid credit.</div>
                  )}

                  {paymentMessage ? (
                    <div className={`rounded-xl px-4 py-3 text-sm ${paymentMessage.startsWith('Payment of') ? 'app-alert-success' : 'app-alert-danger'}`}>{paymentMessage}</div>
                  ) : null}

                  {creditData.openSales.length > 0 ? (
                    <div>
                      <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Unpaid sales</p>
                      <div className="space-y-2">
                        {creditData.openSales.map((sale) => {
                          const overdue = sale.dueDate && new Date(`${sale.dueDate}T23:59:59`) < new Date();
                          return (
                            <div key={sale.id} className="app-panel-soft flex items-center justify-between gap-3 rounded-xl border px-4 py-3 text-sm">
                              <div className="min-w-0">
                                <p className="font-medium text-[var(--text-primary)]">{sale.receipt?.receiptNumber || `#${sale.id}`} · {new Date(sale.createdAt).toLocaleDateString()}</p>
                                <p className={`text-xs ${overdue ? 'font-semibold text-red-500' : 'text-[var(--text-muted)]'}`}>
                                  Total {formatMoney(sale.total)}{sale.dueDate ? ` · due ${sale.dueDate}${overdue ? ' (overdue)' : ''}` : ''}
                                </p>
                              </div>
                              <span className="shrink-0 font-semibold text-amber-600">{formatMoney(sale.balanceDue)}</span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ) : null}

                  <div>
                    <p className="mb-2 text-xs font-medium text-[var(--text-muted)]">Payments received</p>
                    {creditData.payments.length === 0 ? (
                      <p className="text-sm text-[var(--text-muted)]">No payments recorded yet.</p>
                    ) : (
                      <div className="space-y-2">
                        {creditData.payments.map((payment) => (
                          <div key={payment.id} className="flex items-center justify-between gap-3 border-b border-[var(--border-default)] pb-2 text-sm last:border-0">
                            <div className="min-w-0">
                              <p className="text-[var(--text-primary)]">{new Date(payment.createdAt).toLocaleString()} · {payment.method}</p>
                              <p className="text-xs text-[var(--text-muted)]">
                                Sale #{payment.saleId}{payment.receivedBy ? ` · by ${payment.receivedBy.name}` : ''}{payment.notes ? ` · ${payment.notes}` : ''}
                              </p>
                            </div>
                            <span className="shrink-0 font-semibold text-[var(--success)]">+{formatMoney(payment.amount)}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </>
              ) : (
                <div className="app-alert-danger rounded-xl px-4 py-3 text-sm">{paymentMessage || 'Could not load this account.'}</div>
              )}
            </div>
          </div>
        </div>
      )}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete customer?"
          message={
            <>
              Delete <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.name}</strong> permanently? This cannot be undone.
            </>
          }
          confirmLabel="Delete"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            handleDelete(target);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}
    </div>
  );
}
