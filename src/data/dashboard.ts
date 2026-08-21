export const modules = [
  { name: 'AI Brain', status: 'Live', icon: '🧠', color: 'purple' },
  { name: 'Command Center', status: 'Realtime', icon: '📊', color: 'blue' },
  { name: 'Business Intelligence', status: '12 reports', icon: '📈', color: 'green' },
  { name: 'Customer Hub', status: '1,248 contacts', icon: '👥', color: 'amber' },
  { name: 'Supply Chain', status: '96% ready', icon: '📦', color: 'orange' },
  { name: 'Growth Hub', status: '8 campaigns', icon: '📣', color: 'pink' },
  { name: 'Knowledge Hub', status: '324 docs', icon: '📚', color: 'teal' },
  { name: 'Strategy Hub', status: '17 OKRs', icon: '🚀', color: 'red' },
];

export const metrics = [
  { label: 'Doanh thu', value: '₫482.400.000', change: '+18.2%', tone: 'up' },
  { label: 'Lợi nhuận', value: '₫136.700.000', change: '+9.4%', tone: 'up' },
  { label: 'Tỷ lệ chuyển đổi', value: '6.8%', change: '+1.3%', tone: 'up' },
  { label: 'Tồn kho an toàn', value: '93%', change: '-1.1%', tone: 'down' },
];

export const revenueBars = [42, 58, 36, 72, 64, 88, 82, 94];

export const aiMessages = [
  'Khuyến nghị tăng quảng cáo cho nhóm khách hàng B2B 2.3x so với Q2.',
  'Tồn kho sản phẩm A đang giảm nhanh; nên đặt lại 38% trong 7 ngày tới.',
  'Doanh thu khu vực miền Nam đang vượt kế hoạch 12%.',
];

export const pipeline = [
  { name: 'Mới', value: 38 },
  { name: 'Tiềm năng', value: 52 },
  { name: 'Đang xử lý', value: 64 },
  { name: 'Chốt sale', value: 79 },
  { name: 'Thành công', value: 91 },
];

export const dashboardData = {
  modules,
  metrics,
  revenueBars,
  aiMessages,
  pipeline,
};
