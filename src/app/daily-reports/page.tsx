import Link from 'next/link';

const reports = [
  { href: '/daily-reports/fashion-q4', title: 'Báo cáo ngày thời trang Quận 4' },
  { href: '/daily-reports/fabric-q4', title: 'Báo cáo ngày kho Quận 4' },
  { href: '/daily-reports/fabric-ben-thanh', title: 'Báo cáo ngày kho Bến Thành' },
];

export default function DailyReportsPage() {
  return <main className="page-layout"><div className="page-header"><div><p className="eyebrow">DAILY REPORTS</p><h1>Bảng báo cáo ngày</h1></div><Link href="/" className="primary-btn">Về dashboard</Link></div><div className="stats-row">{reports.map((report) => <Link key={report.href} href={report.href} className="metric-card" style={{ textDecoration: 'none' }}><span>Bảng báo cáo</span><strong style={{ fontSize: '1.1rem' }}>{report.title}</strong></Link>)}</div></main>;
}
