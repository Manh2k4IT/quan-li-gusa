import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getErpCustomers, getErpSalesInvoices, getErpSalesOrders } from '@/lib/erp';

export type CustomerSegment = 'VIP – mua nhiều' | 'Khách tiềm năng' | 'Mua đều / ổn định' | 'Khách mới' | 'Giảm mua / ngừng mua';
type WebCitation = { type?: string; url?: string; title?: string };
type ResponseOutput = { type?: string; content?: Array<{ type?: string; text?: string; annotations?: WebCitation[] }> };

function getResponseText(output: ResponseOutput[] | undefined) {
  return (output ?? []).flatMap((item) => item.content ?? []).filter((content) => content.type === 'output_text').map((content) => content.text ?? '').join('\n').trim();
}

function getResponseSources(output: ResponseOutput[] | undefined) {
  const sources = new Map<string, { title: string; url: string }>();
  for (const item of output ?? []) for (const content of item.content ?? []) for (const annotation of content.annotations ?? []) {
    if (annotation.type === 'url_citation' && annotation.url) sources.set(annotation.url, { title: annotation.title || annotation.url, url: annotation.url });
  }
  return [...sources.values()];
}

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

function getBusinessGroup(value: unknown) {
  const normalized = String(value ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (normalized.includes('thoi trang q4') || normalized.includes('thoi trang quan 4')) return 'Thời trang Quận 4';
  if (normalized.includes('vai ben thanh')) return 'Vải Bến Thành';
  if (normalized.includes('vai quan 4')) return 'Vải Quận 4';
  return null;
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
        if (existing.name === name && existing.company === company && existing.email === email && existing.phone === phone && existing.status === status && existing.value === value) continue;
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

    return records;
  } catch (error) {
    console.error('ERP customer sync failed:', error);
    return [];
  }
}

function getSegment(input: { value: number; orderCount: number; firstOrderAt: Date | null; lastOrderAt: Date | null; status: string }): CustomerSegment {
  const daysSinceFirstOrder = input.firstOrderAt
    ? Math.floor((Date.now() - input.firstOrderAt.getTime()) / 86400000)
    : Number.POSITIVE_INFINITY;
  const daysSinceLastOrder = input.lastOrderAt
    ? Math.floor((Date.now() - input.lastOrderAt.getTime()) / 86400000)
    : Number.POSITIVE_INFINITY;

  const status = normalizeStatus(input.status);
  const hasHotSignals = status.includes('hot') || status.includes('tiềm') || status.includes('warm') || status.includes('potential');

  if (input.orderCount > 0 && daysSinceFirstOrder <= 90) return 'Khách mới';
  if (input.orderCount === 0) return hasHotSignals || input.value > 0 ? 'Khách tiềm năng' : 'Mua đều / ổn định';
  if (daysSinceLastOrder > 180) return 'Giảm mua / ngừng mua';
  if (input.value >= 200_000_000 || input.orderCount >= 4 || (input.value >= 80_000_000 && daysSinceLastOrder <= 90)) return 'VIP – mua nhiều';
  if (hasHotSignals || input.value >= 50_000_000) return 'Khách tiềm năng';
  if (input.value >= 20_000_000 || input.orderCount >= 2) return 'Mua đều / ổn định';

  return 'Mua đều / ổn định';
}

