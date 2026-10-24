import { useEffect, useMemo, useState } from 'react';
import { api, fetchProducts, fetchSettings } from '../utils/api';
import { formatMoney } from '../utils/format';
import { Badge, EmptyState, Panel, PanelHeader, SearchInput, SkeletonRows, StatGrid, StatTile, Tabs, Toast, statIcons } from '../components/ui';

const REASONS = ['Count error', 'Damage', 'Theft / loss', 'Expired', 'Supplier short delivery', 'Other'];
const PAGE_SIZE = 60;

function VarianceBadge({ value }) {
  const v = Number(value);
  if (!v) return <Badge tone="neutral">Matches</Badge>;
  return <Badge tone={v > 0 ? 'success' : 'danger'}>{v > 0 ? `+${v}` : v}</Badge>;
}

export default function StockReconciliation() {
  const [view, setView] = useState('count');
  const [currency, setCurrency] = useState('UGX');
  const [products, setProducts] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('');
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [counts, setCounts] = useState({});
  const [reason, setReason] = useState(REASONS[0]);
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);
  const [history, setHistory] = useState([]);
  const [summary, setSummary] = useState([]);
  const [toast, setToast] = useState('');

  const flash = (text) => {
    setToast(text);
    window.setTimeout(() => setToast(''), 4000);
  };

  const loadProducts = async () => {
    try {
      setLoading(true);
      const data = await fetchProducts();
      setProducts(data.filter((p) => (p.type || 'goods') === 'goods'));
    } catch (error) {
      flash(error.message);
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async () => {
    try {
      setLoading(true);
      const [historyResponse, summaryResponse] = await Promise.all([
        api.get('/stock-reconciliation/history?limit=100'),
        api.get('/stock-reconciliation/summary').catch(() => ({ data: [] })),
      ]);
      setHistory(historyResponse.data.data || []);
      setSummary(summaryResponse.data || []);
    } catch (error) {
      flash(error.message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSettings().then((s) => setCurrency(s?.currency || 'UGX')).catch(() => {});
  }, []);

  useEffect(() => {
    if (view === 'count') loadProducts();
    else loadHistory();
  }, [view]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [search, category]);

  const categories = useMemo(() => Array.from(new Set(products.map((p) => p.category).filter(Boolean))).sort(), [products]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return products.filter((p) => {
      if (category && p.category !== category) return false;
      if (!q) return true;
      return [p.name, p.sku].some((v) => String(v || '').toLowerCase().includes(q));
    });
  }, [products, search, category]);

  // Only rows the user actually typed a count into.
  const entered = useMemo(() => products
    .filter((p) => counts[p.id] !== undefined && counts[p.id] !== '')
    .map((p) => {
      const physical = Number(counts[p.id]);
      const variance = physical - Number(p.quantity || 0);
      return { product: p, physical, variance, value: variance * Number(p.buyPrice || 0) };
    }), [products, counts]);

  const differences = entered.filter((row) => row.variance !== 0);
  const shortValue = differences.filter((r) => r.variance < 0).reduce((sum, r) => sum + r.value, 0);
  const extraValue = differences.filter((r) => r.variance > 0).reduce((sum, r) => sum + r.value, 0);

  const setCount = (id, value) => {
    if (value === '' || /^\d+$/.test(value)) setCounts((prev) => ({ ...prev, [id]: value }));
  };

  const saveCounts = async () => {
    if (!entered.length) return;
    setSaving(true);
    let saved = 0;
    const failed = [];
    for (const row of entered) {
      try {
        await api.post('/stock-reconciliation/create', {
          productId: row.product.id,
          physicalQuantity: row.physical,
          reason: row.variance ? reason : 'Count confirmed',
          notes: notes || null,
        });
        saved += 1;
      } catch (error) {
        failed.push(`${row.product.name}: ${error.message}`);
      }
    }
    setSaving(false);
    setCounts({});
    setNotes('');
    flash(failed.length ? `${saved} saved, ${failed.length} failed: ${failed[0]}` : `Stock count saved for ${saved} product${saved === 1 ? '' : 's'}${differences.length ? `, ${differences.length} adjusted` : ''}.`);
    await loadProducts();
  };

  return (
    <div className="space-y-5">
      <Tabs
        label="Stock count"
        value={view}
        onChange={setView}
        tabs={[
          { key: 'count', label: 'Count stock' },
          { key: 'history', label: 'History' },
        ]}
      />

      {view === 'count' ? (
        <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
          <Panel>
            <div className="flex flex-col gap-2 border-b border-[var(--border-default)] p-4 sm:flex-row">
              <SearchInput value={search} onChange={setSearch} placeholder="Search products" className="flex-1 sm:max-w-sm" />
              <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Category" className="app-input rounded-lg border px-3 py-2 text-sm sm:w-52">
                <option value="">All categories</option>
                {categories.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
            </div>
            <p className="border-b border-[var(--border-default)] bg-[var(--panel-soft-bg)] px-4 py-2 text-xs text-[var(--text-muted)]">
              Count what is physically on the shelf and type the number. Leave a row blank to skip it.
            </p>
            {loading ? (
              <SkeletonRows rows={8} />
            ) : filtered.length === 0 ? (
              <EmptyState title="No products to count" message="Try another search or category." />
            ) : (
              <>
                <div className="overflow-x-auto">
                  <table className="min-w-full text-left text-sm">
                    <thead className="app-table-head">
                      <tr>
                        <th className="px-4 py-2.5 font-medium">Product</th>
                        <th className="px-4 py-2.5 text-right font-medium">System</th>
                        <th className="w-32 px-4 py-2.5 text-right font-medium">Counted</th>
                        <th className="w-28 px-4 py-2.5 text-right font-medium">Difference</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {filtered.slice(0, visibleCount).map((product) => {
                        const value = counts[product.id] ?? '';
                        const variance = value === '' ? null : Number(value) - Number(product.quantity || 0);
                        return (
                          <tr key={product.id} className={value !== '' ? 'bg-[var(--accent-soft)]' : 'app-row-hover'}>
                            <td className="px-4 py-2">
                              <p className="font-medium text-[var(--text-primary)]">{product.name}</p>
                              <p className="text-xs text-[var(--text-muted)]">{product.category}{product.sku ? ` · ${product.sku}` : ''}</p>
                            </td>
                            <td className="num px-4 py-2 text-right text-[var(--text-secondary)]">{Number(product.quantity || 0).toLocaleString()}</td>
                            <td className="px-4 py-2 text-right">
                              <input
                                type="text"
                                inputMode="numeric"
                                value={value}
                                onChange={(e) => setCount(product.id, e.target.value.trim())}
                                placeholder="-"
                                aria-label={`Counted quantity of ${product.name}`}
                                className="app-input num w-20 rounded-lg border px-2.5 py-1.5 text-right text-sm"
                              />
                            </td>
                            <td className="px-4 py-2 text-right">{variance === null ? <span className="text-[var(--text-muted)]">-</span> : <VarianceBadge value={variance} />}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {filtered.length > visibleCount ? (
                  <div className="border-t border-[var(--border-default)] p-3 text-center">
                    <button type="button" onClick={() => setVisibleCount((c) => c + PAGE_SIZE)} className="app-btn-secondary rounded-lg border px-4 py-2 text-sm font-medium">
                      Show more · {(filtered.length - visibleCount).toLocaleString()} remaining
                    </button>
                  </div>
                ) : null}
              </>
            )}
          </Panel>

          <Panel className="xl:sticky xl:top-20">
            <PanelHeader title="This count" description={entered.length ? `${entered.length} product${entered.length === 1 ? '' : 's'} counted` : 'Nothing counted yet'} />
            <div className="space-y-4 p-4">
              <dl className="space-y-1.5 text-sm">
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Match the system</dt><dd className="num">{entered.length - differences.length}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">With differences</dt><dd className="num">{differences.length}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Missing stock (at cost)</dt><dd className={`num ${shortValue < 0 ? 'text-red-600' : ''}`}>{formatMoney(currency, shortValue)}</dd></div>
                <div className="flex justify-between"><dt className="text-[var(--text-muted)]">Extra stock (at cost)</dt><dd className="num">{formatMoney(currency, extraValue)}</dd></div>
              </dl>
              {differences.length ? (
                <label className="block text-sm font-medium text-[var(--text-secondary)]">
                  Reason for differences
                  <select value={reason} onChange={(e) => setReason(e.target.value)} className="app-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm">
                    {REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                </label>
              ) : null}
              <label className="block text-sm font-medium text-[var(--text-secondary)]">
                Note <span className="font-normal text-[var(--text-muted)]">(optional)</span>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="app-input mt-1.5 w-full rounded-lg border px-3 py-2 text-sm" placeholder="e.g. Shelf B, end of month" />
              </label>
              <button type="button" onClick={saveCounts} disabled={!entered.length || saving} className="app-btn-primary w-full rounded-lg px-4 py-2.5 text-sm disabled:opacity-50">
                {saving ? 'Saving…' : entered.length ? `Save count & update stock` : 'Enter counts to save'}
              </button>
              {entered.length ? (
                <button type="button" onClick={() => setCounts({})} className="w-full text-center text-xs text-[var(--text-muted)] hover:text-[var(--text-primary)]">Clear entered counts</button>
              ) : null}
              <p className="text-xs text-[var(--text-muted)]">Saving sets stock to the counted numbers and records who counted and why.</p>
            </div>
          </Panel>
        </div>
      ) : (
        <div className="space-y-5">
          <StatGrid>
            <StatTile label="Counts recorded" value={history.length.toLocaleString()} hint="Most recent 100"  icon={statIcons.check} />
            <StatTile label="With differences" value={history.filter((h) => Number(h.variance)).length.toLocaleString()} hint="Stock adjusted" tone={history.some((h) => Number(h.variance) < 0) ? 'warning' : 'default'} icon={statIcons.pulse} iconTone="warning" />
            <StatTile label="Units missing" value={Math.abs(history.reduce((s, h) => s + Math.min(0, Number(h.variance)), 0)).toLocaleString()} hint="Counted below system" tone="danger"  icon={statIcons.alert} iconTone="danger" />
            <StatTile label="Units found" value={history.reduce((s, h) => s + Math.max(0, Number(h.variance)), 0).toLocaleString()} hint="Counted above system"  icon={statIcons.box} iconTone="success" />
          </StatGrid>

          <Panel>
            <PanelHeader title="Count history" description="Every stock count and the adjustment it made." />
            {loading ? (
              <SkeletonRows rows={6} />
            ) : history.length === 0 ? (
              <EmptyState title="No stock counts yet" message="Counting regularly catches theft, damage and mistakes early." />
            ) : (
              <div className="overflow-x-auto">
                <table className="table-cards min-w-full text-left text-sm">
                  <thead className="app-table-head">
                    <tr>
                      <th className="px-4 py-2.5 font-medium">When</th>
                      <th className="px-4 py-2.5 font-medium">Product</th>
                      <th className="px-4 py-2.5 text-right font-medium">System</th>
                      <th className="px-4 py-2.5 text-right font-medium">Counted</th>
                      <th className="px-4 py-2.5 text-right font-medium">Difference</th>
                      <th className="px-4 py-2.5 font-medium">Reason</th>
                      <th className="px-4 py-2.5 font-medium">By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {history.map((row) => (
                      <tr key={row.id} className="app-row-hover">
                        <td data-label="When" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">{new Date(row.reconciliationDate || row.createdAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</td>
                        <td data-label="Product" className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{row.product?.name || `#${row.productId}`}</td>
                        <td data-label="System" className="num px-4 py-2.5 text-right text-[var(--text-secondary)]">{Number(row.systemQuantity)}</td>
                        <td data-label="Counted" className="num px-4 py-2.5 text-right text-[var(--text-primary)]">{Number(row.physicalQuantity)}</td>
                        <td data-label="Difference" className="px-4 py-2.5 text-right"><VarianceBadge value={row.variance} /></td>
                        <td data-label="Reason" className="px-4 py-2.5 text-[var(--text-secondary)]">{row.reason || '-'}{row.notes ? <span className="block text-xs text-[var(--text-muted)]">{row.notes}</span> : null}</td>
                        <td data-label="By" className="px-4 py-2.5 text-[var(--text-secondary)]">{row.adjustedBy?.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Panel>

          {summary.some((s) => Number(s.totalVariance)) ? (
            <Panel>
              <PanelHeader title="Products that keep going missing" description="Total difference across all counts." />
              <ul className="divide-y divide-[var(--border-default)]">
                {summary
                  .filter((s) => Number(s.totalVariance) < 0)
                  .sort((a, b) => Number(a.totalVariance) - Number(b.totalVariance))
                  .slice(0, 8)
                  .map((s) => (
                    <li key={s.productId} className="flex items-center justify-between gap-3 px-5 py-2.5 text-sm">
                      <span className="text-[var(--text-primary)]">{s['product.name'] || `#${s.productId}`}</span>
                      <span className="flex items-center gap-3">
                        <span className="text-xs text-[var(--text-muted)]">{s.reconciliationCount} count{Number(s.reconciliationCount) === 1 ? '' : 's'}</span>
                        <VarianceBadge value={Number(s.totalVariance)} />
                      </span>
                    </li>
                  ))}
              </ul>
            </Panel>
          ) : null}
        </div>
      )}

      <Toast text={toast} />
    </div>
  );
}
