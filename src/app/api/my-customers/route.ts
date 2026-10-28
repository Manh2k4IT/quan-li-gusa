import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, getPreviousMonthRange, sumOrdersBetween } from '@/lib/customer-directory';
import { closeEndedAssignmentsSafely } from '@/lib/assignment-history';

const DAY_MS = 86_400_000;

function shiftDate(isoDate: string, days: number) {
  return new Date(Date.parse(`${isoDate}T00:00:00.000Z`) + days * DAY_MS).toISOString().slice(0, 10);
}

export async function GET(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const isManager = session.role === 'CEO' || session.role === 'MANAGER';
  const requestedSaleId = new URL(request.url).searchParams.get('saleId') ?? '';
  const currentUser = await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } });

  const where = isManager
    ? (requestedSaleId ? { saleId: requestedSaleId } : {})
    : { saleId: currentUser?.id ?? '__none__' };

  try {
    // Periods that ended since anyone last looked are stored in history and released before reading.
    await closeEndedAssignmentsSafely();

    const [assignments, directory, sales] = await Promise.all([
      prisma.customerAssignment.findMany({ where, include: { sale: { select: { id: true, name: true } }, assignedBy: { select: { name: true } } }, orderBy: { updatedAt: 'desc' } }),
      getCustomerDirectory(),
      isManager ? prisma.user.findMany({ where: { role: 'SALE' }, select: { id: true, name: true }, orderBy: { name: 'asc' } }) : Promise.resolve([]),
    ]);
    const byKey = new Map(directory.map((customer) => [customer.key, customer]));
    const lastMonth = getPreviousMonthRange();

    const customers = assignments.map((assignment) => {
      const customer = byKey.get(assignment.customerKey);
      const orders = customer?.orders ?? [];
      const period = sumOrdersBetween(orders, assignment.periodStart, assignment.periodEnd);
      const periodDays = Math.round((Date.parse(assignment.periodEnd) - Date.parse(assignment.periodStart)) / DAY_MS) + 1;
      const previous = sumOrdersBetween(orders, shiftDate(assignment.periodStart, -periodDays), shiftDate(assignment.periodStart, -1));
      const periodStartIso = `${assignment.periodStart}T00:00:00.000Z`;
      const beforePeriod = orders.filter((order) => order.date && order.date < periodStartIso);

      return {
        key: assignment.customerKey,
        name: customer?.name ?? assignment.customerName,
        code: assignment.customerCode,
        phone: customer?.phone ?? null,
        group: assignment.businessGroup,
        saleId: assignment.saleId,
        saleName: assignment.sale.name,
        note: assignment.note,
        assignedAt: assignment.updatedAt.toISOString(),
        assignedByName: assignment.assignedBy.name,
        periodStart: assignment.periodStart,
        periodEnd: assignment.periodEnd,
        targetRevenue: assignment.targetRevenue,
        achievedRevenue: period.total,
        achievedOrders: period.count,
        previousPeriodRevenue: previous.total,
        lastMonthRevenue: sumOrdersBetween(orders, lastMonth.start, lastMonth.end).total,
        history: {
          spentBeforePeriod: beforePeriod.reduce((sum, order) => sum + order.total, 0),
          ordersBeforePeriod: beforePeriod.length,
          lifetimeSpent: customer?.totalSpent ?? 0,
          lifetimeOrders: customer?.orderCount ?? 0,
          avgOrderValue: customer?.avgOrderValue ?? 0,
          firstOrderAt: customer?.firstOrderAt ?? null,
          lastOrderAt: customer?.lastOrderAt ?? null,
        },
        recentOrders: orders.slice(0, 6),
        foundInErp: Boolean(customer),
      };
    });

    return NextResponse.json({ customers, sales, isManager, lastMonthLabel: lastMonth.label });
  } catch (error) {
    console.error('My customers error:', error);
    return NextResponse.json({ message: 'Không thể tải dữ liệu khách hàng từ ERP.' }, { status: 502 });
  }
}
