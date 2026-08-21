import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getSession } from '@/lib/auth';
import WarehouseReport from '@/components/warehouse-report';

export default async function FashionWarehouseReport({ searchParams }: { searchParams: Promise<{ month?: string; year?: string; costCenter?: string }> }) {
  const session = getSession(await cookies());
  if (!session) redirect('/login');

  const params = await searchParams;

  return (
    <WarehouseReport
      warehouse="Kho Thời Trang Q4 - CTTGVN"
      title="Kho thời trang Quận 4"
      itemGroup="Thành phẩm"
      unitType="piece"
      year={Number(params.year) || new Date().getFullYear()}
      month={Number(params.month) || new Date().getMonth() + 1}
      costCenter={params.costCenter || 'CNO3 - Thời Trang Q4'}
    />
  );
}
