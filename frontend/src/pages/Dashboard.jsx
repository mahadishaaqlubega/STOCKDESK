import { useEffect, useMemo, useState } from 'react';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { Link } from 'react-router-dom';
import { fetchBestSelling, fetchCreditSummary, fetchDashboardStats, fetchDashboardSummary } from '../utils/api';
import { getUser } from '../utils/auth';

function formatMoney(currency, value) {
  return `${currency} ${Number(value || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function DashboardIcon({ children, tone = 'default' }) {
  const toneClasses = {
    default: 'bg-[linear-gradient(135deg,rgba(30,167,189,0.18),rgba(30,167,189,0.08))] text-[var(--accent-strong)] ring-1 ring-[rgba(30,167,189,0.12)]',
    success: 'bg-[linear-gradient(135deg,rgba(74,168,132,0.18),rgba(74,168,132,0.08))] text-[var(--success)] ring-1 ring-[rgba(74,168,132,0.12)]',
    danger: 'bg-[linear-gradient(135deg,rgba(218,106,90,0.18),rgba(218,106,90,0.08))] text-[var(--danger)] ring-1 ring-[rgba(218,106,90,0.12)]',
    warning: 'bg-[linear-gradient(135deg,rgba(216,155,73,0.18),rgba(216,155,73,0.08))] text-[var(--warning)] ring-1 ring-[rgba(216,155,73,0.12)]',
  };

  return <div className={`flex h-10 w-10 items-center justify-center rounded-[1.05rem] shadow-sm ${toneClasses[tone]}`}>{children}</div>;
}

function StatCard({ title, value, helper, tone = 'default', icon, eyebrow }) {
  const valueClass = tone === 'success' ? 'text-[var(--success)]' : tone === 'danger' ? 'text-[var(--danger)]' : tone === 'warning' ? 'text-[var(--warning)]' : 'text-[var(--text-primary)]';
  const borderAccent = {
    default: 'border-l-[3px] border-l-[var(--accent)]',
    success: 'border-l-[3px] border-l-[var(--success)]',
    danger: 'border-l-[3px] border-l-[var(--danger)]',
    warning: 'border-l-[3px] border-l-[var(--warning)]',
  }[tone];

  return (
    <div className={`app-panel relative overflow-hidden rounded-[1.2rem] border ${borderAccent} p-4 transition duration-200 hover:shadow-lg`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="text-[10.5px] font-semibold uppercase tracking-[0.18em] text-[var(--text-muted)]">{eyebrow || 'Overview'}</p>
          <div className="mt-1.5">
            <p className="text-[13px] font-medium text-[var(--text-secondary)]">{title}</p>
            <p className={`mt-0.5 break-words text-[0.95rem] font-bold tracking-tight leading-tight sm:text-[1.05rem] ${valueClass}`}>{value}</p>
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
      <p className="text-xs font-semibold uppercase tracking-[0.14em] text-[var(--text-muted)]">{label}</p>
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
    () => bestSelling.slice(0, 5).map((item) => ({
      name: item.Product?.name || 'Item',
      value: Number(item.unitsold || 0),
    })),
    [bestSelling]
  );
  const shopName = user?.shop?.name || 'StockDesk Shop';
  const todayRevenue = Number(summary?.periods?.today?.netSales || 0);
  const weeklySalesTotal = useMemo(() => salesTrend.reduce((sum, item) => sum + Number(item.sales || 0), 0), [salesTrend]);
  const weeklyAverageSales = salesTrend.length ? weeklySalesTotal / salesTrend.length : 0;
  const topProductsPreview = bestProductData.slice(0, 4);
  const bestDay = salesTrend.length ? salesTrend.reduce((best, current) => (current.sales > best.sales ? current : best), salesTrend[0]).label : '-';

  return (
    <div className="space-y-4">
      {/* Error banner */}
      {!loading && loadErrors.length > 0 && (
        <div className="rounded-[1.25rem] border border-red-400/30 bg-red-400/10 px-4 py-3">
          <p className="text-sm font-semibold text-red-600 dark:text-red-400">Some dashboard data failed to load</p>
          {loadErrors.map((err) => (
            <p key={err} className="mt-1 text-xs text-red-600/80 dark:text-red-400/80">{err}</p>
          ))}
          <p className="mt-2 text-xs text-red-600/60 dark:text-red-400/60">Check the browser console for full details.</p>
        </div>
      )}

      {/* Money owed by customers */}
      {!loading && credit?.totalOutstanding > 0 && (
        <div className="flex flex-col gap-2 rounded-[1.25rem] border border-sky-400/30 bg-sky-400/10 px-4 py-3 sm:flex-row sm:items-center sm:justify-between">
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

      {/* Low-stock alert banner */}
      {!loading && lowStockCount > 0 && (
        <div className="flex items-start gap-3 rounded-[1.25rem] border border-amber-400/30 bg-amber-400/10 px-4 py-3">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="mt-0.5 h-5 w-5 shrink-0 text-amber-500">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-amber-600 dark:text-amber-400">
              {lowStockCount} product{lowStockCount !== 1 ? 's' : ''} running low on stock
            </p>
            <p className="mt-0.5 text-xs text-amber-600/80 dark:text-amber-400/80">
              Restock via Products &rsaquo; Restock.
            </p>
          </div>
        </div>
      )}

      <section className="app-panel relative overflow-hidden rounded-[1.45rem] border p-4 sm:p-5">
        <div className="pointer-events-none absolute inset-y-0 right-0 hidden w-1/3 bg-[radial-gradient(circle_at_top_right,rgba(30,167,189,0.14),transparent_58%)] lg:block" />
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="relative">
            <h2 className="text-[1.7rem] font-bold tracking-tight text-[var(--text-primary)] sm:text-[1.95rem]">{shopName}</h2>
            <p className="mt-1 max-w-2xl text-sm leading-5 text-[var(--text-muted)]">Stock, sales, and inventory — all at a glance.</p>
          </div>
          <div className="app-panel-accent rounded-[1.1rem] border border-[rgba(30,167,189,0.12)] px-4 py-2.5 text-sm sm:min-w-[210px]">
            <p className="font-medium">Last updated</p>
            <p className="mt-1 text-[var(--accent)]">{new Date().toLocaleString()}</p>
          </div>
        </div>
      </section>

      {loading ? (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
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
          <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
            <StatCard
              title="Total Products"
              value={totalProducts.toLocaleString()}
              helper="Products currently in catalog"
              eyebrow="Inventory"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="m3 7 9 4 9-4" /><path d="M12 11v10" /></svg>}
            />
            <StatCard
              title="Total Stock"
              value={totalStock.toLocaleString()}
              helper="Units available for sale"
              eyebrow="Stock Level"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 7h16v10H4z" /><path d="M8 11h8" /></svg>}
            />
            <StatCard
              title="Today's Orders"
              value={todaysSales.toLocaleString()}
              helper="Orders recorded today"
              eyebrow="Daily Activity"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 19h16" /><path d="M7 15V9" /><path d="M12 15V5" /><path d="M17 15v-2" /></svg>}
            />
            <StatCard
              title="Total Revenue"
              value={formatMoney(currency, totalRevenue)}
              helper="This month net sales"
              tone="success"
              eyebrow="Revenue"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 1v22" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7H14.5a3.5 3.5 0 0 1 0 7H6" /></svg>}
            />
            <StatCard
              title="Gross Profit"
              value={formatMoney(currency, totalProfit)}
              helper="This month estimated gross profit"
              tone="warning"
              eyebrow="Profit"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 16l5-5 4 4 7-8" /><path d="M14 7h6v6" /></svg>}
            />
            <StatCard
              title="Low Stock Items"
              value={lowStockCount.toLocaleString()}
              helper="Products below safe stock level"
              tone="danger"
              eyebrow="Attention"
              icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" /></svg>}
            />
          </section>

          <section className="grid gap-4 xl:grid-cols-[1.55fr_0.95fr]">
            <SectionCard
              title="Sales Overview"
              subtitle="Net sales across the last 7 days."
              action={<div className="app-panel-accent rounded-[1rem] px-3 py-2 text-sm font-medium">Today: {formatMoney(currency, todayRevenue)}</div>}
            >
              <div className="mb-4 grid gap-3 sm:grid-cols-3">
                <div className="app-panel-soft rounded-[1rem] border p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">7-Day Total</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklySalesTotal)}</p>
                </div>
                <div className="app-panel-soft rounded-[1rem] border p-3.5">
                  <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">Daily Average</p>
                  <p className="mt-2 text-lg font-semibold text-[var(--text-primary)]">{formatMoney(currency, weeklyAverageSales)}</p>
                </div>
                <div className="app-panel-soft rounded-[1rem] border p-3.5">
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
                    <YAxis tickLine={false} axisLine={false} stroke="var(--text-muted)" tickFormatter={(value) => Number(value).toLocaleString()} />
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
              action={<div className="app-panel-soft rounded-[1rem] border px-3 py-2 text-sm text-[var(--text-muted)]">{summary?.periods?.thisMonth?.orderCount || 0} orders this month</div>}
            >
              <div className="space-y-4">
                <div>
                  <div className="mb-2 flex items-center justify-between gap-3">
                    <h3 className="text-sm font-semibold text-[var(--text-primary)]">Low Stock</h3>
                    <span className="text-xs font-medium text-[var(--text-muted)]">{lowStockCount} flagged</span>
                  </div>
                  {lowStockCount > 0 ? (
                    <div className="app-panel-soft rounded-[1rem] border border-amber-400/20 bg-amber-400/5 px-4 py-4 text-center">
                      <p className="text-sm font-medium text-amber-600">{lowStockCount} products need restocking</p>
                      <p className="mt-1 text-xs text-amber-600/70">Visit Products &rsaquo; Restock to replenish inventory.</p>
                    </div>
                  ) : (
                    <EmptyState title="Inventory looks healthy" message="No products are currently below the low stock threshold." />
                  )}
                </div>

                <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr] xl:grid-cols-1 2xl:grid-cols-[1.05fr_0.95fr]">
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-3">
                      <h3 className="text-sm font-semibold text-[var(--text-primary)]">Top Products</h3>
                      <span className="text-xs font-medium text-[var(--text-muted)]">Best sellers</span>
                    </div>
                    {topProductsPreview.length ? (
                      <div className="overflow-hidden rounded-[1rem] border border-[var(--border-default)]">
                        {topProductsPreview.map((item, index) => (
                          <div key={item.name} className="app-row-hover grid grid-cols-[minmax(0,1fr)_90px] border-t border-[var(--border-default)] px-3 py-2.5 text-sm first:border-t-0 transition">
                            <span className="flex items-center gap-2.5 truncate font-medium text-[var(--text-primary)]">
                              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-[11px] font-semibold text-[var(--accent-strong)]">{index + 1}</span>
                              <span className="truncate">{item.name}</span>
                            </span>
                            <span className="text-right text-[var(--text-muted)]">{item.value}</span>
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
                    <div className="grid gap-2.5 sm:grid-cols-2">
                      <div className="app-panel-soft rounded-[1rem] border p-3">
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Products In Stock</p>
                        <p className="mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{totalStock.toLocaleString()}</p>
                      </div>
                      <div className="app-panel-soft rounded-[1rem] border p-3">
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Low Stock Alerts</p>
                        <p className="mt-1.5 text-xl font-semibold text-[var(--danger)]">{lowStockCount.toLocaleString()}</p>
                      </div>
                      <div className="app-panel-soft rounded-[1rem] border p-3">
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">Today's Revenue</p>
                        <p className="mt-1.5 text-[13px] font-bold leading-tight text-[var(--success)] break-words">{formatMoney(currency, todayRevenue)}</p>
                      </div>
                      <div className="app-panel-soft rounded-[1rem] border p-3">
                        <p className="text-[12px] font-medium text-[var(--text-muted)]">This Week Units</p>
                        <p className="mt-1.5 text-xl font-semibold text-[var(--text-primary)]">{Number(summary?.periods?.thisWeek?.itemsSold || 0).toLocaleString()}</p>
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
