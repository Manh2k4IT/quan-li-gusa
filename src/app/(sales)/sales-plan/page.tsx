import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PlanBoard from '@/components/plan-board';
import { getSession } from '@/lib/auth';

export default async function SalesPlanPage() {
  const session = getSession(await cookies());
  if (!session) redirect('/login');
  // Managers review plans on the board at /plan.
  if (session.role !== 'SALE') redirect('/plan');

  return <PlanBoard mode="sale" />;
}