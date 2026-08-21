import { PrismaClient } from '../src/generated/prisma/client';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';

const adapter = new PrismaBetterSqlite3({
  url: process.env.DATABASE_URL ?? 'file:./dev.db',
});

const prisma = new PrismaClient({ adapter });

async function main() {
  const org = await prisma.organization.upsert({
    where: { slug: 'gusa' },
    update: {},
    create: {
      name: 'GUSA Enterprise',
      slug: 'gusa',
    },
  });

  const admin = await prisma.user.upsert({
    where: { email: 'ceo@gusa.io' },
    update: { name: 'CEO GUSA', password: 'ceo123', role: 'CEO', category: 'Tổng điều hành' },
    create: {
      email: 'ceo@gusa.io',
      name: 'CEO GUSA',
      password: 'ceo123',
      role: 'CEO',
      category: 'Tổng điều hành',
      orgId: org.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'manager@gusa.io' },
    update: { name: 'Manager GUSA', password: 'manager123', role: 'MANAGER', category: 'Thời trang Quận 4' },
    create: {
      email: 'manager@gusa.io',
      name: 'Manager GUSA',
      password: 'manager123',
      role: 'MANAGER',
      category: 'Thời trang Quận 4',
      orgId: org.id,
    },
  });

  await prisma.user.upsert({
    where: { email: 'sale@gusa.io' },
    update: { name: 'Sale GUSA', password: 'sale123', role: 'SALE', category: 'Kho vải Quận 4' },
    create: {
      email: 'sale@gusa.io',
      name: 'Sale GUSA',
      password: 'sale123',
      role: 'SALE',
      category: 'Kho vải Quận 4',
      orgId: org.id,
    },
  });

  await prisma.kPI.upsert({
    where: { id: 'kpi-revenue' },
    update: {},
    create: {
      id: 'kpi-revenue',
      name: 'Doanh thu',
      value: 482400,
      target: 420000,
      unit: 'USD',
      period: 'Q3-2026',
      orgId: org.id,
    },
  });

  const customer = await prisma.customer.upsert({
    where: { id: 'customer-1' },
    update: {},
    create: {
      id: 'customer-1',
      name: 'Nguyễn Minh',
      company: 'Mtech',
      email: 'minh@mtech.vn',
      phone: '0900001111',
      status: 'Hot',
      value: 24500,
      orgId: org.id,
    },
  });

  await prisma.product.upsert({
    where: { sku: 'SP-101' },
    update: {},
    create: {
      name: 'Laptop Pro 14',
      sku: 'SP-101',
      category: 'Tech',
      unitPrice: 1200,
      orgId: org.id,
    },
  });

  await prisma.order.upsert({
    where: { id: 'order-1' },
    update: {},
    create: {
      id: 'order-1',
      customerId: customer.id,
      total: 24500,
      status: 'Paid',
    },
  });

  await prisma.document.upsert({
    where: { id: 'doc-1' },
    update: {},
    create: {
      id: 'doc-1',
      title: 'SOP vận hành Q3',
      type: 'SOP',
      ownerId: admin.id,
      orgId: org.id,
      content: 'SOP này mô tả quy trình vận hành và báo cáo KPI cho toàn bộ doanh nghiệp.',
    },
  });

  await prisma.dashboard.upsert({
    where: { id: 'dash-1' },
    update: {},
    create: {
      id: 'dash-1',
      name: 'Executive Dashboard',
      ownerId: admin.id,
      orgId: org.id,
      widgets: [
        { type: 'kpi', label: 'Revenue' },
        { type: 'chart', label: 'Trend' },
        { type: 'pipeline', label: 'Sales' },
      ],
    },
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
