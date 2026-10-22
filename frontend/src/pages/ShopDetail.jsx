import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchShopDetail, deleteShop } from '../utils/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';

const ACTION_META = {
  CREATE: { label: 'Create', text: 'text-[var(--success)]', bg: 'bg-[rgba(74,168,132,0.12)]' },
  UPDATE: { label: 'Update', text: 'text-[var(--accent)]', bg: 'bg-[rgba(30,167,189,0.12)]' },
  DELETE: { label: 'Delete', text: 'text-[var(--danger)]', bg: 'bg-[rgba(218,106,90,0.12)]' },
  LOGIN: { label: 'Login', text: 'text-[#8e7cc3]', bg: 'bg-[rgba(142,124,195,0.12)]' },
  LOGOUT: { label: 'Logout', text: 'text-[var(--text-muted)]', bg: 'bg-[var(--surface-secondary)]' },
};

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

function Metric({ icon, label, value }) {
  return (
    <div className="app-panel rounded-xl border p-4 transition duration-200">
      <div className="flex items-center gap-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-[linear-gradient(135deg,rgba(30,167,189,0.18),rgba(30,167,189,0.08))] text-[var(--accent)] ring-1 ring-[rgba(30,167,189,0.12)]">
          {icon}
        </span>
        <div>
          <p className="text-xs font-medium text-[var(--text-muted)]">{label}</p>
          <p className="mt-0.5 text-2xl font-bold tracking-tight text-[var(--text-primary)]">{value.toLocaleString()}</p>
        </div>
      </div>
    </div>
  );
}

