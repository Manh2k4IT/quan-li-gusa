import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import PlanBoard from '@/components/plan-board';
import { getSession } from '@/lib/auth';

export default async function PlanPage({ searchParams }: { searchParams: Promise<{ category?: string }> }) {
  const session = getSession(await cookies());
  if (!session) redirect('/login');
  if (session.role === 'SALE') redirect('/sales-plan');

  const { category } = await searchParams;
  return (
    <main className="workspace-page">
      <PlanBoard mode="manager" initialCategory={category ?? ''} />
    </main>
  );
}