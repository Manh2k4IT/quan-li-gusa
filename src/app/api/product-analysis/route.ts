import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getErpProductAnalysis } from '@/lib/erp';

type ProductInput = { sku?: string; name?: string; category?: string; soldQuantity?: number; orderCount?: number; revenue?: number; stock?: number };

function buildProductFallback(products: ProductInput[], businessGroup: string) {
  const rows = products.map((product) => ({
    sku: String(product.sku ?? ''),
    name: String(product.name ?? product.sku ?? 'Sản phẩm'),
    revenue: Number(product.revenue ?? 0),
    soldQuantity: Number(product.soldQuantity ?? 0),
    orderCount: Number(product.orderCount ?? 0),
    stock: Number(product.stock ?? 0),
  }));
  const topRevenue = [...rows].sort((first, second) => second.revenue - first.revenue).slice(0, 5);
  const slowMoving = rows.filter((product) => product.stock > 0).sort((first, second) => first.soldQuantity - second.soldQuantity || second.stock - first.stock).slice(0, 5);
  const stockRisk = rows.filter((product) => product.soldQuantity > 0 && product.stock <= 0).sort((first, second) => second.soldQuantity - first.soldQuantity).slice(0, 5);
  const totalRevenue = rows.reduce((sum, product) => sum + product.revenue, 0);
  const format = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 0 }).format(value);
  const list = (items: typeof rows, detail: (item: typeof rows[number]) => string) => items.length ? items.map((item, index) => `${index + 1}. ${item.name} (${item.sku}): ${detail(item)}`).join('\n') : 'Chưa có sản phẩm phù hợp.';

  return `Phân tích tự động ${businessGroup}\n\nTổng quan\n• ${format(rows.length)} sản phẩm trong phạm vi phân tích\n• Tổng doanh thu: ${format(totalRevenue)} VNĐ\n\nSản phẩm doanh thu cao\n${list(topRevenue, (item) => `${format(item.revenue)} VNĐ, ${format(item.soldQuantity)} đã bán`)}\n\nSản phẩm bán chậm cần theo dõi\n${list(slowMoving, (item) => `${format(item.soldQuantity)} đã bán, tồn ${format(item.stock)}`)}\n\nSản phẩm có nguy cơ thiếu tồn\n${list(stockRisk, (item) => `${format(item.soldQuantity)} đã bán, tồn ${format(item.stock)}`)}\n\nĐề xuất\n• Ưu tiên bổ sung tồn cho sản phẩm đang bán nhưng tồn bằng hoặc dưới 0.\n• Giảm nhập và đẩy chương trình bán cho sản phẩm còn tồn nhưng bán chậm.\n• Duy trì nguồn hàng cho nhóm sản phẩm doanh thu cao.`;
}

export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const products = await getErpProductAnalysis();
    return NextResponse.json({ products, source: 'ERP' });
  } catch (error) {
    console.error('ERP product analysis error:', error);
    return NextResponse.json({ message: 'Không thể tải dữ liệu sản phẩm từ ERP.' }, { status: 502 });
  }
}

export async function POST(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const products: ProductInput[] = Array.isArray(body.products) ? body.products.slice(0, 300) : [];
    const prompt = String(body.prompt ?? 'Phân tích hiệu quả sản phẩm và đề xuất hành động bán hàng, tồn kho.').trim();
    const businessGroup = String(body.businessGroup ?? 'nhóm đang chọn').trim();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) return NextResponse.json({ reply: buildProductFallback(products, businessGroup), provider: 'erp-fallback' });

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là chuyên gia phân tích sản phẩm của GUSA. Trả lời hoàn toàn bằng tiếng Việt, ngắn gọn, dựa đúng dữ liệu ERP được cung cấp, không bịa số. Ưu tiên nêu sản phẩm bán tốt, bán chậm, tồn kho cần chú ý và hành động cụ thể.' },
          { role: 'user', content: `${prompt}\n\nCHI NHÁNH: ${businessGroup}\nDỮ LIỆU SẢN PHẨM ERP:\n${JSON.stringify(products)}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      console.error('Product AI provider error:', response.status, errorPayload?.error?.code, errorPayload?.error?.message);
      return NextResponse.json({ reply: buildProductFallback(products, businessGroup), provider: 'erp-fallback' });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai' });
  } catch (error) {
    console.error('Product AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích sản phẩm lúc này.' }, { status: 500 });
  }
}
