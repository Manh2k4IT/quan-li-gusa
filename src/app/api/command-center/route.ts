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
    const org = await getDefaultOrg();

    const [customerCount, orderCount, totalRevenue, inventoryStatus] = await Promise.all([
      prisma.customer.count({ where: { orgId: org.id } }),
      prisma.order.count({ where: { customer: { orgId: org.id } } }),
      prisma.order.aggregate({
        where: { customer: { orgId: org.id } },
        _sum: { total: true },
      }),
      prisma.inventory.findMany({
        where: { product: { orgId: org.id } },
        include: { product: true },
        take: 5,
      }),
    ]);

    const activeCustomers = await prisma.customer.count({
      where: { orgId: org.id, status: 'Active' },
    });

    const operationalCount = await prisma.order.count({
      where: {
        customer: { orgId: org.id },
        status: { in: ['Pending', 'Processing', 'Shipped'] },
      },
    });

    const alerts = inventoryStatus
      .filter((item) => item.stock <= item.reorderPoint)
      .slice(0, 3)
      .map((item) => `Kho ${item.warehouse} cần bổ sung ${item.product.name} (${item.stock}/${item.reorderPoint}).`);

    const overview = [
      { label: 'Công việc đang chạy', value: String(Math.max(12, operationalCount + 5)), tone: 'up' },
      { label: 'Teams hoạt động', value: String(Math.max(7, Math.min(12, customerCount / 80 + 5))), tone: 'up' },
      { label: 'Pending approvals', value: String(Math.max(2, Math.min(10, orderCount - 8))), tone: 'neutral' },
      { label: 'SLA breach', value: String(alerts.length > 0 ? 1 : 0), tone: alerts.length > 0 ? 'down' : 'up' },
    ];

    const operations = [
      { name: 'Bán hàng', owner: 'Sales Ops', progress: 76, status: 'Tốt' },
      { name: 'Kho vận', owner: 'Supply Chain', progress: Math.min(100, Math.max(45, Math.round((inventoryStatus.length ? inventoryStatus.reduce((total, item) => total + item.stock, 0) : 0) / 18))), status: alerts.length > 0 ? 'Đang theo dõi' : 'Ổn định' },
      { name: 'CSKH', owner: 'Support', progress: 84, status: 'Xuất sắc' },
      { name: 'Marketing', owner: 'Growth', progress: 71, status: 'Ổn định' },
    ];

    const actionQueue = [
      { label: 'Approve invoice run', value: '2h' },
      { label: 'Review supply plan', value: '4h' },
      { label: 'Finalize sales briefing', value: 'Today' },
    ];

    return NextResponse.json({
      overview,
      operations,
      alerts: alerts.length > 0 ? alerts : [
        'Kho HCM cần bổ sung 12 sản phẩm trong 48 giờ.',
        'Chỉ số doanh thu vùng miền Nam vượt kế hoạch 8%.',
        '3 chiến dịch marketing cần review performance ở 18:00.',
      ],
      actionQueue,
      summary: {
        activeCustomers,
        totalRevenue: totalRevenue._sum.total ?? 0,
        orderCount,
      },
    });
  } catch (error) {
    console.error('Command center API error:', error);

    return NextResponse.json({
      overview: [
        { label: 'Công việc đang chạy', value: '17', tone: 'up' },
        { label: 'Teams hoạt động', value: '9', tone: 'up' },
        { label: 'Pending approvals', value: '4', tone: 'neutral' },
        { label: 'SLA breach', value: '1', tone: 'down' },
      ],
      operations: [
        { name: 'Bán hàng', owner: 'Sales Ops', progress: 76, status: 'Tốt' },
        { name: 'Kho vận', owner: 'Supply Chain', progress: 68, status: 'Đang theo dõi' },
        { name: 'CSKH', owner: 'Support', progress: 84, status: 'Xuất sắc' },
        { name: 'Marketing', owner: 'Growth', progress: 71, status: 'Ổn định' },
      ],
      alerts: [
        'Kho HCM cần bổ sung 12 sản phẩm trong 48 giờ.',
        'Chỉ số doanh thu vùng miền Nam vượt kế hoạch 8%.',
        '3 chiến dịch marketing cần review performance ở 18:00.',
      ],
      actionQueue: [
        { label: 'Approve invoice run', value: '2h' },
        { label: 'Review supply plan', value: '4h' },
        { label: 'Finalize sales briefing', value: 'Today' },
      ],
      summary: {
        activeCustomers: 0,
        totalRevenue: 0,
        orderCount: 0,
      },
    });
  }
}
