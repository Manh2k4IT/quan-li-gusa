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

  const customers = [
    { id: 'customer-1', name: 'Nguyễn Minh', company: 'Mtech', email: 'minh@mtech.vn', phone: '0900001111', status: 'Hot', value: 24500 },
    { id: 'customer-2', name: 'Trần Lan', company: 'Hana Textiles', email: 'lan@hanatextiles.vn', phone: '0900002222', status: 'Warm', value: 89000 },
    { id: 'customer-3', name: 'Phạm Hữu', company: 'Viet Style', email: 'huu@vietstyle.vn', phone: '0900003333', status: 'Lead', value: 40000 },
    { id: 'customer-4', name: 'Ngọc Ánh', company: 'Mira Fashion', email: 'anh@mira.vn', phone: '0900004444', status: 'Cold', value: 25000 },
    { id: 'customer-5', name: 'Bùi Quốc', company: 'Urban Goods', email: 'quoc@urbangoods.vn', phone: '0900005555', status: 'Hot', value: 185000 },
    { id: 'customer-6', name: 'Lê Thu', company: 'Bloom Studio', email: 'thu@bloomstudio.vn', phone: '0900006666', status: 'Potential', value: 63000 },
  ];

  for (const customer of customers) {
    await prisma.customer.upsert({
      where: { id: customer.id },
      update: {
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        value: customer.value,
        orgId: org.id,
      },
      create: {
        id: customer.id,
        name: customer.name,
        company: customer.company,
        email: customer.email,
        phone: customer.phone,
        status: customer.status,
        value: customer.value,
        orgId: org.id,
      },
    });
  }

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

  const orderDefinitions = [
    { id: 'order-1', customerId: 'customer-1', total: 24500, status: 'Paid', createdAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000) },
    { id: 'order-2', customerId: 'customer-2', total: 89000, status: 'Paid', createdAt: new Date(Date.now() - 6 * 24 * 60 * 60 * 1000) },
    { id: 'order-3', customerId: 'customer-2', total: 125000, status: 'Paid', createdAt: new Date(Date.now() - 24 * 24 * 60 * 60 * 1000) },
    { id: 'order-4', customerId: 'customer-3', total: 40000, status: 'Pending', createdAt: new Date(Date.now() - 35 * 24 * 60 * 60 * 1000) },
    { id: 'order-5', customerId: 'customer-4', total: 25000, status: 'Cancelled', createdAt: new Date(Date.now() - 72 * 24 * 60 * 60 * 1000) },
    { id: 'order-6', customerId: 'customer-5', total: 185000, status: 'Paid', createdAt: new Date(Date.now() - 9 * 24 * 60 * 60 * 1000) },
    { id: 'order-7', customerId: 'customer-5', total: 240000, status: 'Paid', createdAt: new Date(Date.now() - 18 * 24 * 60 * 60 * 1000) },
    { id: 'order-8', customerId: 'customer-6', total: 63000, status: 'Paid', createdAt: new Date(Date.now() - 50 * 24 * 60 * 60 * 1000) },
  ];

  for (const order of orderDefinitions) {
    await prisma.order.upsert({
      where: { id: order.id },
      update: { customerId: order.customerId, total: order.total, status: order.status, createdAt: order.createdAt },
      create: {
        id: order.id,
        customerId: order.customerId,
        total: order.total,
        status: order.status,
        createdAt: order.createdAt,
      },
    });
  }

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