function DeleteModal({ shop, onCancel, onConfirm, isDeleting }) {
  const [input, setInput] = useState('');
  const matches = input.trim() === shop.name.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'var(--overlay)', backdropFilter: 'blur(4px)' }}>
      <div className="w-full max-w-md rounded-2xl border bg-[var(--surface-primary)] p-6" style={{ boxShadow: '0 32px 80px rgba(0,0,0,0.32)' }}>
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--danger-soft)] text-[var(--danger)]">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-6 w-6">
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" />
            <path d="M12 9v4" />
            <path d="M12 17h.01" />
          </svg>
        </div>
        <h3 className="mt-4 text-lg font-bold text-[var(--text-primary)]">Delete Shop Forever</h3>
        <p className="mt-2 text-sm leading-6 text-[var(--text-muted)]">
          You are about to permanently delete <strong className="font-semibold text-[var(--text-primary)]">{shop.name}</strong> and <em>all</em> its data — users, products, sales, expenses, stock records, and audit logs. <strong className="text-[var(--danger)]">This cannot be undone.</strong>
        </p>
        <div className="mt-5 rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3">
          <p className="text-sm text-[var(--danger)]">
            Type <code className="rounded bg-[var(--danger-soft-strong)] px-1.5 py-0.5 font-mono font-bold text-[var(--danger)]">{shop.name}</code> below to confirm
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
          <button type="button" onClick={onCancel} className="flex-1 rounded-xl border border-[var(--border-strong)] bg-[var(--surface-secondary)] px-4 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-tertiary)]">
            Cancel
          </button>
          <button type="button" onClick={onConfirm} disabled={!matches || isDeleting} className="flex-1 rounded-xl bg-[var(--danger)] px-4 py-2.5 text-sm font-bold text-white transition hover:bg-[var(--danger-hover)] disabled:cursor-not-allowed disabled:opacity-40">
            {isDeleting ? 'Deleting…' : 'Delete Forever'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ShopDetail() {
  const { id } = useParams();
  const navigate = useNavigate();
  const [shop, setShop] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useBodyScrollLock(confirmOpen);

  const load = async () => {
    try {
      setLoading(true);
      const data = await fetchShopDetail(id);
      setShop(data);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load shop.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  const handleDeleteConfirm = async () => {
    setDeleting(true);
    try {
      await deleteShop(id);
      navigate('/app/shops');
    } catch (err) {
      setError(err.message || 'Failed to delete shop.');
      setConfirmOpen(false);
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-36 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
        <div className="grid gap-4 sm:grid-cols-3">
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-24 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
          ))}
        </div>
        <div className="h-96 animate-pulse rounded-2xl bg-[var(--surface-secondary)]" />
      </div>
    );
  }

  if (error || !shop) {
    return (
      <div className="app-panel rounded-2xl border px-6 py-16 text-center">
        <p className="text-lg font-bold text-[var(--text-primary)]">{error || 'Shop not found'}</p>
        <Link to="/app/shops" className="mt-4 inline-block rounded-xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-5 py-2.5 text-sm font-semibold text-[var(--text-primary)] transition hover:bg-[var(--surface-tertiary)]">
          Back to shops
        </Link>
      </div>
    );
  }

  const m = shop.metrics || {};

  return (
    <>
      {confirmOpen && (
        <DeleteModal shop={{ name: shop.name }} onCancel={() => setConfirmOpen(false)} onConfirm={handleDeleteConfirm} isDeleting={deleting} />
      )}

      <div className="space-y-6">
        {/* ── HEADER ─────────────────────────────────────────────────── */}
        <div className="app-panel relative overflow-hidden rounded-2xl border p-6">
          <div className="relative">
            <Link to="/app/shops" className="inline-flex items-center gap-1.5 text-xs font-medium text-[var(--text-muted)] transition hover:text-[var(--text-primary)]">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
                <polyline points="15 18 9 12 15 6" />
              </svg>
              Back to all shops
            </Link>

            <div className="mt-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,var(--accent),var(--accent-hover))] text-xl font-bold text-white">
                  {String(shop.name || 'S').slice(0, 1).toUpperCase()}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2.5">
                    <h1 className="text-2xl font-bold tracking-tight text-[var(--text-primary)]">{shop.name}</h1>
                    <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold uppercase tracking-[0.1em] ${shop.isActive ? 'bg-emerald-500/15 text-emerald-600' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                      {shop.isActive ? 'Active' : 'Paused'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-[var(--text-muted)]">
                    {shop.slug} · {shop.currency} · Joined {new Date(shop.createdAt).toLocaleDateString()}
                  </p>
                  {shop.owner && (
                    <p className="mt-1 text-sm text-[var(--text-muted)]">
                      Admin: <span className="font-semibold text-[var(--text-primary)]">{shop.owner.name}</span> (@{shop.owner.username}) ·{' '}
                      <span className="font-medium text-[var(--text-primary)]">{shop.owner.email || 'no email set'}</span>{' '}
                      <span className={shop.owner.isVerified ? 'text-[var(--success)]' : 'text-[var(--warning)]'}>
                        · {shop.owner.isVerified ? 'email verified' : 'email unverified'}
                      </span>
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-col gap-2 sm:items-end">
                <div className="flex items-center gap-2 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-2.5">
                  <span className="relative flex h-2.5 w-2.5">
                    <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" />
                    <span className="relative inline-flex h-2.5 w-2.5 rounded-full bg-emerald-500" />
                  </span>
                  <span className="text-sm font-semibold text-[var(--text-primary)]">Last login {formatRelativeTime(shop.lastLoginAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmOpen(true)}
                  className="rounded-xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-2 text-xs font-bold text-[var(--danger)] transition hover:bg-[var(--danger-soft-strong)]"
                >
                  Delete shop
                </button>
              </div>
            </div>

            {shop.address || shop.phone ? (
              <div className="mt-5 flex flex-wrap gap-x-6 gap-y-2 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3 text-sm text-[var(--text-muted)]">
                {shop.phone && <span>📞 {shop.phone}</span>}
                {shop.address && <span>📍 {shop.address}</span>}
                <span>VAT {Number(shop.vat || 0)}%</span>
              </div>
            ) : null}
          </div>
        </div>

        {error && (
          <div className="rounded-2xl border border-[var(--danger-border)] bg-[var(--danger-soft)] px-4 py-3 text-sm font-medium text-[var(--danger)]">{error}</div>
        )}

        {/* ── METRICS ────────────────────────────────────────────────── */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
          <Metric label="Users" value={m.users || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" /><circle cx="9.5" cy="7" r="4" /></svg>} />
          <Metric label="Products" value={m.products || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="m3 7 9-4 9 4-9 4-9-4Z" /><path d="M12 11v10" /></svg>} />
          <Metric label="Sales" value={m.sales || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 19h16" /><path d="M7 16V9" /><path d="M12 16V5" /><path d="M17 16v-3" /></svg>} />
          <Metric label="Customers" value={m.customers || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><circle cx="9" cy="7" r="4" /><path d="M17 11a4 4 0 1 0-1-7" /><path d="M1 21v-2a4 4 0 0 1 4-4h8a4 4 0 0 1 4 4v2" /></svg>} />
          <Metric label="Expenses" value={m.expenses || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 2h12a2 2 0 0 1 2 2v16a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2Z" /><path d="M8 6h8" /></svg>} />
          <Metric label="Returns" value={m.returns || 0} icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M3 12a9 9 0 1 0 9-9" /><path d="M3 4v5h5" /></svg>} />
        </div>

        <div className="grid gap-6 xl:grid-cols-[0.7fr_1.3fr]">
          {/* ── TEAM ─────────────────────────────────────────────────── */}
          <div className="app-panel rounded-2xl border p-5 sm:p-6">
            <div className="border-b border-[var(--border-default)] pb-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Team members</h3>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">{shop.team?.length || 0} people in this shop</p>
            </div>
            {!shop.team?.length ? (
              <p className="mt-4 text-sm text-[var(--text-muted)]">No team members.</p>
            ) : (
              <div className="mt-4 space-y-2.5">
                {shop.team.map((member) => (
                  <div key={member.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] px-3 py-2.5 transition hover:bg-[var(--surface-secondary)]">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-xs font-bold text-[var(--accent-strong)]">
                      {String(member.name || '?').slice(0, 1).toUpperCase()}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-[var(--text-primary)]">{member.name}</p>
                      <p className="truncate text-xs text-[var(--text-muted)]">
                        @{member.username}
                        {member.email ? <span> · <span className="font-medium text-[var(--text-primary)]">{member.email}</span></span> : null}
                      </p>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${member.role === 'Admin' ? 'bg-[var(--accent-soft)] text-[var(--accent-strong)]' : member.role === 'Staff' ? 'bg-[rgba(142,124,195,0.12)] text-[#8e7cc3]' : 'bg-[var(--surface-secondary)] text-[var(--text-muted)]'}`}>
                        {member.role}
                      </span>
                      <span className={`inline-flex items-center gap-1 text-[10px] font-medium ${member.isVerified ? 'text-[var(--success)]' : 'text-[var(--warning)]'}`}>
                        {member.isVerified ? '✓' : '⚠'} {member.isVerified ? 'verified' : 'unverified'}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* ── AUDIT FEED ───────────────────────────────────────────── */}
          <div className="app-panel rounded-2xl border p-5 sm:p-6">
            <div className="border-b border-[var(--border-default)] pb-4">
              <h3 className="font-semibold text-[var(--text-primary)]">Shop activity</h3>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">Recent audit trail for this shop</p>
            </div>
            {!shop.audits?.length ? (
              <div className="mt-4 rounded-2xl border border-dashed border-[var(--border-strong)] px-4 py-12 text-center">
                <p className="text-sm font-semibold text-[var(--text-primary)]">No activity yet</p>
                <p className="mt-1 text-sm text-[var(--text-muted)]">Actions will appear here as the shop uses StockDesk</p>
              </div>
            ) : (
              <div className="mt-4 space-y-2.5">
                {shop.audits.map((event) => {
                  const meta = ACTION_META[event.action] || { label: event.action, text: 'text-[var(--text-muted)]', bg: 'bg-[var(--surface-secondary)]' };
                  return (
                    <div key={event.id} className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] px-3 py-2.5 transition hover:bg-[var(--surface-secondary)]">
                      <span className={`inline-flex w-16 shrink-0 items-center justify-center rounded-full px-2 py-1 text-[11px] font-bold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
                        {meta.label}
                      </span>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-[var(--text-primary)]">
                          <span className="font-semibold">{event.user?.username || 'System'}</span>
                          <span className="text-[var(--text-muted)]"> · {event.entityType?.toLowerCase()}{event.entityId ? ` #${event.entityId}` : ''}</span>
                        </p>
                        {event.ipAddress && <p className="truncate text-xs text-[var(--text-muted)]">IP {event.ipAddress}</p>}
                      </div>
                      <span className="shrink-0 text-xs text-[var(--text-muted)]">{formatRelativeTime(event.createdAt)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
