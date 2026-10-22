import { useEffect, useMemo, useRef, useState } from 'react';
import { Navigate } from 'react-router-dom';
import { fetchPlatformOverview, deleteShop } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

// ── Icons ──────────────────────────────────────────────────────────────────
function TrashIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6l-1 14H6L5 6" />
      <path d="M10 11v6" />
      <path d="M14 11v6" />
    </svg>
  );
}

function AlertIcon({ className = 'h-5 w-5' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
    </svg>
  );
}

function StoreIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M3 21h18" />
      <path d="M5 21V8l7-4 7 4v13" />
      <path d="M9 10h6" />
      <path d="M9 14h6" />
      <path d="M10 21v-3h4v3" />
    </svg>
  );
}

function ActivityIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <polyline points="22 12 18 12 15 21 9 3 6 12 2 12" />
    </svg>
  );
}

function UsersIcon2() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <path d="M9.5 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}

function PackageIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="m3 7 9-4 9 4-9 4-9-4Z" />
      <path d="m3 7 9 4 9-4" />
      <path d="M12 11v10" />
      <path d="m3 17 9 4 9-4" />
    </svg>
  );
}

function ChartIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M4 19h16" />
      <path d="M7 16V9" />
      <path d="M12 16V5" />
      <path d="M17 16v-3" />
    </svg>
  );
}

function RefreshIcon({ className = 'h-4 w-4' }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className={className}>
      <path d="M3 12a9 9 0 0 1 15-6.7L21 8" />
      <path d="M21 3v5h-5" />
      <path d="M21 12a9 9 0 0 1-15 6.7L3 16" />
      <path d="M3 21v-5h5" />
    </svg>
  );
}

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}

// ── Helpers ────────────────────────────────────────────────────────────────
function formatRelativeTime(value) {
  if (!value) return 'No activity yet';
  const date = new Date(value);
  const diffMin = Math.max(0, Math.round((Date.now() - date.getTime()) / 60000));
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  return date.toLocaleDateString();
}

// ── MetricCard ─────────────────────────────────────────────────────────────
function MetricCard({ icon, eyebrow, value, label, accent = false }) {
  return (
    <div
      className={`relative overflow-hidden rounded-2xl border p-4 transition ${
        accent
          ? 'border-[var(--accent)]/20 bg-[var(--accent-soft)]'
          : 'app-panel hover:border-[var(--border-strong)]'
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <div
          className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${
            accent
              ? 'bg-[var(--accent)]/15 text-[var(--accent-strong)]'
              : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'
          }`}
        >
          {icon}
        </div>
        <span className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[var(--text-muted)]">
          {eyebrow}
        </span>
      </div>
      <p
        className={`mt-3 text-2xl font-bold tracking-tight ${
          accent ? 'text-[var(--accent-strong)]' : 'text-[var(--text-primary)]'
        }`}
      >
        {value}
      </p>
      <p className="mt-1 text-sm text-[var(--text-muted)]">{label}</p>
    </div>
  );
}

