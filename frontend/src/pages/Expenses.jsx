import { useEffect, useMemo, useState } from 'react';
import { fetchExpenses, createExpense, updateExpense, deleteExpense, fetchSettings } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import ConfirmDialog from '../components/ConfirmDialog';
import { formatMoney, formatCompactMoney, formatAmount } from '../utils/format';
import { Drawer, EmptyState, Field, IconButton, Panel, PanelHeader, SkeletonRows, StatGrid, StatTile, Toast, fieldInput, icons, statIcons } from '../components/ui';

const CATEGORIES = ['Rent', 'Utilities', 'Supplies', 'Salaries', 'Maintenance', 'Marketing', 'Transport', 'Other'];

// Local calendar dates (toISOString would shift to UTC and land on the wrong day).
const localISO = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
const todayISO = () => localISO(new Date());
const emptyForm = () => ({ id: null, category: CATEGORIES[0], description: '', amount: '', date: todayISO(), notes: '' });

function isoDaysAgo(days) {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return localISO(d);
}

const PRESETS = [
  { key: 'month', label: 'This month', range: () => { const d = new Date(); return [localISO(new Date(d.getFullYear(), d.getMonth(), 1)), todayISO()]; } },
  { key: '30d', label: 'Last 30 days', range: () => [isoDaysAgo(29), todayISO()] },
  { key: 'year', label: 'This year', range: () => [`${new Date().getFullYear()}-01-01`, todayISO()] },
  { key: 'all', label: 'All time', range: () => ['', ''] },
];

