import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getErpCustomers, getErpSalesInvoices, getErpSalesOrders } from '@/lib/erp';

export type CustomerSegment = 'VIP – mua nhiều' | 'Khách tiềm năng' | 'Mua đều / ổn định' | 'Khách mới' | 'Giảm mua / ngừng mua';
type CustomerLifecycle = 'Active' | 'Potential' | 'At Risk' | 'Dormant';
type CustomerTrend = 'new' | 'rising' | 'stable' | 'declining';
type WebCitation = { type?: string; url?: string; title?: string };
type ResponseOutput = { type?: string; content?: Array<{ type?: string; text?: string; annotations?: WebCitation[] }> };

type CustomerOrderHistoryEntry = { id?: string; date?: string | null; total: number; status?: string };
type CustomerAnalysisInput = {
  name?: string;
  company?: string;
  status?: string;
  orderCount?: number;
  totalSpent?: number;
  lastOrderAt?: string | null;
  daysSinceLastOrder?: number | null;
  segment?: string;
  orderHistory?: CustomerOrderHistoryEntry[];
  cadenceDays?: number | null;
  activeScore?: number;
  potentialScore?: number;
  health?: string;
  trend?: string;
};

function sortOrderHistory(orderHistory: CustomerOrderHistoryEntry[]) {
  return [...orderHistory].sort((first, second) => {
    const firstDate = first.date ? new Date(first.date).getTime() : 0;
    const secondDate = second.date ? new Date(second.date).getTime() : 0;
    return secondDate - firstDate;
  });
}

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

function getCustomerBusinessScope(businessGroup: string) {
  const normalized = businessGroup.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (normalized.includes('thoi trang')) return 'Khách của chi nhánh thời trang may mặc; phân tích nhu cầu quần áo, bộ sưu tập và sản phẩm thời trang hoàn chỉnh.';
  if (normalized.includes('ben thanh')) return 'Khách mua vải linen tại Bến Thành; phân tích nhu cầu vải theo mét, chất liệu, màu sắc, họa tiết và hành vi mua sỉ/lẻ vải, không coi họ là khách mua quần áo.';
  return 'Khách mua vải linen tại Quận 4; phân tích nhu cầu vải theo mét, chất liệu, màu sắc, họa tiết và hành vi mua sỉ/lẻ vải, không coi họ là khách mua quần áo.';
}

function buildCustomerCadenceSummary(customers: CustomerAnalysisInput[]) {
  return customers.map((customer) => {
    const history = Array.isArray(customer.orderHistory) ? customer.orderHistory.filter((order) => order?.date) : [];
    const dates = history
      .map((order) => order.date ? new Date(order.date).getTime() : null)
      .filter((value): value is number => value !== null)
      .sort((first, second) => first - second);

    const intervals = [] as number[];
    for (let index = 1; index < dates.length; index += 1) {
      intervals.push((dates[index] - dates[index - 1]) / 86400000);
    }

    const avgInterval = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
    const medianInterval = intervals.length ? [...intervals].sort((first, second) => first - second)[Math.floor(intervals.length / 2)] : 0;
    const lastGapDays = dates.length > 1 ? Math.round((Date.now() - dates[dates.length - 1]) / 86400000) : null;

    return {
      name: customer.name ?? 'Khách chưa đặt tên',
      orderCount: Number(customer.orderCount ?? history.length ?? 0),
      historyDates: history.map((order) => order.date),
      intervals,
      avgInterval,
      medianInterval,
      lastGapDays,
      recencyDays: customer.daysSinceLastOrder ?? lastGapDays,
      note: intervals.length
        ? lastGapDays === null
          ? 'Chưa đủ dữ liệu lịch sử'
          : lastGapDays > medianInterval * 2.2
            ? 'Mua chậm hơn nhịp ổn định' : 'Mua theo nhịp tương đối ổn định'
        : 'Không có đủ lịch sử mua để đánh giá tần suất',
    };
  });
}

