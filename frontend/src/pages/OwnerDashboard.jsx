import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchPlatformDashboard } from '../utils/api';
import { getUser } from '../utils/auth';

const ACTION_META = {
  CREATE: { label: 'Create', text: 'text-emerald-400', bg: 'bg-emerald-400/15', dot: 'bg-emerald-400' },
  UPDATE: { label: 'Update', text: 'text-sky-400', bg: 'bg-sky-400/15', dot: 'bg-sky-400' },
  DELETE: { label: 'Delete', text: 'text-rose-400', bg: 'bg-rose-400/15', dot: 'bg-rose-400' },
  LOGIN: { label: 'Login', text: 'text-violet-400', bg: 'bg-violet-400/15', dot: 'bg-violet-400' },
  LOGOUT: { label: 'Logout', text: 'text-zinc-400', bg: 'bg-zinc-400/10', dot: 'bg-zinc-400' },
};

const RANGE_OPTIONS = [
  { value: 7, label: '7D' },
  { value: 14, label: '14D' },
  { value: 30, label: '30D' },
  { value: 90, label: '90D' },
];

function formatRelativeTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

function exportToCSV(data, summary) {
  const rows = [
    ['Platform Dashboard Export'],
    ['Generated', new Date().toLocaleString()],
    [],
    ['--- KPIs ---'],
    ['Metric', 'Value'],
    ['Total Shops', summary.totalShops],
    ['Active Shops', summary.activeShops],
    ['Recently Active', summary.recentlyActiveShops],
    ['New Today', summary.newShopsToday],
    ['Total Users', summary.totalUsers],
    ['Total Products', summary.totalProducts],
    ['Total Sales', summary.totalSales],
    ['Pending Signups', summary.pendingSignups],
    ['Unverified Users', summary.unverifiedUsers],
    [],
    ['--- Top Shops ---'],
    ['Shop Name', 'Users', 'Products', 'Sales'],
    ...(data.topShops || []).map((shop) => [
      shop.name,
      shop.metrics?.userCount || 0,
      shop.metrics?.productCount || 0,
      shop.metrics?.saleCount || 0,
    ]),
    [],
    ['--- Sales Trend ---'],
    ['Date', 'Sales'],
    ...(data.salesTrend || []).map((d) => [d.day, d.count]),
    [],
    ['--- Signup Trend ---'],
    ['Date', 'Signups'],
    ...(data.signupsTrend || []).map((d) => [d.day, d.count]),
  ];
  const csv = rows.map((r) => r.join(',')).join('\n');
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `platform-dashboard-${new Date().toISOString().slice(0, 10)}.csv`;
  document.body.appendChild(a);
  a.click();
  URL.revokeObjectURL(url);
  document.body.removeChild(a);
}

function GlassCard({ children, className = '', accent = false, hover = true }) {
  return (
    <div
      className={`relative overflow-hidden rounded-[1.6rem] border transition-all duration-300 ${
        accent
          ? 'border-white/15 bg-white/[0.08] shadow-[0_8px_32px_rgba(0,0,0,0.12),inset_0_1px_0_rgba(255,255,255,0.1)] backdrop-blur-xl'
          : 'border-white/10 bg-white/[0.05] shadow-[0_4px_24px_rgba(0,0,0,0.08),inset_0_1px_0_rgba(255,255,255,0.06)] backdrop-blur-lg'
      } ${hover ? 'hover:border-white/20 hover:bg-white/[0.08] hover:shadow-[0_8px_32px_rgba(0,0,0,0.15),inset_0_1px_0_rgba(255,255,255,0.12)]' : ''} ${className}`}
    >
      <div className="pointer-events-none absolute inset-0 bg-gradient-to-br from-white/[0.06] via-transparent to-transparent" />
      <div className="relative">{children}</div>
    </div>
  );
}

