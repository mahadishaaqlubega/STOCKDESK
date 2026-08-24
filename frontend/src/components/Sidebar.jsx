import { NavLink } from 'react-router-dom';
import { getUser } from '../utils/auth';
import { useTheme } from './ThemeProvider';
import logo from '../assets/logo.png';

const links = [
  {
    to: '/app',
    label: 'Dashboard',
    adminOnly: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 13h7V4H4v9Z" />
        <path d="M13 20h7v-5h-7v5Z" />
        <path d="M13 13h7V4h-7v9Z" />
        <path d="M4 20h7v-5H4v5Z" />
      </svg>
    ),
  },
  {
    to: '/app/products',
    label: 'Products',
    adminOnly: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="m3 7 9-4 9 4-9 4-9-4Z" />
        <path d="m3 7 9 4 9-4" />
        <path d="M12 11v10" />
        <path d="m3 17 9 4 9-4" />
      </svg>
    ),
  },
  {
    to: '/app/pos',
    label: 'Sales',
    adminOnly: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 5h16v14H4z" />
        <path d="M8 9h8" />
        <path d="M8 13h3" />
        <path d="M14 13h2" />
      </svg>
    ),
  },
  {
    to: '/app/customers',
    label: 'Customers',
    adminOnly: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
        <path d="M9.5 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z" />
        <path d="M21 21v-2a4 4 0 0 0-3-3.9" />
        <path d="M16 3.1a4 4 0 0 1 0 7.8" />
      </svg>
    ),
  },
  {
    to: '/app/returns',
    label: 'Returns',
    adminOnly: false,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M9 14l-4-4 4-4" />
        <path d="M5 10h11a4 4 0 0 1 0 8h-1" />
      </svg>
    ),
  },
  {
    to: '/app/reports',
    label: 'Reports',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M4 19h16" />
        <path d="M7 16V9" />
        <path d="M12 16V5" />
        <path d="M17 16v-3" />
      </svg>
    ),
  },
  {
    to: '/app/expenses',
    label: 'Expenses',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    to: '/app/stock-reconciliation',
    label: 'Stock Reconciliation',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M9 3H5a2 2 0 0 0-2 2v4m0 0H3m2 0v2m0-6h10a2 2 0 0 1 2 2v4m0 0h2m-2 0v2m0 0v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-5m0 0H3" />
        <path d="M9 11l1.5 1.5 3-3" />
      </svg>
    ),
  },
  {
    to: '/app/audit-logs',
    label: 'Audit Logs',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2z" />
        <path d="M12 6v6l4 2" />
      </svg>
    ),
  },
  {
    to: '/app/settings',
    label: 'Settings',
    adminOnly: true,
    icon: (
      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
        <path d="M12 8.5A3.5 3.5 0 1 0 12 15.5A3.5 3.5 0 1 0 12 8.5z" />
        <path d="M19.4 15a1 1 0 0 0 .2 1.1l.1.1a2 2 0 0 1-2.8 2.8l-.1-.1a1 1 0 0 0-1.1-.2 1 1 0 0 0-.6.9V20a2 2 0 0 1-4 0v-.2a1 1 0 0 0-.7-.9 1 1 0 0 0-1.1.2l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1 1 0 0 0 .2-1.1 1 1 0 0 0-.9-.6H4a2 2 0 0 1 0-4h.2a1 1 0 0 0 .9-.7 1 1 0 0 0-.2-1.1l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1 1 0 0 0 1.1.2 1 1 0 0 0 .6-.9V4a2 2 0 0 1 4 0v.2a1 1 0 0 0 .7.9 1 1 0 0 0 1.1-.2l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1 1 0 0 0-.2 1.1 1 1 0 0 0 .9.6H20a2 2 0 0 1 0 4h-.2a1 1 0 0 0-.9.7Z" />
      </svg>
    ),
  },
];

function UsersIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <path d="M16 21v-2a4 4 0 0 0-4-4H7a4 4 0 0 0-4 4v2" />
      <path d="M9.5 11a4 4 0 1 0 0-8a4 4 0 0 0 0 8Z" />
      <path d="M21 21v-2a4 4 0 0 0-3-3.9" />
      <path d="M16 3.1a4 4 0 0 1 0 7.8" />
    </svg>
  );
}

function ShopsIcon() {
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

function ProfileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
      <circle cx="12" cy="8" r="4" />
      <path d="M4 21c0-4 3.6-6 8-6s8 2 8 6" />
    </svg>
  );
}

export default function Sidebar({ user: providedUser, isOpen = false, collapsed = false, onClose = () => {}, onLogout = () => {} }) {
  const user = providedUser || getUser();
  const { resolvedTheme, setThemeMode, themeMode } = useTheme();
  const activeTheme = themeMode === 'system' ? resolvedTheme : themeMode;
  const isAdmin = user?.role === 'Admin';
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const shopName = isSuperAdmin ? 'Platform Console' : user?.shop?.name || 'Default Shop';
  const shopSlug = isSuperAdmin ? 'all-registered-shops' : user?.shop?.slug || 'legacy-shop';
  const isStaff = user?.role === 'Staff';
  const visibleLinks = isSuperAdmin
    ? [
        {
          to: '/app/owner',
          label: 'Dashboard',
          icon: (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M4 13h7V4H4v9Z" />
              <path d="M13 20h7v-5h-7v5Z" />
              <path d="M13 13h7V4h-7v9Z" />
              <path d="M4 20h7v-5H4v5Z" />
            </svg>
          ),
        },
        {
          to: '/app/shops',
          label: 'Platform',
          icon: <ShopsIcon />,
        },
        {
          to: '/app/profile',
          label: 'Profile',
          icon: <ProfileIcon />,
        },
      ]
    : isStaff
    ? links.filter((l) => !l.adminOnly)
    : links;

  return (
    <>
      <div
        className={`app-overlay fixed inset-0 z-30 transition lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
<aside
        className={`app-sidebar-shell fixed inset-y-0 left-0 z-40 flex w-72 flex-col border-r px-5 py-5 transition-all duration-300 lg:static lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${
          collapsed ? 'lg:translate-x-0 lg:w-20 lg:px-3' : 'lg:translate-x-0 lg:w-72 lg:px-6 lg:py-6'
        }`}
      >
        <div className="flex items-center justify-between lg:block">
          <div>
              <div className={`flex items-center ${collapsed ? 'lg:justify-center' : 'lg:gap-3.5'}`}>
                <img src={logo} alt="StockDesk logo" className={`h-16 w-16 object-contain ${collapsed ? 'lg:h-11 lg:w-11' : ''}`} />
              <div className={`pt-0.5 ${collapsed ? 'lg:hidden' : ''}`}>
                <p className="text-[1.9rem] font-semibold leading-none tracking-tight text-[var(--sidebar-text)]">StockDesk</p>
                <p className="mt-2 text-sm font-medium tracking-[0.02em] text-[var(--sidebar-muted)]">Business overview</p>
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-11 w-11 items-center justify-center rounded-lg border border-[var(--sidebar-border)] bg-white/5 text-[var(--sidebar-text)] transition hover:bg-white/10 lg:hidden"
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
              <path d="M6 6l12 12" />
              <path d="M18 6L6 18" />
            </svg>
          </button>
        </div>

        <div className={`app-sidebar-card mt-7 rounded-2xl border p-4 ${collapsed ? 'lg:hidden' : ''}`}>
          <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)]">{isSuperAdmin ? 'Platform Scope' : 'Active Shop'}</p>
          <p className="mt-2 text-base font-semibold text-[var(--sidebar-text)]">{shopName}</p>
          <p className="mt-1 text-sm text-[var(--sidebar-muted)]">{shopSlug}</p>
        </div>

        <nav className="mt-7 min-h-0 flex-1 space-y-1.5 overflow-y-auto">
          {visibleLinks.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              onClick={onClose}
              className={({ isActive }) =>
                `app-sidebar-link flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  collapsed ? 'lg:justify-center lg:px-2' : ''
                } ${
                  isActive
                    ? 'app-sidebar-link-active'
                    : ''
                }`
              }
            >
              {item.icon}
              <span className={collapsed ? 'lg:hidden' : ''}>{item.label}</span>
            </NavLink>
          ))}
          {!isSuperAdmin && isAdmin && (
            <NavLink
              to="/app/users"
              onClick={onClose}
              className={({ isActive }) =>
                `app-sidebar-link flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  collapsed ? 'lg:justify-center lg:px-2' : ''
                } ${
                  isActive
                    ? 'app-sidebar-link-active'
                    : ''
                }`
              }
            >
              <UsersIcon />
              <span className={collapsed ? 'lg:hidden' : ''}>Users</span>
            </NavLink>
          )}
          {!isSuperAdmin && isAdmin && (
            <NavLink
              to="/app/profile"
              onClick={onClose}
              className={({ isActive }) =>
                `app-sidebar-link flex items-center gap-3 rounded-xl px-4 py-3 text-sm font-medium transition ${
                  collapsed ? 'lg:justify-center lg:px-2' : ''
                } ${
                  isActive
                    ? 'app-sidebar-link-active'
                    : ''
                }`
              }
            >
              <ProfileIcon />
              <span className={collapsed ? 'lg:hidden' : ''}>Profile</span>
            </NavLink>
          )}
        </nav>

        <div className={`app-sidebar-card mt-auto rounded-2xl border p-4 ${collapsed ? 'lg:p-3' : ''}`}>
          <p className={`text-[11px] font-semibold uppercase tracking-[0.18em] text-[var(--sidebar-muted)] ${collapsed ? 'lg:hidden' : ''}`}>
            {isSuperAdmin ? 'Platform User' : 'Current User'}
          </p>
          <div className={`flex items-center gap-3 rounded-2xl bg-[var(--sidebar-hover)] px-3 py-3 ${collapsed ? 'lg:mt-0 lg:justify-center lg:px-0' : 'mt-3'}`}>
            {user?.avatarUrl ? (
              <img
                src={user.avatarUrl}
                alt="Profile avatar"
                className="h-11 w-11 rounded-xl object-cover shadow-[var(--sidebar-active-shadow)]"
              />
            ) : (
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[var(--sidebar-active-bg)] text-sm font-semibold text-[var(--sidebar-active-text)] shadow-[var(--sidebar-active-shadow)]">
                {String(user?.name || 'S').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={`min-w-0 flex-1 ${collapsed ? 'lg:hidden' : ''}`}>
              <p className="truncate text-sm font-semibold text-[var(--sidebar-text)]">{user?.name || 'Staff'}</p>
              <p className="truncate text-xs text-[var(--sidebar-muted)]">{user?.displayRole || user?.role || 'User'}</p>
            </div>
            <button
              type="button"
              title={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setThemeMode(activeTheme === 'dark' ? 'light' : 'dark')}
              className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted)] transition hover:bg-white/10 hover:text-[var(--sidebar-text)]"
              aria-label="Toggle theme"
            >
              {activeTheme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <circle cx="12" cy="12" r="4" />
                  <path d="M12 2v2.5" /><path d="M12 19.5V22" />
                  <path d="M4.9 4.9 6.7 6.7" /><path d="M17.3 17.3 19.1 19.1" />
                  <path d="M2 12h2.5" /><path d="M19.5 12H22" />
                  <path d="m4.9 19.1 1.8-1.8" /><path d="m17.3 6.7 1.8-1.8" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4">
                  <path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" />
                </svg>
              )}
            </button>
          </div>
          <button
            type="button"
            onClick={onLogout}
            className={`mt-3 flex w-full items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm font-medium text-[var(--sidebar-muted)] transition hover:bg-white/6 hover:text-[var(--danger)] ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span className={collapsed ? 'lg:hidden' : ''}>Sign out</span>
          </button>
        </div>
      </aside>
    </>
  );
}