async function getAnalysis() {
  const organization = await prisma.organization.findFirst({ where: { slug: 'gusa' } });
  let erpCustomers: Array<Record<string, unknown>> = [];
  let erpInvoices: Array<Record<string, unknown>> = [];
  let erpSalesOrders: Array<Record<string, unknown>> = [];
  if (organization) {
    try {
      erpCustomers = await getErpCustomers();
    } catch (error) {
      console.error('ERP customer fetch failed:', error);
    }
    try {
      erpInvoices = await getErpSalesInvoices();
    } catch (error) {
      console.error('ERP sales invoice sync failed:', error);
    }
    try {
      erpSalesOrders = await getErpSalesOrders();
    } catch (error) {
      console.error('ERP sales order sync failed:', error);
    }
  }

  const customers = await prisma.customer.findMany({
    include: { orders: { select: { total: true, createdAt: true, status: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  const erpCustomerCodes = new Map<string, string>();
  for (const erpCustomer of erpCustomers) {
    const erpCode = String(erpCustomer.name ?? '').trim().toLowerCase();
    const displayName = String(erpCustomer.customer_name ?? erpCustomer.name ?? '').trim().toLowerCase();
    if (erpCode && displayName) {
      erpCustomerCodes.set(displayName, erpCode);
    }
  }

  const invoiceStats = new Map<string, { count: number; total: number; firstOrderAt: Date | null; lastOrderAt: Date | null }>();
  for (const invoice of erpInvoices) {
    const invoiceCode = String(invoice.customer ?? '').trim().toLowerCase();
    const invoiceDisplayName = String(invoice.customer_name ?? '').trim().toLowerCase();
    const key = invoiceCode || erpCustomerCodes.get(invoiceDisplayName) || invoiceDisplayName;
    if (!key) continue;
    const dateValue = String(invoice.posting_date ?? '').trim();
    const invoiceDate = dateValue ? new Date(dateValue) : null;
    const validDate = invoiceDate && !Number.isNaN(invoiceDate.getTime()) ? invoiceDate : null;
    const stats = invoiceStats.get(key) ?? { count: 0, total: 0, firstOrderAt: null, lastOrderAt: null };
    stats.count += 1;
    stats.total += normalizeErpValue(invoice.grand_total);
    if (validDate && (!stats.firstOrderAt || validDate < stats.firstOrderAt)) stats.firstOrderAt = validDate;
    if (validDate && (!stats.lastOrderAt || validDate > stats.lastOrderAt)) stats.lastOrderAt = validDate;
    invoiceStats.set(key, stats);
  }

  if (erpCustomers.length) {
    const customerByCode = new Map(erpCustomers.map((customer) => [String(customer.name ?? '').trim().toLowerCase(), customer]));
    const orderStats = new Map<string, { group: string; code: string; count: number; total: number; firstOrderAt: Date | null; lastOrderAt: Date | null }>();
    for (const order of erpSalesOrders) {
      const group = getBusinessGroup(order.branch);
      const code = String(order.customer ?? '').trim().toLowerCase();
      if (!group || !code) continue;
      const key = `${group}|${code}`;
      const dateValue = String(order.transaction_date ?? '').trim();
      const orderDate = dateValue ? new Date(dateValue) : null;
      const validDate = orderDate && !Number.isNaN(orderDate.getTime()) ? orderDate : null;
      const stats = orderStats.get(key) ?? { group, code, count: 0, total: 0, firstOrderAt: null, lastOrderAt: null };
      stats.count += 1;
      stats.total += normalizeErpValue(order.grand_total);
      if (validDate && (!stats.firstOrderAt || validDate < stats.firstOrderAt)) stats.firstOrderAt = validDate;
      if (validDate && (!stats.lastOrderAt || validDate > stats.lastOrderAt)) stats.lastOrderAt = validDate;
      orderStats.set(key, stats);
    }

    const results = [...orderStats.values()].map((stats) => {
      const customer = customerByCode.get(stats.code);
      const name = String(customer?.customer_name ?? customer?.name ?? stats.code).trim();
      const status = String(customer?.customer_type ?? 'Chưa phân loại').trim() || 'Chưa phân loại';
      return {
        id: `${stats.group}:${stats.code}`,
        name,
        phone: String(customer?.mobile_no ?? '').trim() || null,
        company: stats.group,
        status,
        orderCount: stats.count,
        totalSpent: stats.total,
        avgOrderValue: stats.count ? stats.total / stats.count : 0,
        lastOrderAt: stats.lastOrderAt?.toISOString() ?? null,
        daysSinceLastOrder: stats.lastOrderAt ? Math.floor((Date.now() - stats.lastOrderAt.getTime()) / 86400000) : null,
        segment: getSegment({ value: stats.total, orderCount: stats.count, firstOrderAt: stats.firstOrderAt, lastOrderAt: stats.lastOrderAt, status }),
      };
    });
    const resultKeys = new Set(results.map((customer) => customer.id));

    erpCustomers.forEach((customer, index) => {
      const group = getBusinessGroup(customer.customer_group);
      const customerCode = String(customer.name ?? '').trim().toLowerCase();
      const id = `${group}:${customerCode}`;
      if (!group || !customerCode || resultKeys.has(id)) return;
      const name = String(customer.customer_name ?? customer.name ?? '').trim() || 'Khách chưa đặt tên';
      const status = String(customer.customer_type ?? 'Chưa phân loại').trim() || 'Chưa phân loại';
      results.push({
        id: id || `erp-customer-${index}`,
        name,
        phone: String(customer.mobile_no ?? '').trim() || null,
        company: group,
        status,
        orderCount: 0,
        totalSpent: 0,
        avgOrderValue: 0,
        lastOrderAt: null,
        daysSinceLastOrder: null,
        segment: getSegment({ value: 0, orderCount: 0, firstOrderAt: null, lastOrderAt: null, status }),
      });
    });

    return results;
  }

  return customers.map((customer) => {
    const orders = customer.orders;
    const customerName = customer.name.trim().toLowerCase();
    const customerCode = erpCustomerCodes.get(customerName);
    const stats = invoiceStats.get(customerCode ?? customerName);
    const erpTotal = stats?.total ?? 0;
    const totalSpent = orders.reduce((sum, order) => sum + order.total, 0);
    const firstOrderAt = orders.reduce<Date | null>((earliest, order) => (!earliest || order.createdAt < earliest ? order.createdAt : earliest), null);
    const lastOrderAt = orders.reduce<Date | null>((latest, order) => (!latest || order.createdAt > latest ? order.createdAt : latest), null);
    const erpFirstOrderAt = stats?.firstOrderAt ?? null;
    const erpLastOrderAt = stats?.lastOrderAt ?? null;
    const value = erpTotal || totalSpent || customer.value;
    const orderCount = stats?.count || orders.length;
    const effectiveFirstOrderAt = erpFirstOrderAt || firstOrderAt;
    const effectiveLastOrderAt = erpLastOrderAt || lastOrderAt;
    const segment = getSegment({ value, orderCount, firstOrderAt: effectiveFirstOrderAt, lastOrderAt: effectiveLastOrderAt, status: customer.status });

    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
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
    const businessGroup = String(body.businessGroup ?? 'nhóm đang chọn').trim();
    const analysisMode = body.analysisMode === 'web+erp' ? 'web+erp' : 'erp';
    const apiKey = process.env.OPENAI_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ reply: 'Chưa cấu hình OPENAI_API_KEY. Hãy dùng các nhóm phân loại tự động và bổ sung API key để bật phân tích AI.', provider: 'fallback' });
    }

    if (analysisMode === 'web+erp') {
      const webResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_WEB_MODEL || 'gpt-4.1-mini',
          instructions: 'Bạn là chuyên gia CRM và chiến lược marketing của GUSA tại Việt Nam. Trả lời hoàn toàn bằng tiếng Việt. Bắt buộc nghiên cứu nhiều nguồn web độc lập, ưu tiên ít nhất 3 nguồn mới và đáng tin cậy khi có thể. Không trả về một danh sách đường dẫn thay cho câu trả lời. Hãy tổng hợp các nguồn thành nhận định thị trường, đối chiếu với dữ liệu khách hàng ERP, xác định phân khúc/cơ hội/rủi ro và đề xuất chiến lược cụ thể. Phân biệt rõ dữ liệu thị trường và dữ liệu nội bộ; không bịa số. Nguồn chỉ dùng để kiểm chứng các kết luận.',
          input: `${prompt}\n\nCHI NHÁNH GUSA: ${businessGroup}\nDỮ LIỆU KHÁCH HÀNG ERP GUSA:\n${JSON.stringify(customers)}\n\nNgày phân tích: ${new Date().toISOString().slice(0, 10)}. Hãy trả lời theo cấu trúc: Kết luận chính; Tín hiệu thị trường; Đối chiếu khách hàng GUSA; Chiến lược đề xuất; Việc cần làm ngay.`,
          tools: [{ type: 'web_search', search_context_size: 'medium', user_location: { type: 'approximate', country: 'VN', city: 'Ho Chi Minh City', timezone: 'Asia/Ho_Chi_Minh' } }],
          tool_choice: 'required',
          include: ['web_search_call.action.sources'],
          max_output_tokens: 1400,
        }),
      });
      const webPayload = await webResponse.json().catch(() => null) as { output?: ResponseOutput[]; error?: { code?: string; message?: string } } | null;
      if (!webResponse.ok) return NextResponse.json({ message: `Không thể tìm kiếm thị trường (${webResponse.status}). ${webPayload?.error?.message ?? ''}` }, { status: webResponse.status });
      return NextResponse.json({ reply: getResponseText(webPayload?.output) || 'AI chưa đưa ra phân tích.', provider: 'openai-web', mode: 'web+erp', sources: getResponseSources(webPayload?.output) });
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
        temperature: 0.2,
        messages: [
          { role: 'system', content: 'Bạn là chuyên gia CRM nội bộ của GUSA. Trả lời tiếng Việt, ngắn gọn và chỉ dựa trên dữ liệu ERP được cung cấp. Không sử dụng hay suy đoán dữ liệu thị trường bên ngoài, không bịa số. Phân tích theo nhóm khách, dấu hiệu, ưu tiên và hành động Sale cụ thể.' },
          { role: 'user', content: `${prompt}\n\nCHI NHÁNH GUSA: ${businessGroup}\nDỮ LIỆU KHÁCH HÀNG ERP:\n${JSON.stringify(customers)}` },
        ],
      }),
    });

    if (!response.ok) {
      const errorPayload = await response.json().catch(() => null) as { error?: { code?: string; message?: string } } | null;
      const errorCode = errorPayload?.error?.code;
      const errorMessage = errorPayload?.error?.message ?? '';
      const reply = response.status === 401
        ? 'OPENAI_API_KEY trên server không hợp lệ hoặc đã bị thu hồi. Hãy tạo key mới và cập nhật lại trên Render.'
        : response.status === 429
          ? 'Tài khoản OpenAI đã hết quota hoặc đang bị giới hạn tốc độ. Kiểm tra Billing và Limits của Project.'
          : `OpenAI không phản hồi thành công (${response.status}${errorCode ? `, ${errorCode}` : ''}). ${errorMessage || 'Hãy kiểm tra cấu hình model và Project.'}`;
      console.error('Customer AI provider error:', response.status, errorCode, errorMessage);
      return NextResponse.json({ reply, provider: 'fallback' });
    }
    const payload = await response.json() as { choices?: Array<{ message?: { content?: string } }> };
    return NextResponse.json({ reply: payload.choices?.[0]?.message?.content?.trim() ?? 'AI chưa đưa ra phân tích.', provider: 'openai', mode: 'erp', sources: [] });
  } catch (error) {
    console.error('Customer AI analysis error:', error);
    return NextResponse.json({ message: 'Không thể phân tích khách hàng lúc này.' }, { status: 500 });
  }
}
