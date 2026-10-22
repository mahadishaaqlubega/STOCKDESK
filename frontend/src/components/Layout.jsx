import { Suspense, useState } from 'react';
import { Outlet } from 'react-router-dom';
import Sidebar from './Sidebar';
import Header from './Header';
import PageLoader from './PageLoader';
import OfflineBar from './OfflineBar';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { logout, getUser } from '../utils/auth';

export default function Layout() {
  const user = getUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useBodyScrollLock(sidebarOpen);

  return (
    <div className="app-shell min-h-dvh">
      <div className="flex min-h-dvh">
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
          <main className="mx-auto w-full max-w-[1440px]">
            {user?.shopId ? <OfflineBar shopId={user.shopId} /> : null}
            <Suspense fallback={<PageLoader />}>
              <Outlet />
            </Suspense>
          </main>
        </div>
      </div>
    </div>
  );
}
