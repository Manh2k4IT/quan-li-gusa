import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerHistoryView from '@/components/customer-history-view';
import { getSession } from '@/lib/auth';

export default async function CustomerHistoryPage({ searchParams }: { searchParams: Promise<{ saleId?: string }> }) {
  const session = getSession(await cookies());
  if (!session) redirect('/login');

  const { saleId } = await searchParams;
  return <CustomerHistoryView initialSaleId={saleId ?? ''} />;
}
