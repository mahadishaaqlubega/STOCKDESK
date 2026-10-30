import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import PageLoader from './PageLoader';
import OfflineBar from './OfflineBar';
import SubscriptionBanner from './SubscriptionBanner';
import { InstallBanner } from './InstallApp';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { logout, getUser } from '../utils/auth';

export default function Layout() {
  const user = getUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useBodyScrollLock(sidebarOpen);

  return (
    <div className="app-shell min-h-app">
      <div className="flex min-h-app">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          collapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
          onLogout={() => logout()}
        />
        <div className="min-w-0 flex-1 px-3 pb-10 sm:px-5 lg:px-8">
          <Header
            onOpenSidebar={() => setSidebarOpen(true)}
            onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
            sidebarCollapsed={sidebarCollapsed}
          />
          {/* On large screens main fills the window below the header (85px) and
              above the page padding (40px), so pages like the dashboard can
              stretch into the space that banners leave. */}
          <main className="mx-auto w-full max-w-[1440px] lg:max-w-[1600px] xl:flex xl:min-h-[calc(100dvh/var(--app-zoom,1)-125px)] xl:flex-col">
            {user?.shopId ? <OfflineBar shopId={user.shopId} /> : null}
            {user?.shopId && user?.role !== 'SuperAdmin' ? <SubscriptionBanner user={user} /> : null}
            {user?.shopId && user?.role !== 'SuperAdmin' ? <InstallBanner /> : null}
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
