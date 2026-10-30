import { useEffect, useMemo, useState } from 'react';
import { fetchReports, fetchBestSelling, fetchCashierReport, fetchDashboardSummary, fetchSettings, fetchRangeReport, fetchReturns, fetchSales, downloadReceipt, exportSalesRows } from '../utils/api';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, CartesianGrid, AreaChart, Area, LineChart, Line, Legend } from 'recharts';
import { formatMoney } from '../utils/format';
import { tileEdge } from '../components/ui';

// Forest, brass and muted earth tones that read in light and dark mode.
const PALETTE = ['#2f6b4a', '#a07a35', '#c0634f', '#6b7f99', '#7a9a5b', '#8a6f9e', '#4f8f86', '#b8904a'];

function formatCompact(value) {
  const n = Number(value || 0);
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
}

function DeltaBadge({ value }) {
  const v = Number(value || 0);
  if (v === 0) return null;
  const positive = v > 0;
  return (
    <span className={`ml-2 inline-flex items-center gap-0.5 rounded-full px-2 py-0.5 text-[11px] font-semibold ${positive ? 'bg-[rgba(74,168,132,0.12)] text-[var(--success)]' : 'bg-[rgba(218,106,90,0.12)] text-[var(--danger)]'}`}>
      <svg viewBox="0 0 12 12" className={`h-3 w-3 ${positive ? '' : 'rotate-180'}`} fill="currentColor"><path d="M6 2l4 5H2z" /></svg>
      {Math.abs(v).toFixed(1)}%
    </span>
  );
}

