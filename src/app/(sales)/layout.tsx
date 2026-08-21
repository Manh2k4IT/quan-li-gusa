'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ name?: string; email?: string } | null>(null);
  const isSalesReports = pathname.startsWith('/sales-reports');
  const isSalesPlan = pathname.startsWith('/sales-plan');

  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.json())
      .then((payload) => setSessionUser(payload.user ?? null))
      .catch(() => setSessionUser(null));
  }, []);

  const displayName = sessionUser?.name || sessionUser?.email || 'Sale';

  return (
    <main className="page-shell sales-report-page">
      <aside className="sidebar">
        <div className="brand-box">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Sales workspace</p>
            <h1>GUSA</h1>
          </div>
        </div>

        <div className="metric-card" style={{ margin: '12px 0', padding: '12px 16px' }}>
          <span>Signed in as</span>
          <strong style={{ display: 'block', marginTop: '8px', fontSize: '2.8rem', lineHeight: 0.92, letterSpacing: '-0.06em', overflowWrap: 'anywhere' }}>{displayName}</strong>
          <small style={{ display: 'block', marginTop: '8px' }}>Sale</small>
        </div>

        <nav className="nav">
          <span className="nav-title">Báo cáo</span>

          <Link href="/sales-reports" className={`nav-item ${isSalesReports ? 'active' : ''}`}>
            <span>▣</span>
            Báo cáo Sale nhập
          </Link>

          <Link href="/sales-plan" className={`nav-item ${isSalesPlan ? 'active' : ''}`}>
            <span>▤</span>
            Báo cáo kế hoạch
          </Link>

        </nav>

        <form action="/api/logout" method="POST" style={{ marginTop: '18px' }}>
          <button type="submit" className="ghost-btn" style={{ width: '100%' }}>
            Logout
          </button>
        </form>
      </aside>

      <div className="sales-workspace-content">{children}</div>
    </main>
  );
}
