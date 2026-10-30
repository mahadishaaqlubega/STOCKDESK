import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { fetchBestSelling, fetchCreditSummary, fetchDashboardStats, fetchDashboardSummary, fetchSales } from '../utils/api';
import { getUser } from '../utils/auth';
import { formatMoney } from '../utils/format';
import { IconChip, tileEdge } from '../components/ui';

// "▲ 12%" / "▼ 8%" against the previous period, from the summary's comparisons.
function Trend({ comparison }) {
  if (!comparison || (!comparison.current && !comparison.previous)) return null;
  const pct = Math.round(Number(comparison.percentChange || 0));
  const up = pct >= 0;
  return (
    <span className={`num font-semibold ${up ? 'text-[var(--success)]' : 'text-[var(--danger)]'}`}>
      {up ? '▲' : '▼'} {Math.abs(pct)}%
    </span>
  );
}

function StatCard({ title, value, helper, tone = 'default', icon, eyebrow, trend, to }) {
  const valueClass = {
    default: 'text-[var(--text-primary)]',
    success: 'text-[var(--success)]',
    danger: 'text-[var(--danger)]',
    warning: 'text-[var(--warning)]',
  }[tone];

  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">{eyebrow}</p>
          <p className="mt-0.5 truncate text-[12.5px] font-medium text-[var(--text-secondary)]">{title}</p>
        </div>
        <IconChip tone={tone} size="sm">{icon}</IconChip>
      </div>
      <p className={`num mt-1.5 break-words text-[1.05rem] font-bold leading-tight tracking-tight sm:text-[1.15rem] ${valueClass}`}>{value}</p>
      <p className="mt-0.5 truncate text-[11.5px] leading-4 text-[var(--text-muted)]" title={helper}>
        {trend ? <><Trend comparison={trend} />{' '}</> : null}
        {helper}
      </p>
    </>
  );

  const className = `app-panel relative block overflow-hidden rounded-[1.1rem] border p-3 transition duration-200 hover:shadow-lg sm:p-3.5 ${tileEdge(tone)}`;
  return to ? <Link to={to} className={className}>{body}</Link> : <div className={className}>{body}</div>;
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <section className="app-panel flex h-full flex-col rounded-[1.2rem] border p-3.5 sm:p-4">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] pb-2.5">
        <div className="min-w-0">
          <h2 className="text-[15px] font-semibold tracking-tight text-[var(--text-primary)] sm:text-base">{title}</h2>
          <p className="mt-0.5 text-xs leading-4 text-[var(--text-muted)]">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-3 flex flex-1 flex-col">{children}</div>
    </section>
  );
}

function SkeletonCard() {
  return <div className="app-panel-soft h-[6.25rem] animate-pulse rounded-lg border p-4" />;
}

function EmptyState({ title, message }) {
  return (
    <div className="app-panel-soft rounded-lg border border-dashed px-4 py-5 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-1 text-xs leading-5 text-[var(--text-muted)]">{message}</p>
    </div>
  );
}

function MiniStat({ label, value }) {
  return (
    <div className={`app-panel-soft min-w-0 rounded-[0.85rem] border px-3 py-2 ${tileEdge()}`}>
      <p className="text-[10px] font-semibold uppercase leading-tight tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
      <p className="num mt-0.5 break-words text-[13px] font-semibold leading-tight text-[var(--text-primary)] sm:text-[15px]">{value}</p>
    </div>
  );
}

function SummaryTile({ label, value, tone = 'default', small }) {
  const color = { default: 'text-[var(--text-primary)]', success: 'text-[var(--success)]', danger: 'text-[var(--danger)]', warning: 'text-[var(--warning)]' }[tone];
  return (
    <div className={`app-panel-soft min-w-0 rounded-[0.85rem] border px-3 py-2 ${tileEdge(tone)}`}>
      <p className="text-[11px] font-medium leading-tight text-[var(--text-muted)]">{label}</p>
      <p className={`num mt-0.5 break-words font-semibold leading-tight ${small ? 'text-[13px]' : 'text-lg'} ${color}`}>{value}</p>
    </div>
  );
}

function SalesTooltip({ active, payload, label, currency }) {
  if (!active || !payload?.length) {
    return null;
  }

  return (
    <div className="app-panel min-w-[160px] rounded-2xl border px-4 py-3 shadow-xl">
      <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
      <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, payload[0].value)}</p>
      <p className="mt-1 text-xs text-[var(--text-muted)]">Net sales recorded for the day</p>
    </div>
  );
}

