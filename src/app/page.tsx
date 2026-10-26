import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import DashboardOverview from '@/components/dashboard-overview';
import GreetingTicker from '@/components/greeting-ticker';
import WarehouseReport from '@/components/warehouse-report';
import { getRoleLabel, getSession } from '@/lib/auth';
import { getErpDashboardData } from '@/lib/erp';

export default async function Home({ searchParams }: { searchParams: Promise<{ warehouse?: string; month?: string; year?: string; costCenter?: string }> }) {
  const session = getSession(await cookies());

  if (!session) {
    redirect('/login');
  }

  if (session.role === 'SALE') {
    redirect('/sales-reports');
  }

  const erpData = await getErpDashboardData();
  const params = await searchParams;
  const warehouse = params.warehouse;
  const selectedMonth = Number(params.month) || new Date().getMonth() + 1;
  const selectedYear = Number(params.year) || new Date().getFullYear();
  const selectedCostCenter = params.costCenter || 'CNO3 - Thời Trang Q4';
  const showFashionWarehouse = warehouse === 'fashion-q4';

  return (
    <main className="page-shell">
      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">Trung tâm điều hành</p>
            <h2>Dashboard điều hành</h2>
          </div>

          <GreetingTicker name={session.name} />

          <div className="topbar-actions">
            <span className="status-badge">{session.name} · {getRoleLabel(session.role)}</span>
          </div>
        </header>

        {showFashionWarehouse ? (
          <WarehouseReport warehouse="Kho Thời Trang Q4 - CTTGVN" title="Kho thời trang Quận 4" itemGroup="Thành phẩm" unitType="piece" year={selectedYear} month={selectedMonth} costCenter={selectedCostCenter} />
        ) : (
          <DashboardOverview erpData={erpData} />
        )}
      </section>
    </main>
  );
}
