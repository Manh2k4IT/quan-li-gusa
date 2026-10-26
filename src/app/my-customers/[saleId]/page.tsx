import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import MyCustomersView from '@/components/my-customers-view';
import { getSession } from '@/lib/auth';

export default async function SaleCustomersPage({ params }: { params: Promise<{ saleId: string }> }) {
  const session = getSession(await cookies());
  if (!session) redirect('/login');
  if (session.role !== 'CEO' && session.role !== 'MANAGER') redirect('/my-customers');

  const { saleId } = await params;
  return <MyCustomersView saleId={saleId} />;
}
