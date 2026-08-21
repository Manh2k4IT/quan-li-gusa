import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { getErpDashboardData } from '@/lib/erp';
import { prisma } from '@/lib/prisma';

type Insight = { title: string; detail: string };

function fallbackInsights(input: { reports: Array<{ revenue: number; orderStatus: string; salesperson: string }>; assignments: Array<{ status: string }>; erpRevenue: number; erpProfit: number }): Insight[] {
  const salesRevenue = input.reports.reduce((sum, report) => sum + report.revenue, 0);
  const pendingReports = input.reports.filter((report) => !['Hoàn tất', 'Đã giao', 'Đã xác nhận'].includes(report.orderStatus)).length;
  const activePlans = input.assignments.filter((assignment) => !['Đã hoàn thành', 'Đã duyệt'].includes(assignment.status)).length;

  return [
    { title: 'Doanh thu', detail: `Doanh thu Sale nhập hiện là ${salesRevenue.toLocaleString('vi-VN')} VND từ ${input.reports.length} báo cáo; ERP ghi nhận ${input.erpRevenue.toLocaleString('vi-VN')} VND. Nên đối soát các mã đơn có chênh lệch trước khi chốt kỳ.` },
    { title: 'Vận hành', detail: `${pendingReports} báo cáo Sale chưa ở trạng thái hoàn tất và ${activePlans} kế hoạch còn đang xử lý. Ưu tiên giao người phụ trách, đặt hạn xử lý và cập nhật ghi chú ngay trên từng mục.` },
    { title: 'Chiến lược Marketing', detail: `Ưu tiên xây nội dung và chiến dịch bám theo nhóm sản phẩm, khu vực và Sale đang có doanh thu thực tế trong báo cáo. Chia ngân sách theo từng nhóm, đo số khách hàng tiềm năng, tỷ lệ chuyển đổi và doanh thu; chưa đủ dữ liệu để chốt kênh hoặc ngân sách cụ thể nên cần thử nghiệm nhỏ trước.` },
    { title: 'Phương án', detail: `Theo dõi biên lợi nhuận ERP hiện ở ${input.erpProfit.toLocaleString('vi-VN')} VND, so sánh với doanh thu từng Sale và tập trung nguồn lực vào nhóm đơn có giá trị cao nhưng còn chờ xác nhận.` },
  ];
}

export async function GET() {
  try {
    const session = getSession(await cookies());
    if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const [reports, assignments, erpData] = await Promise.all([
      prisma.salesReport.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { date: true, salesperson: true, category: true, orderStatus: true, revenue: true, target: true, items: true } }),
      prisma.salesAssignment.findMany({ orderBy: { createdAt: 'desc' }, take: 100, select: { category: true, title: true, status: true, date: true } }),
      getErpDashboardData().catch(() => null),
    ]);

    const erpRevenue = erpData?.monthlyPerformance?.reduce((sum, month) => sum + month.revenue, 0) ?? 0;
    const erpProfit = erpData?.monthlyPerformance?.reduce((sum, month) => sum + month.profit, 0) ?? 0;
    const context = { reports, assignments, erp: { metrics: erpData?.metrics ?? [], monthlyPerformance: erpData?.monthlyPerformance ?? [], revenue: erpRevenue, profit: erpProfit } };
    let insights = fallbackInsights({ reports, assignments, erpRevenue, erpProfit });

    if (process.env.OPENAI_API_KEY) {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: { Authorization: `Bearer ${process.env.OPENAI_API_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          temperature: 0.2,
          response_format: { type: 'json_object' },
          messages: [
            { role: 'system', content: 'Bạn là cố vấn vận hành và marketing GUSA. Chỉ dùng dữ liệu được cung cấp, không bịa số liệu. Phân tích báo cáo Sale nhập, kế hoạch và ERP; phát hiện chênh lệch và xu hướng. Luôn tạo một mục riêng tên "Chiến lược Marketing" với kế hoạch thực thi dựa trên dữ liệu: phân khúc/nhóm sản phẩm hoặc khu vực nên ưu tiên, thông điệp, kênh thử nghiệm, KPI cần đo, mốc kiểm tra và điều kiện điều chỉnh ngân sách. Nếu dữ liệu chưa đủ, phải nói rõ cần thu thập thêm gì thay vì tự điền con số. Trả JSON dạng {"insights":[{"title":"...","detail":"..."}]} với tối đa 4 mục bằng tiếng Việt.' },
            { role: 'user', content: `Dữ liệu thực tế hiện tại:\n${JSON.stringify(context)}` },
          ],
        }),
      });
      if (response.ok) {
        const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
        const parsed = JSON.parse(payload.choices?.[0]?.message?.content ?? '{}') as { insights?: Insight[] };
        if (Array.isArray(parsed.insights) && parsed.insights.length) {
          insights = parsed.insights.slice(0, 4).map((item) => ({ title: String(item.title), detail: String(item.detail) }));
        }
      }
    }

    return NextResponse.json({ insights, sources: { salesReports: reports.length, plans: assignments.length, erpConnected: Boolean(erpData) } }, { headers: { 'Cache-Control': 'no-store' } });
  } catch (error) {
    console.error('Dashboard insights error:', error);
    return NextResponse.json({ message: 'Không thể tổng hợp dữ liệu AI.' }, { status: 500 });
  }
}
