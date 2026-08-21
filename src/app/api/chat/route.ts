import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordActivity } from '@/lib/activity';

type SalesAnalysisReport = {
  date: string;
  salesperson: string;
  orderCode: string;
  category: string;
  paymentMethod: string;
  orderStatus: string;
  revenue: number;
  note: string;
  items: Array<{ productCode: string; productName: string; quantity: number; unitPrice: number; revenue: number }>;
};

async function askChatGpt(message: string, context: Awaited<ReturnType<typeof buildBusinessContext>> | null, reportData?: SalesAnalysisReport[]) {
  const apiKey = process.env.OPENAI_API_KEY;

  if (!apiKey) return null;

  const response = await fetch('https://api.openai.com/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
      temperature: 0.2,
      messages: [
        {
          role: 'system',
          content: 'Bạn là trợ lý điều hành CEO GUSA. Trả lời bằng tiếng Việt, ngắn gọn, dựa trên dữ liệu được cung cấp. Không bịa số liệu và nói rõ khi dữ liệu chưa đủ.',
        },
        {
          role: 'user',
          content: reportData
            ? `${message}\n\nDỮ LIỆU BÁO CÁO SALE NHẬP DUY NHẤT:\n${JSON.stringify(reportData)}`
            : `${message}\n\nDữ liệu vận hành hiện tại:\n${JSON.stringify({
              customerCount: context!.customerCount,
              productCount: context!.productCount,
              lowStockCount: context!.lowStockCount,
              totalRevenue: context!.totalRevenue,
              topStatus: context!.topStatus,
              lowStockItems: context!.lowStockItems.map((item) => ({ sku: item.product.sku, stock: item.stock, warehouse: item.warehouse })),
            })}`,
        },
      ],
    }),
  });

  if (!response.ok) {
    console.error('OpenAI request failed:', response.status);
    return null;
  }

  const payload = (await response.json()) as { choices?: Array<{ message?: { content?: string } }> };
  return payload.choices?.[0]?.message?.content?.trim() || null;
}

async function buildBusinessContext() {
  const [customerCount, productCount, lowStockCount, totalRevenue, topStatus] = await Promise.all([
    prisma.customer.count(),
    prisma.product.count(),
    prisma.inventory.count({ where: { stock: { lte: 10 } } }),
    prisma.customer.aggregate({ _sum: { value: true } }),
    prisma.customer.groupBy({
      by: ['status'],
      _count: { status: true },
      orderBy: { _count: { status: 'desc' } },
      take: 3,
    }),
  ]);

  const lowStockItems = await prisma.inventory.findMany({
    include: { product: true },
    where: { stock: { lte: 10 } },
    orderBy: [{ stock: 'asc' }, { warehouse: 'asc' }],
    take: 5,
  });

  return {
    customerCount,
    productCount,
    lowStockCount,
    totalRevenue: Number(totalRevenue._sum.value ?? 0),
    topStatus,
    lowStockItems,
  };
}

function generateSalesReply(reports: SalesAnalysisReport[]) {
  const totalRevenue = reports.reduce((sum, report) => sum + Number(report.revenue || 0), 0);
  const totalQuantity = reports.reduce((sum, report) => sum + report.items.reduce((itemSum, item) => itemSum + Number(item.quantity || 0), 0), 0);
  const bySalesperson = new Map<string, number>();
  reports.forEach((report) => bySalesperson.set(report.salesperson, (bySalesperson.get(report.salesperson) ?? 0) + Number(report.revenue || 0)));
  const ranking = [...bySalesperson.entries()].sort((left, right) => right[1] - left[1]).map(([name, revenue]) => `${name}: ${revenue.toLocaleString('vi-VN')} VND`).join('; ');
  const unusual = reports.filter((report) => report.orderStatus.toLowerCase().includes('hủy') || report.orderStatus.toLowerCase().includes('không'));

  return `Tổng hợp ${reports.length} báo cáo Sale nhập: doanh thu ${totalRevenue.toLocaleString('vi-VN')} VND, sản lượng ${totalQuantity}. Hiệu suất theo Sale: ${ranking || 'chưa đủ dữ liệu'}. ${unusual.length ? `Có ${unusual.length} báo cáo cần xử lý do trạng thái ${unusual.map((report) => report.orderStatus).join(', ')}.` : 'Chưa thấy báo cáo có trạng thái bất thường.'} Phương án: ưu tiên kiểm tra các đơn có trạng thái chưa hoàn tất, đối soát doanh thu với từng mã đơn, theo dõi Sale có doanh thu thấp và cập nhật ghi chú nguyên nhân trước khi chốt báo cáo.`;
}

