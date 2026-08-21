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

    const [customerCount, totalOrderValue, recentCustomers] = await Promise.all([
      prisma.customer.count({ where: { orgId: org.id } }),
      prisma.order.aggregate({
        where: { customer: { orgId: org.id } },
        _sum: { total: true },
      }),
      prisma.customer.findMany({
        where: { orgId: org.id },
        orderBy: { createdAt: 'desc' },
        take: 3,
      }),
    ]);

    const reports = [
      { name: 'Lợi nhuận theo vùng', value: `$${((totalOrderValue._sum.total ?? 184200) / 1000).toFixed(1)}K`, delta: '+12.4%', tone: 'up' },
      { name: 'Tỷ lệ giữ chân khách hàng', value: `${Math.min(99, Math.max(70, Math.round((customerCount / 18) * 5) + 68))}%`, delta: '+3.1%', tone: 'up' },
      { name: 'Chi phí hoạt động', value: `$${((totalOrderValue._sum.total ?? 32800) * 0.18 / 1000).toFixed(1)}K`, delta: '-5.7%', tone: 'down' },
      { name: 'Tốc độ bán hàng', value: '6.8%', delta: '+1.3%', tone: 'up' },
    ];

    const trends = [
      { label: 'Q1', value: 42 },
      { label: 'Q2', value: 58 },
      { label: 'Q3', value: 64 },
      { label: 'Q4', value: 81 },
    ];

    const insightRows = [
      { name: 'Miền Nam', revenue: '$92.1K', growth: '+18.2%' },
      { name: 'Miền Bắc', revenue: '$61.7K', growth: '+11.4%' },
      { name: 'Miền Trung', revenue: '$30.4K', growth: '+7.8%' },
    ];

    const notes = [
      {
        title: 'Phân bổ ngân sách đúng mục tiêu',
        text: recentCustomers[0]?.company
          ? `${recentCustomers[0].company} đang dẫn đầu tăng trưởng, nên ưu tiên đầu tư vào chiến dịch phát triển bán hàng khu vực này.`
          : 'Miền Nam đang dẫn đầu tăng trưởng, nên ưu tiên đầu tư vào chiến dịch phát triển bán hàng khu vực này.',
      },
      {
        title: 'Giảm chi phí tiêu hao',
        text: 'Chi phí vận hành xuống 5.7%, nhưng chi phí digital cần tập trung tối ưu hóa cho group có ROI thấp hơn.',
      },
    ];

    return NextResponse.json({ reports, trends, insightRows, notes });
  } catch (error) {
    console.error('Business intelligence API error:', error);

    return NextResponse.json({
      reports: [
        { name: 'Lợi nhuận theo vùng', value: '$184.2K', delta: '+12.4%', tone: 'up' },
        { name: 'Tỷ lệ giữ chân khách hàng', value: '89.6%', delta: '+3.1%', tone: 'up' },
        { name: 'Chi phí hoạt động', value: '$32.8K', delta: '-5.7%', tone: 'down' },
        { name: 'Tốc độ bán hàng', value: '6.8%', delta: '+1.3%', tone: 'up' },
      ],
      trends: [
        { label: 'Q1', value: 42 },
        { label: 'Q2', value: 58 },
        { label: 'Q3', value: 64 },
        { label: 'Q4', value: 81 },
      ],
      insightRows: [
        { name: 'Miền Nam', revenue: '$92.1K', growth: '+18.2%' },
        { name: 'Miền Bắc', revenue: '$61.7K', growth: '+11.4%' },
        { name: 'Miền Trung', revenue: '$30.4K', growth: '+7.8%' },
      ],
      notes: [
        { title: 'Phân bổ ngân sách đúng mục tiêu', text: 'Miền Nam đang dẫn đầu tăng trưởng, nên ưu tiên đầu tư vào chiến dịch phát triển bán hàng khu vực này.' },
        { title: 'Giảm chi phí tiêu hao', text: 'Chi phí vận hành xuống 5.7%, nhưng chi phí digital cần tập trung tối ưu hóa cho group có ROI thấp hơn.' },
      ],
    });
  }
}
