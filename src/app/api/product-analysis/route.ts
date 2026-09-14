import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getErpProductAnalysis } from '@/lib/erp';

type ProductInput = { sku?: string; name?: string; category?: string; soldQuantity?: number; orderCount?: number; revenue?: number; stock?: number };

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

    if (!apiKey) return NextResponse.json({ message: 'Chưa cấu hình OPENAI_API_KEY trên server.' }, { status: 503 });

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
      const errorCode = errorPayload?.error?.code;
      const errorMessage = errorPayload?.error?.message ?? '';
      console.error('Product AI provider error:', response.status, errorCode, errorMessage);
      const message = response.status === 401
        ? 'OPENAI_API_KEY trên server không hợp lệ hoặc đã bị thu hồi. Hãy cập nhật key mới trên Render.'
        : response.status === 429
          ? 'OpenAI đang hết quota hoặc vượt giới hạn tốc độ. Hãy kiểm tra Billing và Limits.'
          : `OpenAI trả lỗi ${response.status}${errorCode ? ` (${errorCode})` : ''}. ${errorMessage}`;
      return NextResponse.json({ message }, { status: response.status });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai' });
  } catch (error) {
    console.error('Product AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích sản phẩm lúc này.' }, { status: 500 });
  }
}