export default function Expenses() {
  const isAdmin = getUser()?.role === 'Admin';
  const [currency, setCurrency] = useState('UGX');
  const [expenses, setExpenses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [preset, setPreset] = useState('month');
  const [[startDate, endDate], setRange] = useState(PRESETS[0].range());
  const [categoryFilter, setCategoryFilter] = useState('');
  const [form, setForm] = useState(emptyForm);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [formError, setFormError] = useState('');
  const [saving, setSaving] = useState(false);
  const [highlightId, setHighlightId] = useState(null);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [toast, setToast] = useState('');

  useBodyScrollLock(Boolean(deleteTarget) || drawerOpen);

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 3000);
  };

  const loadExpenses = async (start = startDate, end = endDate) => {
    setLoading(true);
    try {
      const data = await fetchExpenses(start || undefined, end || undefined);
      setExpenses(Array.isArray(data) ? data : []);
    } catch (e) {
      flash(e.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
  }, []);

  useEffect(() => {
    loadExpenses(startDate, endDate);
  }, [startDate, endDate]);

  const choosePreset = (key) => {
    setPreset(key);
    setRange(PRESETS.find((p) => p.key === key).range());
  };

  const byCategory = useMemo(() => {
    const map = new Map();
    expenses.forEach((e) => map.set(e.category, (map.get(e.category) || 0) + Number(e.amount || 0)));
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [expenses]);

  const total = useMemo(() => expenses.reduce((sum, e) => sum + Number(e.amount || 0), 0), [expenses]);
  const shown = useMemo(() => (categoryFilter ? expenses.filter((e) => e.category === categoryFilter) : expenses), [expenses, categoryFilter]);
  const days = useMemo(() => {
    if (!startDate) return null;
    const ms = new Date(endDate || todayISO()) - new Date(startDate);
    return Math.max(1, Math.round(ms / 86400000) + 1);
  }, [startDate, endDate]);

  const openNew = () => {
    setForm(emptyForm());
    setFormError('');
    setDrawerOpen(true);
  };

  const openEdit = (expense) => {
    setForm({
      id: expense.id,
      category: expense.category,
      description: expense.description || '',
      amount: expense.amount,
      date: String(expense.date).slice(0, 10),
      notes: expense.notes || '',
    });
    setFormError('');
    setDrawerOpen(true);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Ignore repeat clicks while a save is in flight (prevents duplicates).
    if (saving) return;
    if (!(Number(form.amount) > 0)) {
      setFormError('Enter an amount greater than 0.');
      return;
    }
    setSaving(true);
    setFormError('');
    try {
      let saved;
      if (form.id) {
        saved = await updateExpense(form.id, form);
        flash(`Expense updated · ${formatMoney(currency, form.amount)}`);
      } else {
        saved = await createExpense(form);
        flash(`Expense recorded · ${formatMoney(currency, form.amount)}`);
      }
      setDrawerOpen(false);
      setHighlightId(saved?.id || form.id || null);
      window.setTimeout(() => setHighlightId(null), 4000);
      await loadExpenses();
    } catch (err) {
      setFormError(err.message);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (expense) => {
    try {
      await deleteExpense(expense.id);
      flash('Expense deleted.');
      await loadExpenses();
    } catch (err) {
      flash(err.message);
    }
  };

  const rangeLabel = startDate ? `${new Date(startDate).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} – ${new Date(endDate || todayISO()).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'All time';

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="inline-flex max-w-full items-center gap-1 overflow-x-auto rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-1" role="tablist" aria-label="Period">
          {PRESETS.map((p) => (
            <button
              key={p.key}
              type="button"
              role="tab"
              aria-selected={preset === p.key}
              onClick={() => choosePreset(p.key)}
              className={`shrink-0 rounded-lg px-3 py-1.5 text-sm font-medium transition ${preset === p.key ? 'bg-[var(--surface-primary)] text-[var(--text-primary)] shadow-sm' : 'text-[var(--text-muted)] hover:text-[var(--text-primary)]'}`}
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-1.5">
          <input type="date" aria-label="From" value={startDate} onChange={(e) => { setPreset('custom'); setRange([e.target.value, endDate]); }} className="app-input rounded-lg border px-3 py-1.5 text-sm" />
          <span className="text-sm text-[var(--text-muted)]">to</span>
          <input type="date" aria-label="To" value={endDate} onChange={(e) => { setPreset('custom'); setRange([startDate, e.target.value]); }} className="app-input rounded-lg border px-3 py-1.5 text-sm" />
        </div>
      </div>

      <StatGrid>
        <StatTile label="Spent" value={formatCompactMoney(currency, total)} title={formatMoney(currency, total)} hint={rangeLabel} tone={total ? 'danger' : 'default'} icon={statIcons.money} iconTone="danger" />
        <StatTile label="Per day" value={days ? formatCompactMoney(currency, total / days) : '-'} hint={days ? `Average over ${days} day${days === 1 ? '' : 's'}` : 'Choose a period'} icon={statIcons.calendar} iconTone="info" />
        <StatTile label="Biggest cost" value={byCategory[0]?.[0] || '-'} hint={byCategory[0] ? formatMoney(currency, byCategory[0][1]) : 'No expenses'} icon={statIcons.receipt} iconTone="warning" />
        <StatTile label="Records" value={expenses.length.toLocaleString()} hint="In this period"  icon={statIcons.box} />
      </StatGrid>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel>
          <PanelHeader
            title="Expenses"
            description={categoryFilter ? `Showing ${categoryFilter}` : 'Every cost recorded in this period'}
            actions={(
              <>
                {categoryFilter ? <button type="button" onClick={() => setCategoryFilter('')} className="text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">Show all</button> : null}
                {isAdmin ? (
                  <button type="button" onClick={openNew} className="app-btn-primary inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm">{icons.plus}Record expense</button>
                ) : null}
              </>
            )}
          />
          {loading ? (
            <SkeletonRows rows={4} />
          ) : shown.length === 0 ? (
            <EmptyState
              title="No expenses in this period"
              message="Record rent, transport, salaries and other costs to see your true profit."
              action={isAdmin ? <button type="button" onClick={openNew} className="app-btn-primary rounded-lg px-4 py-2 text-sm">Record expense</button> : null}
            />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Date</th>
                    <th className="px-4 py-2.5 font-medium">Expense</th>
                    <th className="px-4 py-2.5 text-right font-medium">Amount ({currency})</th>
                    {isAdmin ? <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {shown.map((expense) => (
                    <tr key={expense.id} className={`app-row-hover transition-colors ${highlightId === expense.id ? 'bg-[var(--accent-soft)]' : ''}`}>
                      <td data-label="Date" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">{new Date(expense.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                      <td data-label="Expense" className="px-4 py-2.5">
                        <p className="font-medium text-[var(--text-primary)]">{expense.description || expense.category}</p>
                        <p className="text-xs text-[var(--text-muted)]">{expense.category}{expense.notes ? ` · ${expense.notes}` : ''}</p>
                      </td>
                      <td data-label="Amount" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{formatAmount(currency, expense.amount)}</td>
                      {isAdmin ? (
                        <td data-label="Actions" className="px-4 py-2.5">
                          <div className="flex justify-end">
                            <IconButton label="Edit expense" onClick={() => openEdit(expense)}>{icons.edit}</IconButton>
                            <IconButton label="Delete expense" tone="danger" onClick={() => setDeleteTarget(expense)}>{icons.trash}</IconButton>
                          </div>
                        </td>
                      ) : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Where the money goes" />
          {byCategory.length === 0 ? (
            <p className="px-5 py-6 text-sm text-[var(--text-muted)]">Nothing recorded yet.</p>
          ) : (
            <ul className="space-y-1 p-3">
              {byCategory.map(([category, amount]) => {
                const share = total ? Math.round((amount / total) * 100) : 0;
                const active = categoryFilter === category;
                return (
                  <li key={category}>
                    <button
                      type="button"
                      onClick={() => setCategoryFilter(active ? '' : category)}
                      aria-pressed={active}
                      className={`w-full rounded-lg px-2.5 py-2 text-left transition ${active ? 'bg-[var(--accent-soft)]' : 'hover:bg-[var(--surface-secondary)]'}`}
                    >
                      <span className="flex items-baseline justify-between gap-2 text-sm">
                        <span className="font-medium text-[var(--text-primary)]">{category}</span>
                        <span className="num text-[var(--text-secondary)]">{formatMoney(currency, amount)}</span>
                      </span>
                      <span className="mt-1.5 flex items-center gap-2">
                        <span className="h-1.5 flex-1 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                          <span className="block h-full rounded-full bg-[var(--accent)]" style={{ width: `${share}%` }} />
                        </span>
                        <span className="num w-9 text-right text-xs text-[var(--text-muted)]">{share}%</span>
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </Panel>
      </div>

      {drawerOpen ? (
        <Drawer
          title={form.id ? 'Edit expense' : 'Record expense'}
          onClose={() => setDrawerOpen(false)}
          onSubmit={handleSubmit}
          footer={(
            <>
              <button type="button" onClick={() => setDrawerOpen(false)} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
              <button type="submit" disabled={saving} className="app-btn-primary flex-1 rounded-lg px-4 py-2.5 text-sm disabled:cursor-wait disabled:opacity-60">{saving ? 'Saving…' : form.id ? 'Save changes' : 'Record expense'}</button>
            </>
          )}
        >
          <div>
            <p className="text-sm font-medium text-[var(--text-secondary)]">Category</p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {CATEGORIES.map((category) => (
                <button
                  key={category}
                  type="button"
                  onClick={() => setForm((p) => ({ ...p, category }))}
                  aria-pressed={form.category === category}
                  className={`rounded-full border px-3 py-1 text-sm transition ${form.category === category ? 'border-[var(--accent)] bg-[var(--accent-soft)] text-[var(--accent-strong)]' : 'border-[var(--border-strong)] text-[var(--text-secondary)] hover:border-[var(--text-muted)]'}`}
                >
                  {category}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`Amount (${currency})`}>
              <input autoFocus required type="number" min="0" step="any" inputMode="decimal" value={form.amount} onChange={(e) => setForm((p) => ({ ...p, amount: e.target.value }))} className={fieldInput} placeholder="0" />
            </Field>
            <Field label="Date">
              <input required type="date" value={form.date} max={todayISO()} onChange={(e) => setForm((p) => ({ ...p, date: e.target.value }))} className={fieldInput} />
            </Field>
          </div>
          <Field label="Description">
            <input required value={form.description} onChange={(e) => setForm((p) => ({ ...p, description: e.target.value }))} className={fieldInput} placeholder="e.g. October shop rent" />
          </Field>
          <Field label="Notes">
            <textarea rows="3" value={form.notes} onChange={(e) => setForm((p) => ({ ...p, notes: e.target.value }))} className={fieldInput} placeholder="Optional" />
          </Field>
          {formError ? <p className="app-alert-danger rounded-lg px-3 py-2 text-sm" role="alert">{formError}</p> : null}
        </Drawer>
      ) : null}

      {deleteTarget ? (
        <ConfirmDialog
          title="Delete expense?"
          message={<>Delete <strong className="font-semibold text-[var(--text-primary)]">{deleteTarget.description || deleteTarget.category}</strong> ({formatMoney(currency, deleteTarget.amount)})? This cannot be undone.</>}
          confirmLabel="Delete"
          onConfirm={() => {
            const target = deleteTarget;
            setDeleteTarget(null);
            handleDelete(target);
          }}
          onCancel={() => setDeleteTarget(null)}
        />
      ) : null}

      <Toast text={toast} />
    </div>
  );
}
