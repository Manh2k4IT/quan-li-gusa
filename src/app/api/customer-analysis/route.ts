import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getErpCustomers, getErpSalesInvoices } from '@/lib/erp';

export type CustomerSegment = 'VIP – mua nhiều' | 'Khách tiềm năng' | 'Mua đều / ổn định' | 'Khách mới' | 'Giảm mua / ngừng mua';

function normalizeStatus(status: string) {
  return status.toLowerCase();
}

function normalizeErpValue(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

async function syncCustomersFromErp(orgId: string) {
  try {
    const records = await getErpCustomers();
    const existingCustomers = await prisma.customer.findMany({
      where: { orgId },
      select: { id: true, name: true, email: true, phone: true, company: true, status: true, value: true },
    });
    const customerByKey = new Map<string, (typeof existingCustomers)[number]>();
    for (const customer of existingCustomers) {
      for (const key of [customer.email, customer.phone, customer.name]) {
        if (key) customerByKey.set(key.trim().toLowerCase(), customer);
      }
    }

    const operations: Array<ReturnType<typeof prisma.customer.update> | ReturnType<typeof prisma.customer.create>> = [];
    let synced = 0;

    for (const row of records) {
      const name = String(row.customer_name ?? row.name ?? row.customer ?? '').trim();
      if (!name) continue;

      const email = String(row.email_id ?? row.email ?? '').trim() || null;
      const phone = String(row.mobile_no ?? row.phone ?? row.phone_no ?? '').trim() || null;
      const company = String(row.customer_group ?? row.company ?? row.customer_type ?? '').trim() || null;
      const status = String(row.status ?? row.customer_type ?? 'New').trim() || 'New';
      const value = normalizeErpValue(row.grand_total ?? row.total_amount ?? row.outstanding_amount ?? row.value ?? 0);

      const existing = [email, phone, name]
        .map((key) => key ? customerByKey.get(key.toLowerCase()) : undefined)
        .find(Boolean);

      if (existing) {
        operations.push(prisma.customer.update({
          where: { id: existing.id },
          data: {
            name,
            company: existing.company || company,
            email: existing.email || email,
            phone: existing.phone || phone,
            status,
            value: existing.value || value,
          },
        }));
      } else {
        operations.push(prisma.customer.create({
          data: {
            name,
            company,
            email,
            phone,
            status,
            value,
            orgId,
          },
        }));
        synced += 1;
      }
    }

    for (let index = 0; index < operations.length; index += 25) {
      await Promise.all(operations.slice(index, index + 25));
    }

    return synced;
  } catch (error) {
    console.error('ERP customer sync failed:', error);
    return 0;
  }
}

function getSegment(input: { value: number; orderCount: number; lastOrderAt: Date | null; status: string }): CustomerSegment {
  const daysSinceLastOrder = input.lastOrderAt
    ? Math.floor((Date.now() - input.lastOrderAt.getTime()) / 86400000)
    : Number.POSITIVE_INFINITY;

  const status = normalizeStatus(input.status);
  const hasHotSignals = status.includes('hot') || status.includes('tiềm') || status.includes('warm') || status.includes('potential');

  if (input.orderCount === 0) return 'Khách mới';
  if (daysSinceLastOrder > 180) return 'Giảm mua / ngừng mua';
  if (input.value >= 200_000_000 || input.orderCount >= 4 || (input.value >= 80_000_000 && daysSinceLastOrder <= 90)) return 'VIP – mua nhiều';
  if (hasHotSignals || input.value >= 50_000_000) return 'Khách tiềm năng';
  if (input.value >= 20_000_000 || input.orderCount >= 2) return 'Mua đều / ổn định';

  return 'Mua đều / ổn định';
}

async function getAnalysis() {
  const organization = await prisma.organization.findFirst({ where: { slug: 'gusa' } });
  let erpInvoices: Array<Record<string, unknown>> = [];
  if (organization) {
    await syncCustomersFromErp(organization.id);
    try {
      erpInvoices = await getErpSalesInvoices();
    } catch (error) {
      console.error('ERP sales invoice sync failed:', error);
    }
  }

  const customers = await prisma.customer.findMany({
    include: { orders: { select: { total: true, createdAt: true, status: true } } },
    orderBy: { updatedAt: 'desc' },
  });

  return customers.map((customer) => {
    const orders = customer.orders;
    const matchingInvoices = erpInvoices.filter((invoice) => {
      const invoiceCustomer = String(invoice.customer_name ?? invoice.customer ?? '').trim().toLowerCase();
      return invoiceCustomer === customer.name.trim().toLowerCase();
    });
    const erpTotal = matchingInvoices.reduce((sum, invoice) => sum + normalizeErpValue(invoice.grand_total), 0);
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const lastOrderAt = orders.reduce<Date | null>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), null);
    const erpLastOrderAt = matchingInvoices.reduce<Date | null>((latest, invoice) => {
      const dateValue = String(invoice.posting_date ?? '').trim();
      if (!dateValue) return latest;
      const date = new Date(dateValue);
      return !Number.isNaN(date.getTime()) && (!latest || date > latest) ? date : latest;
    }, null);
    const value = erpTotal || totalSpent || customer.value;
    const orderCount = matchingInvoices.length || orders.length;
    const effectiveLastOrderAt = erpLastOrderAt || lastOrderAt;
    const segment = getSegment({ value, orderCount, lastOrderAt: effectiveLastOrderAt, status: customer.status });

    return {
      id: customer.id,
      name: customer.name,
      company: customer.company ?? 'Chưa có công ty',
      status: customer.status,
      orderCount,
      totalSpent: value,
      avgOrderValue: orderCount ? value / orderCount : value,
      lastOrderAt: effectiveLastOrderAt?.toISOString() ?? null,
      daysSinceLastOrder: effectiveLastOrderAt ? Math.floor((Date.now() - effectiveLastOrderAt.getTime()) / 86400000) : null,
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
