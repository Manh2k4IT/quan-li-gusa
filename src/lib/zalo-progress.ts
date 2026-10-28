import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, sumOrdersBetween, type CustomerOrder } from '@/lib/customer-directory';
import { getZaloAppConfig, getZaloSettings, sendZaloGroupText, setZaloSettings, ZALO_KEYS } from '@/lib/zalo';

const DAY_MS = 86_400_000;
// Weekly report goes out on Monday from this hour (Vietnam time), or as soon as the server is up after it.
const WEEKLY_REPORT_HOUR = 8;
const DIVIDER = '━━━━━━━━━━━━━━━━';
const BAR_SLOTS = 10;
// A customer below target with this many days or fewer left in its period is flagged as urgent.
const URGENT_DAYS = 7;
// Flagged as behind when the share of the period already elapsed exceeds the share of target reached by this many points.
const BEHIND_PACE_POINTS = 20;

const formatDay = (isoDate: string) => isoDate.slice(0, 10).split('-').reverse().join('/');
const formatShortDay = (isoDate: string) => formatDay(isoDate).slice(0, 5);

// Zalo group messages show progress only, never revenue amounts.
function progressLine(achieved: number, target: number) {
  if (target <= 0) return 'Chưa đặt mục tiêu';
  const percent = Math.round((achieved / target) * 100);
  const filled = Math.min(BAR_SLOTS, Math.round((percent / 100) * BAR_SLOTS));
  const bar = `${'▰'.repeat(filled)}${'▱'.repeat(BAR_SLOTS - filled)}`;
  // Percentages stay without thousands separators: Vietnamese "16.383%" reads as sixteen percent.
  const tail = percent >= 100 ? `🎯 vượt ${percent - 100}%` : `còn ${100 - percent}%`;
  return `${bar} ${percent}% · ${tail}`;
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
  // Customers whose target period has not ended yet, including ones starting later.
  const active = rows.filter((row) => row.assignment.periodEnd >= weekStart);

  // Same totals as "Tổng hợp theo Sale" on /my-customers: every assigned customer, whatever its period.
  const saleTotals = new Map<string, { name: string; achieved: number; target: number; customers: number; reached: number }>();
  for (const row of rows) {
    const total = saleTotals.get(row.assignment.saleId) ?? { name: row.saleName, achieved: 0, target: 0, customers: 0, reached: 0 };
    total.achieved += row.achieved;
    total.target += row.assignment.targetRevenue;
    total.customers += 1;
    if (row.assignment.targetRevenue > 0 && row.achieved >= row.assignment.targetRevenue) total.reached += 1;
    saleTotals.set(row.assignment.saleId, total);
  }

  return { rows, active, saleTotals, weekStart };
}

