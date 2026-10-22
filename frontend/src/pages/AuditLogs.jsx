import { useEffect, useMemo, useState } from 'react';
import { api } from '../utils/api';
import { formatMoney } from '../utils/format';
import { Badge, EmptyState, Panel, SkeletonRows, StatGrid, StatTile, statIcons } from '../components/ui';

const ACTIONS = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];
const ENTITY_TYPES = [
  { value: 'SALE', label: 'Sales' },
  { value: 'CREDIT_PAYMENT', label: 'Credit payments' },
  { value: 'PRODUCT', label: 'Products' },
  { value: 'STOCK_RECONCILIATION', label: 'Stock counts' },
  { value: 'USER', label: 'Team & sign-ins' },
  { value: 'EXPENSE', label: 'Expenses' },
  { value: 'SETTING', label: 'Settings' },
];

const actionTone = { CREATE: 'success', UPDATE: 'info', DELETE: 'danger', LOGIN: 'neutral', LOGOUT: 'neutral' };

const entityNoun = {
  SALE: 'a sale',
  CREDIT_PAYMENT: 'a credit payment',
  PRODUCT: 'a product',
  STOCK_RECONCILIATION: 'a stock count',
  USER: 'a team member',
  EXPENSE: 'an expense',
  SETTING: 'shop settings',
  PURCHASE: 'a purchase',
};

function parseDetails(details) {
  if (!details) return {};
  if (typeof details === 'object') return details;
  try {
    return JSON.parse(details);
  } catch {
    return {};
  }
}

// Turn a raw audit row into a sentence a shop owner understands.
function describe(log) {
  const d = parseDetails(log.details);
  const currency = d.currency || '';
  if (log.action === 'LOGIN') return { text: 'signed in' };
  if (log.action === 'LOGOUT') return { text: 'signed out' };
  if (log.entityType === 'SALE' && log.action === 'CREATE') {
    const parts = [];
    if (d.total != null) parts.push(formatMoney(currency, d.total));
    if (d.items != null) parts.push(`${d.items} item${Number(d.items) === 1 ? '' : 's'}`);
    if (d.paymentMethod) parts.push(d.paymentMethod);
    return { text: d.creditAmount ? 'made a credit sale' : 'made a sale', meta: parts.join(' · ') };
  }
  if (log.entityType === 'CREDIT_PAYMENT') {
    return { text: 'received a credit payment', meta: [d.amount != null ? formatMoney(currency, d.amount) : null, d.method].filter(Boolean).join(' · ') };
  }
  if (log.entityType === 'STOCK_RECONCILIATION') {
    const variance = Number(d.variance || 0);
    return {
      text: 'counted stock',
      meta: d.physicalQuantity != null ? `counted ${d.physicalQuantity}, system had ${d.systemQuantity}${variance ? ` (${variance > 0 ? '+' : ''}${variance})` : ''}` : '',
    };
  }
  if (log.entityType === 'PRODUCT' && d.field === 'quantity') {
    return { text: 'adjusted stock', meta: `${d.oldValue} → ${d.newValue}${d.reason ? ` · ${d.reason}` : ''}` };
  }
  const verb = { CREATE: 'added', UPDATE: 'updated', DELETE: 'deleted' }[log.action] || log.action.toLowerCase();
  return { text: `${verb} ${entityNoun[log.entityType] || log.entityType.toLowerCase()}` };
}

function dayLabel(date) {
  const d = new Date(date);
  const today = new Date();
  const yesterday = new Date();
  yesterday.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return 'Today';
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long', year: d.getFullYear() === today.getFullYear() ? undefined : 'numeric' });
}

