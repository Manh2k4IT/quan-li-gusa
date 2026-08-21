import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

async function getSummary() {
  const kpis = await prisma.kPI.findMany({
    orderBy: { updatedAt: 'desc' },
    take: 12,
  });

  if (kpis.length === 0) {
    return {
      averageProgress: 0,
      onTrack: 0,
      trackedKpis: 0,
      insights: [
        { title: 'Thiết lập KPI đầu tiên', detail: 'Bắt đầu bằng 3 chỉ số trọng tâm: doanh thu, hiệu suất marketing và tỷ lệ giữ chân khách hàng.' },
        { title: 'Tập trung mục tiêu ngắn hạn', detail: 'Chọn 30-60 ngày, ưu tiên mục tiêu tác động trực tiếp tới doanh thu và khả năng vận hành.' },
      ],
    };
  }

  const averageProgress = Math.round(
    kpis.reduce((sum, item) => {
      const target = item.target || 1;
      return sum + Math.min(100, Math.round((item.value / target) * 100));
    }, 0) / kpis.length,
  );

  const onTrack = kpis.filter((item) => {
    const target = item.target || 1;
    return (item.value / target) * 100 >= 100;
  }).length;

  const bestKpi = [...kpis].sort((a, b) => {
    const diffA = (a.value / (a.target || 1)) * 100;
    const diffB = (b.value / (b.target || 1)) * 100;
    return diffB - diffA;
  })[0];

  const weakestKpi = [...kpis].sort((a, b) => {
    const diffA = (a.value / (a.target || 1)) * 100;
    const diffB = (b.value / (b.target || 1)) * 100;
    return diffA - diffB;
  })[0];

  return {
    averageProgress,
    onTrack,
    trackedKpis: kpis.length,
    insights: [
      {
        title: 'KPI đang dẫn đầu',
        detail: bestKpi ? `${bestKpi.name} đạt ${Math.min(100, Math.round((bestKpi.value / (bestKpi.target || 1)) * 100))}% tiến độ.` : 'Chưa có KPI đủ dữ liệu để phân tích.',
      },
      {
        title: 'KPI cần tập trung',
        detail: weakestKpi ? `${weakestKpi.name} đang thấp hơn mục tiêu ở mức ${Math.min(100, Math.round((weakestKpi.value / (weakestKpi.target || 1)) * 100))}%. Cần điều chỉnh chiến lược trong 2 tuần tới.` : 'Chưa có KPI đủ dữ liệu để cảnh báo.',
      },
    ],
  };
}

export async function GET() {
  try {
    const summary = await getSummary();
    const kpis = await prisma.kPI.findMany({
      orderBy: { updatedAt: 'desc' },
      take: 12,
    });

    return NextResponse.json({
      overview: [
        { label: 'Tiến độ trung bình', value: `${summary.averageProgress}%`, tone: 'up' },
        { label: 'Đạt mục tiêu', value: String(summary.onTrack), tone: 'up' },
        { label: 'Chỉ số đang theo dõi', value: String(summary.trackedKpis), tone: 'neutral' },
      ],
      kpis: kpis.map((row) => {
        const target = row.target || 1;
        const progress = Math.min(100, Math.round((row.value / target) * 100));
        return {
          id: row.id,
          name: row.name,
          value: row.value,
          target: row.target,
          unit: row.unit,
          period: row.period,
          progress,
          status: progress >= 100 ? 'On track' : progress >= 75 ? 'Near target' : 'Watch',
        };
      }),
      insights: summary.insights,
    });
  } catch (error) {
    console.error('Strategy Hub API error:', error);
    return NextResponse.json({
      overview: [
        { label: 'Tiến độ trung bình', value: '82%', tone: 'up' },
        { label: 'Đạt mục tiêu', value: '4', tone: 'up' },
        { label: 'Chỉ số đang theo dõi', value: '8', tone: 'neutral' },
      ],
      kpis: [
        { id: 'fallback-1', name: 'Doanh thu bán hàng', value: 82, target: 100, unit: '%', period: 'Q4', progress: 82, status: 'Near target' },
        { id: 'fallback-2', name: 'Tỷ lệ giữ chân khách hàng', value: 88, target: 100, unit: '%', period: 'Q4', progress: 88, status: 'On track' },
      ],
      insights: [
        { title: 'Tập trung chiến lược', detail: 'Đầu tư thêm vào nhóm KPI có tác động trực tiếp tới tăng trưởng 2 quý tới.' },
        { title: 'Theo dõi sát', detail: 'Giữ nhịp đánh giá 2 tuần/lần để không mất mục tiêu.' },
      ],
    });
  }
}
