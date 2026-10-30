import { useEffect, useRef, useState } from 'react';
import { NavLink, useLocation } from 'react-router-dom';
import { getUser, otherSessionUser } from '../utils/auth';
import { useTheme } from './ThemeProvider';
import logo from '../assets/logo.png';
import { InstallGuide, useInstallState } from './InstallApp';

// Minimal 20px stroke icons, one visual family.
const Icon = ({ children }) => (
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0">
    {children}
  </svg>
);

const icons = {
  dashboard: <Icon><rect x="3" y="3" width="7" height="9" rx="1.5" /><rect x="14" y="3" width="7" height="5" rx="1.5" /><rect x="14" y="12" width="7" height="9" rx="1.5" /><rect x="3" y="16" width="7" height="5" rx="1.5" /></Icon>,
  pos: <Icon><path d="M6 2h12l2 6H4l2-6Z" /><path d="M4 8v12a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1V8" /><path d="M9 12h6" /></Icon>,
  customers: <Icon><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7" /><path d="M18.5 20a6.5 6.5 0 0 0-2.5-5.1" /></Icon>,
  returns: <Icon><path d="M9 14 4 9l5-5" /><path d="M4 9h11a5 5 0 0 1 0 10h-3" /></Icon>,
  quotes: <Icon><path d="M7 3h7l5 5v13H7z" /><path d="M14 3v5h5" /><path d="M10 13h6M10 17h4" /></Icon>,
  till: <Icon><rect x="3" y="11" width="18" height="9" rx="1.5" /><path d="M3 15h18" /><path d="M10 17.5h4" /><rect x="7" y="4" width="10" height="7" rx="1" /></Icon>,
  products: <Icon><path d="m21 8-9-5-9 5 9 5 9-5Z" /><path d="m3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></Icon>,
  stockCount: <Icon><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M9 3v2h6V3" /><path d="m9 13 2 2 4-4" /></Icon>,
  suppliers: <Icon><path d="M3 7h11v9H3z" /><path d="M14 10h4l3 3v3h-7" /><circle cx="7" cy="18" r="1.8" /><circle cx="17.5" cy="18" r="1.8" /></Icon>,
  reports: <Icon><path d="M3 21h18" /><rect x="5" y="11" width="3" height="7" rx="1" /><rect x="10.5" y="6" width="3" height="12" rx="1" /><rect x="16" y="14" width="3" height="4" rx="1" /></Icon>,
  expenses: <Icon><rect x="3" y="6" width="18" height="13" rx="2" /><path d="M3 10h18" /><path d="M7 15h3" /></Icon>,
  users: <Icon><circle cx="12" cy="8" r="4" /><path d="M4 21a8 8 0 0 1 16 0" /></Icon>,
  audit: <Icon><path d="M12 8v4l3 2" /><circle cx="12" cy="12" r="9" /></Icon>,
  messages: <Icon><rect x="3" y="5" width="18" height="14" rx="2" /><path d="m3 7 9 6 9-6" /></Icon>,
  billing: <Icon><rect x="2.5" y="5" width="19" height="14" rx="2" /><path d="M2.5 10h19M6.5 15h4" /></Icon>,
  settings: <Icon><circle cx="12" cy="12" r="3" /><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z" /></Icon>,
  profile: <Icon><circle cx="12" cy="12" r="9" /><circle cx="12" cy="10" r="3" /><path d="M6.2 18.4a7 7 0 0 1 11.6 0" /></Icon>,
  shops: <Icon><path d="M3 21h18" /><path d="M5 21V8l7-4 7 4v13" /><path d="M10 21v-4h4v4" /></Icon>,
};

