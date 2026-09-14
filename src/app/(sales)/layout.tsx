'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';

export default function SalesLayout({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const [sessionUser, setSessionUser] = useState<{ name?: string; email?: string } | null>(null);
  const [customerGroup, setCustomerGroup] = useState('fabric-q4');
  const isSalesReports = pathname.startsWith('/sales-reports');
  const isSalesPlan = pathname.startsWith('/sales-plan');
  const isCustomerAnalysis = pathname.startsWith('/customer-analysis');
  const isProductAnalysis = pathname.startsWith('/product-analysis');

  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.json())
      .then((payload) => setSessionUser(payload.user ?? null))
      .catch(() => setSessionUser(null));
    const group = new URLSearchParams(window.location.search).get('group');
    if (group) setCustomerGroup(group);
  }, []);

  function selectCustomerGroup(group: string) {
    setCustomerGroup(group);
    window.dispatchEvent(new CustomEvent('customer-group-change', { detail: group }));
  }

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

          <Link href="/customer-analysis" className={`nav-item ${isCustomerAnalysis ? 'active' : ''}`}>
            <span>◌</span>
            Phân tích khách hàng
          </Link>
          {isCustomerAnalysis && (
            <div className="nav-submenu customer-analysis-submenu">
              <Link href="/customer-analysis?group=fashion-q4" onClick={() => selectCustomerGroup('fashion-q4')} className={`nav-submenu-item ${customerGroup === 'fashion-q4' ? 'active' : ''}`}>Thời trang Quận 4</Link>
              <Link href="/customer-analysis?group=fabric-ben-thanh" onClick={() => selectCustomerGroup('fabric-ben-thanh')} className={`nav-submenu-item ${customerGroup === 'fabric-ben-thanh' ? 'active' : ''}`}>Vải Bến Thành</Link>
              <Link href="/customer-analysis?group=fabric-q4" onClick={() => selectCustomerGroup('fabric-q4')} className={`nav-submenu-item ${customerGroup === 'fabric-q4' ? 'active' : ''}`}>Vải Quận 4</Link>
            </div>
          )}

          <Link href="/product-analysis" className={`nav-item ${isProductAnalysis ? 'active' : ''}`}>
            <span>◇</span>
            Phân tích sản phẩm
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