export default function Dashboard() {
  const user = getUser();
  const [dashboardStats, setDashboardStats] = useState(null);
  const [bestSelling, setBestSelling] = useState([]);
  const [summary, setSummary] = useState(null);
  const [credit, setCredit] = useState(null);
  const [recentSales, setRecentSales] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState([]);

  useEffect(() => {
    async function loadStats() {
      const errors = [];
      const [statsResult, bestResult, summaryResult, creditResult, recentResult] = await Promise.allSettled([
        fetchDashboardStats(),
        fetchBestSelling(),
        fetchDashboardSummary(),
        fetchCreditSummary(),
        fetchSales({ limit: 15 }),
      ]);

      // Recent sales fill the rest of the snapshot panel; optional like credit.
      if (recentResult.status === 'fulfilled') {
        const list = recentResult.value;
        setRecentSales(Array.isArray(list) ? list : list?.rows || list?.sales || []);
      }

      // Credit is supplementary; a failure here should not alarm the user.
      if (creditResult.status === 'fulfilled') {
        setCredit(creditResult.value);
      }

      if (statsResult.status === 'fulfilled') {
        setDashboardStats(statsResult.value);
      } else {
        console.error('Dashboard stats failed:', statsResult.reason);
        errors.push('Stats: ' + (statsResult.reason?.message || 'Unknown error'));
      }

      if (bestResult.status === 'fulfilled') {
        setBestSelling(bestResult.value);
      } else {
        console.error('Best selling failed:', bestResult.reason);
        errors.push('Best Selling: ' + (bestResult.reason?.message || 'Unknown error'));
      }

      if (summaryResult.status === 'fulfilled') {
        setSummary(summaryResult.value);
      } else {
        console.error('Dashboard summary failed:', summaryResult.reason);
        errors.push('Summary: ' + (summaryResult.reason?.message || 'Unknown error'));
      }

      if (errors.length) setLoadErrors(errors);
      setLoading(false);
    }
    loadStats();
  }, []);

  const currency = summary?.periods?.thisMonth?.netSales !== undefined ? (user?.shop?.currency || 'UGX') : 'UGX';
  const totalProducts = dashboardStats?.products?.totalProducts || 0;
  const totalStock = dashboardStats?.products?.totalStock || 0;
  const lowStockCount = dashboardStats?.products?.lowStockCount || 0;
  const outOfStockCount = dashboardStats?.products?.outOfStockCount || 0;
  const todaysSales = Number(summary?.periods?.today?.orderCount || 0);
  const totalRevenue = Number(summary?.periods?.thisMonth?.netSales || 0);
  const totalProfit = Number(summary?.periods?.thisMonth?.grossProfit || 0);

  const salesTrend = useMemo(() => {
    const today = new Date();
    const days = [];
    for (let index = 6; index >= 0; index -= 1) {
      const date = new Date(today);
      date.setHours(0, 0, 0, 0);
      date.setDate(today.getDate() - index);
      days.push({
        key: date.toISOString().slice(0, 10),
        label: date.toLocaleDateString([], { weekday: 'short' }),
        sales: 0,
      });
    }
    const dayMap = new Map(days.map((day) => [day.key, day]));
    (dashboardStats?.salesTrend || []).forEach((row) => {
      const bucket = dayMap.get(row.day);
      if (bucket) bucket.sales = Number(row.sales || 0);
    });
    return days;
  }, [dashboardStats]);

  const bestProductData = useMemo(
    () => bestSelling.slice(0, 6).map((item) => ({
      name: item.Product?.name || 'Item',
      value: Number(item.unitsold || 0),
    })),
    [bestSelling]
  );
  const todayRevenue = Number(summary?.periods?.today?.netSales || 0);
  const weeklySalesTotal = useMemo(() => salesTrend.reduce((sum, item) => sum + Number(item.sales || 0), 0), [salesTrend]);
  const weeklyAverageSales = salesTrend.length ? weeklySalesTotal / salesTrend.length : 0;
  const topProductsPreview = bestProductData.slice(0, 6);
  const bestDay = salesTrend.length ? salesTrend.reduce((best, current) => (current.sales > best.sales ? current : best), salesTrend[0]).label : '-';

  const monthTrend = summary?.comparisons?.thisMonthVsLastMonth;
  const noSalesThisWeek = salesTrend.every((item) => item.sales === 0);
  const hasAlerts = credit?.totalOutstanding > 0 || outOfStockCount > 0 || lowStockCount > 0;

  return (
    // On laptop and desktop the dashboard fills the window: the bottom row
    // stretches so the chart and snapshot use the space below them.
    <div className="space-y-3 xl:flex xl:flex-1 xl:flex-col xl:gap-3 xl:space-y-0">
      {/* Error banner */}
      {!loading && loadErrors.length > 0 && (
        <div className="rounded-2xl border border-red-400/30 bg-red-400/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">Some dashboard data failed to load</p>
          {loadErrors.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{err}</p>
          ))}
          <p className="mt-2 text-xs text-red-600/60 dark:text-red-400/60">Check the browser console for full details.</p>
        </div>
      )}

      {/* Alerts: money owed and stock, one slim row */}
      {!loading && hasAlerts && (
        <div className={`grid gap-2 ${credit?.totalOutstanding > 0 && (outOfStockCount > 0 || lowStockCount > 0) ? 'md:grid-cols-2' : ''}`}>
          {credit?.totalOutstanding > 0 && (
            <Link to="/app/customers" className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-slate-400/30 bg-slate-400/10 px-3.5 py-2 transition hover:bg-slate-400/15">
              <p className="min-w-0 truncate text-[13px] text-slate-700 dark:text-slate-300">
                <strong className="font-semibold">
                  {credit.debtorCount === 1 ? '1 customer owes' : `${credit.debtorCount} customers owe`} {formatMoney(currency, credit.totalOutstanding)}
                </strong>
                {credit.totalOverdue > 0 ? ` · ${formatMoney(currency, credit.totalOverdue)} overdue` : ' · nothing overdue'}
                {Number(summary?.periods?.today?.creditCollected || 0) > 0
                  ? ` · collected today ${formatMoney(currency, summary.periods.today.creditCollected)}`
                  : ''}
              </p>
              <span className="shrink-0 text-xs font-semibold text-slate-700 dark:text-slate-300">View who owes →</span>
            </Link>
          )}
          {(outOfStockCount > 0 || lowStockCount > 0) && (
            <Link to="/app/products" className="flex min-w-0 items-center justify-between gap-3 rounded-xl border border-amber-400/30 bg-amber-400/10 px-3.5 py-2 transition hover:bg-amber-400/15">
              <p className="min-w-0 truncate text-[13px] text-amber-700 dark:text-amber-300">
                {outOfStockCount > 0 ? <strong className="font-semibold">{outOfStockCount.toLocaleString()} out of stock</strong> : null}
                {outOfStockCount > 0 && lowStockCount > 0 ? ' · ' : ''}
                {lowStockCount > 0 ? `${lowStockCount.toLocaleString()} at or below reorder level` : ''}
              </p>
              <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">Review stock →</span>
            </Link>
          )}
        </div>
      )}

      {loading ? (
        <>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
          <div className="grid gap-3 xl:grid-cols-[1.55fr_0.95fr]">
            <div className="app-panel-soft h-[23rem] animate-pulse rounded-lg border" />
            <div className="app-panel-soft h-[23rem] animate-pulse rounded-lg border" />
          </div>
        </>
      ) : (
        <>
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 xl:grid-cols-6">
            <StatCard
              eyebrow="Inventory"
              title="Total Products"
              value={totalProducts.toLocaleString()}
              helper="Products in catalog"
              to="/app/products"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></svg>}
            />
            <StatCard
              eyebrow="Stock Level"
              title="Total Stock"
              value={totalStock.toLocaleString()}
              helper="Units available for sale"
              to="/app/products"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v10H4z" /><path d="M8 11h8" /></svg>}
            />
            <StatCard
              eyebrow="Daily Activity"
              title="Today's Orders"
              value={todaysSales.toLocaleString()}
              helper={`${formatMoney(currency, todayRevenue)} sold today`}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-2" /></svg>}
            />
            <StatCard
              eyebrow="Revenue"
              title="Total Revenue"
              value={formatMoney(currency, totalRevenue)}
              helper={monthTrend?.netSales?.previous ? 'vs last month' : 'This month net sales'}
              trend={monthTrend?.netSales?.previous ? monthTrend.netSales : null}
              tone="success"
              to="/app/reports"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            />
            <StatCard
              eyebrow="Profit"
              title="Gross Profit"
              value={formatMoney(currency, totalProfit)}
              helper={totalRevenue > 0 ? `${Math.round((totalProfit / totalRevenue) * 100)}% margin this month` : 'This month estimated'}
              trend={monthTrend?.grossProfit?.previous ? monthTrend.grossProfit : null}
              tone="warning"
              to="/app/reports"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 16l5-5 4 4 7-8" /><path d="M14 7h6v6" /></svg>}
            />
            <StatCard
              eyebrow="Attention"
              title="Low Stock Items"
              value={lowStockCount.toLocaleString()}
              helper={outOfStockCount > 0 ? `${outOfStockCount.toLocaleString()} of them out of stock` : 'Below safe stock level'}
              tone="danger"
              to="/app/products"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>}
            />
          </section>

          <section className="grid gap-3 xl:flex-1 xl:grid-cols-[1.55fr_0.95fr]">
            <SectionCard
              title="Sales Overview"
              subtitle="Net sales across the last 7 days."
              action={<div className="num shrink-0 rounded-[0.85rem] bg-[var(--accent-soft)] px-2.5 py-1.5 text-[13px] font-medium text-[var(--accent-strong)]">Today: {formatMoney(currency, todayRevenue)}</div>}
            >
              <div className="mb-3 grid grid-cols-3 gap-2">
                <MiniStat label="7-Day Total" value={formatMoney(currency, weeklySalesTotal)} />
                <MiniStat label="Daily Average" value={formatMoney(currency, weeklyAverageSales)} />
                <MiniStat label="Best Day" value={noSalesThisWeek ? '-' : bestDay} />
              </div>
              <div className="relative h-56 xl:h-auto xl:min-h-[14rem] xl:flex-1 2xl:min-h-[19rem]">
                <div className="absolute inset-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <AreaChart data={salesTrend} margin={{ top: 6, right: 8, bottom: 0, left: 0 }}>
                      <defs>
                        <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                          <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.25" />
                          <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
                        </linearGradient>
                      </defs>
                      <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                      <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} />
                      <YAxis width={44} tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={11} tickFormatter={(value) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value)} />
                      <Tooltip cursor={{ stroke: 'var(--chart-1)', strokeWidth: 1, strokeDasharray: '4 2' }} content={<SalesTooltip currency={currency} />} />
                      <Area type="monotone" dataKey="sales" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#salesGradient)" dot={false} activeDot={{ r: 5, fill: 'var(--chart-1)', strokeWidth: 0 }} />
                    </AreaChart>
                  </ResponsiveContainer>
                </div>
                {noSalesThisWeek ? (
                  <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
                    <div className="app-panel rounded-xl border px-4 py-2.5 text-center shadow-sm">
                      <p className="text-sm font-medium text-[var(--text-primary)]">No sales yet</p>
                      <p className="mt-0.5 text-xs text-[var(--text-muted)]">Sales recorded this week will appear here.</p>
                    </div>
                  </div>
                ) : null}
              </div>
            </SectionCard>

            <SectionCard
              title="Operations Snapshot"
              subtitle="Top products, and inventory health in one compact view."
              action={<div className="app-panel-soft num shrink-0 rounded-[0.85rem] border px-2.5 py-1.5 text-[13px] text-[var(--text-muted)]">{Number(summary?.periods?.thisMonth?.orderCount || 0).toLocaleString()} orders this month</div>}
            >
              <div className="flex flex-1 flex-col gap-3">
                {lowStockCount > 0 ? (
                  <Link to="/app/products" className="flex items-center justify-between gap-3 rounded-[0.85rem] border border-amber-400/30 bg-amber-400/10 px-3 py-2 transition hover:bg-amber-400/15">
                    <div className="min-w-0">
                      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-amber-700/80 dark:text-amber-300/80">Low Stock · {lowStockCount.toLocaleString()} flagged</p>
                      <p className="truncate text-[13px] font-medium text-amber-700 dark:text-amber-300">{lowStockCount.toLocaleString()} product{lowStockCount === 1 ? ' needs' : 's need'} restocking</p>
                    </div>
                    <span className="shrink-0 text-xs font-semibold text-amber-700 dark:text-amber-300">Restock →</span>
                  </Link>
                ) : (
                  <div className="rounded-[0.85rem] border border-emerald-400/30 bg-emerald-400/10 px-3 py-2">
                    <p className="text-[13px] font-medium text-emerald-700 dark:text-emerald-300">Inventory looks healthy, nothing below its reorder level.</p>
                  </div>
                )}

                <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-1 2xl:grid-cols-[1.1fr_0.9fr]">
                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Top Products</h3>
                      <Link to="/app/reports" className="text-xs font-medium text-[var(--accent)] hover:underline">Best sellers</Link>
                    </div>
                    {topProductsPreview.length ? (
                      <div className="overflow-hidden rounded-[0.85rem] border border-[var(--border-default)]">
                        {topProductsPreview.slice(0, 5).map((item, index) => (
                          <div key={item.name} className="app-row-hover flex items-center gap-2 border-t border-[var(--border-default)] px-2.5 py-1.5 text-[13px] transition first:border-t-0">
                            <span className={`num flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[10px] font-semibold ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm' : 'bg-[var(--surface-secondary)] text-[var(--accent-strong)]'}`}>{index + 1}</span>
                            <span className="min-w-0 flex-1 truncate font-medium text-[var(--text-primary)]" title={item.name}>{item.name}</span>
                            <span className="num shrink-0 text-[var(--text-muted)]">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No product sales yet" message="Top sellers appear here once sales are recorded." />
                    )}
                  </div>

                  <div className="min-w-0">
                    <div className="mb-1.5 flex items-center justify-between gap-3">
                      <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Stock Summary</h3>
                      <span className="text-[11px] font-medium text-[var(--text-muted)]">Quick health check</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <SummaryTile label="Out of stock" value={outOfStockCount.toLocaleString()} tone="danger" />
                      <SummaryTile label="Low stock" value={lowStockCount.toLocaleString()} tone="warning" />
                      <SummaryTile label="Sold today" value={formatMoney(currency, todayRevenue)} tone="success" small />
                      <SummaryTile label="Units this week" value={Number(summary?.periods?.thisWeek?.itemsSold || 0).toLocaleString()} />
                    </div>
                  </div>
                </div>

                {/* Recent sales: grows to fill the panel's remaining height. Hidden
                    on mid-size laptops, where the snapshot is already full. */}
                <div className="flex min-h-[9rem] flex-1 flex-col xl:hidden 2xl:flex 2xl:min-h-[6rem]">
                  <div className="mb-1.5 flex items-center justify-between gap-3">
                    <h3 className="text-[13px] font-semibold text-[var(--text-primary)]">Recent Sales</h3>
                    {user?.role === 'Admin' ? <Link to="/app/reports" className="text-[11px] font-medium text-[var(--accent)] hover:underline">All sales</Link> : <span className="text-[11px] font-medium text-[var(--text-muted)]">Latest first</span>}
                  </div>
                  {recentSales.length === 0 ? (
                    <div className="app-panel-soft flex flex-1 items-center justify-center rounded-[0.85rem] border px-3 py-6 text-center text-xs text-[var(--text-muted)]">
                      No sales yet. Sales appear here as soon as they are rung up.
                    </div>
                  ) : (
                    <div className="app-panel-soft relative min-h-0 flex-1 overflow-hidden rounded-[0.85rem] border">
                      <ul className="absolute inset-0 divide-y divide-[var(--border-default)] overflow-y-auto">
                        {recentSales.map((sale) => {
                          const when = new Date(sale.createdAt);
                          const today = when.toDateString() === new Date().toDateString();
                          return (
                            <li key={sale.id} className="flex items-center gap-3 px-3 py-2">
                              <span className="num w-14 shrink-0 text-[11px] text-[var(--text-muted)]">
                                {today ? when.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : when.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })}
                              </span>
                              <span className="min-w-0 flex-1 truncate text-[13px] text-[var(--text-primary)]" title={sale.customer?.name || 'Walk-in customer'}>
                                {sale.customer?.name && sale.customer.name !== 'Walk-in Customer' ? sale.customer.name : 'Walk-in'}
                                <span className="text-[11px] text-[var(--text-muted)]"> · {sale.paymentMethod}{sale.cashier?.name ? ` · ${sale.cashier.name}` : ''}</span>
                              </span>
                              <span className="num shrink-0 text-[13px] font-semibold text-[var(--text-primary)]">{formatMoney(currency, sale.total)}</span>
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  )}
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      )}
    </div>
  );
}