// ── DeleteModal ────────────────────────────────────────────────────────────
function DeleteModal({ shop, onCancel, onConfirm, isDeleting }) {
  const [input, setInput] = useState('');
  const matches = input.trim() === shop.name.trim();

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      style={{ background: 'var(--overlay)', backdropFilter: 'blur(4px)' }}
    >
      <div
        className="w-full max-w-md rounded-2xl border bg-[var(--surface-primary)] p-6"
        style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.32)' }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <AlertIcon className="h-6 w-6" />
        </div>

        <h3 className="mt-4 text-lg font-bold text-[var(--text-primary)]">Delete Shop Forever</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          You are about to permanently delete{' '}
          <strong className="font-semibold text-[var(--text-primary)]">{shop.name}</strong> and{' '}
          <em>all</em> its data — users, products, sales, expenses, stock records, and audit logs.{' '}
          <strong className="text-[var(--danger)]">This cannot be undone.</strong>
        </p>

        <div className="mt-5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3">
          <p className="text-sm text-[var(--danger)]">
            Type{' '}
            <code className="rounded bg-[var(--danger-soft-strong)] px-1.5 py-0.5 font-mono font-bold text-[var(--danger)]">
              {shop.name}
            </code>{' '}
            below to confirm
          </p>
        </div>

        <input
          type="text"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={shop.name}
          autoFocus
          className="mt-3 w-full rounded-xl border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-primary)] placeholder:text-[var(--text-muted)] focus:border-[var(--danger)] focus:outline-none focus:ring-2 focus:ring-[var(--danger)]/20"
        />

        <div className="mt-5 flex gap-3">
          <button
            type="button"
            onClick={onCancel}
            className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-tertiary)]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={!matches || isDeleting}
            className="flex-1 rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--danger-hover)] disabled:cursor-not-allowed disabled:opacity-40"
          >
            {isDeleting ? 'Deleting…' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function Shops() {
  const currentUser = getUser();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [shopToDelete, setShopToDelete] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [sortKey, setSortKey] = useState('joined');
  const [sortDir, setSortDir] = useState('desc');
  const mountedRef = useRef(true);

  useBodyScrollLock(Boolean(shopToDelete));

  const load = async (isInitial = false) => {
    try {
      if (isInitial) setLoading(true);
      else setRefreshing(true);
      const data = await fetchPlatformOverview();
      if (mountedRef.current) {
        setOverview(data);
        setError('');
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Failed to load platform overview.');
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
    const intervalId = window.setInterval(() => load(false), 30000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(intervalId);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const shops = overview?.shops || [];
  const summary = overview?.summary || {
    totalShops: 0,
    activeShops: 0,
    recentlyActiveShops: 0,
    newShopsToday: 0,
    totalUsers: 0,
  };

  const derived = useMemo(() => {
    const totalProducts = shops.reduce((acc, s) => acc + Number(s.metrics?.productCount || 0), 0);
    const totalSales = shops.reduce((acc, s) => acc + Number(s.metrics?.saleCount || 0), 0);
    const topShops = [...shops]
      .sort((a, b) => Number(b.metrics?.saleCount || 0) - Number(a.metrics?.saleCount || 0))
      .slice(0, 5);
    const windowHours = overview?.activityWindowHours || 24;
    const threshold = new Date(Date.now() - windowHours * 3600000);
    const recentlyActive = shops.filter(
      (s) => s.activity?.lastLoginAt && new Date(s.activity.lastLoginAt) >= threshold
    );
    const atRisk = shops.filter(
      (s) => !s.activity?.lastLoginAt && Number(s.metrics?.saleCount || 0) === 0
    );
    const latestSignups = [...shops]
      .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
      .slice(0, 4);
    return { totalProducts, totalSales, topShops, recentlyActive, atRisk, latestSignups, windowHours };
  }, [shops, overview?.activityWindowHours]);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'));
    } else {
      setSortKey(key);
      setSortDir(key === 'name' || key === 'ownerName' ? 'asc' : 'desc');
    }
  };

  const sortedShops = useMemo(() => {
    const arr = [...shops];
    arr.sort((a, b) => {
      let va, vb;
      switch (sortKey) {
        case 'name':
          va = String(a.name || '').toLowerCase();
          vb = String(b.name || '').toLowerCase();
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'ownerName':
          va = String(a.owner?.name || '').toLowerCase();
          vb = String(b.owner?.name || '').toLowerCase();
          return sortDir === 'asc' ? va.localeCompare(vb) : vb.localeCompare(va);
        case 'status':
          va = a.isActive ? 1 : 0;
          vb = b.isActive ? 1 : 0;
          break;
        case 'users':
          va = Number(a.metrics?.userCount || 0);
          vb = Number(b.metrics?.userCount || 0);
          break;
        case 'products':
          va = Number(a.metrics?.productCount || 0);
          vb = Number(b.metrics?.productCount || 0);
          break;
        case 'sales':
          va = Number(a.metrics?.saleCount || 0);
          vb = Number(b.metrics?.saleCount || 0);
          break;
        case 'lastLogin':
          va = a.activity?.lastLoginAt ? new Date(a.activity.lastLoginAt).getTime() : 0;
          vb = b.activity?.lastLoginAt ? new Date(b.activity.lastLoginAt).getTime() : 0;
          break;
        case 'joined':
        default:
          va = new Date(a.createdAt).getTime();
          vb = new Date(b.createdAt).getTime();
      }
      if (va === vb) return 0;
      return sortDir === 'asc' ? (va > vb ? 1 : -1) : va < vb ? 1 : -1;
    });
    return arr;
  }, [shops, sortKey, sortDir]);

  const sortHeader = (key, label, className = '') => (
    <button
      type="button"
      onClick={() => handleSort(key)}
      className={`group inline-flex items-center gap-1 font-semibold transition hover:text-[var(--accent-strong)] ${className}`}
    >
      {label}
      <svg
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        strokeWidth="2"
        className={`h-3 w-3 transition ${sortKey === key ? 'opacity-100 text-[var(--accent-strong)]' : 'opacity-40 group-hover:opacity-80'} ${sortKey === key && sortDir === 'asc' ? 'rotate-180' : ''}`}
      >
        <polyline points="6 9 12 15 18 9" />
      </svg>
    </button>
  );

  const handleDeleteClick = (shop) => setShopToDelete(shop);

  const handleDeleteConfirm = async () => {
    if (!shopToDelete) return;
    const id = shopToDelete.id;
    setDeletingId(id);
    try {
      await deleteShop(id);
      setOverview((prev) =>
        prev ? { ...prev, shops: prev.shops.filter((s) => s.id !== id) } : prev
      );
      setShopToDelete(null);
    } catch (err) {
      setError(err.message || 'Failed to delete shop.');
      setShopToDelete(null);
    } finally {
      setDeletingId(null);
    }
  };

  if (currentUser?.role !== 'SuperAdmin') return <Navigate to="/app" replace />;

  return (
    <>
      {shopToDelete && (
        <DeleteModal
          shop={shopToDelete}
          onCancel={() => setShopToDelete(null)}
          onConfirm={handleDeleteConfirm}
          isDeleting={deletingId === shopToDelete.id}
        />
      )}

      <div className="space-y-6">
        {/* ── HERO HEADER ────────────────────────────────────────────── */}
        <section className="app-panel relative overflow-hidden rounded-2xl border p-6">

          <div className="relative flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
            <div>
              <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-[var(--accent)]/25 bg-[var(--accent-soft)] px-3 py-1.5">
                <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
                <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[var(--accent-strong)]">
                  Platform Console
                </span>
              </div>
              <h1 className="text-3xl font-bold tracking-tight text-[var(--text-primary)]">
                Registered Shops
              </h1>
              <p className="mt-2 max-w-xl text-sm leading-6 text-[var(--text-muted)]">
                Monitor all tenants, manage shop status, and view platform health — without
                accessing any shop&apos;s business data or revenue.
              </p>
            </div>

            <div className="flex shrink-0 flex-col items-end gap-2">
              <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2.5">
                <span className="relative flex h-2.5 w-2.5">
                  <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                  <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                </span>
                <span className="text-sm font-semibold text-[var(--text-primary)]">
                  {currentUser?.name || 'Super Admin'}
                </span>
              </div>
              <button
                type="button"
                onClick={() => load(false)}
                className="flex items-center gap-1.5 rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-2 text-xs font-medium text-[var(--text-muted)] transition hover:border-[var(--border-strong)] hover:text-[var(--text-primary)]"
              >
                <span className={refreshing ? 'animate-spin' : ''}>
                  <RefreshIcon />
                </span>
                {refreshing ? 'Refreshing…' : `Updated ${formatRelativeTime(overview?.generatedAt)}`}
              </button>
            </div>
          </div>

          {/* 6-card metric strip */}
          <div className="relative mt-6 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
            <MetricCard icon={<StoreIcon />} eyebrow="Tenants" value={summary.totalShops.toLocaleString()} label="Registered shops" accent />
            <MetricCard icon={<ActivityIcon />} eyebrow="Active" value={summary.activeShops.toLocaleString()} label="Enabled on platform" />
            <MetricCard icon={<RefreshIcon />} eyebrow={`Last ${derived.windowHours}h`} value={summary.recentlyActiveShops.toLocaleString()} label="Shops with logins" />
            <MetricCard icon={<UsersIcon2 />} eyebrow="Accounts" value={summary.totalUsers.toLocaleString()} label="Users across shops" />
            <MetricCard icon={<PackageIcon />} eyebrow="Catalogue" value={derived.totalProducts.toLocaleString()} label="Products listed" />
            <MetricCard icon={<ChartIcon />} eyebrow="Transactions" value={derived.totalSales.toLocaleString()} label="Total sales recorded" />
          </div>
        </section>

        {/* ── ERROR BANNER ───────────────────────────────────────────── */}
        {error && (
          <div className="flex items-center gap-3 rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">
            <AlertIcon />
            {error}
          </div>
        )}

        {/* ── INSIGHTS ROW ───────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-3">
          <div className="app-panel rounded-2xl border p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Growth Today</p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)]">{summary.newShopsToday}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">New shops signed up today</p>
            <div className="mt-4 h-px bg-[var(--border-default)]" />
            <p className="mt-3 text-xs text-[var(--text-muted)]">
              {summary.activeShops} of {summary.totalShops} shops currently enabled
            </p>
          </div>

          <div className="app-panel rounded-2xl border p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Most Active Shop</p>
            {derived.topShops[0] ? (
              <>
                <p className="mt-3 truncate text-xl font-bold text-[var(--text-primary)]">{derived.topShops[0].name}</p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  <span className="rounded-full bg-emerald-500/15 px-2.5 py-0.5 text-xs font-bold text-emerald-600">
                    {Number(derived.topShops[0].metrics?.saleCount || 0).toLocaleString()} sales
                  </span>
                  <span className="text-xs text-[var(--text-muted)]">
                    {Number(derived.topShops[0].metrics?.userCount || 0)} users
                  </span>
                </div>
                <div className="mt-4 h-px bg-[var(--border-default)]" />
                <p className="mt-3 text-xs text-[var(--text-muted)]">
                  Admin: <span className="font-medium text-[var(--text-primary)]">{derived.topShops[0].owner?.username || 'Not set'}</span>
                </p>
              </>
            ) : (
              <p className="mt-3 text-sm text-[var(--text-muted)]">No activity recorded yet</p>
            )}
          </div>

          <div className="app-panel rounded-2xl border p-5">
            <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[var(--text-muted)]">Needs Attention</p>
            <p className="mt-3 text-4xl font-bold tracking-tight text-[var(--text-primary)]">{derived.atRisk.length}</p>
            <p className="mt-1 text-sm text-[var(--text-muted)]">Shops with no sales &amp; no login activity</p>
            <div className="mt-4 h-px bg-[var(--border-default)]" />
            <p className="mt-3 flex items-center gap-1.5 text-xs text-[var(--text-muted)]">
              <ShieldIcon />
              Revenue stays strictly inside each shop
            </p>
          </div>
        </div>

        {/* ── ACTIVITY + TOP SHOPS ───────────────────────────────────── */}
        <div className="grid gap-6 xl:grid-cols-[1.3fr_0.7fr]">
          {/* Recently active */}
          <div className="app-panel rounded-2xl border p-5 sm:p-6">
            <div className="flex items-center justify-between border-b border-[var(--border-default)] pb-4">
              <div>
                <h3 className="font-semibold text-[var(--text-primary)]">Recently Active Shops</h3>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                  Shops with a user login in the last {derived.windowHours} hours
                </p>
              </div>
              <span className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1.5 text-sm font-semibold text-[var(--text-muted)]">
                {derived.recentlyActive.length} live
              </span>
            </div>

            {loading ? (
              <div className="mt-4 space-y-3">
                {[1, 2, 3].map((i) => (
                  <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
                ))}
              </div>
            ) : derived.recentlyActive.length === 0 ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No shops active right now</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Activity appears here as users log in across shops</p>
              </div>
            ) : (
              <div className="mt-4 space-y-3">
                {derived.recentlyActive.map((shop) => (
                  <div key={shop.id} className="app-panel-soft rounded-2xl border p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-center gap-3">
                        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-strong)]">
                          {String(shop.name || 'S').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="font-semibold text-[var(--text-primary)]">{shop.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">
                            {shop.owner?.username || 'No admin'} &middot; {shop.currency}
                          </p>
                        </div>
                      </div>
                      <span className="shrink-0 rounded-full bg-emerald-500/15 px-2.5 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-600">
                        Active
                      </span>
                    </div>
                    <div className="mt-3 grid grid-cols-3 gap-1 rounded-xl bg-[var(--surface-secondary)] px-3 py-2.5 text-center">
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Last Login</p>
                        <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{formatRelativeTime(shop.activity?.lastLoginAt)}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Last User</p>
                        <p className="mt-0.5 truncate text-xs font-semibold text-[var(--text-primary)]">{shop.activity?.lastActiveUser?.username || '—'}</p>
                      </div>
                      <div>
                        <p className="text-[10px] font-medium uppercase tracking-wide text-[var(--text-muted)]">Role</p>
                        <p className="mt-0.5 text-xs font-semibold text-[var(--text-primary)]">{shop.activity?.lastActiveUser?.role || '—'}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right column */}
          <div className="flex flex-col gap-6">
            {/* Top by transactions */}
            <div className="app-panel rounded-2xl border p-5">
              <div className="border-b border-[var(--border-default)] pb-4">
                <h3 className="font-semibold text-[var(--text-primary)]">Top by Transactions</h3>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">Ranked by recorded sales</p>
              </div>
              {loading ? (
                <div className="mt-4 space-y-2">
                  {[1, 2, 3, 4, 5].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--surface-secondary)]" />
                  ))}
                </div>
              ) : derived.topShops.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--text-muted)]">No data yet</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {derived.topShops.map((shop, i) => (
                    <div key={shop.id} className="flex items-center gap-3 rounded-xl border border-[var(--border-default)] px-3 py-2.5 transition hover:bg-[var(--surface-secondary)]">
                      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-xs font-bold ${i === 0 ? 'bg-amber-400/20 text-amber-600' : i === 1 ? 'bg-slate-400/15 text-slate-500' : i === 2 ? 'bg-orange-400/15 text-orange-500' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                        {i + 1}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{shop.name}</p>
                        <p className="text-xs text-[var(--text-muted)]">{shop.owner?.username || 'No admin'}</p>
                      </div>
                      <div className="text-right">
                        <p className="text-sm font-bold text-[var(--text-primary)]">{Number(shop.metrics?.saleCount || 0).toLocaleString()}</p>
                        <p className="text-[10px] text-[var(--text-muted)]">sales</p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latest signups */}
            <div className="app-panel rounded-2xl border p-5">
              <div className="border-b border-[var(--border-default)] pb-4">
                <h3 className="font-semibold text-[var(--text-primary)]">Latest Signups</h3>
                <p className="mt-0.5 text-sm text-[var(--text-muted)]">Most recently joined shops</p>
              </div>
              {loading ? (
                <div className="mt-4 space-y-2">
                  {[1, 2, 3, 4].map((i) => (
                    <div key={i} className="h-12 animate-pulse rounded-xl bg-[var(--surface-secondary)]" />
                  ))}
                </div>
              ) : derived.latestSignups.length === 0 ? (
                <p className="mt-4 text-sm text-[var(--text-muted)]">No shops yet</p>
              ) : (
                <div className="mt-4 space-y-2">
                  {derived.latestSignups.map((shop) => (
                    <div key={shop.id} className="flex items-center justify-between gap-3 rounded-xl border border-[var(--border-default)] px-3 py-2.5 transition hover:bg-[var(--surface-secondary)]">
                      <div className="flex min-w-0 items-center gap-2.5">
                        <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--surface-secondary)] text-xs font-bold text-[var(--text-muted)]">
                          {String(shop.name || 'S').slice(0, 1).toUpperCase()}
                        </div>
                        <div className="min-w-0">
                          <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{shop.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{shop.owner?.username || 'No admin'}</p>
                        </div>
                      </div>
                      <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold ${shop.isActive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                        {shop.isActive ? 'Active' : 'Paused'}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* ── TENANT DIRECTORY ───────────────────────────────────────── */}
        <section className="app-panel rounded-2xl border p-5 sm:p-6">
          <div className="flex flex-col gap-2 border-b border-[var(--border-default)] pb-4 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <h3 className="font-semibold text-[var(--text-primary)]">Tenant Directory</h3>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">Full platform registry — all shops, admins, and usage footprint</p>
            </div>
            <span className="rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-1.5 text-sm font-medium text-[var(--text-muted)]">
              {shops.length} records
            </span>
          </div>

          {loading ? (
            <div className="mt-5 space-y-3">
              {[1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-16 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
              ))}
            </div>
          ) : shops.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center">
              <p className="text-sm font-semibold text-[var(--text-primary)]">No registered shops yet</p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">Shops will appear here once they sign up</p>
            </div>
          ) : (
            <div className="mt-5 overflow-x-auto rounded-xl border border-[var(--border-default)]">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-3">{sortHeader('name', 'Shop')}</th>
                    <th className="px-4 py-3">{sortHeader('ownerName', 'Admin')}</th>
                    <th className="px-4 py-3">{sortHeader('status', 'Status')}</th>
                    <th className="px-4 py-3 text-center">{sortHeader('users', 'Users', 'justify-center')}</th>
                    <th className="px-4 py-3 text-center">{sortHeader('products', 'Products', 'justify-center')}</th>
                    <th className="px-4 py-3 text-center">{sortHeader('sales', 'Sales', 'justify-center')}</th>
                    <th className="px-4 py-3">{sortHeader('lastLogin', 'Last Login')}</th>
                    <th className="px-4 py-3">{sortHeader('joined', 'Joined')}</th>
                    <th className="px-4 py-3 text-center font-semibold">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)] bg-[var(--surface-primary)]">
                  {sortedShops.map((shop) => (
                    <tr key={shop.id} className="app-row-hover transition">
                      <td data-label="Shop" className="px-4 py-3.5">
                        <div className="flex items-center gap-2.5">
                          <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-strong)]">
                            {String(shop.name || 'S').slice(0, 1).toUpperCase()}
                          </div>
                          <div className="min-w-0">
                            <p className="font-semibold leading-tight text-[var(--text-primary)]">{shop.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{shop.currency}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="Admin" className="px-4 py-3.5">
                        {shop.owner ? (
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{shop.owner.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">
                              @{shop.owner.username}
                              {shop.owner.email ? <span className="font-medium text-[var(--accent-strong)]"> · {shop.owner.email}</span> : null}
                            </p>
                          </div>
                        ) : (
                          <span className="text-[var(--text-muted)]">—</span>
                        )}
                      </td>
                      <td data-label="Status" className="px-4 py-3.5">
                        <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${shop.isActive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                          {shop.isActive ? 'Active' : 'Paused'}
                        </span>
                      </td>
                      <td data-label="Users" className="px-4 py-3.5 text-right font-semibold text-[var(--text-primary)] md:text-center">{Number(shop.metrics?.userCount || 0)}</td>
                      <td data-label="Products" className="px-4 py-3.5 text-right font-semibold text-[var(--text-primary)] md:text-center">{Number(shop.metrics?.productCount || 0)}</td>
                      <td data-label="Sales" className="px-4 py-3.5 text-right font-semibold text-[var(--text-primary)] md:text-center">{Number(shop.metrics?.saleCount || 0).toLocaleString()}</td>
                      <td data-label="Last Login" className="px-4 py-3.5 text-sm text-[var(--text-muted)]">{formatRelativeTime(shop.activity?.lastLoginAt)}</td>
                      <td data-label="Joined" className="px-4 py-3.5 text-sm text-[var(--text-muted)]">{new Date(shop.createdAt).toLocaleDateString()}</td>
                      <td data-label="Action" className="px-4 py-3.5 text-right md:text-center">
                        <button
                          type="button"
                          onClick={() => handleDeleteClick(shop)}
                          disabled={deletingId === shop.id}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-3 py-1.5 text-xs font-bold text-[var(--danger)] transition hover:bg-[var(--danger-soft-strong)] disabled:cursor-not-allowed disabled:opacity-50"
                          title={`Delete ${shop.name}`}
                        >
                          <TrashIcon />
                          {deletingId === shop.id ? 'Deleting…' : 'Delete'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </div>
    </>
  );
}
