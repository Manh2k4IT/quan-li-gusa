'use client';

import { Suspense } from 'react';
import { usePathname } from 'next/navigation';
import AppSidebar, { type SidebarUser } from '@/components/app-sidebar';
import GreetingTicker from '@/components/greeting-ticker';
import MissionPopup from '@/components/mission-popup';
import NotificationBell, { NotificationProvider } from '@/components/notification-bell';

export default function AppShell({ user, children }: { user: SidebarUser | null; children: React.ReactNode }) {
  const pathname = usePathname();

  if (pathname === '/login') {
    return <>{children}</>;
  }

  const shell = (
    <div className="app-shell">
      <Suspense fallback={<aside className="sidebar" />}>
        <AppSidebar user={user} />
      </Suspense>
      <div className="app-main">
        {user ? (
          <div className="app-greeting">
            <GreetingTicker name={user.name} />
          </div>
        ) : null}
        {children}
      </div>
      {user ? <NotificationBell /> : null}
      {user ? <MissionPopup /> : null}
    </div>
  );

  return user ? <NotificationProvider storageKey={`${user.role}:${user.name}`}>{shell}</NotificationProvider> : shell;
}
