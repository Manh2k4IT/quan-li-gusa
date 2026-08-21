import { NextResponse } from 'next/server';

export async function GET() {
  const payload = {
    overview: [
      { label: 'Tổng reach', value: '1.86M', tone: 'up' },
      { label: 'CTR trung bình', value: '4.8%', tone: 'up' },
      { label: 'Conversion', value: '6.2%', tone: 'neutral' },
      { label: 'ROAS', value: '3.7x', tone: 'up' },
    ],
    channels: [
      {
        name: 'Facebook',
        type: 'Paid Social',
        metrics: [
          { label: 'Reach', value: '620K' },
          { label: 'CTR', value: '3.7%' },
          { label: 'CPA', value: '₫92k' },
          { label: 'Conversion', value: '5.2%' },
        ],
        plan: 'Tăng ngân sách 15% cho audience lookalike đang có ROAS tốt hơn mục tiêu.',
      },
      {
        name: 'Website',
        type: 'Organic + Landing',
        metrics: [
          { label: 'Traffic', value: '310K' },
          { label: 'CVR', value: '7.3%' },
          { label: 'Avg order', value: '₫760k' },
          { label: 'Bounce', value: '28%' },
        ],
        plan: 'Cải tiến CTA, giảm thời gian tải, tăng upsell trên landing page để tăng chuyển đổi.',
      },
      {
        name: 'TikTok',
        type: 'Short video',
        metrics: [
          { label: 'Views', value: '740K' },
          { label: 'Watch rate', value: '38%' },
          { label: 'CPV', value: '₫1.4k' },
          { label: 'Sales', value: '₫1.45 tỷ' },
        ],
        plan: 'Tiếp tục mở 3 video dạng sản phẩm + 2 video review, ưu tiên creator affiliate.',
      },
      {
        name: 'Shopee',
        type: 'Marketplace',
        metrics: [
          { label: 'GMV', value: '₫2.1 tỷ' },
          { label: 'Fee', value: '₫310M' },
          { label: 'Net', value: '₫1.79 tỷ' },
          { label: 'ROI', value: '168%' },
        ],
        plan: 'Giữ mức giảm giá 8–10%, tối ưu tiêu đề sản phẩm và voucher combo để tăng tỷ lệ lưu kho.',
      },
    ],
    plans: [
      { title: 'Tuần 1–2', detail: 'Tăng 2 nhóm quảng cáo retarget FB, dồn thêm 20% budget cho TikTok video bán hàng.' },
      { title: 'Tuần 3–4', detail: 'Cập nhật lại landing page và kho ảnh cho website, tối ưu CTA trên từng collection.' },
      { title: 'Tháng tới', detail: 'Tập trung vào creator affiliate + combo voucher Shopee/TikTok để nâng tỷ lệ chuyển đổi.' },
    ],
    marketplaceSummary: {
      platforms: [
        { name: 'Shopee', revenue: '₫1.79 tỷ', fee: '₫310M', net: '₫1.48 tỷ', roi: '168%' },
        { name: 'TikTok', revenue: '₫1.45 tỷ', fee: '₫240M', net: '₫1.21 tỷ', roi: '189%' },
      ],
      combined: {
        totalRevenue: '₫3.24 tỷ',
        totalFee: '₫550M',
        totalNet: '₫2.69 tỷ',
        combinedRoi: '178%',
      },
    },
  };

  return NextResponse.json(payload);
}
