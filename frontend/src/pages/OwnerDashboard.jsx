import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { fetchPlatformDashboard } from '../utils/api';
import { getUser } from '../utils/auth';
import { Alert, Badge, EmptyState, Panel, PanelHeader, SkeletonRows, StatTile, Tabs, icons, statIcons } from '../components/ui';

const RANGE_OPTIONS = [
  { key: 7, label: '7 days' },
  { key: 14, label: '14 days' },
  { key: 30, label: '30 days' },
  { key: 90, label: '90 days' },
];

function relativeTime(value) {
  if (!value) return '-';
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(value).toLocaleDateString();
}

function activityText(event) {
  if (event.action === 'LOGIN') return 'signed in';
  if (event.action === 'LOGOUT') return 'signed out';
  if (event.entityType === 'SALE' && event.action === 'CREATE') return 'made a sale';
  if (event.entityType === 'CREDIT_PAYMENT') return 'received a credit payment';
  const verb = { CREATE: 'added', UPDATE: 'updated', DELETE: 'deleted' }[event.action] || event.action.toLowerCase();
  return `${verb} ${String(event.entityType || '').toLowerCase().replace(/_/g, ' ')}`;
}

function exportToCSV(data) {
  const s = data.summary;
  const rows = [
    ['StockDesk platform export', new Date().toLocaleString()],
    [],
    ['Metric', 'Value'],
    ['Shops', s.totalShops], ['Active shops', s.activeShops], ['Active in last 24h', s.recentlyActiveShops], ['New today', s.newShopsToday],
    ['Team accounts', s.totalUsers], ['Products', s.totalProducts], ['Sales', s.totalSales], ['Pending signups', s.pendingSignups], ['Unverified users', s.unverifiedUsers],
    [],
    ['Top shops', 'Users', 'Products', 'Sales'],
    ...(data.topShops || []).map((shop) => [`"${shop.name.replace(/"/g, '""')}"`, shop.metrics?.userCount || 0, shop.metrics?.productCount || 0, shop.metrics?.saleCount || 0]),
    [],
    ['Date', 'Sales', 'Signups'],
    ...(data.salesTrend || []).map((d, i) => [d.day, d.count, data.signupsTrend?.[i]?.count || 0]),
  ];
  const blob = new Blob([rows.map((r) => r.join(',')).join('\n')], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `stockdesk-platform-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

function TrendChart({ data, color, label }) {
  if (!data.length || data.every((d) => !d.count)) {
    return <p className="px-5 py-16 text-center text-sm text-[var(--text-muted)]">No {label.toLowerCase()} in this period.</p>;
  }
  return (
    <div className="h-56 px-2 pb-3 pt-4">
      <ResponsiveContainer width="100%" height="100%">
        <AreaChart data={data} margin={{ top: 4, right: 12, left: 0, bottom: 0 }}>
          <defs>
            <linearGradient id={`fill-${label}`} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={color} stopOpacity={0.18} />
              <stop offset="100%" stopColor={color} stopOpacity={0} />
            </linearGradient>
          </defs>
          <CartesianGrid vertical={false} stroke="var(--chart-grid)" />
          <XAxis dataKey="label" tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={11} minTickGap={24} />
          <YAxis width={32} allowDecimals={false} tickLine={false} axisLine={false} stroke="var(--text-muted)" fontSize={11} />
          <Tooltip
            cursor={{ stroke: color, strokeDasharray: '3 3' }}
            contentStyle={{ background: 'var(--surface-primary)', border: '1px solid var(--border-default)', borderRadius: 8, fontSize: 12 }}
            formatter={(value) => [value, label]}
          />
          <Area type="monotone" dataKey="count" stroke={color} strokeWidth={2} fill={`url(#fill-${label})`} dot={false} />
        </AreaChart>
      </ResponsiveContainer>
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
      if (mountedRef.current) setError(err.message || 'Could not load the platform overview.');
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

  const s = data?.summary || { totalShops: 0, activeShops: 0, recentlyActiveShops: 0, newShopsToday: 0, totalUsers: 0, totalProducts: 0, totalSales: 0, pendingSignups: 0, unverifiedUsers: 0 };
  const waiting = s.pendingSignups + s.unverifiedUsers;
  const activeRate = s.totalShops ? Math.round((s.recentlyActiveShops / s.totalShops) * 100) : 0;
  const periodSales = (data?.salesTrend || []).reduce((sum, d) => sum + d.count, 0);
  const periodSignups = (data?.signupsTrend || []).reduce((sum, d) => sum + d.count, 0);

  return (
    <div className="space-y-5">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm text-[var(--text-muted)]">Hello {currentUser?.name?.split(' ')[0] || 'there'}, here is how the network is doing.</p>
          <p className="text-xs text-[var(--text-muted)]">{refreshing ? 'Refreshing…' : data?.generatedAt ? `Updated ${relativeTime(data.generatedAt)} · refreshes every minute` : ''}</p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs label="Period" value={trendDays} onChange={setTrendDays} tabs={RANGE_OPTIONS} />
          <button type="button" onClick={() => data && exportToCSV(data)} disabled={!data} className="app-btn-secondary inline-flex items-center gap-1.5 rounded-lg border px-3 py-2 text-sm font-medium disabled:opacity-50">
            {icons.download}
            Export
          </button>
        </div>
      </div>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <section className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatTile label="Shops" value={s.totalShops.toLocaleString()} hint={`${s.activeShops.toLocaleString()} enabled`} icon={statIcons.store} />
        <StatTile label="Active in last 24h" value={s.recentlyActiveShops.toLocaleString()} hint={`${activeRate}% of shops`} tone={activeRate >= 50 ? 'success' : 'warning'} icon={statIcons.pulse} iconTone="success" />
        <StatTile label="New shops today" value={s.newShopsToday.toLocaleString()} hint={`${periodSignups} in the last ${trendDays} days`} tone={s.newShopsToday ? 'success' : 'default'} icon={statIcons.calendar} iconTone="info" />
        <StatTile label="Waiting on email" value={waiting.toLocaleString()} hint={`${s.pendingSignups} signups · ${s.unverifiedUsers} users`} tone={waiting ? 'warning' : 'default'} icon={statIcons.alert} iconTone="warning" />
        <StatTile label="Team accounts" value={s.totalUsers.toLocaleString()} hint="Across all shops"  icon={statIcons.users} iconTone="violet" />
        <StatTile label="Products listed" value={s.totalProducts.toLocaleString()} hint="Across all shops"  icon={statIcons.box} />
        <StatTile label="Sales recorded" value={s.totalSales.toLocaleString()} hint="All time"  icon={statIcons.receipt} iconTone="success" />
        <StatTile label={`Sales · ${trendDays} days`} value={periodSales.toLocaleString()} hint={`${(periodSales / trendDays).toFixed(1)} per day`} icon={statIcons.money} iconTone="info" />
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <Panel>
          <PanelHeader title="Sales across all shops" description={`Transactions per day · last ${trendDays} days`} />
          {loading ? <SkeletonRows rows={4} /> : <TrendChart data={data?.salesTrend || []} color="var(--chart-1)" label="Sales" />}
        </Panel>
        <Panel>
          <PanelHeader title="New shops" description={`Sign-ups per day · last ${trendDays} days`} />
          {loading ? <SkeletonRows rows={4} /> : <TrendChart data={data?.signupsTrend || []} color="var(--chart-3)" label="Signups" />}
        </Panel>
      </div>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,1fr)_420px]">
        <Panel>
          <PanelHeader title="Busiest shops" description="Ranked by sales recorded" actions={<Link to="/app/shops" className="text-sm font-medium text-[var(--accent)] hover:underline">All shops</Link>} />
          {loading ? (
            <SkeletonRows rows={5} />
          ) : !(data?.topShops || []).length ? (
            <EmptyState title="No shops yet" />
          ) : (
            <div className="overflow-x-auto">
              <table className="table-cards min-w-full text-left text-sm">
                <thead className="app-table-head">
                  <tr>
                    <th className="px-4 py-2.5 font-medium">Shop</th>
                    <th className="px-4 py-2.5 text-right font-medium">Team</th>
                    <th className="px-4 py-2.5 text-right font-medium">Products</th>
                    <th className="px-4 py-2.5 text-right font-medium">Sales</th>
                    <th className="px-4 py-2.5"><span className="sr-only">Open</span></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--border-default)]">
                  {data.topShops.map((shop, index) => (
                    <tr key={shop.id} className="app-row-hover">
                      <td data-label="Shop" className="px-4 py-2.5">
                        <div className="flex items-center gap-3">
                          <span className="num hidden w-5 text-xs text-[var(--text-muted)] md:inline">{index + 1}</span>
                          <div className="min-w-0">
                            <p className="font-medium text-[var(--text-primary)]">{shop.name}</p>
                            <p className="text-xs text-[var(--text-muted)]">{shop.currency} · joined {new Date(shop.createdAt).toLocaleDateString(undefined, { month: 'short', year: 'numeric' })}</p>
                          </div>
                          {!shop.isActive ? <Badge tone="danger">Disabled</Badge> : null}
                        </div>
                      </td>
                      <td data-label="Team" className="num px-4 py-2.5 text-right">{shop.metrics?.userCount || 0}</td>
                      <td data-label="Products" className="num px-4 py-2.5 text-right">{(shop.metrics?.productCount || 0).toLocaleString()}</td>
                      <td data-label="Sales" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{(shop.metrics?.saleCount || 0).toLocaleString()}</td>
                      <td className="px-4 py-2.5 text-right">
                        <Link to={`/app/shops/${shop.id}`} className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]" aria-label={`Open ${shop.name}`}>{icons.chevronRight}</Link>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Live activity" description={`Across all shops · last ${data?.activityWindowHours || 24} hours`} />
          {loading ? (
            <SkeletonRows rows={6} />
          ) : !(data?.liveActivity || []).length ? (
            <EmptyState title="Quiet right now" message="Sign-ins and sales from every shop appear here." />
          ) : (
            <ul className="max-h-[420px] divide-y divide-[var(--border-default)] overflow-y-auto">
              {data.liveActivity.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.action === 'DELETE' ? 'bg-red-500' : event.action === 'LOGIN' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
                  <div className="min-w-0 flex-1">
                    <p className="text-[var(--text-primary)]"><span className="font-medium">{event.user?.username || 'Someone'}</span> <span className="text-[var(--text-secondary)]">{activityText(event)}</span></p>
                    <p className="truncate text-xs text-[var(--text-muted)]">{event.shopName || 'Platform'}</p>
                  </div>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}
