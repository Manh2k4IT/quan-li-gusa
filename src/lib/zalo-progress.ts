import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, sumOrdersBetween, type CustomerOrder } from '@/lib/customer-directory';
import { getZaloAppConfig, getZaloSettings, sendZaloGroupText, setZaloSettings, ZALO_KEYS } from '@/lib/zalo';

const DAY_MS = 86_400_000;
// Weekly report goes out on Monday from this hour (Vietnam time), or as soon as the server is up after it.
const WEEKLY_REPORT_HOUR = 8;
const DIVIDER = '━━━━━━━━━━━━━━━━';
const BAR_SLOTS = 10;

// Short amounts read better in chat, and Zalo turns long digit runs like 376.809.615 into phone links.
function formatMoney(value: number) {
  const abs = Math.abs(value);
  const short = (amount: number, unit: string) => `${amount.toLocaleString('vi-VN', { maximumFractionDigits: amount < 10 ? 2 : 1 })} ${unit}`;
  if (abs >= 1e9) return short(value / 1e9, 'tỷ');
  if (abs >= 1e6) return short(value / 1e6, 'triệu');
  if (abs >= 1e3) return short(value / 1e3, 'nghìn');
  return `${Math.round(value)} đ`;
}

const formatDay = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');
const formatShortDay = (isoDate: string) => formatDay(isoDate).slice(0, 5);

function progressLine(achieved: number, target: number) {
  if (target <= 0) return `Đã đạt ${formatMoney(achieved)} · chưa đặt mục tiêu`;
  const percent = Math.round((achieved / target) * 100);
  const filled = Math.min(BAR_SLOTS, Math.round((percent / 100) * BAR_SLOTS));
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(BAR_SLOTS - filled)}`;
  const tail = achieved >= target
    ? `🎯 vượt mục tiêu ${formatMoney(achieved - target)}`
    : `còn ${100 - percent}% (thiếu ${formatMoney(target - achieved)})`;
  return `${bar} ${percent.toLocaleString('vi-VN')}% · ${tail}`;
}

function vnParts(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', hourCycle: 'h23' }).formatToParts(now);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? '';
  return { date: `${get('year')}-${get('month')}-${get('day')}`, hour: Number(get('hour')) };
}

function shiftDate(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

const daysBetween = (fromIso: string, toIso: string) => Math.round((Date.parse(toIso.slice(0, 10)) - Date.parse(fromIso.slice(0, 10))) / DAY_MS);

type ProgressRow = {
  assignment: { id: string; customerKey: string; customerCode: string; saleId: string; periodStart: string; periodEnd: string; targetRevenue: number; updatedAt: Date };
  name: string;
  saleName: string;
  orders: CustomerOrder[];
  achieved: number;
};

// A sale's overall progress only counts targets running in the last week, so a target that starts next month does not drag it down.
async function loadProgress(today: string) {
  const weekStart = shiftDate(today, -6);
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
  const active = rows.filter((row) => row.assignment.periodStart <= today && row.assignment.periodEnd >= weekStart);

  const saleTotals = new Map<string, { name: string; achieved: number; target: number }>();
  for (const row of active) {
    const total = saleTotals.get(row.assignment.saleId) ?? { name: row.saleName, achieved: 0, target: 0 };
    total.achieved += row.achieved;
    total.target += row.assignment.targetRevenue;
    saleTotals.set(row.assignment.saleId, total);
  }

  return { rows, active, saleTotals, weekStart };
}

function customerLabel(row: ProgressRow) {
  return `${row.name} (${row.assignment.customerCode.toUpperCase()})`;
}

// Posts one group message per ERP order placed by a customer that is currently assigned to a sale.
export async function notifyNewOrders() {
  const settings = await getZaloSettings();
  const watchStart = settings[ZALO_KEYS.watchStartedAt];
  if (!settings[ZALO_KEYS.groupId] || !watchStart) return 0;

  const { rows, saleTotals } = await loadProgress(vnParts().date);
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
    const sale = saleTotals.get(row.assignment.saleId) ?? { name: row.saleName, achieved: row.achieved, target: row.assignment.targetRevenue };
    await sendZaloGroupText([
      '🛒 KHÁCH HÀNG PHÁT SINH ĐƠN MỚI',
      DIVIDER,
      `🏷 Khách hàng: ${customerLabel(row)}`,
      `🧾 Mã đơn: ${order.id}`,
      `💰 Giá trị: ${formatMoney(order.total)}${order.date ? ` · ngày ${formatDay(order.date)}` : ''}`,
      `👤 Sale phụ trách: ${row.saleName}`,
      '',
      `📈 Tiến độ khách hàng (mục tiêu ${formatMoney(row.assignment.targetRevenue)}, ${formatShortDay(row.assignment.periodStart)} – ${formatDay(row.assignment.periodEnd)})`,
      progressLine(row.achieved, row.assignment.targetRevenue),
      '',
      `📊 Tiến độ chung của ${sale.name}`,
      progressLine(sale.achieved, sale.target),
      `Đã đạt ${formatMoney(sale.achieved)} / ${formatMoney(sale.target)}`,
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
  const { active, saleTotals, weekStart } = await loadProgress(today);

  const lines = ['📊 BÁO CÁO TIẾN ĐỘ KHÁCH HÀNG', `🗓 Tuần ${formatShortDay(weekStart)} – ${formatDay(today)}`, DIVIDER];
  if (!active.length) return [...lines, 'Hiện chưa có khách hàng nào đang được giao cho sale.'].join('\n');

  const bySale = new Map<string, ProgressRow[]>();
  for (const row of active) bySale.set(row.assignment.saleId, [...(bySale.get(row.assignment.saleId) ?? []), row]);
  let withOrdersTotal = 0;

  for (const [saleId, saleRows] of bySale) {
    const sale = saleTotals.get(saleId)!;
    const weekly = saleRows.map((row) => ({ row, week: sumOrdersBetween(row.orders, weekStart, today) }));
    const withOrders = weekly.filter(({ week }) => week.count > 0);
    const idle = weekly.filter(({ week }) => week.count === 0);
    withOrdersTotal += withOrders.length;

    lines.push('', `👤 ${sale.name.toUpperCase()}`, `Tiến độ chung: ${progressLine(sale.achieved, sale.target)}`, `Đã đạt ${formatMoney(sale.achieved)} / ${formatMoney(sale.target)}`);

    if (withOrders.length) {
      lines.push('', `✅ Có phát sinh đơn tuần qua (${withOrders.length})`);
      withOrders.forEach(({ row, week }, index) => {
        lines.push(`${index + 1}. ${customerLabel(row)}`);
        lines.push(`   ${week.count} đơn · ${formatMoney(week.total)} trong tuần`);
        lines.push(`   ${progressLine(row.achieved, row.assignment.targetRevenue)}`);
      });
    }

    if (idle.length) {
      lines.push('', `⚠️ Không có đơn tuần qua (${idle.length})`);
      idle.forEach(({ row }, index) => {
        const lastOrder = row.orders.find((order) => order.date)?.date;
        lines.push(`${index + 1}. ${customerLabel(row)}`);
        lines.push(`   ${progressLine(row.achieved, row.assignment.targetRevenue)}`);
        lines.push(`   Đơn gần nhất: ${lastOrder ? `${formatDay(lastOrder)} (${daysBetween(lastOrder, today)} ngày trước)` : 'chưa từng mua'}`);
      });
    }
  }

  lines.push('', DIVIDER, `Tổng: ${active.length} khách · ${withOrdersTotal} có đơn · ${active.length - withOrdersTotal} không có đơn`);
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
