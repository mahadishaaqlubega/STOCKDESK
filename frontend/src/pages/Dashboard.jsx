import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { fetchBestSelling, fetchCreditSummary, fetchDashboardStats, fetchDashboardSummary } from '../utils/api';
import { getUser } from '../utils/auth';
import { formatMoney } from '../utils/format';
import { IconChip, tileEdge } from '../components/ui';

function DashboardIcon({ children, tone = 'default' }) {
  return <IconChip tone={tone}>{children}</IconChip>;
}

function StatCard({ title, value, helper, tone = 'default', icon, eyebrow }) {
  const valueClass = {
    default: 'text-[var(--text-primary)]',
    success: 'text-[var(--success)]',
    danger: 'text-[var(--danger)]',
    warning: 'text-[var(--warning)]',
  }[tone];

  return (
    <div className={`app-panel relative overflow-hidden rounded-[1.2rem] border p-4 transition duration-200 hover:shadow-lg ${tileEdge(tone)}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow}</p>
          <div className="mt-1.5">
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</p>
            <p className={`num mt-0.5 break-words text-[0.95rem] font-bold leading-tight tracking-tight sm:text-[1.05rem] ${valueClass}`}>{value}</p>
          </div>
          <p className="mt-2 text-[12px] leading-4 text-[var(--text-muted)]">{helper}</p>
        </div>
        <DashboardIcon tone={tone}>{icon}</DashboardIcon>
      </div>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <section className="app-panel rounded-[1.3rem] border p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3 border-b border-[var(--border-default)] pb-3.5">
        <div>
          <h2 className="text-base font-semibold tracking-tight text-[var(--text-primary)] sm:text-lg">{title}</h2>
          <p className="mt-1 text-sm leading-5 text-[var(--text-muted)]">{subtitle}</p>
        </div>
        {action}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function SkeletonCard() {
  return <div className="app-panel-soft h-28 animate-pulse rounded-lg border p-4" />;
}

function EmptyState({ title, message }) {
  return (
    <div className="app-panel-soft rounded-lg border border-dashed px-4 py-10 text-center">
      <p className="text-sm font-medium text-[var(--text-primary)]">{title}</p>
      <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">{message}</p>
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
  const [loading, setLoading] = useState(true);
  const [loadErrors, setLoadErrors] = useState([]);

  useEffect(() => {
    async function loadStats() {
      const errors = [];
      const [statsResult, bestResult, summaryResult, creditResult] = await Promise.allSettled([
        fetchDashboardStats(),
        fetchBestSelling(),
        fetchDashboardSummary(),
        fetchCreditSummary(),
      ]);

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

  return (
    <div className="space-y-4">
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

      {/* Money owed by customers */}
      {!loading && credit?.totalOutstanding > 0 && (
        <div className="flex flex-col gap-2 rounded-2xl border border-sky-400/30 bg-sky-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-sky-700 dark:text-sky-300">
              {credit.debtorCount === 1 ? '1 customer owes' : `${credit.debtorCount} customers owe`} you {formatMoney(currency, credit.totalOutstanding)}
            </p>
            <p className="mt-0.5 text-xs text-sky-700/80 dark:text-sky-300/80">
              {credit.totalOverdue > 0
                ? `${formatMoney(currency, credit.totalOverdue)} is past its due date.`
                : 'Nothing is overdue.'}
              {Number(summary?.periods?.today?.creditCollected || 0) > 0
                ? ` Collected today: ${formatMoney(currency, summary.periods.today.creditCollected)}.`
                : ''}
            </p>
          </div>
          <Link to="/app/customers" className="app-btn-secondary shrink-0 rounded-lg border px-3 py-2 text-center text-xs font-medium">
            View who owes
          </Link>
        </div>
      )}

      {/* Inventory attention banner */}
      {!loading && (outOfStockCount > 0 || lowStockCount > 0) && (
        <div className="flex flex-col gap-2 rounded-2xl border border-amber-400/30 bg-amber-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-amber-700 dark:text-amber-300">
            {outOfStockCount > 0 ? <strong className="font-semibold">{outOfStockCount.toLocaleString()} out of stock</strong> : null}
            {outOfStockCount > 0 && lowStockCount > 0 ? ' · ' : ''}
            {lowStockCount > 0 ? `${lowStockCount.toLocaleString()} at or below their reorder level` : ''}
          </p>
          <Link to="/app/products" className="app-btn-secondary shrink-0 rounded-lg border px-3 py-2 text-center text-xs font-medium">
            Review stock
          </Link>
        </div>
      )}

      {loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            {Array.from({ length: 6 }).map((_, index) => (
              <SkeletonCard key={index} />
            ))}
          </div>
          <div className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
            <div className="app-panel-soft h-80 animate-pulse rounded-lg border" />
            <div className="app-panel-soft h-80 animate-pulse rounded-lg border" />
          </div>
        </>
      ) : (
        <>
          <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              eyebrow="Inventory"
              title="Total Products"
              value={totalProducts.toLocaleString()}
              helper="Products currently in catalog"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></svg>}
            />
            <StatCard
              eyebrow="Stock Level"
              title="Total Stock"
              value={totalStock.toLocaleString()}
              helper="Units available for sale"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 7h16v10H4z" /><path d="M8 11h8" /></svg>}
            />
            <StatCard
              eyebrow="Daily Activity"
              title="Today's Orders"
              value={todaysSales.toLocaleString()}
              helper="Orders recorded today"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-2" /></svg>}
            />
            <StatCard
              eyebrow="Revenue"
              title="Total Revenue"
              value={formatMoney(currency, totalRevenue)}
              helper="This month net sales"
              tone="success"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            />
            <StatCard
              eyebrow="Profit"
              title="Gross Profit"
              value={formatMoney(currency, totalProfit)}
              helper={totalRevenue > 0 ? `This month · ${Math.round((totalProfit / totalRevenue) * 100)}% margin` : 'This month estimated gross profit'}
              tone="warning"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 16l5-5 4 4 7-8" /><path d="M14 7h6v6" /></svg>}
            />
            <StatCard
              eyebrow="Attention"
              title="Low Stock Items"
              value={lowStockCount.toLocaleString()}
              helper={outOfStockCount > 0 ? `${outOfStockCount.toLocaleString()} of them out of stock` : 'Products below safe stock level'}
              tone="danger"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
            <SectionCard
              title="Sales Overview"
              subtitle="Net sales across the last 7 days."
              action={<div className="num shrink-0 rounded-[1rem] bg-[var(--accent-soft)] px-3 py-2 text-sm font-medium text-[var(--accent-strong)]">Today: {formatMoney(currency, todayRevenue)}</div>}
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className={`app-panel-soft rounded-[1rem] border p-3.5 ${tileEdge()}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">7-Day Total</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklySalesTotal)}</p>
                </div>
                <div className={`app-panel-soft rounded-[1rem] border p-3.5 ${tileEdge()}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Daily Average</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklyAverageSales)}</p>
                </div>
                <div className={`app-panel-soft rounded-[1rem] border p-3.5 ${tileEdge()}`}>
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Best Day</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{bestDay}</p>
                </div>
              </div>
              <div className="h-56 sm:h-64">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={salesTrend}>
                    <defs>
                      <linearGradient id="salesGradient" x1="0" x2="0" y1="0" y2="1">
                        <stop offset="0%" stopColor="var(--chart-1)" stopOpacity="0.25" />
                        <stop offset="100%" stopColor="var(--chart-1)" stopOpacity="0.02" />
                      </linearGradient>
                    </defs>
                    <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
                    <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--text-muted)" />
                    <YAxis width={48} tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={12} tickFormatter={(value) => new Intl.NumberFormat(undefined, { notation: 'compact' }).format(value)} />
                    <Tooltip cursor={{ stroke: 'var(--chart-1)', strokeWidth: 1, strokeDasharray: '4 2' }} content={<SalesTooltip currency={currency} />} />
                    <Area type="monotone" dataKey="sales" stroke="var(--chart-1)" strokeWidth={2.5} fill="url(#salesGradient)" dot={false} activeDot={{ r: 5, fill: 'var(--chart-1)', strokeWidth: 0 }} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
              {salesTrend.every((item) => item.sales === 0) ? (
                <div className="mt-4">
                  <EmptyState title="No sales yet" message="Sales recorded this week will appear here automatically." />
                </div>
              ) : null}
            </SectionCard>

            <SectionCard
              title="Operations Snapshot"
              subtitle="Top products, and inventory health in one compact view."
              action={<div className="app-panel-soft shrink-0 rounded-[1rem] border px-3 py-2 text-sm text-[var(--text-muted)]">{Number(summary?.periods?.thisMonth?.orderCount || 0).toLocaleString()} orders this month</div>}
            >
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Low Stock</h3>
                    <span className="text-xs font-medium text-[var(--text-muted)]">{lowStockCount.toLocaleString()} flagged</span>
                  </div>
                  {lowStockCount > 0 ? (
                    <Link to="/app/products" className="block rounded-[1rem] border border-amber-400/30 bg-amber-400/10 px-4 py-4 text-center transition hover:bg-amber-400/15">
                      <p className="text-sm font-medium text-amber-700 dark:text-amber-300">{lowStockCount.toLocaleString()} product{lowStockCount === 1 ? ' needs' : 's need'} restocking</p>
                      <p className="mt-1 text-xs text-amber-700/80 dark:text-amber-300/80">Visit Products &rsaquo; Restock to replenish inventory.</p>
                    </Link>
                  ) : (
                    <EmptyState title="Inventory looks healthy" message="No products are currently below the low stock threshold." />
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] xl:grid-cols-1 2xl:grid-cols-[1.05fr_0.95fr]">
                  <div className="min-w-0">
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Products</h3>
                      <Link to="/app/reports" className="text-xs font-medium text-[var(--accent)] hover:underline">Best sellers</Link>
                    </div>
                    {topProductsPreview.length ? (
                      <div className="overflow-hidden rounded-[1rem] border border-[var(--border-default)]">
                        {topProductsPreview.slice(0, 4).map((item, index) => (
                          <div key={item.name} className="app-row-hover flex items-center gap-2.5 border-t border-[var(--border-default)] px-3 py-2.5 text-sm transition first:border-t-0">
                            <span className={`num flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm' : 'bg-[var(--surface-secondary)] text-[var(--accent-strong)]'}`}>{index + 1}</span>
                            <span className="line-clamp-2 min-w-0 flex-1 font-medium text-[var(--text-primary)]" title={item.name}>{item.name}</span>
                            <span className="num shrink-0 text-[var(--text-muted)]">{item.value.toLocaleString()}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <EmptyState title="No product sales yet" message="Top-selling products will appear here once sales are recorded." />
                    )}
                  </div>

                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Stock Summary</h3>
                      <span className="text-xs font-medium text-[var(--text-muted)]">Quick health check</span>
                    </div>
                    <div className="grid grid-cols-2 gap-2.5">
                      <div className={`app-panel-soft rounded-[1rem] border p-3 ${tileEdge()}`}>
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Products In Stock</p>
                        <p className="num mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{totalStock.toLocaleString()}</p>
                      </div>
                      <div className={`app-panel-soft rounded-[1rem] border p-3 ${tileEdge('danger')}`}>
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Low Stock Alerts</p>
                        <p className="num mt-1.5 text-xl font-semibold text-[var(--danger)]">{lowStockCount.toLocaleString()}</p>
                      </div>
                      <div className={`app-panel-soft rounded-[1rem] border p-3 ${tileEdge('success')}`}>
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Today&apos;s Revenue</p>
                        <p className="num mt-1.5 break-words text-[13px] font-bold leading-tight text-[var(--success)]">{formatMoney(currency, todayRevenue)}</p>
                      </div>
                      <div className={`app-panel-soft rounded-[1rem] border p-3 ${tileEdge()}`}>
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">This Week Units</p>
                        <p className="num mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{Number(summary?.periods?.thisWeek?.itemsSold || 0).toLocaleString()}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </SectionCard>
          </section>
        </>
      )}
    </div>
  );
}