function generateReply(message: string, context: Awaited<ReturnType<typeof buildBusinessContext>>) {
  const text = message.toLowerCase();
  const revenueSummary = `$${context.totalRevenue.toLocaleString()}`;

  if (text.includes('stock') || text.includes('inventory') || text.includes('kho')) {
    if (context.lowStockItems.length === 0) {
      return `Tình trạng kho đang ổn định. Hiện không có SKU nào dưới ngưỡng tối thiểu. Tôi khuyến nghị duy trì mức tồn kho hiện tại và theo dõi tăng trưởng 2 tuần tới.`;
    }

    const skuList = context.lowStockItems
      .map((item) => `${item.product.sku} (${item.stock} còn trong ${item.warehouse})`)
      .join('; ');

    return `Có ${context.lowStockCount} SKU đang ở mức báo động: ${skuList}. Nên đặt hàng gấp cho nhóm Tech và Office để tránh thiếu hụt trong 7 ngày tới.`;
  }

  if (text.includes('customer') || text.includes('crm') || text.includes('khách')) {
    const leadSummary = context.topStatus.map((item) => `${item.status} (${item._count.status})`).join(', ');
    return `Hiện có ${context.customerCount} khách hàng trong CRM. Phân khúc đang mạnh nhất là ${leadSummary}. Tôi đề xuất ưu tiên nhóm khách hàng Hot và VIP với chiến dịch follow-up trong 48 giờ.`;
  }

  if (text.includes('revenue') || text.includes('sale') || text.includes('doanh thu')) {
    return `Doanh thu tiềm năng hiện tại là ${revenueSummary}. Tốc độ tăng trưởng đang tốt, nhưng cần tập trung vào 3 nhóm chiến lược để tối ưu hóa tỷ lệ chuyển đổi.`;
  }

  const insight = [
    `Hiện tại bạn đang quản lý ${context.customerCount} khách hàng và ${context.productCount} sản phẩm.`,
    `Có ${context.lowStockCount} sản phẩm ở mức thiếu kho cần xử lý.`,
    `Giá trị tiềm năng hiện đang khoảng ${revenueSummary}.`,
  ].join(' ');

  return `${insight} Tôi khuyến nghị ưu tiên nhóm khách hàng Hot, duy trì mức tồn kho cho SKU quan trọng, và tăng nỗ lực cho các chiến dịch chốt sale trong 7 ngày tới.`;
}

export async function POST(request: Request) {
  try {
    const session = getSession(await cookies());

    if (!session) {
      return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const message = String(body?.message ?? '').trim();
    const reportData = Array.isArray(body?.reportData) ? body.reportData as SalesAnalysisReport[] : undefined;

    if (!message) {
      return NextResponse.json({ message: 'Message is required.' }, { status: 400 });
    }

    const context = reportData?.length ? null : await buildBusinessContext();
    const provider = 'openai';
    const aiReply = await askChatGpt(message, context, reportData);

    const reply = aiReply ?? (reportData?.length ? generateSalesReply(reportData) : generateReply(message, context!));

    await recordActivity({
      userEmail: session.email,
      action: 'asked_ai_chat',
      entityType: 'chat',
      details: message,
    });

    return NextResponse.json({
      reply,
      role: session.role,
      context: {
        customerCount: context?.customerCount ?? 0,
        productCount: context?.productCount ?? 0,
        lowStockCount: context?.lowStockCount ?? 0,
        totalRevenue: context?.totalRevenue ?? 0,
      },
      provider: aiReply ? 'openai' : 'fallback',
      configuredProvider: provider,
      selectedProvider: 'openai',
      model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    });
  } catch {
    return NextResponse.json(
      { message: 'Không thể xử lý yêu cầu AI hiện tại.' },
      { status: 500 },
    );
  }
}