function KPICard({ eyebrow, label, value, delta, icon }) {
  return (
    <div className={`app-panel rounded-2xl border p-4 sm:p-5 ${tileEdge()}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[13px] font-medium text-[var(--text-muted)]">{eyebrow}</p>
          <p className="num mt-2 whitespace-nowrap text-xl font-semibold tracking-tight text-[var(--text-primary)] xl:text-2xl">{value}</p>
          <p className="mt-1 flex items-center text-[13px] text-[var(--text-muted)]">
            {label}
            {delta !== undefined && <DeltaBadge value={delta} />}
          </p>
        </div>
        {icon && <div className="shrink-0 rounded-lg bg-[var(--surface-secondary)] p-1.5 text-[var(--text-muted)] [&>svg]:h-4 [&>svg]:w-4">{icon}</div>}
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action, className = '' }) {
  return (
    <section className={`app-panel rounded-2xl border ${className}`}>
      <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] px-5 py-4">
        <div className="min-w-0">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">{title}</h3>
          {subtitle && <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">{subtitle}</p>}
        </div>
        {action}
      </div>
      <div className="p-5">{children}</div>
    </section>
  );
}

function EmptyState({ title, message }) {
  return (
    <div className="flex flex-col items-center justify-center rounded-xl border border-dashed border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-12 text-center">
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-3 h-8 w-8 text-[var(--text-muted)]"><path d="M4 19h16M7 16V9m5 7V5m5 11v-3" /></svg>
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 max-w-xs text-xs text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

function ChartTooltip({ active, payload, label, currency, valueKey = 'value' }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="app-panel rounded-xl border px-4 py-3 shadow-xl">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      {payload.map((p, i) => (
        <p key={i} className="mt-1.5 text-sm font-semibold" style={{ color: p.color || 'var(--text-primary)' }}>
          {p.name && <span className="mr-1 text-[var(--text-muted)]">{p.name}:</span>}
          {currency ? formatMoney(currency, p.value) : Number(p.value).toLocaleString()}
        </p>
      ))}
    </div>
  );
}

function SkeletonCards({ count = 3 }) {
  return (
    <div className="grid gap-5 xl:grid-cols-3">
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} className="app-panel h-[26rem] animate-pulse rounded-2xl border" />
      ))}
    </div>
  );
}

export default function Reports() {
  const [dailySales, setDailySales] = useState([]);
  const [bestSelling, setBestSelling] = useState([]);
  const [cashierReport, setCashierReport] = useState([]);
  const [summary, setSummary] = useState(null);
  const [returns, setReturns] = useState([]);
  const [currency, setCurrency] = useState('UGX');
  const [loading, setLoading] = useState(true);
  const [rangeStart, setRangeStart] = useState('');
  const [rangeEnd, setRangeEnd] = useState('');
  const [rangeData, setRangeData] = useState(null);
  const [rangeLoading, setRangeLoading] = useState(false);
  const [allSales, setAllSales] = useState([]);
  const [receiptsLoaded, setReceiptsLoaded] = useState(false);
  const [receiptsLoading, setReceiptsLoading] = useState(false);
  const [receiptSearch, setReceiptSearch] = useState('');
  const [downloadingId, setDownloadingId] = useState(null);

  useEffect(() => {
    async function loadReports() {
      try {
        setLoading(true);
        const [salesData, productData, cashierData, summaryData, settings, returnsData] = await Promise.all([
          fetchReports(),
          fetchBestSelling(),
          fetchCashierReport(),
          fetchDashboardSummary(),
          fetchSettings(),
          fetchReturns().catch(() => []),
        ]);
        setDailySales(salesData);
        setBestSelling(productData);
        setCashierReport(cashierData);
        setSummary(summaryData);
        setReturns(returnsData);
        setCurrency(settings.currency || 'UGX');
      } catch (error) {
        console.error(error);
      } finally {
        setLoading(false);
      }
    }
    loadReports();
  }, []);

  /* ---------- derived data ---------- */
  const salesTimeline = useMemo(() => {
    if (!dailySales.length) return [];
    // Bucket by hour in chronological order, including quiet hours in
    // between, so the chart reads left-to-right as the day unfolds.
    const byHour = new Map();
    dailySales.forEach((sale) => {
      const hour = new Date(sale.createdAt).getHours();
      const bucket = byHour.get(hour) || { revenue: 0, orders: 0 };
      bucket.revenue += Number(sale.total || 0);
      bucket.orders += 1;
      byHour.set(hour, bucket);
    });
    const hours = [...byHour.keys()];
    const first = Math.min(...hours);
    const last = Math.max(...hours);
    const series = [];
    for (let hour = first; hour <= last; hour += 1) {
      const bucket = byHour.get(hour) || { revenue: 0, orders: 0 };
      series.push({ time: `${hour % 12 || 12}${hour < 12 ? 'am' : 'pm'}`, ...bucket });
    }
    return series;
  }, [dailySales]);

  const bestProductData = useMemo(
    () => bestSelling.slice(0, 6).map((item, i) => ({
      name: item.Product?.name || 'Item',
      units: Number(item.unitsold || 0),
      fill: PALETTE[i % PALETTE.length],
    })),
    [bestSelling]
  );

  const cashierData = useMemo(
    () => cashierReport.map((item, i) => ({
      name: item.cashier?.name || 'Cashier',
      revenue: Number(item.revenue || 0),
      sales: Number(item.salesCount || 0),
      color: PALETTE[i % PALETTE.length],
    })),
    [cashierReport]
  );

  const totalRevenue = useMemo(
    () => Number(summary?.periods?.today?.netSales || dailySales.reduce((sum, s) => sum + Number(s.total || 0), 0)),
    [dailySales, summary]
  );
  const totalProfit = useMemo(() => Number(summary?.periods?.today?.grossProfit || 0), [summary]);
  const itemsSold = useMemo(() => Number(summary?.periods?.today?.itemsSold || 0), [summary]);
  const averageSale = dailySales.length ? totalRevenue / dailySales.length : 0;

  const revenueComparison = summary?.comparisons?.todayVsYesterday?.netSales;
  const profitComparison = summary?.comparisons?.todayVsYesterday?.grossProfit;

  const totalRefunds = useMemo(() => returns.reduce((sum, r) => sum + Number(r.totalRefund || 0), 0), [returns]);

  /* ---------- receipt archive ---------- */
  const loadReceiptArchive = async (q = '') => {
    setReceiptsLoading(true);
    try {
      // Server-side search; the latest 100 matches are shown.
      const data = await fetchSales({ q, limit: 100 });
      setAllSales(Array.isArray(data) ? data : []);
      setReceiptsLoaded(true);
    } catch (e) {
      console.error(e);
    } finally {
      setReceiptsLoading(false);
    }
  };

  const handleDownloadReceipt = async (saleId) => {
    setDownloadingId(saleId);
    try {
      await downloadReceipt(saleId);
    } finally {
      setDownloadingId(null);
    }
  };

  useEffect(() => {
    if (!receiptsLoaded) return undefined;
    const handle = setTimeout(() => loadReceiptArchive(receiptSearch.trim()), 300);
    return () => clearTimeout(handle);
  }, [receiptSearch]);

  const filteredReceipts = allSales;

  /* ---------- range report ---------- */
  const runRangeReport = async () => {
    if (!rangeStart || !rangeEnd) return;
    setRangeLoading(true);
    try {
      const data = await fetchRangeReport(rangeStart, rangeEnd);
      setRangeData(data);
    } catch (e) {
      console.error(e);
    } finally {
      setRangeLoading(false);
    }
  };

  // Excel workbook: a summary sheet and one row per item sold, for the
  // accountant (profit per line, discounts, credit still owed).
  const [exporting, setExporting] = useState(false);
  const downloadExcel = async () => {
    if (!rangeStart || !rangeEnd) return;
    setExporting(true);
    try {
      const [{ rows, truncated }, { downloadWorkbook }] = await Promise.all([exportSalesRows(rangeStart, rangeEnd), import('../utils/spreadsheet')]);
      const m = rangeData?.metrics || {};
      const summary = [
        { item: 'Period', value: `${rangeStart} to ${rangeEnd}` },
        { item: 'Sales (orders)', value: Number(m.orderCount || 0) },
        { item: 'Gross sales', value: Number(m.grossSales || 0) },
        { item: 'Discounts', value: Number(m.discountTotal || 0) },
        { item: 'Refunds', value: Number(m.refundTotal || 0) },
        { item: 'Net sales', value: Number(m.netSales || 0) },
        { item: 'Gross profit', value: Number(m.grossProfit || 0) },
        { item: 'Sold on credit', value: Number(m.creditSales || 0) },
        { item: 'Credit collected', value: Number(m.creditCollected || 0) },
        ...(rangeData?.byPriceTier ? [
          { item: 'Retail sales', value: Number(rangeData.byPriceTier.retail?.total || 0) },
          { item: 'Wholesale sales', value: Number(rangeData.byPriceTier.wholesale?.total || 0) },
        ] : []),
        { item: 'Currency', value: currency },
        ...(truncated ? [{ item: 'Note', value: 'Only the first 50,000 lines are included. Export a shorter period for the rest.' }] : []),
      ];
      await downloadWorkbook(`sales-${rangeStart}-to-${rangeEnd}.xlsx`, [
        { name: 'Summary', columns: [{ header: 'Item', key: 'item', width: 22 }, { header: 'Value', key: 'value', width: 22, money: true }], rows: rangeData ? summary : summary.slice(0, 1).concat(summary.slice(-1)) },
        {
          name: 'Items sold',
          columns: [
            { header: 'Date', key: 'date', width: 18, date: true },
            { header: 'Receipt', key: 'receiptNumber', width: 12 },
            { header: 'Cashier', key: 'cashier', width: 16 },
            { header: 'Customer', key: 'customer', width: 20 },
            { header: 'Payment', key: 'paymentMethod', width: 13 },
            { header: 'Product', key: 'product', width: 30 },
            { header: 'Category', key: 'category', width: 16 },
            { header: 'Qty', key: 'quantity', width: 7 },
            { header: 'List price', key: 'listPrice', width: 12, money: true },
            { header: 'Price charged', key: 'price', width: 13, money: true },
            { header: 'Line total', key: 'lineTotal', width: 13, money: true },
            { header: 'Line cost', key: 'lineCost', width: 12, money: true },
            { header: 'Line profit', key: 'lineProfit', width: 12, money: true },
            { header: 'Still owed on sale', key: 'balanceDue', width: 16, money: true },
          ],
          rows: rows.map((r) => ({
            ...r,
            date: new Date(r.date),
            customer: r.customer || 'Walk-in',
            quantity: Number(r.quantity),
            listPrice: Number(r.listPrice),
            price: Number(r.price),
            lineTotal: Number(r.lineTotal),
            lineCost: Number(r.lineCost),
            lineProfit: Number(r.lineTotal) - Number(r.lineCost),
            balanceDue: Number(r.balanceDue) || '',
          })),
        },
      ]);
    } catch (e) {
      window.alert(e.message);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-5">
      {/* ---------- KPI strip ---------- */}
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        <KPICard
          eyebrow="Revenue"
          label="Today's net sales"
          value={formatMoney(currency, totalRevenue)}
          delta={revenueComparison?.percentChange}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" /></svg>}
        />
        <KPICard
          eyebrow="Profit"
          label="Gross profit"
          value={formatMoney(currency, totalProfit)}
          delta={profitComparison?.percentChange}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M22 12h-4l-3 9L9 3l-3 9H2" /></svg>}
        />
        <KPICard
          eyebrow="Orders"
          label="Transactions today"
          value={dailySales.length.toLocaleString()}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V7a2 2 0 0 0-2-2h-2" /><rect x="9" y="3" width="6" height="4" rx="1" /></svg>}
        />
        <KPICard
          eyebrow="Avg Sale"
          label="Per transaction"
          value={formatMoney(currency, averageSale)}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M16 8v8m-8-4v4m4-6v6" /></svg>}
        />
        <KPICard
          eyebrow="Refunds"
          label={`${returns.length} return${returns.length !== 1 ? 's' : ''} processed`}
          value={returns.length ? `−${formatMoney(currency, totalRefunds)}` : formatMoney(currency, 0)}
          icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M9 14l-4-4 4-4" /><path d="M5 10h11a4 4 0 0 1 0 8h-1" /></svg>}
        />
      </div>

      {loading ? <SkeletonCards /> : (
        <>
          {/* ---------- Row 1: Sales Timeline + Best Selling ---------- */}
          <div className="grid gap-5 xl:grid-cols-5">
            <SectionCard
              className="xl:col-span-3"
              title="Sales Activity"
              subtitle="Revenue flow by hour for today's transactions."
              action={<span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)]">{dailySales.length} sales</span>}
            >
              {salesTimeline.length ? (
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTimeline}>
                      <defs>
                        <linearGradient id="salesGrad" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity={0.25} />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity={0} />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border-default)" strokeDasharray="4 4" />
                      <XAxis dataKey="time" stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatCompact} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#salesGrad)" dot={{ r: 4, fill: 'var(--chart-1)', strokeWidth: 0 }} activeDot={{ r: 6 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
              ) : (
                <EmptyState title="No sales yet today" message="Revenue flow will populate as transactions are recorded." />
              )}
            </SectionCard>

            <SectionCard
              className="xl:col-span-2"
              title="Top Products"
              subtitle="Best sellers by units sold."
              action={<span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)]">Top {bestProductData.length}</span>}
            >
              {bestProductData.length ? (
                <>
                  <div className="h-48">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie data={bestProductData} dataKey="units" nameKey="name" innerRadius={45} outerRadius={75} paddingAngle={3} strokeWidth={0}>
                          {bestProductData.map((e) => <Cell key={e.name} fill={e.fill} />)}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="mt-2 space-y-1.5">
                    {bestProductData.map((item, i) => (
                      <div key={item.name} className="flex items-center gap-3 rounded-[0.9rem] px-3 py-2 transition hover:bg-[var(--surface-secondary)]">
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.fill }} />
                        <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]">{item.name}</span>
                        <span className="text-[13px] font-semibold tabular-nums text-[var(--text-muted)]">{item.units}</span>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState title="No product data" message="Sell products to see top performers." />
              )}
            </SectionCard>
          </div>

          {/* ---------- Row 2: Revenue by Cashier (Line + breakdown) ---------- */}
          <SectionCard
            title="Revenue by Cashier"
            subtitle="Compare each team member's sales contribution. Bar shows total revenue; table shows breakdown."
            action={<span className="rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)]">{cashierData.length} cashier{cashierData.length !== 1 ? 's' : ''}</span>}
          >
            {cashierData.length ? (
              <div className="grid gap-6 xl:grid-cols-2">
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={cashierData} barCategoryGap="20%">
                      <defs>
                        {cashierData.map((c, i) => (
                          <linearGradient key={c.name} id={`cashGrad${i}`} x1="0" x2="0" y1="0" y2="1">
                            <stop offset="0%" stopColor={c.color} stopOpacity={0.9} />
                            <stop offset="100%" stopColor={c.color} stopOpacity={0.5} />
                          </linearGradient>
                        ))}
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--border-default)" strokeDasharray="4 4" />
                      <XAxis dataKey="name" stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--text-muted)" tickLine={false} axisLine={false} tick={{ fontSize: 11 }} tickFormatter={formatCompact} />
                      <Tooltip content={<ChartTooltip currency={currency} />} />
                      <Bar dataKey="revenue" name="Revenue" radius={[8, 8, 3, 3]} maxBarSize={48}>
                        {cashierData.map((c, i) => <Cell key={c.name} fill={`url(#cashGrad${i})`} />)}
                      </Bar>
                    </BarChart>
                  </ResponsiveContainer>
                </div>
                <div className="space-y-2">
                  <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
                    <table className="table-cards w-full text-[13px]">
                      <thead>
                        <tr className="text-[10px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)] bg-[var(--surface-secondary)]">
                          <th className="px-4 py-2.5 text-left">#</th>
                          <th className="px-4 py-2.5 text-left">Cashier</th>
                          <th className="px-4 py-2.5 text-right">Sales</th>
                          <th className="px-4 py-2.5 text-right">Revenue</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-[var(--border-default)]">
                        {cashierData.map((c, i) => (
                          <tr key={c.name} className="transition">
                            <td data-label="Rank" className="px-4 py-2.5">
                              <span className="flex h-6 w-6 items-center justify-center rounded-full text-[10px] font-bold text-white" style={{ backgroundColor: c.color }}>{i + 1}</span>
                            </td>
                            <td data-label="Cashier" className="px-4 py-2.5 font-medium text-[var(--text-primary)]">{c.name}</td>
                            <td data-label="Sales" className="px-4 py-2.5 text-right tabular-nums text-[var(--text-muted)]">{c.sales}</td>
                            <td data-label="Revenue" className="px-4 py-2.5 text-right font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(currency, c.revenue)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              </div>
            ) : (
              <EmptyState title="No cashier data yet" message="Revenue by cashier appears after sales are recorded." />
            )}
          </SectionCard>

          {/* ---------- Row 3: Returns / Refunds ---------- */}
          {returns.length > 0 && (
            <SectionCard
              title="Returns & Refunds"
              subtitle="All processed returns with refund amounts. Full details available on the Returns page."
              action={<span className="rounded-full bg-[rgba(218,106,90,0.12)] px-3 py-1 text-[12px] font-semibold text-[var(--danger)]">−{formatMoney(currency, totalRefunds)}</span>}
            >
              <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
                <table className="table-cards w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)]">
                      {['Date', 'Sale #', 'Items', 'Refund', 'Reason', 'By'].map((h) => (
                        <th key={h} className="px-4 py-2.5 text-left text-xs font-medium text-[var(--text-muted)]">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {returns.slice(0, 10).map((ret) => (
                      <tr key={ret.id} className="transition hover:bg-[var(--surface-secondary)]">
                        <td data-label="Date" className="whitespace-nowrap px-4 py-2.5 text-xs text-[var(--text-muted)]">{new Date(ret.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</td>
                        <td data-label="Sale #" className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">#{ret.saleId}</td>
                        <td data-label="Items" className="px-4 py-2.5 text-[var(--text-secondary)]">{ret.items?.map((it) => `${it.product?.name || 'Item'} ×${it.quantity}`).join(', ') || '-'}</td>
                        <td data-label="Refund" className="px-4 py-2.5 font-semibold tabular-nums text-[var(--danger)]">−{formatMoney(currency, ret.totalRefund)}</td>
                        <td data-label="Reason" className="px-4 py-2.5 text-[var(--text-muted)]">{ret.reason || '-'}</td>
                        <td data-label="By" className="px-4 py-2.5 text-[var(--text-secondary)]">{ret.processedBy?.name || '-'}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </SectionCard>
          )}
        </>
      )}

      {/* ---------- Date Range Report ---------- */}
      <section className="app-panel rounded-2xl border">
        <div className="border-b border-[var(--border-default)] px-5 py-4">
          <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">Custom Date Range</h3>
          <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Generate a detailed report for any period, and export every item sold to Excel.</p>
        </div>
        <div className="flex flex-wrap items-end gap-3 px-5 py-4">
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">From</label>
            <input type="date" value={rangeStart} onChange={(e) => setRangeStart(e.target.value)} className="app-input rounded-[0.9rem] border px-3 py-2 text-sm" />
          </div>
          <div className="flex flex-col gap-1">
            <label className="text-[11px] font-semibold uppercase tracking-widest text-[var(--text-muted)]">To</label>
            <input type="date" value={rangeEnd} onChange={(e) => setRangeEnd(e.target.value)} className="app-input rounded-[0.9rem] border px-3 py-2 text-sm" />
          </div>
          <button type="button" onClick={runRangeReport} disabled={!rangeStart || !rangeEnd || rangeLoading} className="app-btn-primary rounded-[0.9rem] px-4 py-2 text-sm font-medium disabled:opacity-50">
            {rangeLoading ? 'Loading…' : 'Run Report'}
          </button>
          <button type="button" onClick={downloadExcel} disabled={!rangeStart || !rangeEnd || exporting} className="app-btn-secondary flex items-center gap-2 rounded-[0.9rem] border px-4 py-2 text-sm font-medium disabled:opacity-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 text-emerald-600"><rect x="3" y="3" width="18" height="18" rx="2" /><path d="M3 9h18M3 15h18M9 3v18" /></svg>
            {exporting ? 'Preparing…' : 'Export to Excel'}
          </button>
        </div>

        {rangeData && (
          <div className="space-y-5 border-t border-[var(--border-default)] px-5 py-5">
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              {[
                { label: 'Sales', value: (rangeData.metrics?.orderCount || 0).toLocaleString() },
                { label: 'Revenue', value: formatMoney(currency, rangeData.metrics?.netSales) },
                { label: 'Gross Profit', value: formatMoney(currency, rangeData.metrics?.grossProfit) },
                { label: 'Expenses', value: formatMoney(currency, rangeData.totalExpenses) },
              ].map((m) => (
                <div key={m.label} className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                  <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">{m.label}</p>
                  <p className="mt-2 text-xl font-bold text-[var(--text-primary)]">{m.value}</p>
                </div>
              ))}
            </div>

            {(() => {
              const revenue = Number(rangeData.metrics?.netSales || 0);
              const expenses = Number(rangeData.totalExpenses || 0);
              const grossProfit = Number(rangeData.metrics?.grossProfit || 0);
              const netProfit = grossProfit - expenses;
              const grossMargin = revenue > 0 ? ((grossProfit / revenue) * 100).toFixed(1) : '0.0';
              const netMargin = revenue > 0 ? ((netProfit / revenue) * 100).toFixed(1) : '0.0';
              return (
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Gross Margin</p>
                    <p className="mt-2 text-2xl font-bold text-[var(--text-primary)]">{grossMargin}%</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Revenue minus cost of goods sold</p>
                  </div>
                  <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Net Profit</p>
                    <p className={`mt-2 text-2xl font-bold ${netProfit >= 0 ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>{formatMoney(currency, netProfit)}</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Gross profit minus expenses · {netMargin}% margin</p>
                  </div>
                </div>
              );
            })()}

            {rangeData.byPriceTier?.wholesale?.orders > 0 ? (() => {
              const { retail, wholesale } = rangeData.byPriceTier;
              const all = (retail.total || 0) + (wholesale.total || 0);
              const share = all > 0 ? Math.round((wholesale.total / all) * 100) : 0;
              return (
                <div className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] p-4">
                  <div className="flex items-baseline justify-between gap-3">
                    <p className="text-[10px] font-bold uppercase tracking-widest text-[var(--text-muted)]">Retail vs wholesale</p>
                    <p className="text-xs text-[var(--text-muted)]">{share}% wholesale</p>
                  </div>
                  <div className="mt-3 flex h-2.5 overflow-hidden rounded-full bg-[var(--surface-tertiary)]" aria-hidden="true">
                    <span className="bg-[var(--accent)]" style={{ width: `${100 - share}%` }} />
                    <span className="bg-[var(--chart-2)]" style={{ width: `${share}%` }} />
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
                    <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--accent)]" />Retail <span className="num block font-semibold text-[var(--text-primary)]">{formatMoney(currency, retail.total)}</span><span className="text-xs text-[var(--text-muted)]">{retail.orders.toLocaleString()} sales</span></p>
                    <p><span className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[var(--chart-2)]" />Wholesale <span className="num block font-semibold text-[var(--text-primary)]">{formatMoney(currency, wholesale.total)}</span><span className="text-xs text-[var(--text-muted)]">{wholesale.orders.toLocaleString()} sales</span></p>
                  </div>
                </div>
              );
            })() : null}

            {rangeData.sales?.length > 0 && (
              <div className="overflow-hidden rounded-xl border border-[var(--border-default)]">
                <div className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2.5">
                  <p className="text-[13px] font-semibold text-[var(--text-primary)]">Sales in range <span className="ml-1 text-xs font-normal text-[var(--text-muted)]">{rangeData.salesTruncated ? `latest ${rangeData.sales.length.toLocaleString()} of ${(rangeData.metrics?.orderCount || 0).toLocaleString()}` : `${rangeData.sales.length} transactions`}</span></p>
                </div>
                <div className="overflow-x-auto">
                  <table className="table-cards w-full text-sm">
                    <thead>
                      <tr className="border-b border-[var(--border-default)] text-left">
                        {['ID', 'Date', 'Customer', 'Cashier', 'Payment', 'Total'].map((h) => (
                          <th key={h} className="px-4 py-2.5 text-xs font-medium text-[var(--text-muted)]">{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-[var(--border-default)]">
                      {rangeData.sales.map((sale) => (
                        <tr key={sale.id} className="transition hover:bg-[var(--surface-secondary)]">
                          <td data-label="ID" className="px-4 py-2.5 font-mono text-xs text-[var(--text-muted)]">#{sale.id}</td>
                          <td data-label="Date" className="px-4 py-2.5 text-[var(--text-secondary)]">{new Date(sale.createdAt).toLocaleDateString()}</td>
                          <td data-label="Customer" className="px-4 py-2.5 text-[var(--text-primary)]">{sale.customer?.name || 'Walk-in'}</td>
                          <td data-label="Cashier" className="px-4 py-2.5 text-[var(--text-secondary)]">{sale.cashier?.name || '-'}</td>
                          <td data-label="Payment" className="px-4 py-2.5">
                            <span className="inline-block rounded-full bg-[var(--surface-secondary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-secondary)]">{sale.paymentMethod}</span>
                          </td>
                          <td data-label="Total" className="px-4 py-2.5 font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(currency, sale.total)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </section>

      {/* ---------- Receipt Archive ---------- */}
      <section className="app-panel rounded-2xl border">
        <div className="flex items-start justify-between gap-4 border-b border-[var(--border-default)] px-5 py-4">
          <div>
            <h3 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)]">Receipt Archive</h3>
            <p className="mt-0.5 text-[13px] text-[var(--text-muted)]">Download a PDF receipt for any past sale. Click a row or use the download button.</p>
          </div>
          {!receiptsLoaded ? (
            <button
              type="button"
              onClick={() => loadReceiptArchive()}
              disabled={receiptsLoading}
              className="app-btn-primary flex shrink-0 items-center gap-2 rounded-[0.9rem] px-4 py-2 text-sm font-medium disabled:opacity-60"
            >
              {receiptsLoading ? (
                <span className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 12a9 9 0 1 0 18 0 9 9 0 0 0-18 0"/><path d="M12 8v4l3 3"/></svg>
              )}
              {receiptsLoading ? 'Loading…' : 'Load Sales'}
            </button>
          ) : (
            <span className="shrink-0 rounded-full bg-[var(--surface-secondary)] px-3 py-1 text-[12px] font-semibold text-[var(--text-muted)]">
              {filteredReceipts.length === 100 ? 'Latest 100 matches' : `${filteredReceipts.length} sales`}
            </span>
          )}
        </div>

        {!receiptsLoaded && !receiptsLoading ? (
          <div className="flex flex-col items-center justify-center px-4 py-14 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[var(--surface-secondary)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-7 w-7 text-[var(--text-muted)]"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/></svg>
            </div>
            <p className="mt-3 font-semibold text-[var(--text-primary)]">Receipt archive not loaded</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Click "Load Sales" to browse all past transactions and download receipts.</p>
          </div>
        ) : receiptsLoading ? (
          <div className="space-y-2 p-5">
            {Array.from({ length: 5 }).map((_, i) => (
              <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--surface-secondary)]" />
            ))}
          </div>
        ) : (
          <div className="p-5">
            <div className="relative mb-4">
              <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3.5 text-[var(--text-muted)]">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="11" cy="11" r="7"/><path d="m21 21-4.35-4.35"/></svg>
              </div>
              <input
                type="text"
                placeholder="Search by ID, customer, cashier or payment method…"
                value={receiptSearch}
                onChange={(e) => setReceiptSearch(e.target.value)}
                className="app-input w-full rounded-[0.9rem] border py-2 pl-10 pr-4 text-sm"
              />
            </div>
            {filteredReceipts.length === 0 ? (
              <div className="py-8 text-center text-sm text-[var(--text-muted)]">No sales match your search.</div>
            ) : (
              <div className="overflow-x-auto rounded-xl border border-[var(--border-default)]">
                <table className="table-cards w-full text-sm">
                  <thead>
                    <tr className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)]">
                      {['Receipt #', 'Date', 'Customer', 'Cashier', 'Payment', 'Total', ''].map((h, i) => (
                        <th key={i} className={`px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] text-[var(--text-muted)] ${i === 5 ? 'text-right' : 'text-left'}`}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-[var(--border-default)]">
                    {filteredReceipts.slice(0, 100).map((sale) => (
                      <tr key={sale.id} className=" transition hover:bg-[var(--surface-secondary)]">
                        <td data-label="Receipt" className="px-4 py-3">
                          <span className="font-mono text-xs font-semibold text-[var(--text-secondary)]">
                            {sale.receipt?.receiptNumber || `SD-${String(sale.id).padStart(6, '0')}`}
                          </span>
                        </td>
                        <td data-label="Date" className="whitespace-nowrap px-4 py-3">
                          <p className="text-xs text-[var(--text-secondary)]">{new Date(sale.createdAt).toLocaleDateString([], { dateStyle: 'medium' })}</p>
                          <p className="text-[11px] text-[var(--text-muted)]">{new Date(sale.createdAt).toLocaleTimeString([], { timeStyle: 'short' })}</p>
                        </td>
                        <td data-label="Customer" className="px-4 py-3 font-medium text-[var(--text-primary)]">{sale.customer?.name || 'Walk-in'}</td>
                        <td data-label="Cashier" className="px-4 py-3 text-[var(--text-secondary)]">{sale.cashier?.name || '-'}</td>
                        <td data-label="Payment" className="px-4 py-3">
                          <span className="inline-flex items-center rounded-full bg-[var(--surface-secondary)] px-2.5 py-0.5 text-[11px] font-semibold text-[var(--text-muted)]">{sale.paymentMethod}</span>
                        </td>
                        <td data-label="Total" className="px-4 py-3 text-right font-semibold tabular-nums text-[var(--text-primary)]">{formatMoney(currency, sale.total)}</td>
                        <td data-label="PDF" className="px-4 py-3">
                          <button
                            type="button"
                            onClick={() => handleDownloadReceipt(sale.id)}
                            disabled={downloadingId === sale.id}
                            className="app-btn-secondary flex items-center gap-1.5 rounded-[0.7rem] border px-3 py-1.5 text-xs font-medium transition hover:border-[var(--accent)] hover:text-[var(--accent)] disabled:opacity-50"
                          >
                            {downloadingId === sale.id ? (
                              <span className="h-3 w-3 animate-spin rounded-full border-2 border-[var(--accent)] border-t-transparent" />
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-3.5 w-3.5"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
                            )}
                            PDF
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}
      </section>
    </div>
  );
}