function customerProgress(row: ProgressRow, today: string) {
  return row.assignment.periodStart > today
    ? `⏳ Kỳ mục tiêu bắt đầu ${formatDay(row.assignment.periodStart)}`
    : progressLine(row.achieved, row.assignment.targetRevenue);
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
    const sale = saleTotals.get(row.assignment.saleId)!;
    const target = row.assignment.targetRevenue;
    // This order is the one that pushed the customer over its target.
    const justReached = target > 0 && row.achieved >= target && row.achieved - order.total < target;
    await sendZaloGroupText([
      ...(justReached ? [`🎉🎉 CHÚC MỪNG ${row.saleName.toUpperCase()}! Khách ${row.name} vừa ĐẠT MỤC TIÊU với đơn này!`, ''] : []),
      '🛒 KHÁCH HÀNG PHÁT SINH ĐƠN MỚI',
      DIVIDER,
      `🏷 Khách hàng: ${customerLabel(row)}`,
      `🧾 Mã đơn: ${order.id}${order.date ? ` · ngày ${formatDay(order.date)}` : ''}`,
      `👤 Sale phụ trách: ${row.saleName}`,
      '',
      `📈 Tiến độ khách hàng (${formatShortDay(row.assignment.periodStart)} – ${formatDay(row.assignment.periodEnd)})`,
      progressLine(row.achieved, row.assignment.targetRevenue),
      '',
      `📊 Tiến độ chung của ${sale.name}`,
      progressLine(sale.achieved, sale.target),
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
  // Ended periods are released from assignment the next day, so their outcome comes from the stored history.
  const endedThisWeek = await prisma.assignmentResult.findMany({ where: { outcome: 'completed', periodEnd: { gte: shiftDate(today, -7), lt: today } }, orderBy: { periodEnd: 'asc' } });

  const lines = ['📊 BÁO CÁO TIẾN ĐỘ KHÁCH HÀNG', `🗓 Tuần ${formatShortDay(weekStart)} – ${formatDay(today)}`, DIVIDER];
  if (!active.length && !endedThisWeek.length) return [...lines, 'Hiện chưa có khách hàng nào đang được giao cho sale.'].join('\n');
  if (!active.length) lines.push('', 'Hiện không còn khách nào đang được giao cho sale.');

  const bySale = new Map<string, ProgressRow[]>();
  for (const row of active) bySale.set(row.assignment.saleId, [...(bySale.get(row.assignment.saleId) ?? []), row]);
  let withOrdersTotal = 0;

  for (const [saleId, saleRows] of bySale) {
    const sale = saleTotals.get(saleId)!;
    const weekly = saleRows.map((row) => ({ row, week: sumOrdersBetween(row.orders, weekStart, today) }));
    const withOrders = weekly.filter(({ week }) => week.count > 0);
    const idle = weekly.filter(({ week }) => week.count === 0);
    withOrdersTotal += withOrders.length;

    lines.push('', `👤 ${sale.name.toUpperCase()}`, `Tiến độ chung: ${progressLine(sale.achieved, sale.target)}`, `Khách đạt mục tiêu: ${sale.reached}/${sale.customers}`);

    if (withOrders.length) {
      lines.push('', `✅ Có phát sinh đơn tuần qua (${withOrders.length})`);
      withOrders.forEach(({ row, week }, index) => {
        lines.push(`${index + 1}. ${customerLabel(row)}`);
        lines.push(`   ${week.count} đơn trong tuần`);
        lines.push(`   ${customerProgress(row, today)}`);
      });
    }

    if (idle.length) {
      lines.push('', `⚠️ Không có đơn tuần qua (${idle.length})`);
      idle.forEach(({ row }, index) => {
        const lastOrder = row.orders.find((order) => order.date)?.date;
        lines.push(`${index + 1}. ${customerLabel(row)}`);
        lines.push(`   ${customerProgress(row, today)}`);
        lines.push(`   Đơn gần nhất: ${lastOrder ? `${formatDay(lastOrder)} (${daysBetween(lastOrder, today)} ngày trước)` : 'chưa từng mua'}`);
      });
    }
  }

  if (endedThisWeek.length) {
    lines.push('', DIVIDER, `🏁 KẾT THÚC KỲ TRONG TUẦN (${endedThisWeek.length})`);
    for (const result of endedThisWeek) {
      const percent = result.targetRevenue > 0 ? Math.round((result.achievedRevenue / result.targetRevenue) * 100) : 0;
      lines.push(result.reached
        ? `🎉 ${result.customerName} (${result.saleName}): ĐẠT MỤC TIÊU ${percent}% · kỳ đến ${formatDay(result.periodEnd)}`
        : `🔴 ${result.customerName} (${result.saleName}): KHÔNG ĐẠT, chỉ đạt ${percent}% · kỳ đến ${formatDay(result.periodEnd)}`);
    }
    lines.push('Các khách này đã tự động bỏ giao, xem lại trong Lịch sử chăm khách.');
  }

  const alerts = buildAlerts(active, today);
  lines.push('', DIVIDER, '🔔 CẢNH BÁO & GHI NHẬN');
  if (alerts.length) lines.push(...alerts);
  else lines.push('✅ Không có khách nào cần chú ý tuần này.');
  lines.push('', `📌 ${active.length} khách · ${withOrdersTotal} có đơn · ${active.length - withOrdersTotal} không có đơn trong tuần`);
  return lines.join('\n');
}

// Customers ending soon without reaching target come first, then ones behind pace, then congratulations.
function buildAlerts(rows: ProgressRow[], today: string) {
  const urgent: string[] = [];
  const behind: string[] = [];
  const reached: string[] = [];

  for (const row of rows) {
    const { periodStart, periodEnd, targetRevenue } = row.assignment;
    if (periodStart > today || targetRevenue <= 0) continue;
    const percent = Math.round((row.achieved / targetRevenue) * 100);
    const daysLeft = daysBetween(today, periodEnd);
    const totalDays = daysBetween(periodStart, periodEnd) + 1;
    const elapsedPercent = Math.round(((daysBetween(periodStart, today) + 1) / totalDays) * 100);
    // Ended periods are reported from history; one still assigned here only means storing its result failed.
    if (daysLeft < 0) continue;

    if (percent >= 100) {
      reached.push(`🎉 Chúc mừng ${row.saleName}! Khách ${row.name} đã ĐẠT MỤC TIÊU (${percent}%)`);
    } else if (daysLeft <= URGENT_DAYS) {
      urgent.push(`🚨 ${row.name} (${row.saleName}): ${daysLeft === 0 ? 'HẾT KỲ HÔM NAY' : `CÒN ${daysLeft} NGÀY hết kỳ`} (${formatDay(periodEnd)}) mà mới đạt ${percent}%`);
    } else if (elapsedPercent - percent >= BEHIND_PACE_POINTS) {
      behind.push(`⚠️ ${row.name} (${row.saleName}): CHẬM TIẾN ĐỘ · đã qua ${elapsedPercent}% thời gian, mới đạt ${percent}%`);
    }
  }

  return [...urgent, ...behind, ...reached];
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
