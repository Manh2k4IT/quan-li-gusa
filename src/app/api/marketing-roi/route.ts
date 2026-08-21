import { NextResponse } from 'next/server';

export async function GET() {
  const payload = {
    overview: [
      { label: 'Tổng chi phí', value: '₫2.4 tỷ', tone: 'neutral' },
      { label: 'Doanh thu sinh ra', value: '₫7.1 tỷ', tone: 'up' },
      { label: 'ROI trung bình', value: '196%', tone: 'up' },
      { label: 'CAC', value: '₫34k', tone: 'up' },
    ],
    funnel: [
      { label: 'Hiển thị', value: 94 },
      { label: 'Click', value: 78 },
      { label: 'Lead', value: 66 },
      { label: 'Sales', value: 52 },
    ],
    campaignPerformance: [
      { name: 'Meta Ads - Q3', spend: '₫680M', revenue: '₫2.1 tỷ', roi: '208%', channel: 'Social' },
      { name: 'Google Search', spend: '₫540M', revenue: '₫1.7 tỷ', roi: '184%', channel: 'Search' },
      { name: 'TikTok Shop', spend: '₫420M', revenue: '₫1.5 tỷ', roi: '221%', channel: 'Commerce' },
      { name: 'Email Retarget', spend: '₫180M', revenue: '₫620M', roi: '244%', channel: 'Lifecycle' },
    ],
    channelMix: [
      { name: 'Meta', value: 35 },
      { name: 'Google', value: 27 },
      { name: 'TikTok', value: 22 },
      { name: 'Email', value: 16 },
    ],
    recommendations: [
      { title: 'Tăng ngân sách cho TikTok Shop', detail: 'Kênh này đang đạt hiệu suất vượt trội về ROI và tỷ lệ chuyển đổi tốt hơn mức mục tiêu.' },
      { title: 'Tối ưu landing page cho search', detail: 'Sửa lại wording, CTA và mobile experience để nâng tỷ lệ lead từ kênh tìm kiếm.' },
      { title: 'Tái kích hoạt người đã xem', detail: 'Tập trung vào audience sơ cấp và hai lần chạm để giảm chi phí mua khách mới.' },
    ],
  };

  return NextResponse.json(payload);
}
