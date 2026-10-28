import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, sumOrdersBetween, type CustomerOrder } from '@/lib/customer-directory';
import { getZaloAppConfig, getZaloSettings, sendZaloGroupText, setZaloSettings, ZALO_KEYS } from '@/lib/zalo';

const DAY_MS = 86_400_000;
// Weekly report goes out on Monday from this hour (Vietnam time), or as soon as the server is up after it.
const WEEKLY_REPORT_HOUR = 8;

const formatVnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
const formatPercent = (achieved: number, target: number) => (target > 0 ? `${Math.round((achieved / target) * 100)}%` : 'chưa đặt mục tiêu');
const formatDay = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');

function vnParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function shiftDate(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

type ProgressRow = {
  assignment: { id: string; customerKey: string; customerCode: string; saleId: string; periodStart: string; periodEnd: string; targetRevenue: number; updatedAt: Date };
  name: string;
  saleName: string;
  orders: CustomerOrder[];
  achieved: number;
};

async function loadProgress() {
  const [assignments, directory] = await Promise.all([
    prisma.customerAssignment.findMany({ include: { sale: { select: { name: true } } } }),
    getCustomerDirectory(),
  ]);
  const byKey = new Map(directory.map((customer) => [customer.key, customer]));

  const rows: ProgressRow[] = assignments.map((assignment) => {
    const customer = byKey.get(assignment.customerKey);
    const orders = customer?.orders ?? [];
    return {
      assignment,
      name: customer?.name ?? assignment.customerName,
      saleName: assignment.sale.name,
      orders,
      achieved: sumOrdersBetween(orders, assignment.periodStart, assignment.periodEnd).total,
    };
  });

  const saleTotals = new Map<string, { name: string; achieved: number; target: number }>();
  for (const row of rows) {
    const total = saleTotals.get(row.assignment.saleId) ?? { name: row.saleName, achieved: 0, target: 0 };
    total.achieved += row.achieved;
    total.target += row.assignment.targetRevenue;
    saleTotals.set(row.assignment.saleId, total);
  }

  return { rows, saleTotals };
}

// Posts one group message per ERP order placed by a customer that is currently assigned to a sale.
export async function notifyNewOrders() {
  const settings = await getZaloSettings();
  const watchStart = settings[ZALO_KEYS.watchStartedAt];
  if (!settings[ZALO_KEYS.groupId] || !watchStart) return 0;

  const { rows, saleTotals } = await loadProgress();
  const candidates: Array<{ row: ProgressRow; order: CustomerOrder }> = [];

  for (const row of rows) {
    // Orders from before the group was connected or before this assignment are history, not news.
    const assignedDay = vnParts(row.assignment.updatedAt).date;
    const from = [watchStart, assignedDay, row.assignment.periodStart].sort().at(-1)!;
    for (const order of row.orders) {
      const day = order.date?.slice(0, 10);
      if (day && day >= from && day <= row.assignment.periodEnd) candidates.push({ row, order });
    }
  }
  if (!candidates.length) return 0;

  const seen = await prisma.zaloOrderNotice.findMany({ where: { orderId: { in: candidates.map(({ order }) => order.id) } }, select: { orderId: true } });
  const seenIds = new Set(seen.map((notice) => notice.orderId));
  let sent = 0;

  for (const { row, order } of candidates) {
    if (seenIds.has(order.id)) continue;
    const sale = saleTotals.get(row.assignment.saleId)!;
    await sendZaloGroupText([
      `🛒 ĐƠN MỚI từ khách hàng ${row.name} (${row.assignment.customerCode.toUpperCase()})`,
      `• Mã đơn: ${order.id} · ${formatVnd(order.total)} · ngày ${order.date ? formatDay(order.date) : '—'}`,
      `• Sale phụ trách: ${row.saleName}`,
      `• Tiến độ khách này: ${formatPercent(row.achieved, row.assignment.targetRevenue)} (${formatVnd(row.achieved)} / ${formatVnd(row.assignment.targetRevenue)}, ${formatDay(row.assignment.periodStart)}–${formatDay(row.assignment.periodEnd)})`,
      `• Tiến độ chung của ${row.saleName}: ${formatPercent(sale.achieved, sale.target)} (${formatVnd(sale.achieved)} / ${formatVnd(sale.target)})`,
    ].join('\n'));
    // Recorded right after its own send, so a failure part-way through never re-posts earlier orders.
    await prisma.zaloOrderNotice.create({ data: { orderId: order.id, customerKey: row.assignment.customerKey } });
    seenIds.add(order.id);
    sent += 1;
  }

  return sent;
}

export async function buildWeeklyReport(now = new Date()) {
  const today = vnParts(now).date;
  const weekStart = shiftDate(today, -6);
  const { rows, saleTotals } = await loadProgress();
  const active = rows.filter((row) => row.assignment.periodStart <= today && row.assignment.periodEnd >= weekStart);

  const lines = [`📊 BÁO CÁO TIẾN ĐỘ KHÁCH HÀNG TUẦN ${formatDay(weekStart)} – ${formatDay(today)}`];
  if (!active.length) return [...lines, 'Hiện chưa có khách hàng nào đang được giao cho sale.'].join('\n');

  const bySale = new Map<string, ProgressRow[]>();
  for (const row of active) bySale.set(row.assignment.saleId, [...(bySale.get(row.assignment.saleId) ?? []), row]);
  for (const [saleId, saleRows] of bySale) {
    const sale = saleTotals.get(saleId)!;
    const idle = saleRows.filter((row) => sumOrdersBetween(row.orders, weekStart, today).count === 0);
    lines.push('', `👤 ${sale.name} — tiến độ chung ${formatPercent(sale.achieved, sale.target)} (${formatVnd(sale.achieved)} / ${formatVnd(sale.target)})`);
    lines.push(`   ${saleRows.length - idle.length}/${saleRows.length} khách có đơn trong tuần`);
    for (const row of idle) {
      lines.push(`   • ${row.name}: ${formatPercent(row.achieved, row.assignment.targetRevenue)} (${formatVnd(row.achieved)} / ${formatVnd(row.assignment.targetRevenue)}) — chưa phát sinh đơn trong tuần`);
    }
  }
  return lines.join('\n');
}

export async function sendWeeklyReport() {
  await sendZaloGroupText(await buildWeeklyReport());
}

// Once per week: the key is that week's Monday, so a server that was down on Monday catches up later in the week.
async function sendWeeklyReportIfDue() {
  const { date, hour } = vnParts();
  const weekday = (new Date(`${date}T00:00:00.000Z`).getUTCDay() + 6) % 7;
  const monday = shiftDate(date, -weekday);
  if (weekday === 0 && hour < WEEKLY_REPORT_HOUR) return false;

  const settings = await getZaloSettings();
  if (!settings[ZALO_KEYS.groupId] || settings[ZALO_KEYS.lastWeeklyReport] === monday) return false;

  await sendWeeklyReport();
  await setZaloSettings({ [ZALO_KEYS.lastWeeklyReport]: monday });
  return true;
}

let running = false;

export async function runZaloJobs() {
  if (running || !getZaloAppConfig().configured) return;
  running = true;
  try {
    await notifyNewOrders();
    await sendWeeklyReportIfDue();
  } catch (error) {
    console.error('Zalo notification job failed:', error);
    await setZaloSettings({ [ZALO_KEYS.lastError]: `${new Date().toISOString()} · ${error instanceof Error ? error.message : String(error)}` }).catch(() => {});
  } finally {
    running = false;
  }
}

export function startOfWatch() {
  return vnParts().date;
}
