import Link from 'next/link';
import { Icon, type IconName } from '@/components/icons';
import { prisma } from '@/lib/prisma';

// Visual treatment for each recommendation, in the order getAiInsights returns them.
const RECOMMENDATION_META: { icon: IconName; tag: string; tone: string }[] = [
  { icon: 'chart', tag: 'Bán hàng', tone: 'sky' },
  { icon: 'package', tag: 'Kho', tone: 'amber' },
  { icon: 'target', tag: 'Tăng trưởng', tone: 'emerald' },
];

async function getAiInsights() {
  const [customerCount, productCount, inventoryCount, revenue] = await Promise.all([
    prisma.customer.count(),
    prisma.product.count(),
    prisma.inventory.count(),
    prisma.customer.aggregate({
      _sum: { value: true },
    }),
  ]);

  const totalRevenue = Number(revenue._sum.value ?? 0);
  const criticalItems = await prisma.inventory.count({
    where: { stock: { lte: 10 } },
  });

  return {
    customerCount,
    productCount,
    inventoryCount,
    criticalItems,
    totalRevenue,
    recommendations: [
      {
        title: 'Tăng hiệu quả pipeline',
        detail: `Bạn đang có ${customerCount} khách hàng và doanh thu tiềm năng khoảng $${(totalRevenue / 1000).toFixed(1)}K. Nên tập trung 3 chiến dịch hot nhất vào hôm nay.`,
      },
      {
        title: 'Cân bằng tồn kho',
        detail: `Hiện có ${criticalItems} SKU ở mức dưới ngưỡng tối thiểu. Hãy ưu tiên đặt lại hàng cho nhóm Tech và Office.`,
      },
      {
        title: 'Tăng tỷ lệ chuyển đổi',
        detail: `Tổng sản phẩm đang theo dõi là ${productCount}. Nên tạo landing page ưu tiên cho nhóm khách hàng B2B mới.`,
      },
    ],
  };
}

export default async function AIBrainPage() {
  const data = await getAiInsights();

  const stats: { label: string; value: number; note: string; icon: IconName; tone: string }[] = [
    { label: 'Khách hàng', value: data.customerCount, note: 'Đang theo dõi', icon: 'users', tone: 'sky' },
    { label: 'Sản phẩm', value: data.productCount, note: 'Trong danh mục', icon: 'package', tone: 'violet' },
    { label: 'SKU cần bổ sung', value: data.criticalItems, note: 'Tồn kho ≤ 10', icon: 'clipboard', tone: data.criticalItems ? 'rose' : 'emerald' },
  ];

  return (
    <main className="page-layout insight-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Trí tuệ AI</p>
          <h1>Trợ lý vận hành thông minh</h1>
        </div>
        <div className="topbar-actions insight-actions">
          <Link href="/" className="ghost-btn">Quay lại dashboard</Link>
          <Link href="/ai-chat" className="primary-btn"><Icon name="message" size={16} />Mở trò chuyện AI</Link>
        </div>
      </div>

      <div className="insight-stats">
        {stats.map((stat) => (
          <div key={stat.label} className={`insight-stat tone-${stat.tone}`}>
            <span className="insight-stat-icon"><Icon name={stat.icon} size={20} /></span>
            <div>
              <span className="insight-stat-label">{stat.label}</span>
              <strong>{stat.value.toLocaleString('vi-VN')}</strong>
              <small>{stat.note}</small>
            </div>
          </div>
        ))}
      </div>

      <section className="insight-hero">
        <span className="insight-hero-icon"><Icon name="sparkles" size={24} /></span>
        <div className="insight-hero-body">
          <div className="insight-hero-head">
            <p className="eyebrow">Trợ lý điều hành</p>
            <span className="insight-live"><i />Trực tiếp</span>
          </div>
          <h3>Phân tích hoạt động</h3>
          <p>AI đề xuất ưu tiên tối ưu nguồn lực theo 3 nhóm: khách hàng chiến lược, kho thực tế và hiệu suất bán hàng.</p>
        </div>
        <div className="insight-hero-value">
          <small>Tổng giá trị tiềm năng</small>
          <strong>${data.totalRevenue.toLocaleString()}</strong>
        </div>
      </section>

      <div className="insight-section-title">
        <h3>Đề xuất ưu tiên</h3>
        <small>{data.recommendations.length} hành động</small>
      </div>

      <div className="insight-grid">
        {data.recommendations.map((item, index) => {
          const meta = RECOMMENDATION_META[index % RECOMMENDATION_META.length];
          return (
            <article key={item.title} className={`insight-card tone-${meta.tone}`}>
              <div className="insight-card-head">
                <span className="insight-card-icon"><Icon name={meta.icon} size={18} /></span>
                <span className="insight-card-tag">{meta.tag}</span>
              </div>
              <h4>{item.title}</h4>
              <p>{item.detail}</p>
              <Link href="/ai-chat" className="insight-card-link">Hỏi AI thêm →</Link>
            </article>
          );
        })}
      </div>
    </main>
  );
}
