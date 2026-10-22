import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { fetchBestSelling, fetchCreditSummary, fetchDashboardStats, fetchDashboardSummary } from '../utils/api';
import { getUser } from '../utils/auth';
import { formatMoney, formatCompactMoney } from '../utils/format';
import { IconChip, TileEdge } from '../components/ui';

function DashboardIcon({ children, tone = 'default' }) {
  return <IconChip tone={tone}>{children}</IconChip>;
}

function StatCard({ title, value, fullValue, helper, tone = 'default', icon }) {
  const valueClass = {
    default: 'text-[var(--text-primary)]',
    success: 'text-[var(--success)]',
    danger: 'text-[var(--danger)]',
    warning: 'text-[var(--warning)]',
  }[tone];

  return (
    <div className="app-panel relative overflow-hidden rounded-2xl border p-4 sm:p-5">
      <TileEdge tone={tone} />
      <span className={`pointer-events-none absolute -right-8 -top-8 h-24 w-24 rounded-full blur-2xl ${{ default: 'bg-teal-500/10', success: 'bg-emerald-500/10', warning: 'bg-amber-500/15', danger: 'bg-rose-500/10' }[tone]}`} aria-hidden="true" />
      <div className="relative flex items-center justify-between gap-3">
        <p className="truncate text-[13px] font-medium text-[var(--text-muted)]">{title}</p>
        <DashboardIcon tone={tone}>{icon}</DashboardIcon>
      </div>
      <p className={`num relative mt-3 whitespace-nowrap text-2xl font-semibold tracking-tight ${valueClass}`} title={fullValue || undefined}>
        {value}
      </p>
      <p className="relative mt-1 truncate text-xs text-[var(--text-muted)]">{helper}</p>
    </div>
  );
}

function SectionCard({ title, subtitle, children, action }) {
  return (
    <section className="app-panel rounded-2xl border p-4 sm:p-5">
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
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
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
          <section className="grid grid-cols-2 gap-3 lg:grid-cols-3 2xl:grid-cols-6">
            <StatCard
              title="Today's sales"
              value={formatCompactMoney(currency, todayRevenue)}
              fullValue={formatMoney(currency, todayRevenue)}
              helper={`${todaysSales.toLocaleString()} order${todaysSales === 1 ? '' : 's'} so far`}
              tone="success"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            />
            <StatCard
              title="Orders today"
              value={todaysSales.toLocaleString()}
              helper="Completed sales"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-2" /></svg>}
            />
            <StatCard
              title="Month revenue"
              value={formatCompactMoney(currency, totalRevenue)}
              fullValue={formatMoney(currency, totalRevenue)}
              helper="Net of tax and refunds"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18" /><path d="M8 2v4M16 2v4" /></svg>}
            />
            <StatCard
              title="Month profit"
              value={formatCompactMoney(currency, totalProfit)}
              fullValue={formatMoney(currency, totalProfit)}
              helper={totalRevenue > 0 ? `${Math.round((totalProfit / totalRevenue) * 100)}% margin` : 'No sales yet'}
              tone="success"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M4 16l5-5 4 4 7-8" /><path d="M14 7h6v6" /></svg>}
            />
            <StatCard
              title="Running low"
              value={lowStockCount.toLocaleString()}
              helper={`of ${totalProducts.toLocaleString()} products · ${totalStock.toLocaleString()} units`}
              tone={lowStockCount ? 'warning' : 'default'}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></svg>}
            />
            <StatCard
              title="Out of stock"
              value={outOfStockCount.toLocaleString()}
              helper="Cannot be sold until restocked"
              tone={outOfStockCount ? 'danger' : 'default'}
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
            <SectionCard
              title="Sales this week"
              subtitle="Net sales per day, last 7 days"
              action={<div className="num rounded-lg bg-[var(--accent-soft)] px-3 py-1.5 text-sm font-medium text-[var(--accent-strong)]">Today {formatMoney(currency, todayRevenue)}</div>}
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="app-panel-soft relative overflow-hidden rounded-xl border p-3.5">
                  <TileEdge />
                  <p className="text-xs font-medium text-[var(--text-muted)]">7-Day Total</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklySalesTotal)}</p>
                </div>
                <div className="app-panel-soft relative overflow-hidden rounded-xl border p-3.5">
                  <TileEdge />
                  <p className="text-xs font-medium text-[var(--text-muted)]">Daily Average</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklyAverageSales)}</p>
                </div>
                <div className="app-panel-soft relative overflow-hidden rounded-xl border p-3.5">
                  <TileEdge />
                  <p className="text-xs font-medium text-[var(--text-muted)]">Best Day</p>
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
              title="Best sellers"
              subtitle="Units sold, all time"
              action={<Link to="/app/reports" className="text-sm font-medium text-[var(--accent)] hover:underline">Reports</Link>}
            >
              {topProductsPreview.length ? (
                <ol className="space-y-3">
                  {topProductsPreview.map((item, index) => {
                    const top = topProductsPreview[0]?.value || 1;
                    return (
                      <li key={item.name} className="flex items-start gap-3">
                        <span className={`num mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${index === 0 ? 'bg-gradient-to-br from-amber-400 to-amber-500 text-white shadow-sm' : 'bg-[var(--surface-secondary)] text-[var(--text-secondary)]'}`}>{index + 1}</span>
                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-3">
                            <p className="line-clamp-2 text-sm font-medium text-[var(--text-primary)]" title={item.name}>{item.name}</p>
                            <span className="num shrink-0 text-sm text-[var(--text-secondary)]">{item.value.toLocaleString()}</span>
                          </div>
                          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--surface-secondary)]">
                            <div className="h-full rounded-full bg-gradient-to-r from-teal-500 to-emerald-400" style={{ width: `${Math.max(6, Math.round((item.value / top) * 100))}%` }} />
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ol>
              ) : (
                <EmptyState title="No product sales yet" message="Your best sellers will appear here once you start selling." />
              )}
              <dl className="mt-5 grid grid-cols-3 gap-2 border-t border-[var(--border-default)] pt-4 text-center">
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Week orders</dt>
                  <dd className="num mt-0.5 text-base font-semibold text-[var(--text-primary)]">{Number(summary?.periods?.thisWeek?.orderCount || 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Week units</dt>
                  <dd className="num mt-0.5 text-base font-semibold text-[var(--text-primary)]">{Number(summary?.periods?.thisWeek?.itemsSold || 0).toLocaleString()}</dd>
                </div>
                <div>
                  <dt className="text-xs text-[var(--text-muted)]">Month orders</dt>
                  <dd className="num mt-0.5 text-base font-semibold text-[var(--text-primary)]">{Number(summary?.periods?.thisMonth?.orderCount || 0).toLocaleString()}</dd>
                </div>
              </dl>
            </SectionCard>
          </section>
        </>
      )}
    </div>
  );
}
