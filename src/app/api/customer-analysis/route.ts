import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type CustomerSegment = 'Mua nhiều' | 'Mua ít' | 'Khách tiềm năng' | 'Giảm mua / ngừng mua';

function getSegment(input: { value: number; orderCount: number; lastOrderAt: Date | null; status: string }): CustomerSegment {
  const daysSinceLastOrder = input.lastOrderAt
    ? Math.floor((Date.now() - input.lastOrderAt.getTime()) / 86400000)
    : Number.POSITIVE_INFINITY;

  if (daysSinceLastOrder > 60 && input.orderCount > 0) return 'Giảm mua / ngừng mua';
  if (input.value >= 10000000 || input.orderCount >= 5) return 'Mua nhiều';
  if (input.status.toLowerCase().includes('hot') || input.status.toLowerCase().includes('tiềm')) return 'Khách tiềm năng';
  return 'Mua ít';
}

async function getAnalysis() {
  const customers = await prisma.customer.findMany({
    include: { orders: { select: { total: true, createdAt: true, status: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return customers.map((customer) => {
    const orders = customer.orders;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const lastOrderAt = orders.reduce<Date | null>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), null);
    const segment = getSegment({ value: totalSpent || customer.value, orderCount: orders.length, lastOrderAt, status: customer.status });

    return {
      id: customer.id,
      name: customer.name,
      company: customer.company ?? 'Chưa có công ty',
      status: customer.status,
      orderCount: orders.length,
      totalSpent: totalSpent || customer.value,
      lastOrderAt: lastOrderAt?.toISOString() ?? null,
      segment,
    };
  });
}

export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const customers = await getAnalysis();
    return NextResponse.json({ customers });
  } catch (error) {
    console.error('Customer analysis error:', error);
    return NextResponse.json({ message: 'Không thể tải phân tích khách hàng.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  try {
    const body = await request.json();
    const customers = Array.isArray(body.customers) ? body.customers : await getAnalysis();
    const prompt = String(body.prompt ?? 'Phân tích toàn bộ nhóm khách hàng và đề xuất hành động bán hàng.').trim();
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ reply: 'Chưa cấu hình OPENAI_API_KEY. Hãy dùng các nhóm phân loại tự động và bổ sung API key để bật phân tích AI.', provider: 'fallback' });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là chuyên gia CRM của GUSA. Trả lời tiếng Việt, ngắn gọn, dựa đúng dữ liệu, không bịa số. Phân tích theo nhóm khách, dấu hiệu, ưu tiên và hành động Sale cụ thể.' },
          { role: 'user', content: `${prompt}\n\nDỮ LIỆU KHÁCH HÀNG:\n${JSON.stringify(customers)}` },
        ],
      }),
    });

    if (!response.ok) return NextResponse.json({ reply: 'AI tạm thời không phản hồi. Bạn vẫn có thể dùng phân loại tự động trên bảng.', provider: 'fallback' });
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai' });
  } catch (error) {
    console.error('Customer AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích khách hàng lúc này.' }, { status: 500 });
  }
}