// end: true makes the link active only on its exact path (Dashboard is /app).
const shopSections = [
  { title: null, items: [{ to: '/app', label: 'Dashboard', icon: icons.dashboard, end: true }] },
  {
    title: 'Sell',
    items: [
      { to: '/app/pos', label: 'Point of sale', icon: icons.pos },
      { to: '/app/customers', label: 'Customers', icon: icons.customers },
      { to: '/app/returns', label: 'Returns', icon: icons.returns },
      { to: '/app/quotes', label: 'Quotes', icon: icons.quotes },
      { to: '/app/till', label: 'Till', icon: icons.till },
    ],
  },
  {
    title: 'Stock',
    items: [
      { to: '/app/products', label: 'Products', icon: icons.products },
      { to: '/app/suppliers', label: 'Suppliers', icon: icons.suppliers, adminOnly: true },
      { to: '/app/stock-reconciliation', label: 'Stock count', icon: icons.stockCount, adminOnly: true },
    ],
  },
  {
    title: 'Money',
    items: [
      { to: '/app/reports', label: 'Reports', icon: icons.reports, adminOnly: true },
      { to: '/app/expenses', label: 'Expenses', icon: icons.expenses, adminOnly: true },
    ],
  },
  {
    title: 'Admin',
    items: [
      { to: '/app/users', label: 'Team', icon: icons.users, adminOnly: true },
      { to: '/app/audit-logs', label: 'Activity log', icon: icons.audit, adminOnly: true },
      { to: '/app/settings', label: 'Settings', icon: icons.settings, adminOnly: true },
      { to: '/app/billing', label: 'Billing', icon: icons.billing, adminOnly: true },
      { to: '/app/profile', label: 'My account', icon: icons.profile, adminOnly: true },
    ],
  },
];

const ownerSections = [
  {
    title: null,
    items: [
      { to: '/app/owner', label: 'Dashboard', icon: icons.dashboard, end: true },
      { to: '/app/shops', label: 'Shops', icon: icons.shops },
      { to: '/app/owner-billing', label: 'Billing', icon: icons.billing },
      { to: '/app/messages', label: 'Messages', icon: icons.messages },
      { to: '/app/profile', label: 'My account', icon: icons.profile },
    ],
  },
];

