import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import logo from '../assets/logo.png';
import { getUser } from '../utils/auth';

const pageTitles = {
  '/app': 'Dashboard',
  '/app/owner': 'Owner Dashboard',
  '/app/shops': 'Shops',
  '/app/products': 'Products',
  '/app/customers': 'Customers',
  '/app/pos': 'Sales',
  '/app/reports': 'Reports',
  '/app/settings': 'Settings',
  '/app/users': 'Users',
  '/app/profile': 'My Profile',
  '/app/expenses': 'Expenses',
  '/app/returns': 'Returns',
  '/app/audit-logs': 'Audit Logs',
  '/app/stock-reconciliation': 'Stock Reconciliation',
};

export default function Header({ onOpenSidebar, onToggleSidebar, sidebarCollapsed }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const pageTitle = pageTitles[location.pathname] || 'StockDesk';

  useEffect(() => {
    setUser(getUser());
  }, [location.pathname]);

  const initials = String(user?.name || 'U').slice(0, 1).toUpperCase();
  const isSuperAdmin = user?.role === 'SuperAdmin';

  return (
    <div className="app-topbar flex flex-wrap items-center justify-between gap-3 rounded-[1.35rem] border px-4 py-3 sm:px-5 sm:py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <button
          type="button"
          onClick={onOpenSidebar}
          className="app-btn-secondary flex h-11 w-11 items-center justify-center rounded-lg border lg:hidden"
          aria-label="Open navigation"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M4 7h16" />
            <path d="M4 12h16" />
            <path d="M4 17h16" />
          </svg>
        </button>
        <button
          type="button"
          onClick={onToggleSidebar}
          title={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          aria-label={sidebarCollapsed ? 'Show sidebar' : 'Hide sidebar'}
          className="app-btn-secondary hidden rounded-lg border p-2 lg:flex"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            {sidebarCollapsed ? (
              <>
                <path d="M3 12h18" />
                <path d="M3 6h18" />
                <path d="M3 18h18" />
              </>
            ) : (
              <>
                <rect x="3" y="3" width="18" height="18" rx="2" />
                <path d="M9 3v18" />
              </>
            )}
          </svg>
        </button>
        <div className="min-w-0">
          <div className="mb-1 flex items-center gap-2 lg:hidden">
            <img src={logo} alt="StockDesk logo" className="h-12 w-12 object-contain" />
            <span className="truncate text-base font-semibold tracking-tight text-[var(--text-primary)]">StockDesk</span>
          </div>
          <p className="text-[13px] font-medium tracking-tight text-[var(--text-muted)]">
            {isSuperAdmin ? 'Platform Console' : user?.shop?.name || 'StockDesk'}
          </p>
          <h1 className="truncate text-[1.45rem] font-semibold leading-tight tracking-tight text-[var(--text-primary)] sm:text-[1.8rem]">{pageTitle}</h1>
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Link
          to="/app/profile"
          className="flex items-center gap-3 rounded-2xl border border-[var(--border-default)] bg-[var(--surface-secondary)] px-3 py-2 transition hover:border-[var(--border-strong)] hover:bg-[var(--surface-primary)]"
        >
          <div className="text-right hidden sm:block">
            <p className="text-sm font-semibold text-[var(--text-primary)] leading-tight">{user?.name || 'User'}</p>
            <p className="text-[11px] text-[var(--text-muted)]">{user?.displayRole || user?.role || 'User'}</p>
          </div>
          {user?.avatarUrl ? (
            <img
              src={user.avatarUrl}
              alt={user?.name || 'Profile'}
              className="h-9 w-9 rounded-xl object-cover ring-2 ring-[var(--accent)]/20"
            />
          ) : (
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[var(--accent-soft)] text-sm font-bold text-[var(--accent-strong)] ring-2 ring-[var(--accent)]/20">
              {initials}
            </div>
          )}
        </Link>
      </div>
    </div>
  );
}
