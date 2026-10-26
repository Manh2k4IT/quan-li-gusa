import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import ReportHub, { type HubSection } from '@/components/report-hub';
import { getSession } from '@/lib/auth';

const GROUPS = [
  { key: 'fashion-q4', label: 'Thời trang Quận 4' },
  { key: 'fabric-q4', label: 'Vải Quận 4' },
  { key: 'fabric-ben-thanh', label: 'Vải Bến Thành' },
];

const SECTIONS: HubSection[] = [
  {
    title: 'Báo cáo Sale',
    tiles: [
      { href: '/sales-reports', title: 'Báo cáo Sale nhập', description: 'Doanh thu ngày Sale tự nhập, so với mục tiêu và bảng xếp hạng.', icon: 'fileText', tone: 'indigo' },
      { href: '/sales-plan', title: 'Báo cáo kế hoạch', description: 'Kế hoạch đã giao cho Sale và trạng thái thực hiện, duyệt.', icon: 'target', tone: 'violet' },
    ],
  },
  {
    title: 'Báo cáo ngày',
    tiles: [
      { href: '/daily-reports/fashion-q4', title: 'Thời trang Quận 4', description: 'Báo cáo bán hàng ngày của kho thời trang Quận 4.', icon: 'calendar', tone: 'violet' },
      { href: '/daily-reports/fabric-q4', title: 'Kho vải Quận 4', description: 'Báo cáo bán hàng ngày của kho vải Quận 4.', icon: 'calendar', tone: 'violet' },
      { href: '/daily-reports/fabric-ben-thanh', title: 'Kho vải Bến Thành', description: 'Báo cáo bán hàng ngày của kho vải Bến Thành.', icon: 'calendar', tone: 'violet' },
    ],
  },
  {
    title: 'Phân tích khách hàng',
    tiles: GROUPS.map((group) => ({
      href: `/customer-analysis?group=${group.key}`,
      title: group.label,
      description: 'Phân loại khách hoạt động, tiềm năng, có nguy cơ giảm mua từ dữ liệu ERP.',
      icon: 'userCheck',
      tone: 'cyan',
    })),
  },
  {
    title: 'Phân tích sản phẩm',
    tiles: GROUPS.map((group) => ({
      href: `/product-analysis?group=${group.key}`,
      title: group.label,
      description: 'Sản phẩm bán chạy, bán chậm và tồn kho cần chú ý từ ERP.',
      icon: 'package',
      tone: 'emerald',
    })),
  },
  {
    title: 'Nhân sự',
    tiles: [
      { href: '/attendance', title: 'Chấm công', description: 'Check in / check out, đi trễ, về sớm và ghi chú nghỉ phép theo phòng ban.', icon: 'clock', tone: 'indigo' },
    ],
  },
];

export default async function ReportsPage() {
  const session = getSession(await cookies());
  if (!session) redirect('/login');

  return <ReportHub eyebrow="Trung tâm báo cáo" title="Báo cáo" subtitle="Chọn một báo cáo để xem chi tiết." sections={SECTIONS} />;
}