function estimateCustomerTrend(intervals: number[]) {
  if (intervals.length < 2) return 'new';
  const avg = intervals.reduce((sum, value) => sum + value, 0) / intervals.length;
  const recent = intervals.slice(-2);
  const recentAvg = recent.reduce((sum, value) => sum + value, 0) / recent.length;
  if (recentAvg > avg * 1.5) return 'declining';
  if (recentAvg < avg * 0.75) return 'rising';
  return 'stable';
}

function scoreCustomerActivity(customer: CustomerAnalysisInput) {
  const history = Array.isArray(customer.orderHistory) ? customer.orderHistory.filter((order) => order?.date) : [];
  const dates = history
    .map((order) => order.date ? new Date(order.date).getTime() : null)
    .filter((value): value is number => value !== null)
    .sort((first, second) => first - second);

  const intervals = [] as number[];
  for (let index = 1; index < dates.length; index += 1) {
    intervals.push((dates[index] - dates[index - 1]) / 86400000);
  }

  const avgGap = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : 0;
  const lastGapDays = dates.length > 1 ? Math.round((Date.now() - dates[dates.length - 1]) / 86400000) : null;
  let score = 0;
  const orderCount = Number(customer.orderCount ?? history.length ?? 0);

  if (orderCount >= 5) score += 25;
  else if (orderCount >= 3) score += 18;
  else if (orderCount >= 1) score += 10;

  if (customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder !== undefined) {
    if (customer.daysSinceLastOrder <= 30) score += 25;
    else if (customer.daysSinceLastOrder <= 60) score += 16;
    else if (customer.daysSinceLastOrder <= 120) score += 8;
    else score += 2;
  }

  if (avgGap > 0) {
    if (avgGap <= 30) score += 25;
    else if (avgGap <= 60) score += 15;
    else if (avgGap <= 120) score += 8;
    else score += 2;
  }

  if (lastGapDays !== null && avgGap > 0) {
    if (lastGapDays <= avgGap * 1.5) score += 20;
    else if (lastGapDays <= avgGap * 2.4) score += 10;
    else score -= 10;
  }

  const normalizedStatus = String(customer.status ?? '').toLowerCase();
  if (normalizedStatus.includes('hot') || normalizedStatus.includes('vip')) score += 10;
  else if (normalizedStatus.includes('potential')) score += 5;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function scoreCustomerPotential(customer: CustomerAnalysisInput) {
  let score = 0;
  const orderCount = Number(customer.orderCount ?? 0);
  const totalSpent = Number(customer.totalSpent ?? 0);
  const normalizedStatus = String(customer.status ?? '').toLowerCase();

  if (normalizedStatus.includes('hot')) score += 25;
  else if (normalizedStatus.includes('potential')) score += 20;
  else if (normalizedStatus.includes('warm')) score += 15;

  if (orderCount >= 5) score += 20;
  else if (orderCount >= 2) score += 12;
  else if (orderCount >= 1) score += 8;

  if (totalSpent >= 500_000_000) score += 25;
  else if (totalSpent >= 200_000_000) score += 18;
  else if (totalSpent >= 50_000_000) score += 10;

  if (customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder !== undefined) {
    if (customer.daysSinceLastOrder <= 45) score += 10;
    else if (customer.daysSinceLastOrder <= 120) score += 5;
    else score -= 5;
  }

  const cadence = customer.cadenceDays ?? null;
  if (cadence !== null) {
    if (cadence <= 30) score += 10;
    else if (cadence <= 60) score += 6;
    else if (cadence <= 120) score += 2;
  }

  if (customer.orderCount === 0 && !normalizedStatus.includes('inactive') && !normalizedStatus.includes('stop')) score += 10;

  if (customer.trend === 'declining') score -= 10;
  else if (customer.trend === 'rising') score += 8;

  return Math.max(0, Math.min(100, Math.round(score)));
}

function buildCustomerIntelligence(customer: CustomerAnalysisInput) {
  const history = sortOrderHistory(Array.isArray(customer.orderHistory) ? customer.orderHistory.filter((order) => order?.date) : []);
  const dates = history
    .map((order) => order.date ? new Date(order.date).getTime() : null)
    .filter((value): value is number => value !== null)
    .sort((first, second) => first - second);
  const intervals: number[] = [];
  for (let index = 1; index < dates.length; index += 1) intervals.push((dates[index] - dates[index - 1]) / 86400000);
  const sortedIntervals = [...intervals].sort((first, second) => first - second);
  const cadenceDays = intervals.length ? intervals.reduce((sum, value) => sum + value, 0) / intervals.length : null;
  const medianCadenceDays = sortedIntervals.length ? sortedIntervals[Math.floor(sortedIntervals.length / 2)] : null;
  const lastOrderAt = dates.length ? new Date(dates[dates.length - 1]).toISOString() : customer.lastOrderAt ?? null;
  const daysSinceLastOrder = customer.daysSinceLastOrder ?? (dates.length ? Math.max(0, Math.floor((Date.now() - dates[dates.length - 1]) / 86400000)) : null);
  const orderCount = Number(customer.orderCount ?? history.length ?? 0);
  const totalSpent = Number(customer.totalSpent ?? 0);
  const trend = estimateCustomerTrend(intervals) as CustomerTrend;
  const enrichedCustomer = { ...customer, orderCount, totalSpent, daysSinceLastOrder, orderHistory: history, cadenceDays, trend };
  const activeScore = scoreCustomerActivity(enrichedCustomer);
  const potentialScore = scoreCustomerPotential(enrichedCustomer);
  const recent90dOrders = history.filter((order) => order.date && Date.now() - new Date(order.date).getTime() <= 90 * 86400000).length;
  const repeatRate = orderCount > 1 ? Math.round(((orderCount - 1) / orderCount) * 100) : 0;
  const isLateForCadence = cadenceDays !== null && daysSinceLastOrder !== null && daysSinceLastOrder > Math.max(cadenceDays * 1.5, cadenceDays + 14);
  const lifecycle: CustomerLifecycle = orderCount === 0 || (daysSinceLastOrder !== null && daysSinceLastOrder > 180)
    ? 'Dormant'
    : isLateForCadence || trend === 'declining'
      ? 'At Risk'
      : potentialScore >= 60 && activeScore < 75
        ? 'Potential'
        : 'Active';
  const riskLevel = lifecycle === 'Dormant' ? 'Cao' : lifecycle === 'At Risk' ? 'Trung bình' : 'Thấp';
  const actionRecommendation = lifecycle === 'Dormant'
    ? 'Tái kích hoạt bằng ưu đãi hoặc gọi lại để tìm nhu cầu mới'
    : lifecycle === 'At Risk'
      ? 'Liên hệ trong 7 ngày và kiểm tra nguyên nhân chậm nhịp mua'
      : lifecycle === 'Potential'
        ? 'Ưu tiên giới thiệu sản phẩm phù hợp và cơ hội mua thêm'
        : 'Duy trì chăm sóc và đề xuất upsell theo lịch mua';

  return {
    cadenceDays: cadenceDays === null ? null : Math.round(cadenceDays),
    medianCadenceDays: medianCadenceDays === null ? null : Math.round(medianCadenceDays),
    recent90dOrders,
    repeatRate,
    activeScore,
    potentialScore,
    lifecycle,
    riskLevel,
    trend,
    actionRecommendation,
    lastOrderAt,
    daysSinceLastOrder,
    orderHistory: history,
  };
}

function buildCustomerErpSummary(customers: CustomerAnalysisInput[]) {
  const rows = customers.map((customer) => ({
    name: String(customer.name ?? 'Chưa đặt tên'),
    company: String(customer.company ?? 'Chưa phân loại'),
    status: String(customer.status ?? ''),
    orderCount: Number(customer.orderCount ?? 0),
    totalSpent: Number(customer.totalSpent ?? 0),
    daysSinceLastOrder: customer.daysSinceLastOrder === null || customer.daysSinceLastOrder === undefined ? null : Number(customer.daysSinceLastOrder),
    segment: String(customer.segment ?? 'Chưa phân loại'),
  }));
  const segmentCounts = rows.reduce<Record<string, number>>((counts, customer) => ({ ...counts, [customer.segment]: (counts[customer.segment] ?? 0) + 1 }), {});
  return {
    customerCount: rows.length,
    customersWithOrders: rows.filter((customer) => customer.orderCount > 0).length,
    customersWithoutOrders: rows.filter((customer) => customer.orderCount === 0).length,
    totalRevenue: rows.reduce((sum, customer) => sum + customer.totalSpent, 0),
    totalOrders: rows.reduce((sum, customer) => sum + customer.orderCount, 0),
    segmentCounts,
    inactiveOver90Days: rows.filter((customer) => customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder > 90).length,
    inactiveOver180Days: rows.filter((customer) => customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder > 180).length,
    topCustomers: [...rows].sort((first, second) => second.totalSpent - first.totalSpent).slice(0, 10),
    atRiskCustomers: rows.filter((customer) => customer.daysSinceLastOrder !== null && customer.daysSinceLastOrder > 90).sort((first, second) => (second.totalSpent || 0) - (first.totalSpent || 0)).slice(0, 15),
  };
}

function buildWebAnalysisCustomers(customers: CustomerAnalysisInput[]) {
  return [...customers]
    .sort((first, second) => (Number(second.potentialScore ?? 0) - Number(first.potentialScore ?? 0)) || (Number(second.totalSpent ?? 0) - Number(first.totalSpent ?? 0)))
    .slice(0, 100)
    .map((customer) => ({
      name: String(customer.name ?? 'Chưa đặt tên'),
      company: String(customer.company ?? 'Chưa phân loại'),
      status: String(customer.status ?? ''),
      orderCount: Number(customer.orderCount ?? 0),
      totalSpent: Number(customer.totalSpent ?? 0),
      lastOrderAt: customer.lastOrderAt ?? null,
      daysSinceLastOrder: customer.daysSinceLastOrder ?? null,
      segment: String(customer.segment ?? 'Chưa phân loại'),
      cadenceDays: customer.cadenceDays ?? null,
      activeScore: customer.activeScore,
      potentialScore: customer.potentialScore,
      trend: customer.trend,
    }));
}

function buildWebCadenceSummary(customers: ReturnType<typeof buildWebAnalysisCustomers>) {
  return customers.map((customer) => ({
    name: customer.name,
    orderCount: customer.orderCount,
    cadenceDays: customer.cadenceDays,
    recencyDays: customer.daysSinceLastOrder,
    trend: customer.trend,
    activeScore: customer.activeScore,
    potentialScore: customer.potentialScore,
  }));
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
    include: { orders: { select: { id: true, total: true, createdAt: true, status: true } } },
    orderBy: { updatedAt: 'desc' },
  });
  const erpCustomerCodes = new Map<string, string>();
  const orderHistoryByCustomer = new Map<string, CustomerOrderHistoryEntry[]>();
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

    const history = orderHistoryByCustomer.get(key) ?? [];
    history.push({
      id: String(invoice.name ?? `invoice-${key}-${history.length}`),
      date: validDate ? validDate.toISOString() : null,
      total: normalizeErpValue(invoice.grand_total),
      status: String(invoice.status ?? 'Submitted'),
    });
    orderHistoryByCustomer.set(key, history);
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

      const customerHistory = orderHistoryByCustomer.get(key) ?? [];
      customerHistory.push({
        id: String(order.name ?? `order-${key}-${customerHistory.length}`),
        date: validDate ? validDate.toISOString() : null,
        total: normalizeErpValue(order.grand_total),
        status: String(order.status ?? 'Submitted'),
      });
      orderHistoryByCustomer.set(key, customerHistory);
    }

    const results = [...orderStats.values()].map((stats) => {
      const customer = customerByCode.get(stats.code);
      const name = String(customer?.customer_name ?? customer?.name ?? stats.code).trim();
      const status = String(customer?.customer_type ?? 'Chưa phân loại').trim() || 'Chưa phân loại';
      const orderHistory = sortOrderHistory(orderHistoryByCustomer.get(`${stats.group}|${stats.code}`) ?? []);
      const intelligence = buildCustomerIntelligence({ name, status, orderCount: stats.count, totalSpent: stats.total, daysSinceLastOrder: stats.lastOrderAt ? Math.floor((Date.now() - stats.lastOrderAt.getTime()) / 86400000) : null, orderHistory });
      return {
        id: `${stats.group}:${stats.code}`,
        name,
        phone: String(customer?.mobile_no ?? '').trim() || null,
        company: stats.group,
        status,
        orderCount: stats.count,
        totalSpent: stats.total,
        avgOrderValue: stats.count ? stats.total / stats.count : 0,
        segment: getSegment({ value: stats.total, orderCount: stats.count, firstOrderAt: stats.firstOrderAt, lastOrderAt: stats.lastOrderAt, status }),
        ...intelligence,
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
      const intelligence = buildCustomerIntelligence({ name, status, orderCount: 0, totalSpent: 0, orderHistory: [] });
      results.push({
        id: id || `erp-customer-${index}`,
        name,
        phone: String(customer.mobile_no ?? '').trim() || null,
        company: group,
        status,
        orderCount: 0,
        totalSpent: 0,
        avgOrderValue: 0,
        segment: getSegment({ value: 0, orderCount: 0, firstOrderAt: null, lastOrderAt: null, status }),
        ...intelligence,
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

    const orderHistory = orders.map((order) => ({
      id: order.id,
      date: order.createdAt.toISOString(),
      total: Number(order.total ?? 0),
      status: order.status,
    }));
    const sortedHistory = sortOrderHistory(orderHistory);
    const intelligence = buildCustomerIntelligence({
      name: customer.name,
      status: customer.status,
      orderCount,
      totalSpent: value,
      daysSinceLastOrder: effectiveLastOrderAt ? Math.floor((Date.now() - effectiveLastOrderAt.getTime()) / 86400000) : null,
      orderHistory: sortedHistory,
    });
    return {
      id: customer.id,
      name: customer.name,
      phone: customer.phone,
      company: customer.company ?? 'Chưa có công ty',
      status: customer.status,
      orderCount,
      totalSpent: value,
      avgOrderValue: orderCount ? value / orderCount : value,
      segment,
      ...intelligence,
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
    const customers: CustomerAnalysisInput[] = Array.isArray(body.customers) ? body.customers : await getAnalysis();
    const prompt = String(body.prompt ?? 'Phân tích toàn bộ nhóm khách hàng và đề xuất hành động bán hàng.').trim();
    const businessGroup = String(body.businessGroup ?? 'nhóm đang chọn').trim();
    const analysisMode = body.analysisMode === 'web+erp' ? 'web+erp' : 'erp';
    const apiKey = process.env.OPENAI_API_KEY;
    const businessScope = getCustomerBusinessScope(businessGroup);
    const cadenceSummary = buildCustomerCadenceSummary(customers);

    if (!apiKey) {
      return NextResponse.json({ reply: 'Chưa cấu hình OPENAI_API_KEY. Hãy dùng các nhóm phân loại tự động và bổ sung API key để bật phân tích AI.', provider: 'fallback' });
    }

    if (analysisMode === 'web+erp') {
      const erpSummary = buildCustomerErpSummary(customers);
      const webCustomers = buildWebAnalysisCustomers(customers);
      const webCadenceSummary = buildWebCadenceSummary(webCustomers);
      const webResponse = await fetch('https://api.openai.com/v1/responses', {
        method: 'POST',
        headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: process.env.OPENAI_WEB_MODEL || 'gpt-4.1-mini',
          instructions: `Bạn là chuyên gia CRM và chiến lược marketing ngành thời trang và vải linen của GUSA tại Việt Nam. ${businessScope} Trả lời hoàn toàn bằng tiếng Việt. ERP là nguồn sự thật về khách hàng GUSA; web chỉ cung cấp bối cảnh thị trường. Không được chuyển khách của chi nhánh vải thành khách mua quần áo hoặc đề xuất sai phạm vi. Bắt buộc nghiên cứu nhiều nguồn web độc lập, ưu tiên nguồn mới và đáng tin cậy đúng phạm vi chi nhánh. Chủ động chọn khách hàng, phân khúc và số liệu ERP thực sự liên quan. Mỗi chiến lược phải có căn cứ ERP định lượng, căn cứ thị trường, hành động và KPI. Khi đánh giá giảm mua hoặc tần suất mua, hãy dựa trên khoảng cách mua trung bình trong lịch sử và khoảng cách hiện tại, không chỉ nhìn số ngày từ lần cuối mua. Nếu dữ liệu không đủ phải nói rõ. Không đưa lời khuyên chung chung, không bịa số và không lấy số web thay cho số ERP.`,
          input: `${prompt}\n\nCHI NHÁNH GUSA: ${businessGroup}\nPHẠM VI KHÁCH HÀNG BẮT BUỘC: ${businessScope}\nTÓM TẮT KPI ERP ĐÃ TÍNH:\n${JSON.stringify(erpSummary)}\nTÓM TẮT NHỊP MUA (tối đa 100 khách ưu tiên):\n${JSON.stringify(webCadenceSummary)}\nDỮ LIỆU KHÁCH HÀNG ERP TÓM TẮT (tối đa 100 khách, không bao gồm lịch sử từng đơn):\n${JSON.stringify(webCustomers)}\n\nNgày phân tích: ${new Date().toISOString().slice(0, 10)}. Hãy trả lời theo cấu trúc: 1) Chẩn đoán khách hàng từ KPI ERP; 2) Tần suất mua thực tế và khách đang giảm/đứt nhịp; 3) Xu hướng thị trường đúng phạm vi chi nhánh có nguồn; 4) Chiến lược có căn cứ ERP, căn cứ thị trường, hành động và KPI; 5) Kế hoạch 30/60/90 ngày; 6) Danh sách khách/phân khúc cần xử lý trong 7 ngày.`,
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
          { role: 'system', content: `Bạn là chuyên gia CRM nội bộ của GUSA. ${businessScope} Trả lời tiếng Việt và chỉ dựa trên dữ liệu ERP được cung cấp. Không phân tích sai phạm vi chi nhánh, không sử dụng hay suy đoán dữ liệu thị trường bên ngoài, không bịa số. Phân tích theo nhóm khách, dấu hiệu, ưu tiên và hành động Sale cụ thể. Khi đánh giá khách có đang giảm mua hay không, hãy xem chu kỳ mua lịch sử, so sánh nhịp mua trung bình/median với khoảng cách gần nhất và khoảng cách hiện tại, đừng đánh giá chỉ dựa trên "đã bao lâu kể từ lần mua cuối". Đối với khách hàng tiềm năng, hãy đánh giá bằng điểm tiềm năng: có thể phân loại Hot / Potential / Watchlist / Low. Dựa trên sự phù hợp sản phẩm, giá trị, hoạt động gần đây, tần suất mua, và xu hướng tăng/giảm. Nếu dữ liệu không đủ thì nói rõ và không gán kết luận quá mạnh.` },
          { role: 'user', content: `${prompt}\n\nCHI NHÁNH GUSA: ${businessGroup}\nBẢNG TỔNG HỢP TÍNH ĐIỂM:\n${JSON.stringify(cadenceSummary)}\nDỮ LIỆU KHÁCH HÀNG ERP:\n${JSON.stringify(customers)}` },
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