export default function Sidebar({ user: providedUser, isOpen = false, collapsed = false, onClose = () => {}, onLogout = () => {} }) {
  const user = providedUser || getUser();
  const { resolvedTheme, setThemeMode, themeMode } = useTheme();
  const activeTheme = themeMode === 'system' ? resolvedTheme : themeMode;
  const isAdmin = user?.role === 'Admin';
  const isSuperAdmin = user?.role === 'SuperAdmin';
  const shopName = isSuperAdmin ? 'Platform console' : user?.shop?.name || 'My shop';

  const sections = (isSuperAdmin ? ownerSections : shopSections)
    .map((section) => ({ ...section, items: section.items.filter((item) => !item.adminOnly || isAdmin) }))
    .filter((section) => section.items.length > 0);

  const hideWhenCollapsed = collapsed ? 'lg:hidden' : '';
  const { installed } = useInstallState();
  const [installGuide, setInstallGuide] = useState(false);

  // Keep the current page's link visible when the menu is taller than the window.
  const navRef = useRef(null);
  const { pathname } = useLocation();
  useEffect(() => {
    navRef.current?.querySelector('.app-sidebar-link-active')?.scrollIntoView({ block: 'nearest' });
  }, [pathname]);

  return (
    <>
      <div
        className={`app-overlay fixed inset-0 z-30 transition lg:hidden ${isOpen ? 'opacity-100' : 'pointer-events-none opacity-0'}`}
        onClick={onClose}
      />
      <aside
        className={`app-sidebar-shell fixed inset-y-0 left-0 z-40 flex w-[260px] flex-col border-r pt-[env(safe-area-inset-top)] pb-[env(safe-area-inset-bottom)] transition-[width,transform] duration-300 lg:sticky lg:top-0 lg:h-app lg:translate-x-0 lg:shadow-none ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        } ${collapsed ? 'lg:w-[72px]' : 'lg:w-[248px]'}`}
        aria-label="Main navigation"
      >
        {/* Brand + shop */}
        <div className={`flex items-center gap-3 px-4 pb-3 pt-4 tall:pb-4 tall:pt-5 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}>
          <img src={logo} alt="" className="h-9 w-9 shrink-0 object-contain" />
          <div className={`min-w-0 flex-1 ${hideWhenCollapsed}`}>
            <p className="text-[15px] font-semibold leading-tight tracking-tight text-[var(--sidebar-text)]">StockDesk</p>
            <p className="truncate text-xs text-[var(--sidebar-muted)]" title={shopName}>{shopName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-[var(--sidebar-muted)] transition hover:bg-white/10 hover:text-[var(--sidebar-text)] lg:hidden"
            aria-label="Close navigation"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5"><path d="M6 6l12 12M18 6 6 18" /></svg>
          </button>
        </div>

        <nav ref={navRef} className="sidebar-scroll min-h-0 flex-1 overflow-y-auto px-3 pb-3">
          {sections.map((section, index) => (
            <div key={section.title || index} className={index ? 'mt-3.5 tall:mt-5' : 'mt-1'}>
              {section.title ? (
                <p className={`mb-1.5 px-3 text-[11px] font-medium uppercase tracking-[0.08em] text-[var(--sidebar-muted)] opacity-80 ${hideWhenCollapsed}`}>
                  {section.title}
                </p>
              ) : null}
              <div className="space-y-0.5">
                {section.items.map((item) => (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    onClick={onClose}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      `app-sidebar-link flex items-center gap-3 rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition tall:py-2 ${
                        collapsed ? 'lg:justify-center lg:px-0' : ''
                      } ${isActive ? 'app-sidebar-link-active' : ''}`
                    }
                  >
                    {item.icon}
                    <span className={hideWhenCollapsed}>{item.label}</span>
                  </NavLink>
                ))}
              </div>
            </div>
          ))}
          {!installed ? (
            <button
              type="button"
              onClick={() => setInstallGuide(true)}
              title={collapsed ? 'Install app' : undefined}
              className={`app-sidebar-link mt-3.5 flex w-full items-center gap-3 rounded-lg px-3 py-1.5 text-[13.5px] font-medium transition tall:py-2 ${collapsed ? 'lg:justify-center lg:px-0' : ''}`}
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" className="h-[18px] w-[18px] shrink-0"><path d="M12 3v12" /><path d="m7 10 5 5 5-5" /><path d="M5 21h14" /></svg>
              <span className={hideWhenCollapsed}>Install app</span>
            </button>
          ) : null}
        </nav>
        {installGuide ? <InstallGuide onClose={() => setInstallGuide(false)} /> : null}

        {/* Account */}
        <div className="border-t border-[var(--sidebar-border)] p-2.5 tall:p-3">
          {(() => {
            // The other sign-in in this browser (shop or owner console), if any.
            const other = otherSessionUser();
            if (!other) return null;
            const toOwner = other.role === 'SuperAdmin';
            const label = toOwner ? 'Owner console' : (other.shop?.name || 'My shop');
            return (
              <a
                href={toOwner ? '/owner' : '/login'}
                title={`Switch to ${label}`}
                className={`mb-1.5 flex items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium text-[var(--sidebar-muted)] transition hover:bg-white/10 hover:text-[var(--sidebar-text)] ${collapsed ? 'lg:justify-center' : ''}`}
              >
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4 shrink-0" aria-hidden="true"><path d="m17 2 4 4-4 4" /><path d="M3 11v-1a4 4 0 0 1 4-4h14M7 22l-4-4 4-4" /><path d="M21 13v1a4 4 0 0 1-4 4H3" /></svg>
                <span className={`truncate ${hideWhenCollapsed}`}>Switch to {label}</span>
              </a>
            );
          })()}
          <div className={`flex items-center gap-3 rounded-lg px-2 py-2 ${collapsed ? 'lg:flex-col lg:px-0' : ''}`}>
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="h-8 w-8 shrink-0 rounded-full object-cover" />
            ) : (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-white/10 text-xs font-semibold text-[var(--sidebar-text)]">
                {String(user?.name || 'U').slice(0, 1).toUpperCase()}
              </div>
            )}
            <div className={`min-w-0 flex-1 ${hideWhenCollapsed}`}>
              <p className="truncate text-[13px] font-medium text-[var(--sidebar-text)]">{user?.name || 'User'}</p>
              <p className="truncate text-xs text-[var(--sidebar-muted)]">{user?.displayRole || user?.role || 'User'}</p>
            </div>
            <button
              type="button"
              title={activeTheme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
              onClick={() => setThemeMode(activeTheme === 'dark' ? 'light' : 'dark')}
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted)] transition hover:bg-white/10 hover:text-[var(--sidebar-text)]"
              aria-label="Toggle theme"
            >
              {activeTheme === 'dark' ? (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" /></svg>
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z" /></svg>
              )}
            </button>
            <button
              type="button"
              onClick={onLogout}
              title="Sign out"
              className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--sidebar-muted)] transition hover:bg-white/10 hover:text-red-400"
              aria-label="Sign out"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-4 w-4"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><path d="m16 17 5-5-5-5" /><path d="M21 12H9" /></svg>
            </button>
          </div>
        </div>
      </aside>
    </>
  );
}
