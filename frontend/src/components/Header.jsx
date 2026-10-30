import { useEffect, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { getUser } from '../utils/auth';

const pageTitles = {
  '/app': 'Dashboard',
  '/app/owner': 'Platform overview',
  '/app/shops': 'Shops',
  '/app/products': 'Products',
  '/app/suppliers': 'Suppliers & purchases',
  '/app/customers': 'Customers',
  '/app/pos': 'Point of sale',
  '/app/reports': 'Reports',
  '/app/settings': 'Settings',
  '/app/billing': 'Billing',
  '/app/owner-billing': 'Billing',
  '/app/messages': 'Messages',
  '/app/users': 'Team',
  '/app/profile': 'My account',
  '/app/expenses': 'Expenses',
  '/app/returns': 'Returns',
  '/app/till': 'Till',
  '/app/quotes': 'Quotes',
  '/app/audit-logs': 'Activity log',
  '/app/stock-reconciliation': 'Stock count',
};

// "Good morning, Kato" by the shop's clock, for the dashboard title.
function greeting(name, now = new Date()) {
  const hour = now.getHours();
  const part = hour < 12 ? 'Good morning' : hour < 17 ? 'Good afternoon' : 'Good evening';
  const first = String(name || '').trim().split(/\s+/)[0];
  return first ? `${part}, ${first.charAt(0).toUpperCase()}${first.slice(1)}` : part;
}

export default function Header({ onOpenSidebar, onToggleSidebar, sidebarCollapsed }) {
  const location = useLocation();
  const [user, setUser] = useState(null);
  const path = location.pathname.replace(/\/+$/, '') || '/';
  const pageTitle = pageTitles[path] || (path.startsWith('/app/shops/') ? 'Shop details' : 'StockDesk');

  useEffect(() => {
    setUser(getUser());
  }, [location.pathname]);

  const initials = String(user?.name || 'U').slice(0, 1).toUpperCase();
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const showNewSale = !isSuperAdmin && path !== '/app/pos';

  return (
    <header className="sticky top-0 z-20 -mx-3 mb-5 border-b pt-[env(safe-area-inset-top)] border-[var(--border-default)] app-header-blur px-3 backdrop-blur-md sm:-mx-5 sm:px-5 lg:-mx-8 lg:px-8">
      <div className="flex h-14 items-center justify-between gap-3 sm:h-16">
        <div className="flex min-w-0 items-center gap-2">
          <button
            type="button"
            onClick={onOpenSidebar}
            className="-ml-1 flex h-9 w-9 items-center justify-center rounded-lg text-[var(--text-secondary)] transition hover:bg-[var(--surface-secondary)] lg:hidden"
            aria-label="Open navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M4 7h16M4 12h16M4 17h16" /></svg>
          </button>
          <button
            type="button"
            onClick={onToggleSidebar}
            title={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            aria-label={sidebarCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className="-ml-1.5 hidden h-8 w-8 items-center justify-center rounded-lg text-[var(--text-muted)] transition hover:bg-[var(--surface-secondary)] hover:text-[var(--text-primary)] lg:flex"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-[18px] w-[18px]"><rect x="3" y="4" width="18" height="16" rx="2" /><path d="M9 4v16" /></svg>
          </button>
          {path === '/app' && user && !isSuperAdmin ? (
            <div className="min-w-0">
              <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:text-xl">{greeting(user.name)}</h1>
              <p className="hidden truncate text-xs text-[var(--text-muted)] sm:block">
                {new Date().toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' })}
              </p>
            </div>
          ) : (
            <h1 className="truncate text-lg font-semibold tracking-tight text-[var(--text-primary)] sm:text-xl">{pageTitle}</h1>
          )}
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {showNewSale ? (
            <Link to="/app/pos" className="app-btn-primary hidden items-center gap-1.5 rounded-lg px-3.5 py-2 text-sm sm:inline-flex">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-4 w-4"><path d="M12 5v14M5 12h14" /></svg>
              New sale
            </Link>
          ) : null}
          <Link
            to="/app/profile"
            className="flex items-center rounded-full transition hover:opacity-90"
            title={`${user?.name || 'User'} · ${user?.displayRole || user?.role || ''}`}
            aria-label="My account"
          >
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-9 w-9 rounded-full object-cover ring-1 ring-[var(--border-strong)]" />
            ) : (
              <span className="flex h-9 w-9 items-center justify-center rounded-full bg-[var(--accent-soft)] text-sm font-semibold text-[var(--accent-strong)] ring-1 ring-[var(--border-default)]">
                {initials}
              </span>
            )}
          </Link>
        </div>
      </div>
    </header>
  );
}
