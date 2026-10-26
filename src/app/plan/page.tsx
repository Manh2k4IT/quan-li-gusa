import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ReportHub from '@/components/report-hub';
import { getSession } from '@/lib/auth';

export default async function PlanHubPage() {
  const session = getSession(await cookies());
  if (!session) redirect('/login');

  return (
    <ReportHub
      eyebrow="Vận hành"
      title="Bảng giao kế hoạch"
      subtitle="Chọn kho để giao kế hoạch cho Sale và theo dõi báo cáo thực hiện."
      sections={[
        {
          title: 'Chọn kho',
          tiles: [
            { href: '/plan/fashion-q4', title: 'Thời trang Quận 4', description: 'Giao việc và duyệt báo cáo kế hoạch của Sale thời trang Quận 4.', icon: 'clipboard', tone: 'violet' },
            { href: '/plan/fabric-q4', title: 'Kho vải Quận 4', description: 'Giao việc và duyệt báo cáo kế hoạch của Sale kho vải Quận 4.', icon: 'clipboard', tone: 'cyan' },
            { href: '/plan/fabric-ben-thanh', title: 'Kho vải Bến Thành', description: 'Giao việc và duyệt báo cáo kế hoạch của Sale kho vải Bến Thành.', icon: 'clipboard', tone: 'emerald' },
          ],
        },
      ]}
    />
  );
}
