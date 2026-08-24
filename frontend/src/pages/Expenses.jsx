import { useEffect, useMemo, useState } from 'react';
import { fetchExpenses, createExpense, updateExpense, deleteExpense, fetchSettings } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';

const CATEGORIES = ['Rent', 'Utilities', 'Supplies', 'Salaries', 'Maintenance', 'Marketing', 'Other'];

const emptyForm = { id: null, category: CATEGORIES[0], description: '', amount: '', date: new Date().toISOString().slice(0, 10), notes: '' };

export default function Expenses() {
  const currentUser = getUser();
  const isAdmin = currentUser?.role === 'Admin';
  const [currency, setCurrency] = useState('UGX');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [form, setForm] = useState(emptyForm);
  const [message, setMessage] = useState('');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [deleteTarget, setDeleteTarget] = useState(null);

  useBodyScrollLock(Boolean(deleteTarget));

  const loadExpenses = async (start, end) => {
    setLoading(true);
    try {
      const data = await fetchExpenses(start || undefined, end || undefined);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (e) {
      setMessage(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
    loadExpenses();
  }, []);

  const totalThisMonth = useMemo(() => {
    const now = new Date();
    return expenses
      .filter((e) => {
        const d = new Date(e.date);
        return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
      })
      .reduce((sum, e) => sum + Number(e.amount || 0), 0);
  }, [expenses]);

  const totalAll = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);

  const topCategory = useMemo(() => {
    const map = {};
    expenses.forEach((e) => { map[e.category] = (map[e.category] || 0) + Number(e.amount || 0); });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return sorted[0]?.[0] || '—';
  }, [expenses]);

  const fmt = (v) => `${currency} ${Number(v || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setMessage('');
    try {
      if (form.id) {
        await updateExpense(form.id, form);
        setMessage('Expense updated.');
      } else {
        await createExpense(form);
        setMessage('Expense recorded.');
      }
      setForm(emptyForm);
      await loadExpenses(startDate, endDate);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const handleDelete = async (expense) => {
    try {
      await deleteExpense(expense.id);
      await loadExpenses(startDate, endDate);
    } catch (err) {
      setMessage(err.message);
    }
  };

  const CATEGORY_META = {
    Rent:        { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 21h18"/><path d="M5 21V7l7-4 7 4v14"/><path d="M9 21v-6h6v6"/></svg>, color: 'var(--accent)' },
    Utilities:   { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M13 2 3 14h9l-1 8 10-12h-9l1-8z"/></svg>, color: 'var(--warning)' },
    Supplies:    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="m3 7 9-4 9 4-9 4-9-4Z"/><path d="m3 7 9 4 9-4"/><path d="M12 11v10"/></svg>, color: 'var(--accent)' },
    Salaries:    { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg>, color: 'var(--success)' },
    Maintenance: { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"/></svg>, color: 'var(--warning)' },
    Marketing:   { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M22 12h-4l-3 9L9 3l-3 9H2"/></svg>, color: 'var(--accent)' },
    Other:       { icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="12" cy="12" r="10"/><path d="M12 16v.01"/><path d="M12 8v4"/></svg>, color: 'var(--text-muted)' },
  };

  return (
    <div className="space-y-4">
      {/* Stat Cards */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        {[
          { label: 'This Month', value: fmt(totalThisMonth), eyebrow: 'Monthly', tone: 'danger', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg> },
          { label: 'Total (Filtered)', value: fmt(totalAll), eyebrow: 'Expenses', tone: 'warning', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 1v22"/><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6"/></svg> },
          { label: 'Top Category', value: topCategory, eyebrow: 'Category', tone: 'default', icon: <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 19h16"/><path d="M7 15V9"/><path d="M12 15V5"/><path d="M17 15v-2"/></svg> },
        ].map((card) => {
          const toneClasses = {
            default: 'border-l-[var(--accent)] bg-[linear-gradient(135deg,rgba(30,167,189,0.18),rgba(30,167,189,0.08))] text-[var(--accent)]',
            danger:  'border-l-[var(--danger)] bg-[linear-gradient(135deg,rgba(218,106,90,0.18),rgba(218,106,90,0.08))] text-[var(--danger)]',
            warning: 'border-l-[var(--warning)] bg-[linear-gradient(135deg,rgba(216,155,73,0.18),rgba(216,155,73,0.08))] text-[var(--warning)]',
          };
          const iconClass = toneClasses[card.tone] || toneClasses.default;
          return (
            <div key={card.label} className={`app-panel relative overflow-hidden rounded-[1.2rem] border border-l-[3px] ${card.tone === 'danger' ? 'border-l-[var(--danger)]' : card.tone === 'warning' ? 'border-l-[var(--warning)]' : 'border-l-[var(--accent)]'} p-4 transition duration-200 hover:shadow-lg`}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{card.eyebrow}</p>
                  <p className="mt-1.5 text-[13px] font-medium text-[var(--text-secondary)]">{card.label}</p>
                  <p className="mt-2 text-[1.55rem] font-bold tracking-tight leading-none text-[var(--text-primary)]">{card.value}</p>
                </div>
                <div className={`flex h-10 w-10 items-center justify-center rounded-[1.05rem] shadow-sm ring-1 ring-black/5 ${iconClass}`}>{card.icon}</div>
              </div>
            </div>
          );
        })}
      </div>

      <div className="flex flex-col gap-6 lg:flex-row">
        {/* Left: Table */}
        <section className="min-w-0 flex-1">
          {/* Date filters */}
          <div className="app-panel mb-4 flex flex-wrap items-end gap-3 rounded-[1.4rem] border p-4">
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[var(--text-muted)]">From</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="app-input rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            <div className="flex flex-col gap-1">
              <label className="text-[12px] font-medium text-[var(--text-muted)]">To</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="app-input rounded-xl border px-3 py-2 text-sm"
              />
            </div>
            <button type="button" onClick={() => loadExpenses(startDate, endDate)} className="app-btn-primary rounded-xl px-4 py-2 text-sm font-medium">
              Filter
            </button>
            {(startDate || endDate) && (
              <button type="button" onClick={() => { setStartDate(''); setEndDate(''); loadExpenses(); }} className="app-btn-secondary rounded-xl border px-4 py-2 text-sm font-medium">
                Clear
              </button>
            )}
          </div>

          <div className="app-panel overflow-hidden rounded-[1.4rem] border">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] px-5 py-4">
              <div>
                <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Expense Records</h3>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">Review, edit, and filter business expenditure.</p>
              </div>
              <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-xs font-semibold text-[var(--text-muted)]">
                {expenses.length} record{expenses.length !== 1 ? 's' : ''}
              </span>
            </div>
            <div className="overflow-x-auto">
              <table className="table-cards w-full text-sm">
                <thead>
                  <tr className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)]">
                    {['Date', 'Category', 'Description', 'Amount', ...(isAdmin ? ['Actions'] : [])].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.12em] text-[var(--text-muted)]">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {loading ? (
                    Array.from({ length: 5 }).map((_, i) => (
                      <tr key={i}>
                        {Array.from({ length: isAdmin ? 5 : 4 }).map((__, j) => (
                          <td key={j} className="px-4 py-3.5">
                            <div className="h-3 animate-pulse rounded-md bg-[var(--surface-secondary)]" style={{ width: `${60 + Math.random() * 30}%` }} />
                          </td>
                        ))}
                      </tr>
                    ))
                  ) : expenses.length === 0 ? (
                    <tr>
                      <td colSpan={isAdmin ? 5 : 4} className="px-4 py-10 text-center">
                        <p className="text-sm font-medium text-[var(--text-primary)]">No expenses recorded yet</p>
                        <p className="mt-1 text-xs text-[var(--text-muted)]">Use the form to record your first expense.</p>
                      </td>
                    </tr>
                  ) : (
                    expenses.map((expense) => {
                      const meta = CATEGORY_META[expense.category] || CATEGORY_META.Other;
                      return (
                        <tr key={expense.id} className="border-l-[3px] transition hover:bg-[var(--surface-secondary)]" style={{ borderLeftColor: meta.color }}>
                          <td data-label="Date" className="whitespace-nowrap px-4 py-3.5 text-xs text-[var(--text-muted)]">
                            {new Date(expense.date).toLocaleDateString([], { dateStyle: 'medium' })}
                          </td>
                          <td data-label="Category" className="px-4 py-3.5">
                            <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--surface-secondary)] px-2.5 py-1 text-xs font-semibold" style={{ color: meta.color }}>
                              {meta.icon}
                              {expense.category}
                            </span>
                          </td>
                          <td data-label="Description" className="px-4 py-3.5 text-[var(--text-primary)]">{expense.description || '—'}</td>
                          <td data-label="Amount" className="px-4 py-3.5 font-semibold tabular-nums text-[var(--danger)]">{fmt(expense.amount)}</td>
                          {isAdmin && (
                            <td data-label="Actions" className="px-4 py-3.5">
                              <div className="flex flex-wrap justify-end gap-2 md:justify-start">
                                <button
                                  type="button"
                                  onClick={() => setForm({ id: expense.id, category: expense.category, description: expense.description || '', amount: expense.amount, date: expense.date, notes: expense.notes || '' })}
                                  className="app-btn-secondary rounded-[0.9rem] border px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)]"
                                >
                                  Edit
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setDeleteTarget(expense)}
                                  className="app-btn-secondary rounded-[0.9rem] border px-3 py-1.5 text-[12px] font-medium transition hover:border-[var(--danger)] hover:text-[var(--danger)]"
                                >
                                  Delete
                                </button>
                              </div>
                            </td>
                          )}
                        </tr>
                      );
                    })
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </section>

        {/* Right: Form */}
        {isAdmin && (
          <aside className="w-full lg:w-80 xl:w-96">
            <div className="app-panel sticky top-6 rounded-[1.4rem] border p-6">
              <div className="border-b border-[var(--border-default)] pb-4">
                <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">{form.id ? 'Edit Expense' : 'Record Expense'}</h2>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Fill in the details to log an expense.</p>
              </div>
              <form onSubmit={handleSubmit} className="mt-5 space-y-4">
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Category</label>
                  <select
                    value={form.category}
                    onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
                    className="app-input w-full rounded-xl border px-3 py-2 text-sm"
                  >
                    {CATEGORIES.map((c) => (
                      <option key={c} value={c}>{c}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Description</label>
                  <input
                    type="text"
                    placeholder="Brief description"
                    value={form.description}
                    onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                    className="app-input w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                <div className="flex gap-3">
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Amount *</label>
                    <input
                      type="number"
                      min="0"
                      step="0.01"
                      inputMode="decimal"
                      required
                      placeholder="0.00"
                      value={form.amount}
                      onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
                      className="app-input w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                  <div className="flex-1">
                    <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Date *</label>
                    <input
                      type="date"
                      required
                      value={form.date}
                      onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
                      className="app-input w-full rounded-xl border px-3 py-2 text-sm"
                    />
                  </div>
                </div>
                <div>
                  <label className="mb-1 block text-xs font-semibold text-[var(--text-muted)]">Notes</label>
                  <textarea
                    rows={3}
                    placeholder="Optional notes"
                    value={form.notes}
                    onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
                    className="app-input w-full rounded-xl border px-3 py-2 text-sm"
                  />
                </div>
                {message && (
                  <p className={`rounded-[0.9rem] px-3 py-2 text-xs font-medium ${message.toLowerCase().includes('error') || message.toLowerCase().includes('fail') ? 'bg-[rgba(218,106,90,0.1)] text-[var(--danger)]' : 'bg-[rgba(74,168,132,0.1)] text-[var(--success)]'}`}>
                    {message}
                  </p>
                )}
                <div className="flex gap-2 pt-1">
                  <button type="submit" className="app-btn-primary flex-1 rounded-xl py-2 text-sm font-semibold">
                    {form.id ? 'Save Changes' : 'Record Expense'}
                  </button>
                  {form.id && (
                    <button type="button" onClick={() => { setForm(emptyForm); setMessage(''); }} className="app-btn-secondary rounded-xl border px-4 py-2 text-sm font-medium">
                      Cancel
                    </button>
                  )}
                </div>
              </form>
            </div>
          </aside>
        )}
      </div>

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete expense?"
          message={
            <>
              Delete <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.description || deleteTarget.category}</strong> permanently?
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