function LiquidKpi({ icon, label, value, hint, accent = false }) {
  return (
    <GlassCard accent={accent} className="p-4">
      <div className="flex items-start justify-between gap-2">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-[0.85rem] ${accent ? 'bg-white/15 text-white shadow-[0_2px_8px_rgba(255,255,255,0.1)]' : 'bg-white/[0.08] text-white/60'}`}>
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-white/40">{label}</span>
      </div>
      <p className={`mt-3 text-2xl font-bold tracking-tight ${accent ? 'text-white' : 'text-white/90'}`}>
        {value.toLocaleString()}
      </p>
      <p className="mt-1 text-sm text-white/40">{hint}</p>
    </GlassCard>
  );
}

function LiquidTooltip({ active, payload, label }) {
  if (!active || !payload?.length) return null;
  return (
    <div className="rounded-2xl border border-white/15 bg-black/60 px-4 py-3 text-sm shadow-[0_8px_32px_rgba(0,0,0,0.4)] backdrop-blur-xl">
      <p className="font-semibold text-white">{label}</p>
      <p className="mt-0.5 text-xs text-white/60">
        {payload[0].value.toLocaleString()} {payload[0].name}
      </p>
    </div>
  );
}

export default function OwnerDashboard() {
  const currentUser = getUser();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [trendDays, setTrendDays] = useState(14);
  const [shopSearch, setShopSearch] = useState('');
  const mountedRef = useRef(true);

  const load = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      const result = await fetchPlatformDashboard(trendDays);
      if (mountedRef.current) {
        setData(result);
        setError('');
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load platform dashboard.');
    } finally {
      if (mountedRef.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load(true);
    const intervalId = window.setInterval(() => load(false), 60000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
  }, [trendDays]);

  const s = data?.summary || {
    totalShops: 0, activeShops: 0, recentlyActiveShops: 0, newShopsToday: 0,
    totalUsers: 0, totalProducts: 0, totalSales: 0, pendingSignups: 0, unverifiedUsers: 0,
  };
  const pendingCount = s.pendingSignups + s.unverifiedUsers;
  const totalSalesSeries = (data?.salesTrend || []).map((d) => ({ ...d, sales: d.count }));
  const maxSales = Math.max(1, ...totalSalesSeries.map((d) => d.sales));

  const filteredTopShops = useMemo(() => {
    const shops = data?.topShops || [];
    if (!shopSearch.trim()) return shops;
    const q = shopSearch.toLowerCase();
    return shops.filter((shop) => shop.name.toLowerCase().includes(q));
  }, [data?.topShops, shopSearch]);

  const shopActivityData = filteredTopShops.slice(0, 6).map((shop) => ({
    name: shop.name.length > 12 ? shop.name.slice(0, 12) + '…' : shop.name,
    sales: shop.metrics?.saleCount || 0,
    products: shop.metrics?.productCount || 0,
  }));

  const activityRate = s.totalShops > 0 ? Math.round((s.recentlyActiveShops / s.totalShops) * 100) : 0;

  return (
    <div className="relative min-h-dvh space-y-6 overflow-hidden rounded-3xl bg-[#09090b]">
      <div className="pointer-events-none absolute inset-0 overflow-hidden rounded-3xl">
        <div className="absolute -left-32 top-0 h-[500px] w-[500px] rounded-full bg-gradient-to-br from-teal-500/20 to-emerald-500/10 blur-[120px]" />
        <div className="absolute -right-32 top-1/4 h-[400px] w-[400px] rounded-full bg-gradient-to-br from-violet-500/15 to-sky-500/10 blur-[100px]" />
        <div className="absolute bottom-0 left-1/3 h-[350px] w-[350px] rounded-full bg-gradient-to-br from-amber-500/10 to-orange-500/5 blur-[100px]" />
      </div>

      {/* ── HERO ─────────────────────────────────────────────────────── */}
      <GlassCard className="p-6 sm:p-7" hover={false}>
        <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/20 bg-white/[0.08] px-3.5 py-1.5 shadow-[0_2px_8px_rgba(0,0,0,0.1)] backdrop-blur-md">
              <span className="relative flex h-2 w-2">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-teal-400 opacity-60" />
                <span className="relative inline-flex h-2 w-2 rounded-full bg-teal-400" />
              </span>
              <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-teal-300">
                Platform Console
              </span>
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">
              Welcome back, {currentUser?.name?.split(' ')[0] || 'Owner'}
            </h1>
            <p className="mt-2 max-w-xl text-sm leading-6 text-white/50">
              Live health of every shop on the network — signups, activity, and usage footprint across the platform.
            </p>
          </div>
          <div className="flex shrink-0 flex-col items-end gap-2">
            <div className="flex items-center gap-3">
              <div className="flex items-center gap-2 rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-2.5 shadow-[0_2px_12px_rgba(0,0,0,0.1)] backdrop-blur-md">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-400" />
                </span>
                <span className="text-sm font-medium text-white">{activityRate}% active</span>
              </div>
              <button
                type="button"
                onClick={() => load(false)}
                className="rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-2.5 text-xs font-medium text-white/50 backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
              >
                {refreshing ? 'Refreshing…' : `Updated ${formatRelativeTime(data?.generatedAt)}`}
              </button>
              <button
                type="button"
                onClick={() => data && exportToCSV(data, s)}
                className="rounded-2xl border border-white/15 bg-white/[0.08] px-4 py-2.5 text-xs font-medium text-white/50 backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.12] hover:text-white"
                title="Export dashboard data as CSV"
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
              </button>
            </div>
          </div>
        </div>

        {/* ── KPI STRIP ─────────────────────────────────────────────── */}
        <div className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-8">
          <LiquidKpi accent label="Shops" value={s.totalShops} hint="Registered tenants" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /></svg>} />
          <LiquidKpi label="Active" value={s.activeShops} hint="Enabled on platform" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" /></svg>} />
          <LiquidKpi label="Live now" value={s.recentlyActiveShops} hint={`Last ${data?.activityWindowHours || 24}h`} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><polyline points="22 12 18 12 15 21 9 3 6 12 2 12" /></svg>} />
          <LiquidKpi label="New today" value={s.newShopsToday} hint="Shops signed up" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M12 5v14" /><path d="M5 12h14" /></svg>} />
          <LiquidKpi label="Users" value={s.totalUsers} hint="Platform-wide" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /><path d="M21 21v-2a4 4 0 0 0-3-3.9" /><path d="M16 3.1a4 4 0 0 1 0 7.8" /></svg>} />
          <LiquidKpi label="Products" value={s.totalProducts} hint="Listed catalogue" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M12 11v10" /></svg>} />
          <LiquidKpi label="Sales" value={s.totalSales} hint="All-time transactions" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-3" /></svg>} />
          <LiquidKpi label="Pending" value={pendingCount} hint="Unverified accounts" icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" /><path d="M12 9v4" /><path d="M12 17h.01" /></svg>} />
        </div>
      </GlassCard>

      {error && (
        <div className="flex items-center gap-3 rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-3 text-sm font-medium text-rose-300 backdrop-blur-md">
          {error}
        </div>
      )}

      {pendingCount > 0 && !loading && (
        <GlassCard className="px-5 py-4" hover={false}>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm font-medium text-amber-300">
              {pendingCount} account{pendingCount > 1 ? 's' : ''} waiting for email verification.
            </p>
            <Link to="/app/shops" className="shrink-0 rounded-xl border border-white/15 bg-white/[0.08] px-4 py-2 text-sm font-medium text-white/70 backdrop-blur-md transition hover:border-white/25 hover:bg-white/[0.12] hover:text-white">
              View shops
            </Link>
          </div>
        </GlassCard>
      )}

      {/* ── DATE RANGE SELECTOR ───────────────────────────────────── */}
      <div className="flex items-center gap-2">
        {RANGE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            onClick={() => setTrendDays(opt.value)}
            className={`rounded-xl px-4 py-2 text-xs font-semibold transition ${
              trendDays === opt.value
                ? 'border border-teal-400/30 bg-teal-400/15 text-teal-300 shadow-[0_2px_8px_rgba(45,212,191,0.15)]'
                : 'border border-white/10 bg-white/[0.05] text-white/40 hover:border-white/20 hover:bg-white/[0.08] hover:text-white/60'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {/* ── TRENDS ───────────────────────────────────────────────── */}
      <div className="grid gap-6 xl:grid-cols-2">
        <GlassCard className="p-5 sm:p-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="font-semibold text-white">Sales activity · last {trendDays} days</h3>
            <p className="mt-0.5 text-sm text-white/40">Transactions recorded across all shops</p>
          </div>
          {loading ? (
            <div className="mt-4 h-56 animate-pulse rounded-2xl bg-white/[0.04]" />
          ) : (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={totalSalesSeries} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lgSalesGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(45,212,191,0.35)" />
                      <stop offset="100%" stopColor="rgba(45,212,191,0.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} allowDecimals={false} domain={[0, Math.ceil(maxSales * 1.1)]} />
                  <Tooltip cursor={{ stroke: 'rgba(45,212,191,0.3)', strokeWidth: 1, strokeDasharray: '4 2' }} content={<LiquidTooltip />} />
                  <Area type="monotone" dataKey="sales" name="sales" stroke="rgb(45,212,191)" strokeWidth={2.5} fill="url(#lgSalesGrad)" dot={false} activeDot={{ r: 5, fill: 'rgb(45,212,191)', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>

        <GlassCard className="p-5 sm:p-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="font-semibold text-white">Shop signups · last {trendDays} days</h3>
            <p className="mt-0.5 text-sm text-white/40">New tenants joining the platform</p>
          </div>
          {loading ? (
            <div className="mt-4 h-56 animate-pulse rounded-2xl bg-white/[0.04]" />
          ) : (
            <div className="mt-4 h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data?.signupsTrend || []} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                  <defs>
                    <linearGradient id="lgSignupsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="rgba(167,139,250,0.4)" />
                      <stop offset="100%" stopColor="rgba(167,139,250,0.02)" />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                  <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} interval="preserveStartEnd" minTickGap={24} />
                  <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                  <Tooltip cursor={{ stroke: 'rgba(167,139,250,0.3)', strokeWidth: 1, strokeDasharray: '4 2' }} content={<LiquidTooltip />} />
                  <Area type="monotone" dataKey="count" name="signups" stroke="rgb(167,139,250)" strokeWidth={2.5} fill="url(#lgSignupsGrad)" dot={false} activeDot={{ r: 5, fill: 'rgb(167,139,250)', strokeWidth: 0 }} />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </GlassCard>
      </div>

      {/* ── SHOP COMPARISON BAR CHART ──────────────────────────────── */}
      {!loading && shopActivityData.length > 0 && (
        <GlassCard className="p-5 sm:p-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="font-semibold text-white">Shop performance comparison</h3>
            <p className="mt-0.5 text-sm text-white/40">Sales and product count across top shops</p>
          </div>
          <div className="mt-4 h-56">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={shopActivityData} margin={{ top: 6, right: 6, left: -18, bottom: 0 }}>
                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.06)" />
                <XAxis dataKey="name" tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 11, fill: 'rgba(255,255,255,0.35)' }} tickLine={false} axisLine={false} allowDecimals={false} />
                <Tooltip cursor={{ fill: 'rgba(255,255,255,0.04)' }} contentStyle={{ borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', background: 'rgba(0,0,0,0.5)', backdropFilter: 'blur(20px)' }} />
                <Bar dataKey="sales" name="Sales" fill="rgb(45,212,191)" radius={[6, 6, 0, 0]} />
                <Bar dataKey="products" name="Products" fill="rgb(167,139,250)" radius={[6, 6, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </GlassCard>
      )}

      {/* ── ACTIVITY + TOP SHOPS + QUICK ACTIONS ───────────────────── */}
      <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
        <GlassCard className="p-5 sm:p-6">
          <div className="border-b border-white/10 pb-4">
            <h3 className="font-semibold text-white">Live activity feed</h3>
            <p className="mt-0.5 text-sm text-white/40">Recent events across the platform</p>
          </div>
          {loading ? (
            <div className="mt-4 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-14 animate-pulse rounded-2xl bg-white/[0.04]" />
              ))}
            </div>
          ) : (data?.liveActivity || []).length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-white/10 px-4 py-12 text-center">
              <p className="text-sm font-semibold text-white/70">No activity yet</p>
              <p className="mt-1 text-sm text-white/35">Events appear here as shops use StockDesk</p>
            </div>
          ) : (
            <div className="mt-4 space-y-2">
              {(data?.liveActivity || []).slice(0, 12).map((event) => {
                const meta = ACTION_META[event.action] || { label: event.action, text: 'text-white/40', bg: 'bg-white/[0.06]', dot: 'bg-white/40' };
                return (
                  <div key={event.id} className="flex items-center gap-3 rounded-2xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.06]">
                    <span className={`inline-flex w-16 shrink-0 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
                      {meta.label}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm text-white/80">
                        <span className="font-semibold text-white">{event.user?.username || 'System'}</span>
                        <span className="text-white/35"> · {event.entityType?.toLowerCase()}{event.entityId ? ` #${event.entityId}` : ''}</span>
                        {event.shopName && <span className="text-white/35"> · <Link to={`/app/shops/${event.shopId}`} className="font-medium text-teal-300 hover:text-teal-200">{event.shopName}</Link></span>}
                      </p>
                    </div>
                    <span className="shrink-0 text-xs text-white/30">{formatRelativeTime(event.createdAt)}</span>
                  </div>
                );
              })}
            </div>
          )}
        </GlassCard>

        <div className="flex flex-col gap-6">
          <GlassCard className="p-5">
            <div className="border-b border-white/10 pb-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-semibold text-white">Top shops by activity</h3>
                  <p className="mt-0.5 text-sm text-white/40">Ranked by recorded sales</p>
                </div>
                <span className="rounded-full border border-white/10 bg-white/[0.06] px-2.5 py-1 text-[10px] font-semibold text-white/40">
                  {filteredTopShops.length}
                </span>
              </div>
              <div className="relative mt-3">
                <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3 text-white/30">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5"><circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" /></svg>
                </div>
                <input
                  type="text"
                  value={shopSearch}
                  onChange={(e) => setShopSearch(e.target.value)}
                  placeholder="Search shops…"
                  className="w-full rounded-xl border border-white/10 bg-white/[0.05] py-2 pl-9 pr-3 text-xs text-white/80 placeholder-white/25 backdrop-blur-md transition focus:border-white/25 focus:bg-white/[0.08] focus:outline-none"
                />
              </div>
            </div>
            {loading ? (
              <div className="mt-4 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-12 animate-pulse rounded-xl bg-white/[0.04]" />
                ))}
              </div>
            ) : filteredTopShops.length === 0 ? (
              <p className="mt-4 text-sm text-white/40">{shopSearch ? 'No shops match your search' : 'No data yet'}</p>
            ) : (
              <div className="mt-4 space-y-2">
                {filteredTopShops.map((shop, i) => (
                  <Link
                    key={shop.id}
                    to={`/app/shops/${shop.id}`}
                    className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.03] px-3 py-2.5 transition hover:border-white/15 hover:bg-white/[0.06]"
                  >
                    <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? 'bg-amber-400/20 text-amber-300' : i === 1 ? 'bg-white/10 text-white/50' : i === 2 ? 'bg-orange-400/15 text-orange-300' : 'bg-white/[0.06] text-white/40'}`}>
                      {i + 1}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{shop.name}</p>
                      <p className="text-xs text-white/35">{shop.metrics?.userCount || 0} users · {shop.metrics?.productCount || 0} products</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-bold text-white">{(shop.metrics?.saleCount || 0).toLocaleString()}</p>
                      <p className="text-[10px] text-white/30">sales</p>
                    </div>
                  </Link>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard className="p-5">
            <div className="border-b border-white/10 pb-4">
              <h3 className="font-semibold text-white">Quick actions</h3>
              <p className="mt-0.5 text-sm text-white/40">Platform management shortcuts</p>
            </div>
            <div className="mt-4 space-y-2">
              <Link to="/app/shops" className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition hover:border-white/15 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-teal-400/15 text-teal-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /></svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Shops & tenants</p>
                    <p className="text-xs text-white/35">View registry, activity & manage</p>
                  </div>
                </div>
                <span className="text-white/30">→</span>
              </Link>
              <Link to="/app/profile" className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition hover:border-white/15 hover:bg-white/[0.06]">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-violet-400/15 text-violet-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="12" cy="8" r="4" /><path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" /></svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">My profile</p>
                    <p className="text-xs text-white/35">Account, security & password</p>
                  </div>
                </div>
                <span className="text-white/30">→</span>
              </Link>
              <a
                href="https://github.com/mahad20324/STOCKDESK/issues"
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-between rounded-xl border border-white/[0.06] bg-white/[0.03] px-4 py-3 transition hover:border-white/15 hover:bg-white/[0.06]"
              >
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-sky-400/15 text-sky-300">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="12" cy="12" r="10" /><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" /><path d="M12 17h.01" /></svg>
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-white">Support</p>
                    <p className="text-xs text-white/35">Report issues & get help</p>
                  </div>
                </div>
                <span className="text-white/30">→</span>
              </a>
            </div>
          </GlassCard>
        </div>
      </div>
    </div>
  );
}
