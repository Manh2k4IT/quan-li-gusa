import Link from 'next/link';
import { prisma } from '@/lib/prisma';

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

  return (
    <main className="page-layout">
      <div className="page-header">
        <div>
          <p className="eyebrow">AI Brain</p>
          <h1>Trợ lý vận hành thông minh</h1>
        </div>
        <div className="topbar-actions" style={{ gap: '8px' }}>
          <Link href="/ai-chat" className="ghost-btn">Open AI Chat</Link>
          <Link href="/" className="primary-btn">Quay lại dashboard</Link>
        </div>
      </div>

      <div className="stats-row">
        <div className="metric-card">
          <span>Khách hàng</span>
          <strong>{data.customerCount}</strong>
        </div>
        <div className="metric-card">
          <span>Sản phẩm</span>
          <strong>{data.productCount}</strong>
        </div>
        <div className="metric-card">
          <span>SKU cần bổ sung</span>
          <strong>{data.criticalItems}</strong>
        </div>
      </div>

      <div className="panel ai-panel large-ai-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Executive assistant</p>
            <h3>Phân tích hoạt động</h3>
          </div>
          <span className="badge neutral">Live</span>
        </div>

        <div className="ai-summary-box">
          <p>
            AI đề xuất ưu tiên tối ưu nguồn lực theo 3 nhóm: khách hàng chiến lược, kho thực tế và hiệu suất bán hàng.
            Tổng giá trị tiềm năng hiện tại là ${data.totalRevenue.toLocaleString()}.
          </p>
        </div>

        <div className="recommendation-list">
          {data.recommendations.map((item) => (
            <div key={item.title} className="recommendation-card">
              <div className="chat-avatar">AI</div>
              <div>
                <h4>{item.title}</h4>
                <p>{item.detail}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </main>
  );
}
