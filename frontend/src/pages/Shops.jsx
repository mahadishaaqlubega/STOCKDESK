import { useEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { fetchPlatformOverview, deleteShop } from '../utils/api';
import { getUser } from '../utils/auth';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { Alert, Badge, EmptyState, IconButton, Modal, Panel, SearchInput, SkeletonRows, StatGrid, StatTile, Tabs, Toast, fieldInput, icons, statIcons } from '../components/ui';

function relativeTime(value) {
  if (!value) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return mins < 1 ? 'just now' : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  const days = Math.round(hrs / 24);
  return days < 30 ? `${days} d ago` : new Date(value).toLocaleDateString();
}

function DeleteShopModal({ shop, onCancel, onConfirm, isDeleting }) {
  const [input, setInput] = useState('');
  const matches = input.trim() === shop.name.trim();
  return (
    <Modal
      title="Delete shop permanently?"
      onClose={onCancel}
      size="sm"
      footer={(
        <>
          <button type="button" onClick={onCancel} className="app-btn-secondary flex-1 rounded-lg border px-4 py-2.5 text-sm font-medium">Cancel</button>
          <button type="button" onClick={onConfirm} disabled={!matches || isDeleting} className="app-btn-danger-solid flex-1 rounded-lg px-4 py-2.5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-40">
            {isDeleting ? 'Deleting…' : 'Delete shop'}
          </button>
        </>
      )}
    >
      <div className="space-y-4">
        <Alert tone="danger">
          This deletes <strong>{shop.name}</strong> and everything in it — {shop.metrics?.userCount || 0} team accounts, {(shop.metrics?.productCount || 0).toLocaleString()} products, {(shop.metrics?.saleCount || 0).toLocaleString()} sales, customers, expenses and history. It cannot be undone.
        </Alert>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          Type <span className="font-mono text-[var(--danger)]">{shop.name}</span> to confirm
          <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus className={`${fieldInput} font-mono`} placeholder={shop.name} />
        </label>
      </div>
    </Modal>
  );
}

const SORTS = {
  name: (s) => String(s.name || '').toLowerCase(),
  owner: (s) => String(s.owner?.name || '').toLowerCase(),
  users: (s) => Number(s.metrics?.userCount || 0),
  products: (s) => Number(s.metrics?.productCount || 0),
  sales: (s) => Number(s.metrics?.saleCount || 0),
  lastActive: (s) => (s.activity?.lastLoginAt ? new Date(s.activity.lastLoginAt).getTime() : 0),
  joined: (s) => new Date(s.createdAt).getTime(),
};

export default function Shops() {
  const currentUser = getUser();
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [sort, setSort] = useState({ key: 'joined', dir: 'desc' });
  const [shopToDelete, setShopToDelete] = useState(null);
  const [deleting, setDeleting] = useState(false);
  const [toast, setToast] = useState('');
  const mountedRef = useRef(true);

  useBodyScrollLock(Boolean(shopToDelete));

  const load = async () => {
    try {
      const data = await fetchPlatformOverview();
      if (mountedRef.current) {
        setOverview(data);
        setError('');
      }
    } catch (err) {
      if (mountedRef.current) setError(err.message || 'Could not load shops.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  };

  useEffect(() => {
    mountedRef.current = true;
    load();
    const id = window.setInterval(load, 30000);
    return () => {
      mountedRef.current = false;
      window.clearInterval(id);
    };
  }, []);

  const shops = overview?.shops || [];
  const windowHours = overview?.activityWindowHours || 24;

  const groups = useMemo(() => {
    const threshold = Date.now() - windowHours * 3600000;
    const isActive = (s) => s.activity?.lastLoginAt && new Date(s.activity.lastLoginAt).getTime() >= threshold;
    return {
      all: shops,
      active: shops.filter(isActive),
      attention: shops.filter((s) => !s.activity?.lastLoginAt && Number(s.metrics?.saleCount || 0) === 0),
      disabled: shops.filter((s) => !s.isActive),
      newToday: shops.filter((s) => new Date(s.createdAt).toDateString() === new Date().toDateString()),
    };
  }, [shops, windowHours]);

  const visible = useMemo(() => {
    const q = search.trim().toLowerCase();
    const base = groups[filter] || shops;
    const filtered = q
      ? base.filter((s) => [s.name, s.slug, s.owner?.name, s.owner?.username, s.owner?.email].some((v) => String(v || '').toLowerCase().includes(q)))
      : base;
    const pick = SORTS[sort.key];
    return [...filtered].sort((a, b) => {
      const va = pick(a);
      const vb = pick(b);
      if (va === vb) return 0;
      const order = va > vb ? 1 : -1;
      return sort.dir === 'asc' ? order : -order;
    });
  }, [groups, filter, search, sort, shops]);

  const toggleSort = (key) => setSort((prev) => (prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' || key === 'owner' ? 'asc' : 'desc' }));

  const SortHeader = ({ id, children, align = 'left' }) => (
    <th className={`px-4 py-2.5 font-medium ${align === 'right' ? 'text-right' : ''}`} aria-sort={sort.key === id ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => toggleSort(id)} className="inline-flex items-center gap-1 hover:text-[var(--text-primary)]">
        {children}
        <span className={`text-[10px] ${sort.key === id ? 'opacity-100' : 'opacity-0'}`}>{sort.dir === 'asc' ? '▲' : '▼'}</span>
      </button>
    </th>
  );

  const handleDelete = async () => {
    if (!shopToDelete) return;
    setDeleting(true);
    try {
      await deleteShop(shopToDelete.id);
      setOverview((prev) => (prev ? { ...prev, shops: prev.shops.filter((s) => s.id !== shopToDelete.id) } : prev));
      setToast(`${shopToDelete.name} deleted.`);
      window.setTimeout(() => setToast(''), 3000);
    } catch (err) {
      setError(err.message || 'Could not delete the shop.');
    } finally {
      setDeleting(false);
      setShopToDelete(null);
    }
  };

  if (currentUser?.role !== 'SuperAdmin') return <Navigate to="/app" replace />;

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatTile label="Shops" value={shops.length.toLocaleString()} hint={`${(overview?.summary?.totalUsers || 0).toLocaleString()} team accounts`} onClick={() => setFilter('all')} active={filter === 'all'} icon={statIcons.store} />
        <StatTile label={`Active · last ${windowHours}h`} value={groups.active.length.toLocaleString()} hint="Someone signed in or sold" tone="success" onClick={() => setFilter('active')} active={filter === 'active'} icon={statIcons.pulse} iconTone="success" />
        <StatTile label="Need attention" value={groups.attention.length.toLocaleString()} hint="No sign-ins and no sales yet" tone={groups.attention.length ? 'warning' : 'default'} onClick={() => setFilter('attention')} active={filter === 'attention'} icon={statIcons.alert} iconTone="warning" />
        <StatTile label="New today" value={groups.newToday.length.toLocaleString()} hint="Signed up today" onClick={() => setFilter('newToday')} active={filter === 'newToday'} icon={statIcons.calendar} iconTone="info" />
      </StatGrid>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <Panel>
        <div className="flex flex-col gap-3 border-b border-[var(--border-default)] p-4 lg:flex-row lg:items-center lg:justify-between">
          <SearchInput value={search} onChange={setSearch} placeholder="Search shop, owner or email" className="lg:w-80" />
          <Tabs
            label="Filter shops"
            value={filter}
            onChange={setFilter}
            tabs={[
              { key: 'all', label: 'All', count: groups.all.length },
              { key: 'active', label: 'Active', count: groups.active.length },
              { key: 'attention', label: 'Need attention', count: groups.attention.length },
              { key: 'disabled', label: 'Disabled', count: groups.disabled.length },
            ]}
          />
        </div>

        {loading ? (
          <SkeletonRows rows={8} />
        ) : visible.length === 0 ? (
          <EmptyState title="No shops match" message="Try another search or filter." />
        ) : (
          <div className="overflow-x-auto">
            <table className="table-cards min-w-full text-left text-sm">
              <thead className="app-table-head">
                <tr>
                  <SortHeader id="name">Shop</SortHeader>
                  <SortHeader id="owner">Owner</SortHeader>
                  <SortHeader id="users" align="right">Team</SortHeader>
                  <SortHeader id="products" align="right">Products</SortHeader>
                  <SortHeader id="sales" align="right">Sales</SortHeader>
                  <SortHeader id="lastActive">Last active</SortHeader>
                  <SortHeader id="joined">Joined</SortHeader>
                  <th className="px-4 py-2.5"><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--border-default)]">
                {visible.map((shop) => (
                  <tr key={shop.id} className="app-row-hover">
                    <td data-label="Shop" className="px-4 py-2.5">
                      <Link to={`/app/shops/${shop.id}`} className="font-medium text-[var(--text-primary)] hover:text-[var(--accent)]">{shop.name}</Link>
                      <p className="text-xs text-[var(--text-muted)]">{shop.currency}</p>
                      {!shop.isActive ? <Badge tone="danger" className="mt-1">Disabled</Badge> : null}
                    </td>
                    <td data-label="Owner" className="px-4 py-2.5">
                      {shop.owner ? (
                        <>
                          <p className="text-[var(--text-primary)]">{shop.owner.name}</p>
                          <p className="text-xs text-[var(--text-muted)]">{shop.owner.email || `@${shop.owner.username}`}{shop.owner.email && !shop.owner.isVerified ? ' · unverified' : ''}</p>
                        </>
                      ) : <span className="text-[var(--text-muted)]">No admin</span>}
                    </td>
                    <td data-label="Team" className="num px-4 py-2.5 text-right">{shop.metrics?.userCount || 0}</td>
                    <td data-label="Products" className="num px-4 py-2.5 text-right">{(shop.metrics?.productCount || 0).toLocaleString()}</td>
                    <td data-label="Sales" className="num px-4 py-2.5 text-right font-medium text-[var(--text-primary)]">{(shop.metrics?.saleCount || 0).toLocaleString()}</td>
                    <td data-label="Last active" className="px-4 py-2.5 text-[var(--text-secondary)]">{relativeTime(shop.activity?.lastLoginAt) || <span className="text-[var(--text-muted)]">Never</span>}</td>
                    <td data-label="Joined" className="whitespace-nowrap px-4 py-2.5 text-[var(--text-muted)]">{new Date(shop.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                    <td data-label="Actions" className="px-4 py-2.5">
                      <div className="flex justify-end">
                        <Link to={`/app/shops/${shop.id}`} className="flex h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)]" aria-label={`Open ${shop.name}`} title="Open">{icons.chevronRight}</Link>
                        <IconButton label={`Delete ${shop.name}`} tone="danger" onClick={() => setShopToDelete(shop)}>{icons.trash}</IconButton>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Panel>

      {shopToDelete ? <DeleteShopModal shop={shopToDelete} onCancel={() => setShopToDelete(null)} onConfirm={handleDelete} isDeleting={deleting} /> : null}
      <Toast text={toast} />
    </div>
  );
}
