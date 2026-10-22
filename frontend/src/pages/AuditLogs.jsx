import React, { useState, useEffect } from 'react';
import { api } from '../utils/api';

const ACTION_META = {
  CREATE: { label: 'Create', bg: 'bg-[rgba(74,168,132,0.12)]', text: 'text-[var(--success)]', border: 'border-l-[var(--success)]', icon: <path d="M12 5v14M5 12h14" /> },
  UPDATE: { label: 'Update', bg: 'bg-[rgba(30,167,189,0.12)]', text: 'text-[var(--accent)]', border: 'border-l-[var(--accent)]', icon: <path d="M17 3a2.83 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /> },
  DELETE: { label: 'Delete', bg: 'bg-[rgba(218,106,90,0.12)]', text: 'text-[var(--danger)]', border: 'border-l-[var(--danger)]', icon: <><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></> },
  LOGIN:  { label: 'Login',  bg: 'bg-[rgba(142,124,195,0.12)]', text: 'text-[#8e7cc3]', border: 'border-l-[#8e7cc3]', icon: <><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4" /><polyline points="10 17 15 12 10 7" /><line x1="15" y1="12" x2="3" y2="12" /></> },
  LOGOUT: { label: 'Logout', bg: 'bg-[var(--surface-secondary)]', text: 'text-[var(--text-muted)]', border: 'border-l-[var(--text-muted)]', icon: <><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" /></> },
};

function ActionChip({ action }) {
  const meta = ACTION_META[action] || { label: action, bg: 'bg-[var(--surface-secondary)]', text: 'text-[var(--text-muted)]' };
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wide ${meta.bg} ${meta.text}`}>
      {meta.label}
    </span>
  );
}

function ActionIcon({ action }) {
  const meta = ACTION_META[action] || {};
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"
      className={`h-4 w-4 ${meta.text || 'text-[var(--text-muted)]'}`}>
      {meta.icon || <circle cx="12" cy="12" r="10" />}
    </svg>
  );
}

function UserAvatar({ name }) {
  const initials = (name || '?').split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  return (
    <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-[var(--accent)] text-[11px] font-bold text-white">
      {initials}
    </span>
  );
}

function SkeletonRow() {
  return (
    <tr>
      {Array.from({ length: 6 }).map((_, i) => (
        <td key={i} className="px-4 py-3">
          <div className="h-3 animate-pulse rounded-md bg-[var(--surface-secondary)]" />
        </td>
      ))}
    </tr>
  );
}

function getRelativeTime(dateStr) {
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 7) return `${days}d ago`;
  return `${Math.floor(days / 7)}w ago`;
}

export default function AuditLogs() {
  const [logs, setLogs] = useState([]);
  const [users, setUsers] = useState([]);
  const [stats, setStats] = useState([]);
  const [loading, setLoading] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [filters, setFilters] = useState({
    userId: '',
    action: '',
    entityType: '',
    startDate: '',
    endDate: '',
  });
  const [pagination, setPagination] = useState({
    limit: 50,
    offset: 0,
    total: 0,
  });

  const actions = ['CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGOUT'];
  const entityTypes = ['PRODUCT', 'SALE', 'USER', 'SETTING', 'STOCK_RECONCILIATION', 'PURCHASE', 'EXPENSE'];

  useEffect(() => {
    fetchUsers();
    fetchStats();
  }, []);

  useEffect(() => {
    fetchLogs();
  }, [filters, pagination.offset]);

  const fetchUsers = async () => {
    try {
      const response = await api.get('/audit/users');
      setUsers(response.data);
    } catch (err) {
      console.error('Failed to load audit users:', err.message);
    }
  };

  const fetchStats = async () => {
    try {
      const response = await api.get('/audit/stats');
      setStats(response.data);
    } catch (err) {
      console.error('Failed to load audit stats:', err.message);
    }
  };

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (filters.userId) params.append('userId', filters.userId);
      if (filters.action) params.append('action', filters.action);
      if (filters.entityType) params.append('entityType', filters.entityType);
      if (filters.startDate) params.append('startDate', filters.startDate);
      if (filters.endDate) params.append('endDate', filters.endDate);
      params.append('limit', pagination.limit);
      params.append('offset', pagination.offset);
      const response = await api.get(`/audit/logs?${params}`);
      setLogs(response.data.data);
      setPagination((prev) => ({ ...prev, total: response.data.total }));
    } catch (err) {
      console.error('Failed to load audit logs:', err.message);
    } finally {
      setLoading(false);
    }
  };

  const handleFilterChange = (e) => {
    const { name, value } = e.target;
    setFilters((prev) => ({ ...prev, [name]: value }));
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const handleReset = () => {
    setFilters({ userId: '', action: '', entityType: '', startDate: '', endDate: '' });
    setPagination((prev) => ({ ...prev, offset: 0 }));
  };

  const hasActiveFilters = Object.values(filters).some(Boolean);

  const formatDate = (d) =>
    new Date(d).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });

  const totalLogs = pagination.total;
  const from = totalLogs === 0 ? 0 : pagination.offset + 1;
  const to = Math.min(pagination.offset + pagination.limit, totalLogs);

  return (
    <div className="space-y-4">
      {/* Stats strip */}
      {stats.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
          {stats.map((stat) => {
            const meta = ACTION_META[stat.action] || {};
            return (
              <div key={stat.action} className={`app-panel rounded-xl border ${meta.border || ''} p-4 transition`}>
                <div className="flex items-center justify-between">
                  <p className={`text-xs font-medium ${meta.text || 'text-[var(--text-muted)]'}`}>
                    {stat.action}
                  </p>
                  <div className={`rounded-[0.7rem] p-1.5 ${meta.bg || 'bg-[var(--surface-secondary)]'}`}>
                    <ActionIcon action={stat.action} />
                  </div>
                </div>
                <p className="mt-1.5 text-[1.8rem] font-bold leading-none tracking-tight text-[var(--text-primary)]">
                  {Number(stat.count).toLocaleString()}
                </p>
                <p className="mt-1 text-[11px] text-[var(--text-muted)]">total events</p>
              </div>
            );
          })}
        </div>
      )}

      {/* Filter panel */}
      <section className="app-panel rounded-2xl border p-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <h3 className="text-base font-semibold tracking-tight text-[var(--text-primary)]">Filters</h3>
            {hasActiveFilters && (
              <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-[10px] font-semibold text-white">Active</span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {hasActiveFilters && (
              <button
                type="button"
                onClick={handleReset}
                className="text-[13px] font-medium text-[var(--text-muted)] transition hover:text-[var(--danger)]"
              >
                Clear
              </button>
            )}
            <button
              type="button"
              onClick={() => setFiltersOpen((o) => !o)}
              className="app-btn-secondary flex items-center gap-1.5 rounded-[0.95rem] border px-3 py-1.5 text-[13px] font-medium"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                <path d="M3 6h18M7 12h10M11 18h2" />
              </svg>
              {filtersOpen ? 'Hide' : 'Show'}
            </button>
          </div>
        </div>

        {filtersOpen && (
          <div className="mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">User</label>
              <select name="userId" value={filters.userId} onChange={handleFilterChange}
                className="app-input w-full rounded-xl border px-3 py-2 text-sm">
                <option value="">All users</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} ({u.username})</option>
                ))}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">Action</label>
              <select name="action" value={filters.action} onChange={handleFilterChange}
                className="app-input w-full rounded-xl border px-3 py-2 text-sm">
                <option value="">All actions</option>
                {actions.map((a) => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">Entity type</label>
              <select name="entityType" value={filters.entityType} onChange={handleFilterChange}
                className="app-input w-full rounded-xl border px-3 py-2 text-sm">
                <option value="">All types</option>
                {entityTypes.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">From</label>
              <input type="date" name="startDate" value={filters.startDate} onChange={handleFilterChange}
                className="app-input w-full rounded-xl border px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="mb-1.5 block text-[12px] font-medium text-[var(--text-muted)]">To</label>
              <input type="date" name="endDate" value={filters.endDate} onChange={handleFilterChange}
                className="app-input w-full rounded-xl border px-3 py-2 text-sm" />
            </div>
          </div>
        )}
      </section>

      {/* Logs table */}
      <section className="app-panel overflow-hidden rounded-2xl border">
        <div className="border-b border-[var(--border-default)] bg-[var(--surface-secondary)] px-5 py-3.5">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-[14px] font-semibold text-[var(--text-primary)]">Activity Log</h3>
              <p className="mt-0.5 text-[12px] text-[var(--text-muted)]">Every action taken in the system is recorded here.</p>
            </div>
            <span className="rounded-full bg-[var(--accent)] px-2.5 py-0.5 text-[10px] font-bold text-white">
              {totalLogs.toLocaleString()} entries
            </span>
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="table-cards w-full text-sm">
            <thead>
              <tr className="border-b border-[var(--border-default)]">
                {['Timestamp', 'User', 'Action', 'Entity', 'ID', 'IP'].map((h) => (
                  <th key={h} className="px-4 py-3 text-left text-xs font-medium text-[var(--text-muted)]">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-[var(--border-default)]">
              {loading ? (
                Array.from({ length: 8 }).map((_, i) => <SkeletonRow key={i} />)
              ) : logs.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-4 py-16 text-center">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mx-auto mb-3 h-8 w-8 text-[var(--text-muted)]">
                      <path d="M12 8v4l3 3" /><circle cx="12" cy="12" r="10" />
                    </svg>
                    <p className="text-sm font-medium text-[var(--text-primary)]">No audit logs found</p>
                    <p className="mt-1 text-xs text-[var(--text-muted)]">Logs appear after logins, product edits, and sales.</p>
                  </td>
                </tr>
              ) : (
                logs.map((log) => {
                  const meta = ACTION_META[log.action] || {};
                  return (
                    <tr key={log.id} className={`border-l-[3px] transition hover:bg-[var(--surface-secondary)] ${meta.border || 'border-l-transparent'}`}>
                      <td data-label="Time" className="whitespace-nowrap px-4 py-3">
                        <div className="flex items-center gap-2">
                          <div className={`rounded-[0.6rem] p-1 ${meta.bg || 'bg-[var(--surface-secondary)]'}`}>
                            <ActionIcon action={log.action} />
                          </div>
                          <div>
                            <p className="text-xs font-medium text-[var(--text-secondary)]">{formatDate(log.createdAt)}</p>
                            <p className="text-[10px] text-[var(--text-muted)]">{getRelativeTime(log.createdAt)}</p>
                          </div>
                        </div>
                      </td>
                      <td data-label="User" className="px-4 py-3">
                        <div className="flex items-center justify-end gap-2.5 md:justify-start">
                          <UserAvatar name={log.user?.name} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-semibold text-[var(--text-primary)]">{log.user?.name || '—'}</p>
                            {log.user?.username && <p className="text-[11px] text-[var(--text-muted)]">@{log.user.username}</p>}
                          </div>
                        </div>
                      </td>
                      <td data-label="Action" className="px-4 py-3">
                        <ActionChip action={log.action} />
                      </td>
                      <td data-label="Entity" className="px-4 py-3">
                        <span className="inline-flex items-center rounded-[0.7rem] bg-[var(--surface-secondary)] px-2.5 py-1 text-[12px] font-medium text-[var(--text-secondary)]">
                          {log.entityType}
                        </span>
                      </td>
                      <td data-label="ID" className="px-4 py-3 font-mono text-xs text-[var(--text-muted)]">{log.entityId || '—'}</td>
                      <td data-label="IP" className="px-4 py-3">
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-[var(--text-muted)]">
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="h-3 w-3 opacity-50"><circle cx="12" cy="12" r="10" /><path d="M2 12h20" /><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z" /></svg>
                          {log.ipAddress || '—'}
                        </span>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between border-t border-[var(--border-default)] bg-[var(--surface-secondary)] px-4 py-3">
          <p className="text-xs text-[var(--text-muted)]">
            {totalLogs === 0 ? 'No entries' : `Showing ${from}–${to} of ${totalLogs.toLocaleString()}`}
          </p>
          <div className="flex gap-2">
            <button
              onClick={() => setPagination((prev) => ({ ...prev, offset: Math.max(0, prev.offset - prev.limit) }))}
              disabled={pagination.offset === 0}
              className="app-btn-secondary rounded-[0.9rem] border px-3 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Previous
            </button>
            <button
              onClick={() => setPagination((prev) => ({ ...prev, offset: prev.offset + prev.limit }))}
              disabled={pagination.offset + pagination.limit >= totalLogs}
              className="app-btn-secondary rounded-[0.9rem] border px-3 py-1.5 text-[13px] font-medium disabled:cursor-not-allowed disabled:opacity-40"
            >
              Next
            </button>
          </div>
        </div>
      </section>
    </div>
  );
}
