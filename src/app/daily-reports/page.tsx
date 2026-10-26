import ReportHub from '@/components/report-hub';

export default function DailyReportsPage() {
  return (
    <ReportHub
      eyebrow="Vận hành"
      title="Báo cáo ngày"
      subtitle="Doanh thu Sale nhập theo từng ngày, chia theo kho."
      sections={[
        {
          title: 'Chọn kho',
          tiles: [
            { href: '/daily-reports/fashion-q4', title: 'Thời trang Quận 4', description: 'Báo cáo bán hàng ngày của kho thời trang Quận 4.', icon: 'calendar', tone: 'violet' },
            { href: '/daily-reports/fabric-q4', title: 'Kho vải Quận 4', description: 'Báo cáo bán hàng ngày của kho vải Quận 4.', icon: 'calendar', tone: 'cyan' },
            { href: '/daily-reports/fabric-ben-thanh', title: 'Kho vải Bến Thành', description: 'Báo cáo bán hàng ngày của kho vải Bến Thành.', icon: 'calendar', tone: 'emerald' },
          ],
        },
      ]}
    />
  );
}
