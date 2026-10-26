import { getErpCustomers, getErpSalesOrders } from '@/lib/erp';

export type CustomerOrder = { id: string; date: string | null; total: number; status: string };

export type DirectoryCustomer = {
  key: string;
  code: string;
  name: string;
  phone: string | null;
  group: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  firstOrderAt: string | null;
  lastOrderAt: string | null;
  orders: CustomerOrder[];
};

export const BUSINESS_GROUPS = ['Thời trang Quận 4', 'Vải Quận 4', 'Vải Bến Thành'] as const;

// Mirrors the grouping used by /api/customer-analysis so both screens agree on customer identity.
export function getBusinessGroup(value: unknown) {
  const normalized = String(value ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (normalized.includes('thoi trang q4') || normalized.includes('thoi trang quan 4')) return 'Thời trang Quận 4';
  if (normalized.includes('vai ben thanh')) return 'Vải Bến Thành';
  if (normalized.includes('vai quan 4')) return 'Vải Quận 4';
  return null;
}

function toNumber(value: unknown) {
  if (typeof value === 'number') return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^0-9.-]/g, ''));
    return Number.isFinite(parsed) ? parsed : 0;
  }
  return 0;
}

function toIsoDate(value: unknown) {
  const raw = String(value ?? '').trim();
  if (!raw) return null;
  const date = new Date(raw);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

let directoryMemo: { customers: unknown; orders: unknown; result: DirectoryCustomer[] } | null = null;

export async function getCustomerDirectory(): Promise<DirectoryCustomer[]> {
  const [erpCustomers, erpOrders] = await Promise.all([getErpCustomers(), getErpSalesOrders()]);

  // The ERP reads are cached, so identical arrays mean the directory can be reused as-is.
  if (directoryMemo && directoryMemo.customers === erpCustomers && directoryMemo.orders === erpOrders) {
    return directoryMemo.result;
  }

  const customerByCode = new Map(erpCustomers.map((customer) => [String(customer.name ?? '').trim().toLowerCase(), customer]));
  const directory = new Map<string, DirectoryCustomer>();

  const ensure = (group: string, code: string) => {
    const key = `${group}:${code}`;
    let entry = directory.get(key);
    if (!entry) {
      const customer = customerByCode.get(code);
      entry = {
        key,
        code,
        name: String(customer?.customer_name ?? customer?.name ?? code).trim() || 'Khách chưa đặt tên',
        phone: String(customer?.mobile_no ?? '').trim() || null,
        group,
        orderCount: 0,
        totalSpent: 0,
        avgOrderValue: 0,
        firstOrderAt: null,
        lastOrderAt: null,
        orders: [],
      };
      directory.set(key, entry);
    }
    return entry;
  };

  for (const order of erpOrders) {
    const group = getBusinessGroup(order.branch);
    const code = String(order.customer ?? '').trim().toLowerCase();
    if (!group || !code) continue;
    const entry = ensure(group, code);
    const date = toIsoDate(order.transaction_date);
    const total = toNumber(order.grand_total);
    entry.orders.push({ id: String(order.name ?? `${entry.key}-${entry.orders.length}`), date, total, status: String(order.status ?? '') });
    entry.orderCount += 1;
    entry.totalSpent += total;
    if (date && (!entry.firstOrderAt || date < entry.firstOrderAt)) entry.firstOrderAt = date;
    if (date && (!entry.lastOrderAt || date > entry.lastOrderAt)) entry.lastOrderAt = date;
  }

  for (const customer of erpCustomers) {
    const group = getBusinessGroup(customer.customer_group);
    const code = String(customer.name ?? '').trim().toLowerCase();
    if (group && code) ensure(group, code);
  }

  const result = [...directory.values()].map((entry) => ({
    ...entry,
    avgOrderValue: entry.orderCount ? entry.totalSpent / entry.orderCount : 0,
    orders: entry.orders.sort((first, second) => (second.date ?? '').localeCompare(first.date ?? '')),
  }));

  directoryMemo = { customers: erpCustomers, orders: erpOrders, result };
  return result;
}

// Previous calendar month relative to today in Vietnam time.
export function getPreviousMonthRange(now = new Date()) {
  const [year, month] = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit' })
    .format(now)
    .split('-')
    .map(Number);
  const previousYear = month === 1 ? year - 1 : year;
  const previousMonth = month === 1 ? 12 : month - 1;
  const lastDay = new Date(Date.UTC(previousYear, previousMonth, 0)).getUTCDate();
  const prefix = `${previousYear}-${String(previousMonth).padStart(2, '0')}`;
  return { start: `${prefix}-01`, end: `${prefix}-${String(lastDay).padStart(2, '0')}`, label: `${String(previousMonth).padStart(2, '0')}/${previousYear}` };
}

export function sumOrdersBetween(orders: CustomerOrder[], start: string, end: string) {
  const from = `${start}T00:00:00.000Z`;
  const to = `${end}T23:59:59.999Z`;
  let total = 0;
  let count = 0;
  for (const order of orders) {
    if (order.date && order.date >= from && order.date <= to) {
      total += order.total;
      count += 1;
    }
  }
  return { total, count };
}
