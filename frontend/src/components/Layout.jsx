import { Suspense } from 'react';
import { Outlet } from 'react-router-dom';
import { useState } from 'react';
import Sidebar from './Sidebar';
import Header from './Header';
import PageLoader from './PageLoader';
import useBodyScrollLock from '../hooks/useBodyScrollLock';
import { logout, getUser } from '../utils/auth';

export default function Layout() {
  const user = getUser();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useBodyScrollLock(sidebarOpen);

  const handleLogout = () => {
    logout();
  };

  return (
    <div className="app-shell min-h-dvh">
      <div className="flex min-h-dvh">
        <Sidebar
          user={user}
          isOpen={sidebarOpen}
          collapsed={sidebarCollapsed}
          onClose={() => setSidebarOpen(false)}
          onLogout={handleLogout}
        />
        <div className={`flex-1 min-w-0 px-3 py-3 sm:px-4 sm:py-4 lg:px-5 lg:py-4.5 transition-all duration-300`}>
          <div className="mx-auto w-full max-w-[1280px]">
            <Header
              onOpenSidebar={() => setSidebarOpen(true)}
              onToggleSidebar={() => setSidebarCollapsed((c) => !c)}
              sidebarCollapsed={sidebarCollapsed}
            />
            <div className="mt-4 sm:mt-5">
              <Suspense fallback={<PageLoader />}>
                <Outlet />
              </Suspense>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
