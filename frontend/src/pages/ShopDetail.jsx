import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { fetchShopDetail, deleteShop } from '../utils/api';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { Alert, Badge, EmptyState, Modal, Panel, PanelHeader, SkeletonRows, StatTile, fieldInput, icons } from '../components/ui';
import ShopSubscriptionPanel from '../components/ShopSubscriptionPanel';

function relativeTime(value) {
  if (!value) return null;
  const mins = Math.max(0, Math.round((Date.now() - new Date(value).getTime()) / 60000));
  if (mins < 60) return mins < 1 ? 'just now' : `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return new Date(value).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });
}

function activityText(event) {
  if (event.action === 'LOGIN') return 'signed in';
  if (event.action === 'LOGOUT') return 'signed out';
  if (event.entityType === 'SALE' && event.action === 'CREATE') return `made a sale${event.entityId ? ` SD-${String(event.entityId).padStart(6, '0')}` : ''}`;
  if (event.entityType === 'CREDIT_PAYMENT') return 'received a credit payment';
  const verb = { CREATE: 'added', UPDATE: 'updated', DELETE: 'deleted' }[event.action] || event.action.toLowerCase();
  return `${verb} ${String(event.entityType || '').toLowerCase().replace(/_/g, ' ')}`;
}

function EmailStatus({ email, isVerified }) {
  if (!email) return <span className="text-[var(--text-muted)]">No email on file</span>;
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <span className="text-[var(--text-secondary)]">{email}</span>
      <Badge tone={isVerified ? 'success' : 'warning'}>{isVerified ? 'Verified' : 'Unverified'}</Badge>
    </span>
  );
}

function DeleteShopModal({ shop, onCancel, onConfirm, isDeleting }) {
  const [input, setInput] = useState('');
  const matches = input.trim() === shop.name.trim();
  const m = shop.metrics || {};
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
          This deletes <strong>{shop.name}</strong> and everything in it: {m.users || 0} team accounts, {(m.products || 0).toLocaleString()} products, {(m.sales || 0).toLocaleString()} sales, {(m.customers || 0).toLocaleString()} customers and all history. It cannot be undone.
        </Alert>
        <label className="block text-sm font-medium text-[var(--text-secondary)]">
          Type <span className="font-mono text-[var(--danger)]">{shop.name}</span> to confirm
          <input value={input} onChange={(e) => setInput(e.target.value)} autoFocus className={`${fieldInput} font-mono`} placeholder={shop.name} />
        </label>
      </div>
    </Modal>
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

  useEffect(() => {
    (async () => {
      try {
        setLoading(true);
        setShop(await fetchShopDetail(id));
        setError('');
      } catch (err) {
        setError(err.message || 'Could not load this shop.');
      } finally {
        setLoading(false);
      }
    })();
  }, [id]);

  const handleDelete = async () => {
    setDeleting(true);
    try {
      await deleteShop(id);
      navigate('/app/shops');
    } catch (err) {
      setError(err.message || 'Could not delete the shop.');
      setConfirmOpen(false);
      setDeleting(false);
    }
  };

  const back = (
    <Link to="/app/shops" className="inline-flex items-center gap-1 text-sm text-[var(--text-muted)] hover:text-[var(--text-primary)]">
      {icons.back}
      All shops
    </Link>
  );

  if (loading) {
    return <div className="space-y-5">{back}<Panel><SkeletonRows rows={6} /></Panel></div>;
  }

  if (!shop) {
    return (
      <div className="space-y-5">
        {back}
        <Panel><EmptyState title={error || 'Shop not found'} message="It may have been deleted." /></Panel>
      </div>
    );
  }

  const m = shop.metrics || {};
  const lastActive = relativeTime(shop.lastLoginAt);

  return (
    <div className="space-y-5">
      {back}

      <Panel className="p-5">
        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
          <div className="flex min-w-0 items-start gap-4">
            <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-lg font-semibold text-[var(--accent-strong)]">
              {String(shop.name || 'S').slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-lg font-semibold text-[var(--text-primary)]">{shop.name}</h2>
                <Badge tone={shop.isActive ? 'success' : 'neutral'} dot>{shop.isActive ? 'Enabled' : 'Disabled'}</Badge>
              </div>
              <p className="mt-0.5 text-sm text-[var(--text-muted)]">
                {shop.currency} · VAT {Number(shop.vat || 0)}% · joined {new Date(shop.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' })}
              </p>
              <p className="mt-1 text-sm text-[var(--text-muted)]">
                {[shop.phone, shop.address].filter(Boolean).join(' · ') || 'No contact details yet'}
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Badge tone={lastActive ? 'info' : 'neutral'}>{lastActive ? `Last active ${lastActive}` : 'Never signed in'}</Badge>
            <button type="button" onClick={() => setConfirmOpen(true)} className="rounded-lg border border-[var(--danger-border)] px-3 py-1.5 text-sm font-medium text-[var(--danger)] hover:bg-[var(--danger-soft)]">
              Delete shop
            </button>
          </div>
        </div>
        {shop.owner ? (
          <div className="mt-4 flex flex-wrap items-center gap-x-6 gap-y-1 border-t border-[var(--border-default)] pt-4 text-sm">
            <span className="text-[var(--text-muted)]">Owner</span>
            <span className="font-medium text-[var(--text-primary)]">{shop.owner.name} <span className="font-mono text-xs font-normal text-[var(--text-muted)]">@{shop.owner.username}</span></span>
            <EmailStatus email={shop.owner.email} isVerified={shop.owner.isVerified} />
          </div>
        ) : null}
      </Panel>

      {error ? <Alert tone="danger">{error}</Alert> : null}

      <ShopSubscriptionPanel shopId={shop.id} shopName={shop.name} isActive={shop.isActive} onActiveChange={(value) => setShop((s) => ({ ...s, isActive: value }))} />

      <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-6">
        <StatTile label="Team" value={(m.users || 0).toLocaleString()} />
        <StatTile label="Products" value={(m.products || 0).toLocaleString()} />
        <StatTile label="Sales" value={(m.sales || 0).toLocaleString()} />
        <StatTile label="Customers" value={(m.customers || 0).toLocaleString()} />
        <StatTile label="Expenses" value={(m.expenses || 0).toLocaleString()} />
        <StatTile label="Returns" value={(m.returns || 0).toLocaleString()} />
      </section>

      <div className="grid grid-cols-1 items-start gap-5 xl:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)]">
        <Panel>
          <PanelHeader title="Team" description={`${shop.team?.length || 0} account${shop.team?.length === 1 ? '' : 's'}`} />
          {!shop.team?.length ? (
            <EmptyState title="No team members" />
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {shop.team.map((member) => (
                <li key={member.id} className="flex items-center gap-3 px-5 py-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)]">
                    {String(member.name || member.username || '?').slice(0, 1).toUpperCase()}
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium text-[var(--text-primary)]">{member.name} <span className="font-mono text-xs font-normal text-[var(--text-muted)]">@{member.username}</span></p>
                    <p className="truncate text-xs"><EmailStatus email={member.email} isVerified={member.isVerified} /></p>
                  </div>
                  <Badge tone={member.role === 'Admin' ? 'accent' : 'neutral'}>{member.displayRole || member.role}</Badge>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel>
          <PanelHeader title="Recent activity" description="What this shop has been doing" />
          {!shop.audits?.length ? (
            <EmptyState title="No activity yet" message="Sign-ins and sales will appear here." />
          ) : (
            <ul className="divide-y divide-[var(--border-default)]">
              {shop.audits.map((event) => (
                <li key={event.id} className="flex items-start gap-3 px-5 py-2.5 text-sm">
                  <span className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${event.action === 'DELETE' ? 'bg-red-500' : event.action === 'LOGIN' ? 'bg-sky-500' : 'bg-emerald-500'}`} />
                  <p className="min-w-0 flex-1 text-[var(--text-primary)]">
                    <span className="font-medium">{event.user?.username || 'System'}</span> <span className="text-[var(--text-secondary)]">{activityText(event)}</span>
                  </p>
                  <span className="shrink-0 text-xs text-[var(--text-muted)]">{relativeTime(event.createdAt)}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>

      {confirmOpen ? <DeleteShopModal shop={shop} onCancel={() => setConfirmOpen(false)} onConfirm={handleDelete} isDeleting={deleting} /> : null}
    </div>
  );
}
