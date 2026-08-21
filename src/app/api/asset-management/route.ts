import { NextResponse } from 'next/server';

export async function GET() {
  const payload = {
    overview: [
      { label: 'Tài sản hoạt động', value: '1,284', tone: 'up' },
      { label: 'Công suất sử dụng', value: '86%', tone: 'up' },
      { label: 'Bảo dưỡng sắp tới', value: '32', tone: 'neutral' },
      { label: 'Rủi ro tài sản', value: '7', tone: 'down' },
    ],
    utilization: [
      { label: 'Máy móc sản xuất', value: 88 },
      { label: 'Thiết bị văn phòng', value: 76 },
      { label: 'Phương tiện vận hành', value: 82 },
      { label: 'Hệ thống mạng', value: 91 },
    ],
    maintenance: [
      { name: 'Mặt bằng kho A', due: '15/08', status: 'Đang lên lịch' },
      { name: 'Máy CNC-12', due: '17/08', status: 'Cần kiểm tra' },
      { name: 'Hệ thống UPS', due: '20/08', status: 'Đã xác nhận' },
      { name: 'Xe giao hàng 03', due: '22/08', status: 'Chờ vật tư' },
    ],
    risk: [
      { name: 'Kiểm tra an toàn', value: 68 },
      { name: 'Tuổi thọ thiết bị', value: 53 },
      { name: 'Dự phòng thay thế', value: 77 },
      { name: 'Tuân thủ quy định', value: 91 },
    ],
    priorities: [
      { title: 'Đẩy mạnh bảo dưỡng dự phòng', detail: 'Ưu tiên nhóm thiết bị có tỷ lệ hỏng tăng trong 30 ngày qua.' },
      { title: 'Kiểm tra tài sản vùng quan trọng', detail: 'Tập trung vào khu sản xuất và kho vận, nơi có tỷ lệ sử dụng cao nhất.' },
      { title: 'Tối ưu hóa vốn thay thế', detail: 'Lập kế hoạch mua sắm theo vòng đời để giảm rủi ro ngừng hoạt động.' },
    ],
  };

  return NextResponse.json(payload);
}
