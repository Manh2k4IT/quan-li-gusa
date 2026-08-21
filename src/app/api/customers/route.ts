import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

async function getDefaultOrg() {
  const existing = await prisma.organization.findFirst({
    where: { slug: 'gusa' },
  });

  if (existing) {
    return existing;
  }

  return prisma.organization.create({
    data: { name: 'GUSA Enterprise', slug: 'gusa' },
  });
}

export async function GET() {
  try {
    const customers = await prisma.customer.findMany({
      orderBy: { createdAt: 'desc' },
      take: 20,
    });

    return NextResponse.json(
      customers.map((customer) => ({
        id: customer.id,
        name: customer.name,
        company: customer.company ?? '—',
        email: customer.email ?? '—',
        phone: customer.phone ?? '—',
        status: customer.status,
        value: customer.value,
      })),
    );
  } catch (error) {
    console.error('Customer API error:', error);
    return NextResponse.json([], { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const org = await getDefaultOrg();

    const customer = await prisma.customer.create({
      data: {
        name: String(body.name ?? '').trim(),
        company: String(body.company ?? '').trim() || null,
        email: String(body.email ?? '').trim() || null,
        phone: String(body.phone ?? '').trim() || null,
        status: String(body.status ?? 'New').trim() || 'New',
        value: Number(body.value ?? 0),
        orgId: org.id,
      },
    });

    return NextResponse.json({ ok: true, customer });
  } catch (error) {
    console.error('Customer create error:', error);
    return NextResponse.json({ message: 'Không thể tạo khách hàng.' }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = await request.json();
    const customerId = String(body.id ?? '').trim();

    if (!customerId) {
      return NextResponse.json({ message: 'Thiếu customerId.' }, { status: 400 });
    }

    await prisma.customer.delete({ where: { id: customerId } });
    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Customer delete error:', error);
    return NextResponse.json({ message: 'Không thể xóa khách hàng.' }, { status: 500 });
  }
}