const selectClass = 'app-input rounded-lg border px-3 py-2 text-sm';

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filters, setFilters] = useState({ userId: '', action: '', entityType: '', startDate: '', endDate: '' });
  const [pagination, setPagination] = useState({ limit: 50, offset: 0, total: 0 });

  useEffect(() => {
    api.get('/audit/users').then((r) => setUsers(r.data)).catch(() => {});
    api.get('/audit/stats').then((r) => setStats(r.data)).catch(() => {});
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const params = new URLSearchParams();
        Object.entries(filters).forEach(([key, value]) => {
          if (value) params.append(key, key === 'endDate' ? `${value}T23:59:59` : value);
        });
        params.append('limit', pagination.limit);
        params.append('offset', pagination.offset);
        const response = await api.get(`/audit/logs?${params}`);
        setLogs(response.data.data);
        setPagination((prev) => ({ ...prev, total: response.data.total }));
      } catch (err) {
        console.error('Failed to load activity:', err.message);
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [filters, pagination.offset, pagination.limit]);

  const setFilter = (name, value) => {
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const hasFilters = Object.values(filters).some(Boolean);
  const statCount = (action) => Number(stats.find((s) => s.action === action)?.count || 0);

  const grouped = useMemo(() => {
    const groups = [];
    logs.forEach((log) => {
      const label = dayLabel(log.createdAt);
      const last = groups[groups.length - 1];
      if (last && last.label === label) last.items.push(log);
      else groups.push({ label, items: [log] });
    });
    return groups;
  }, [logs]);

  const { total, offset, limit } = pagination;
  const from = total === 0 ? 0 : offset + 1;
  const to = Math.min(offset + limit, total);

  return (
    <div className="space-y-5">
      <StatGrid>
        <StatTile label="Sign-ins" value={statCount('LOGIN').toLocaleString()} hint="All time"  icon={statIcons.key} iconTone="info" />
        <StatTile label="Created" value={statCount('CREATE').toLocaleString()} hint="Sales, products, payments…"  icon={statIcons.check} iconTone="success" />
        <StatTile label="Updated" value={statCount('UPDATE').toLocaleString()} hint="Edits and stock changes"  icon={statIcons.pulse} iconTone="violet" />
        <StatTile label="Deleted" value={statCount('DELETE').toLocaleString()} hint="Removed records" tone={statCount('DELETE') ? 'danger' : 'default'} icon={statIcons.alert} iconTone="danger" />
      </StatGrid>

      <Panel>
        <div className="flex flex-wrap items-center gap-2 border-b border-[var(--border-default)] p-4">
          <select aria-label="Team member" value={filters.userId} onChange={(e) => setFilter('userId', e.target.value)} className={selectClass}>
            <option value="">Everyone</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.name || u.username}</option>)}
          </select>
          <select aria-label="Type" value={filters.entityType} onChange={(e) => setFilter('entityType', e.target.value)} className={selectClass}>
            <option value="">All activity</option>
            {ENTITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
          </select>
          <select aria-label="Action" value={filters.action} onChange={(e) => setFilter('action', e.target.value)} className={selectClass}>
            <option value="">Any action</option>
            {ACTIONS.map((a) => <option key={a} value={a}>{a.charAt(0) + a.slice(1).toLowerCase()}</option>)}
          </select>
          <div className="flex items-center gap-1.5">
            <input type="date" aria-label="From date" value={filters.startDate} onChange={(e) => setFilter('startDate', e.target.value)} className={selectClass} />
            <span className="text-sm text-[var(--text-muted)]">to</span>
            <input type="date" aria-label="To date" value={filters.endDate} onChange={(e) => setFilter('endDate', e.target.value)} className={selectClass} />
          </div>
          {hasFilters ? (
            <button type="button" onClick={() => { setFilters({ userId: '', action: '', entityType: '', startDate: '', endDate: '' }); setPagination((p) => ({ ...p, offset: 0 })); }} className="text-sm font-medium text-[var(--text-muted)] hover:text-[var(--text-primary)]">
              Clear filters
            </button>
          ) : null}
          <span className="num ml-auto text-sm text-[var(--text-muted)]">{total.toLocaleString()} events</span>
        </div>

        {loading ? (
          <SkeletonRows rows={8} />
        ) : logs.length === 0 ? (
          <EmptyState
            title={hasFilters ? 'No activity matches these filters' : 'No activity yet'}
            message="Sign-ins, sales, stock changes and edits will appear here."
            icon={<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8"><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></svg>}
          />
        ) : (
          <div>
            {grouped.map((group) => (
              <div key={group.label}>
                <p className="sticky top-14 z-[1] border-b border-[var(--border-default)] bg-[var(--panel-soft-bg)] px-5 py-2 text-xs font-medium text-[var(--text-muted)] sm:top-16">{group.label}</p>
                <ul className="divide-y divide-[var(--border-default)]">
                  {group.items.map((log) => {
                    const { text, meta } = describe(log);
                    const who = log.user?.name || log.user?.username || 'Someone';
                    return (
                      <li key={log.id} className="flex items-start gap-3 px-5 py-3">
                        <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--surface-secondary)] text-xs font-semibold text-[var(--text-secondary)]">
                          {who.slice(0, 1).toUpperCase()}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm text-[var(--text-primary)]">
                            <span className="font-medium">{who}</span> <span className="text-[var(--text-secondary)]">{text}</span>
                            {log.entityId && log.entityType === 'SALE' ? <span className="font-mono text-xs text-[var(--text-muted)]"> SD-{String(log.entityId).padStart(6, '0')}</span> : null}
                          </p>
                          {meta ? <p className="num mt-0.5 text-xs text-[var(--text-muted)]">{meta}</p> : null}
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <time className="num text-xs text-[var(--text-muted)]" dateTime={log.createdAt} title={new Date(log.createdAt).toLocaleString()}>
                            {new Date(log.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          </time>
                          {log.action === 'DELETE' ? <Badge tone={actionTone[log.action]}>Deleted</Badge> : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </div>
            ))}
          </div>
        )}

        <div className="flex items-center justify-between border-t border-[var(--border-default)] px-4 py-3">
          <p className="num text-xs text-[var(--text-muted)]">{total === 0 ? 'No events' : `${from}–${to} of ${total.toLocaleString()}`}</p>
          <div className="flex gap-2">
            <button type="button" onClick={() => setPagination((p) => ({ ...p, offset: Math.max(0, p.offset - p.limit) }))} disabled={offset === 0} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40">
              Newer
            </button>
            <button type="button" onClick={() => setPagination((p) => ({ ...p, offset: p.offset + p.limit }))} disabled={offset + limit >= total} className="app-btn-secondary rounded-lg border px-3 py-1.5 text-sm font-medium disabled:opacity-40">
              Older
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}
