import { cookies } from 'next/headers';
import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { getErpProductAnalysis } from '@/lib/erp';

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
    const products = Array.isArray(body.products) ? body.products.slice(0, 300) : [];
    const prompt = String(body.prompt ?? 'Phân tích hiệu quả sản phẩm và đề xuất hành động bán hàng, tồn kho.').trim();
    const businessGroup = String(body.businessGroup ?? 'nhóm đang chọn').trim();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) return NextResponse.json({ reply: 'Chưa cấu hình OPENAI_API_KEY trên server.', provider: 'fallback' });

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
      const message = response.status === 429
        ? 'OpenAI đang bị giới hạn quota hoặc tốc độ. Hãy thử lại sau.'
        : response.status === 401
          ? 'OPENAI_API_KEY trên server không hợp lệ.'
          : `OpenAI không phản hồi thành công (${response.status}). ${errorPayload?.error?.message ?? ''}`;
      return NextResponse.json({ reply: message, provider: 'fallback' });
    }

    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai' });
  } catch (error) {
    console.error('Product AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích sản phẩm lúc này.' }, { status: 500 });
  }
}
