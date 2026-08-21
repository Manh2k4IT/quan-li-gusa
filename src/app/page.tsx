import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardOverview from '@/components/dashboard-overview';
import PlanAssignmentSection from '@/components/plan-assignment-section';
import WarehouseReport from '@/components/warehouse-report';
import { getRoleLabel, getSession, getVisibleModules } from '@/lib/auth';
import { getErpDashboardData } from '@/lib/erp';

export default async function Home({ searchParams }: { searchParams: Promise<{ warehouse?: string; month?: string; year?: string; costCenter?: string }> }) {
  const session = getSession(await cookies());

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'SALE') {
    redirect('/sales-reports');
  }

  const visibleModules = getVisibleModules(session.role);
  const overviewModules = visibleModules.filter((module) => ['admin-users', 'ai-brain', 'ai-chat', 'ai-workflow'].includes(module.key));
  const erpData = await getErpDashboardData();
  const params = await searchParams;
  const warehouse = params.warehouse;
  const selectedMonth = Number(params.month) || new Date().getMonth() + 1;
  const selectedYear = Number(params.year) || new Date().getFullYear();
  const selectedCostCenter = params.costCenter || 'CNO3 - Thời Trang Q4';
  const showFashionWarehouse = warehouse === 'fashion-q4';

  return (
    <main className="page-shell">
      <aside className="sidebar">
        <div className="brand-box">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Enterprise Suite</p>
            <h1>GUSA</h1>
          </div>
        </div>

        <div className="metric-card" style={{ margin: '12px 0', padding: '12px 16px' }}>
          <span>Signed in as</span>
          <strong>{session.name}</strong>
          <small style={{ display: 'block', marginTop: '4px' }}>{getRoleLabel(session.role)}</small>
        </div>

        <nav className="nav">
          <span className="nav-title">Overview</span>
          {overviewModules.length > 0 ? overviewModules.map((module) => (
            <Link key={module.key} href={module.href} className="nav-item active">
              <span>{module.icon}</span>
              {module.name}
            </Link>
          )) : (
            <>
              <Link href="/admin/users" className="nav-item active">
                <span>👤</span>
                Quản lý người dùng
              </Link>
              <Link href="/ai-brain" className="nav-item active">
                <span>🧠</span>
                Trí tuệ AI
              </Link>
              <Link href="/ai-chat" className="nav-item active">
                <span>💬</span>
                Trò chuyện AI
              </Link>
              <Link href="/ai-workflow" className="nav-item active">
                <span>⚙️</span>
                Luồng AI
              </Link>
            </>
          )}

          <span className="nav-title">Dashboard</span>
          <Link href="/" className="nav-item">
            <span>◈</span>
            Dashboard quản lý
          </Link>

          <div className="nav-section-group">
            <Link href="/plan/fashion-q4" className="nav-item nav-item-card">
              <span>▦</span>
              Bảng giao kế hoạch
            </Link>
            <details open className="nav-group">
              <summary className="nav-item nav-item-card nav-summary">
                <span>▤</span>
                Bảng báo cáo ngày
              </summary>
              <div className="nav-submenu">
                <Link href="/daily-reports/fashion-q4" className="nav-submenu-item">Báo cáo ngày thời trang Quận 4</Link>
                <Link href="/daily-reports/fabric-q4" className="nav-submenu-item">Báo cáo ngày kho Quận 4</Link>
                <Link href="/daily-reports/fabric-ben-thanh" className="nav-submenu-item">Báo cáo ngày kho Bến Thành</Link>
              </div>
            </details>
          </div>

          <span className="nav-title mt-8">Sale</span>
          <Link href="/sales-reports" className="nav-item">
            <span>▣</span>
            Báo cáo Sale nhập
          </Link>
          <Link href="/sales-plan" className="nav-item">
            <span>📋</span>
            Báo cáo kế hoạch
          </Link>

        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Command center</p>
            <h2>Dashboard điều hành <span className="dashboard-owner">(CEO GUSA)</span></h2>
          </div>

          <div className="topbar-actions">
            <span className="status-badge">{getRoleLabel(session.role)}</span>
            <button className="ghost-btn">Export</button>
            <button className="primary-btn">Create report</button>
            <form action="/api/logout" method="POST">
              <button type="submit" className="ghost-btn">Logout</button>
            </form>
          </div>
        </header>

        {showFashionWarehouse ? (
          <WarehouseReport warehouse="Kho Thời Trang Q4 - CTTGVN" title="Kho thời trang Quận 4" itemGroup="Thành phẩm" unitType="piece" year={selectedYear} month={selectedMonth} costCenter={selectedCostCenter} />
        ) : (
          <>
            <DashboardOverview erpData={erpData} />
            <PlanAssignmentSection />
          </>
        )}
      </section>
    </main>
  );
}
