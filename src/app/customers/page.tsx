import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import CustomerDirectoryView from '@/components/customer-directory-view';
import { getSession } from '@/lib/auth';

export default async function CustomersPage() {
  const session = getSession(await cookies());
  if (!session) redirect('/login');
  if (session.role !== 'CEO' && session.role !== 'MANAGER') redirect('/my-customers');

  return <CustomerDirectoryView />;
}
