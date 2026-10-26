import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, getPreviousMonthRange, sumOrdersBetween } from '@/lib/customer-directory';

const PAGE_SIZE = 50;

export async function GET(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  if (session.role !== 'CEO' && session.role !== 'MANAGER') return NextResponse.json({ message: 'Forbidden' }, { status: 403 });

  const url = new URL(request.url);
  const query = (url.searchParams.get('q') ?? '').trim().toLowerCase();
  const group = url.searchParams.get('group') ?? '';
  const status = url.searchParams.get('status') ?? '';
  const sort = url.searchParams.get('sort') ?? 'revenue';
  const page = Math.max(1, Number(url.searchParams.get('page')) || 1);

  try {
    const [directory, assignments, sales] = await Promise.all([
      getCustomerDirectory(),
      prisma.customerAssignment.findMany({ include: { sale: { select: { id: true, name: true } } } }),
      prisma.user.findMany({ where: { role: 'SALE' }, select: { id: true, name: true, email: true, category: true }, orderBy: { name: 'asc' } }),
    ]);
    const assignmentByKey = new Map(assignments.map((assignment) => [assignment.customerKey, assignment]));
    const lastMonth = getPreviousMonthRange();
    const lastMonthRevenue = new Map(directory.map((customer) => [customer.key, sumOrdersBetween(customer.orders, lastMonth.start, lastMonth.end).total]));

    const filtered = directory.filter((customer) => {
      if (group && customer.group !== group) return false;
      const assigned = assignmentByKey.has(customer.key);
      if (status === 'assigned' && !assigned) return false;
      if (status === 'unassigned' && assigned) return false;
      if (query && !customer.name.toLowerCase().includes(query) && !customer.code.includes(query) && !(customer.phone ?? '').includes(query)) return false;
      return true;
    });

    filtered.sort((first, second) => {
      if (sort === 'recent') return (second.lastOrderAt ?? '').localeCompare(first.lastOrderAt ?? '');
      if (sort === 'orders') return second.orderCount - first.orderCount;
      if (sort === 'lastMonth') return (lastMonthRevenue.get(second.key) ?? 0) - (lastMonthRevenue.get(first.key) ?? 0);
      if (sort === 'name') return first.name.localeCompare(second.name, 'vi');
      return second.totalSpent - first.totalSpent;
    });

    const customers = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE).map((customer) => {
      const assignment = assignmentByKey.get(customer.key);
      return {
        key: customer.key,
        code: customer.code,
        name: customer.name,
        phone: customer.phone,
        group: customer.group,
        orderCount: customer.orderCount,
        totalSpent: customer.totalSpent,
        avgOrderValue: customer.avgOrderValue,
        lastOrderAt: customer.lastOrderAt,
        lastMonthRevenue: lastMonthRevenue.get(customer.key) ?? 0,
        assignment: assignment
          ? {
            saleId: assignment.saleId,
            saleName: assignment.sale.name,
            targetRevenue: assignment.targetRevenue,
            periodStart: assignment.periodStart,
            periodEnd: assignment.periodEnd,
            note: assignment.note,
          }
          : null,
      };
    });

    return NextResponse.json({
      customers,
      sales,
      page,
      lastMonthLabel: lastMonth.label,
      pageCount: Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)),
      total: filtered.length,
      summary: {
        totalCustomers: directory.length,
        assignedCustomers: directory.filter((customer) => assignmentByKey.has(customer.key)).length,
        buyingCustomers: directory.filter((customer) => customer.orderCount > 0).length,
      },
    });
  } catch (error) {
    console.error('Customer directory error:', error);
    return NextResponse.json({ message: 'Không thể tải danh sách khách hàng từ ERP.' }, { status: 502 });
  }
}
