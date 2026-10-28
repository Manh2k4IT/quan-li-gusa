import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordActivity } from '@/lib/activity';
import { recordAssignmentResultsSafely } from '@/lib/assignment-history';
import { getCustomerDirectory } from '@/lib/customer-directory';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

async function getManager() {
  const session = getSession(await cookies());
  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) return null;
  return prisma.user.findUnique({ where: { email: session.email }, select: { id: true, email: true } });
}

function readKeys(value: unknown) {
  return Array.isArray(value) ? [...new Set(value.map((key) => String(key).trim()).filter(Boolean))] : [];
}

export async function POST(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ message: 'Bạn không có quyền giao khách hàng.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const customerKeys = readKeys(body.customerKeys);
  const saleId = String(body.saleId ?? '').trim();
  const targetRevenue = Math.max(0, Number(body.targetRevenue) || 0);
  const periodStart = String(body.periodStart ?? '');
  const periodEnd = String(body.periodEnd ?? '');
  const note = String(body.note ?? '').trim().slice(0, 500);

  if (!customerKeys.length) return NextResponse.json({ message: 'Chưa chọn khách hàng nào.' }, { status: 400 });
  if (!DATE_PATTERN.test(periodStart) || !DATE_PATTERN.test(periodEnd) || periodStart > periodEnd) {
    return NextResponse.json({ message: 'Khoảng thời gian mục tiêu không hợp lệ.' }, { status: 400 });
  }

  const sale = await prisma.user.findFirst({ where: { id: saleId, role: 'SALE' }, select: { id: true, name: true } });
  if (!sale) return NextResponse.json({ message: 'Không tìm thấy Sale được chọn.' }, { status: 400 });

  const directory = await getCustomerDirectory();
  const byKey = new Map(directory.map((customer) => [customer.key, customer]));
  const customers = customerKeys.map((key) => byKey.get(key)).filter((customer) => customer !== undefined);
  if (!customers.length) return NextResponse.json({ message: 'Không tìm thấy khách hàng trên ERP.' }, { status: 400 });

  // Keep the result of any period this replaces before it is overwritten.
  await recordAssignmentResultsSafely({ customerKey: { in: customers.map((customer) => customer.key) }, NOT: { saleId: sale.id, periodStart, periodEnd } }, 'reassigned');

  await prisma.$transaction(customers.map((customer) => prisma.customerAssignment.upsert({
    where: { customerKey: customer.key },
    update: { saleId: sale.id, assignedById: manager.id, targetRevenue, periodStart, periodEnd, note, customerName: customer.name },
    create: {
      customerKey: customer.key,
      customerCode: customer.code,
      customerName: customer.name,
      businessGroup: customer.group,
      saleId: sale.id,
      assignedById: manager.id,
      targetRevenue,
      periodStart,
      periodEnd,
      note,
    },
  })));

  await recordActivity({
    userEmail: manager.email,
    action: 'assigned_customers',
    entityType: 'customer',
    entityId: sale.id,
    details: `${customers.length} khách → ${sale.name}`,
  });

  return NextResponse.json({ ok: true, assigned: customers.length });
}

export async function DELETE(request: Request) {
  const manager = await getManager();
  if (!manager) return NextResponse.json({ message: 'Bạn không có quyền bỏ giao khách hàng.' }, { status: 403 });

  const body = await request.json().catch(() => ({}));
  const customerKeys = readKeys(body.customerKeys);
  if (!customerKeys.length) return NextResponse.json({ message: 'Chưa chọn khách hàng nào.' }, { status: 400 });

  await recordAssignmentResultsSafely({ customerKey: { in: customerKeys } }, 'removed');
  const { count } = await prisma.customerAssignment.deleteMany({ where: { customerKey: { in: customerKeys } } });
  return NextResponse.json({ ok: true, removed: count });
}
