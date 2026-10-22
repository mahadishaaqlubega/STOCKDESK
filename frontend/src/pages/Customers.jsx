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

function StatCard({ label, value, helper, eyebrow = 'Customers', icon, tone = 'default' }) {
  const toneClasses = {
    default: { border: 'border-l-[var(--accent)]', iconBg: 'bg-[linear-gradient(135deg,rgba(30,167,189,0.18),rgba(30,167,189,0.08))] text-[var(--accent)] ring-1 ring-[rgba(30,167,189,0.12)]' },
    success: { border: 'border-l-[var(--success)]', iconBg: 'bg-[linear-gradient(135deg,rgba(74,168,132,0.18),rgba(74,168,132,0.08))] text-[var(--success)] ring-1 ring-[rgba(74,168,132,0.12)]' },
    warning: { border: 'border-l-[var(--warning)]', iconBg: 'bg-[linear-gradient(135deg,rgba(216,155,73,0.18),rgba(216,155,73,0.08))] text-[var(--warning)] ring-1 ring-[rgba(216,155,73,0.12)]' },
  };
  const t = toneClasses[tone] || toneClasses.default;
  return (
    <div className={`app-panel relative overflow-hidden rounded-[1.2rem] border border-l-[3px] ${t.border} p-4 transition duration-200 hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow}</p>
          <p className="mt-1.5 text-[13px] font-medium text-[var(--text-secondary)]">{label}</p>
          <p className="mt-2 text-[1.55rem] font-bold tracking-tight leading-none text-[var(--text-primary)]">{value}</p>
          <p className="mt-2 text-[12px] leading-4 text-[var(--text-muted)]">{helper}</p>
        </div>
        {icon && <div className={`flex h-10 w-10 items-center justify-center rounded-[1.05rem] shadow-sm ${t.iconBg}`}>{icon}</div>}
      </div>
    </div>
  );
}

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

  useBodyScrollLock(Boolean(historyCustomer) || Boolean(deleteTarget) || Boolean(creditCustomer));

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
    try {
      if (form.id) {
        await updateCustomer(form.id, form);
        setMessage('Customer updated successfully.');
      } else {
        await createCustomer(form);
        setMessage('Customer added successfully.');
      }

      resetForm();
      await loadCustomers();
    } catch (error) {
      setMessage(error.message);
    }
  }

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

  const formatMoney = (value) => `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  return (
    <div className="space-y-6">
      <section className="app-panel relative overflow-hidden rounded-[1.7rem] border p-5 sm:p-6">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(30,167,189,0.14),transparent_58%)] lg:block" />
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div className="relative">
            <p className="max-w-2xl text-sm text-[var(--text-muted)]">
              Keep named customer details organized so repeat visits, delivery follow-up, and account history are easier to manage.
            </p>
            <div className="mt-4 inline-flex max-w-2xl items-start gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-secondary)]">
              <span className="mt-0.5 inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--accent-soft)] text-[var(--accent-strong)]">i</span>
              <span>
                <span className="font-medium text-[var(--text-primary)]">Walk-in Customer already exists by default.</span> Save named customers here when you want to keep phone, email, address, notes, and purchase history for frequent buyers.
              </span>
            </div>
          </div>
          <div className="grid gap-3 grid-cols-2 md:grid-cols-3 lg:min-w-[460px]">
            <StatCard label="Total Customers" value={customers.length.toLocaleString()} helper="Profiles saved in your shop." eyebrow="Directory" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>} />
            <StatCard label="Owed to you" value={formatMoney(totalOwed)} helper={`${owing.length} customer${owing.length === 1 ? '' : 's'} with unpaid credit.`} eyebrow="Credit" tone="warning" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="2" y="5" width="20" height="14" rx="2"/><path d="M2 10h20"/></svg>} />
            <StatCard label="Repeat Buyers" value={repeatCustomers.toLocaleString()} helper="Customers with more than one sale." eyebrow="Loyalty" tone="warning" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 16l5-5 4 4 7-8"/><path d="M14 7h6v6"/></svg>} />
          </div>
        </div>
      </section>

      <div className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
        <section className="app-panel rounded-[1.5rem] border p-5 sm:p-6">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">Customer Directory</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Search, review, and manage saved customer profiles for repeat buyers.</p>
            </div>
            <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:items-center">
              <div className="app-panel-soft inline-grid grid-cols-2 rounded-xl border p-1 text-sm" role="tablist" aria-label="Customer filter">
                <button type="button" role="tab" aria-selected={!owingOnly} onClick={() => setOwingOnly(false)} className={`rounded-lg px-3 py-1.5 ${!owingOnly ? 'app-btn-primary text-white' : 'app-btn-subtle'}`}>
                  All
                </button>
                <button type="button" role="tab" aria-selected={owingOnly} onClick={() => setOwingOnly(true)} className={`rounded-lg px-3 py-1.5 ${owingOnly ? 'app-btn-primary text-white' : 'app-btn-subtle'}`}>
                  Owing ({owing.length})
                </button>
              </div>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Search customers"
                className="app-input w-full max-w-xs rounded-lg border px-4 py-3 text-sm"
              />
            </div>
          </div>

          <div className="mt-6 overflow-x-auto rounded-[1.35rem] border border-[var(--border-default)]">
            <table className="table-cards min-w-full divide-y divide-[var(--border-default)] text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <th className="px-4 py-3 font-medium">Customer</th>
                  <th className="px-4 py-3 font-medium">Contact</th>
                  <th className="px-4 py-3 font-medium">Sales</th>
                  <th className="px-4 py-3 font-medium">Balance</th>
                  <th className="px-4 py-3 font-medium">Status</th>
                  <th className="px-4 py-3 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {loading ? (
                  <tr>
                    <td className="px-4 py-6 text-[var(--text-muted)]" colSpan="6">Loading customers...</td>
                  </tr>
                ) : filteredCustomers.length === 0 ? (
                  <tr>
                    <td className="px-4 py-8" colSpan="6">
                      <div className="app-panel-soft rounded-lg border border-dashed px-4 py-8 text-center">
                        <p className="text-sm font-medium text-[var(--text-primary)]">No customers found</p>
                        <p className="mt-2 text-sm text-[var(--text-muted)]">Try a different search or create a new customer profile.</p>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredCustomers.map((customer) => (
                    <tr key={customer.id} className="app-row-hover transition">
                      <td data-label="Customer" className="px-4 py-4">
                        <div className="flex items-center gap-3">
                          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--accent-strong)]">
                            {String(customer.name || 'C').slice(0, 1).toUpperCase()}
                          </span>
                          <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-primary)]">{customer.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">Added {new Date(customer.createdAt).toLocaleDateString()}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Contact" className="px-4 py-4">
                        <p className="text-[var(--text-secondary)]">{customer.phone || '-'}</p>
                        <p className="text-xs text-[var(--text-muted)]">{customer.email || 'No email'}</p>
                      </td>
                      <td data-label="Sales" className="px-4 py-4 font-medium text-[var(--text-primary)]">{Number(customer.salesCount || 0)}</td>
                      <td data-label="Balance" className="px-4 py-4">
                        {Number(customer.balance || 0) > 0 ? (
                          <span className="font-semibold text-amber-600">{formatMoney(customer.balance)}</span>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td data-label="Status" className="px-4 py-4">
                        <span className={`inline-flex rounded-full px-3 py-1 text-xs font-semibold ${customer.isActive ? 'app-alert-success' : 'app-alert-info'}`}>
                          {customer.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td data-label="Actions" className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2 md:justify-start">
                          <button
                            type="button"
                            onClick={() => setForm({
                              id: customer.id,
                              name: customer.name || '',
                              phone: customer.phone || '',
                              email: customer.email || '',
                              address: customer.address || '',
                              notes: customer.notes || '',
                              creditLimit: customer.creditLimit ?? '',
                              isActive: customer.isActive !== false,
                            })}
                            className="app-btn-secondary rounded-lg border px-3 py-2 text-xs font-medium transition"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => openHistory(customer)}
                            className="app-btn-secondary rounded-lg border px-3 py-2 text-xs font-medium transition"
                          >
                            History
                          </button>
                          <button
                            type="button"
                            onClick={() => openCredit(customer)}
                            className={`rounded-lg border px-3 py-2 text-xs font-medium transition ${Number(customer.balance || 0) > 0 ? 'app-btn-primary text-white' : 'app-btn-secondary'}`}
                          >
                            {Number(customer.balance || 0) > 0 ? 'Receive payment' : 'Credit'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(customer)}
                            className="app-btn-danger rounded-lg px-3 py-2 text-xs font-medium transition disabled:opacity-50"
                            disabled={!canDelete}
                          >
                            Delete
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="app-panel rounded-[1.5rem] border p-5 sm:p-6">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-lg font-semibold text-[var(--text-primary)]">{form.id ? 'Edit Customer Profile' : 'Add Frequent Customer'}</h3>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Only the customer name is required. Add more details when you want better service and follow-up.</p>
            </div>
            {form.id ? (
              <button
                type="button"
                onClick={resetForm}
                className="app-btn-secondary rounded-lg border px-4 py-2 text-xs font-medium transition"
              >
                New Customer
              </button>
            ) : null}
          </div>

          <div className="app-panel-soft mt-5 rounded-2xl border px-4 py-4 text-sm text-[var(--text-secondary)]">
            Use this form for named repeat customers. The default walk-in profile remains available automatically for quick counter sales.
          </div>

          <form className="mt-5 space-y-4" onSubmit={handleSubmit}>
            <div className="grid gap-4 md:grid-cols-2">
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Customer name
                <input
                  value={form.name}
                  onChange={(event) => setForm((prev) => ({ ...prev, name: event.target.value }))}
                  placeholder="Enter full customer name"
                  className="app-input w-full rounded-lg border px-4 py-3"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)]">
                Phone number
                <input
                  value={form.phone}
                  onChange={(event) => setForm((prev) => ({ ...prev, phone: event.target.value }))}
                  placeholder="Add phone number"
                  className="app-input w-full rounded-lg border px-4 py-3"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)] md:col-span-2">
                Email address
                <input
                  value={form.email}
                  onChange={(event) => setForm((prev) => ({ ...prev, email: event.target.value }))}
                  placeholder="Add email address"
                  className="app-input w-full rounded-lg border px-4 py-3"
                />
              </label>
              <label className="space-y-2 text-sm text-[var(--text-secondary)] md:col-span-2">
                Address
                <input
                  value={form.address}
                  onChange={(event) => setForm((prev) => ({ ...prev, address: event.target.value }))}
                  placeholder="Add address"
                  className="app-input w-full rounded-lg border px-4 py-3"
                />
              </label>
              {canDelete ? (
                <label className="space-y-2 text-sm text-[var(--text-secondary)] md:col-span-2">
                  Credit limit ({currency})
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    inputMode="decimal"
                    value={form.creditLimit}
                    onChange={(event) => setForm((prev) => ({ ...prev, creditLimit: event.target.value }))}
                    placeholder="Leave empty for no limit"
                    className="app-input w-full rounded-lg border px-4 py-3"
                  />
                  <span className="block text-xs text-[var(--text-muted)]">The most this customer may owe at any time when buying on credit.</span>
                </label>
              ) : null}
              <label className="space-y-2 text-sm text-[var(--text-secondary)] md:col-span-2">
                Notes
                <textarea
                  value={form.notes}
                  onChange={(event) => setForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Add notes about buying habits, delivery details, or preferences"
                  rows="4"
                  className="app-input w-full rounded-lg border px-4 py-3"
                />
              </label>
            </div>
            <label className="app-panel-soft flex items-center gap-3 rounded-lg border px-4 py-3 text-sm text-[var(--text-secondary)]">
              <input
                type="checkbox"
                checked={form.isActive}
                onChange={(event) => setForm((prev) => ({ ...prev, isActive: event.target.checked }))}
              />
              Customer is active and available for new sales.
            </label>
            <button className="app-btn-primary w-full rounded-lg px-4 py-3 transition">
              {form.id ? 'Save Changes' : 'Create Customer'}
            </button>
          </form>

          {message ? (
            <div className={`mt-4 rounded-2xl px-4 py-3 text-sm ${message.includes('successfully') ? 'app-alert-success' : 'app-alert-danger'}`}>
              {message}
            </div>
          ) : null}
        </section>
      </div>

      {/* Purchase History Modal */}
      {historyCustomer && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-4 sm:items-center" onClick={(e) => { if (e.target === e.currentTarget) setHistoryCustomer(null); }}>
          <div className="app-panel w-full max-w-2xl rounded-[1.5rem] border p-6">
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
                <div key={sale.id} className="app-panel-soft rounded-[1.35rem] border p-4">
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
          <div className="app-panel flex max-h-[92vh] w-full max-w-2xl flex-col rounded-[1.5rem] border p-6" role="dialog" aria-modal="true" aria-labelledby="credit-title">
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
                    <form onSubmit={submitPayment} className="app-panel-soft space-y-3 rounded-[1.2rem] border p-4">
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
                      <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Unpaid sales</p>
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
                    <p className="mb-2 text-xs font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Payments received</p>
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
