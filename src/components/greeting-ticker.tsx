'use client';

import { useEffect, useState } from 'react';

const TIME_ZONE = 'Asia/Ho_Chi_Minh';

// One wish per day, rotating by day of year.
const DAILY_WISHES = [
  'Chúc {name} một ngày làm việc tràn đầy năng lượng và thật nhiều đơn hàng!',
  'Mỗi con số hôm nay là một bước tiến — chúc {name} bứt phá doanh thu!',
  'Chúc {name} hôm nay quyết định sáng suốt, đội ngũ đồng lòng!',
  'Thành công là tổng của những nỗ lực nhỏ mỗi ngày. Cố lên {name}!',
  'Chúc {name} một ngày suôn sẻ, khách hàng hài lòng, kho hàng thông suốt!',
  'Hôm nay là cơ hội mới — chúc {name} chinh phục mọi mục tiêu!',
  'Chúc {name} luôn giữ nụ cười và tinh thần thép trên mọi chặng đường!',
  'Một khởi đầu tốt là một nửa thành công. Chúc {name} khởi đầu thật hứng khởi!',
  'Chúc {name} và cả team GUSA một ngày bùng nổ doanh số!',
  'Kiên trì hôm nay, thành quả ngày mai. Chúc {name} vững bước!',
  'Chúc {name} gặp toàn tin vui và những thương vụ thuận lợi!',
  'Dữ liệu rõ ràng, quyết định chính xác — chúc {name} một ngày hiệu quả!',
  'Chúc {name} sức khỏe dồi dào để cùng GUSA tiến xa hơn nữa!',
  'Mỗi khách hàng hài lòng là một chiến thắng. Chúc {name} thắng lớn hôm nay!',
  'Chúc {name} một ngày làm việc nhẹ nhàng mà hiệu quả bất ngờ!',
  'Đội ngũ mạnh làm nên thương hiệu mạnh. Chúc {name} dẫn dắt thật tuyệt vời!',
  'Chúc {name} hôm nay vượt kế hoạch và có thêm nhiều ý tưởng hay!',
  'Không có gì là không thể với tinh thần quyết tâm. Chúc {name} thành công!',
  'Chúc {name} một ngày ngập tràn cảm hứng và năng lượng tích cực!',
  'Tập trung vào điều quan trọng nhất — chúc {name} hoàn thành xuất sắc!',
  'Chúc {name} đơn về đều tay, hàng ra đúng hẹn, khách quay lại thật nhiều!',
  'Mỗi ngày tốt hơn hôm qua một chút. Chúc {name} tiến bộ không ngừng!',
  'Chúc {name} một ngày bình an, công việc hanh thông!',
  'Thành công đến từ sự chuẩn bị. Chúc {name} luôn sẵn sàng đón cơ hội!',
  'Chúc {name} giữ vững phong độ và cùng team về đích sớm!',
  'Một ngày mới, một trang mới — chúc {name} viết nên kết quả rực rỡ!',
  'Chúc {name} nhiều niềm vui trong công việc và hạnh phúc bên gia đình!',
  'Tăng trưởng bền vững bắt đầu từ hôm nay. Chúc {name} thật bản lĩnh!',
  'Chúc {name} một ngày mọi kế hoạch đều đi đúng hướng!',
  'Cảm ơn {name} đã đồng hành cùng GUSA — chúc một ngày thật rực rỡ!',
  'Chúc {name} luôn nhiệt huyết, sáng tạo và gặt hái thành công!',
];

function partsInVietnam(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: TIME_ZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(now);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get('year'), month: get('month'), day: get('day'), hour: get('hour') };
}

function buildMessage(name: string, now: Date) {
  const { year, month, day, hour } = partsInVietnam(now);
  const dateLabel = new Intl.DateTimeFormat('vi-VN', {
    timeZone: TIME_ZONE,
    weekday: 'long',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  }).format(now);
  const timeLabel = new Intl.DateTimeFormat('vi-VN', { timeZone: TIME_ZONE, hour: '2-digit', minute: '2-digit' }).format(now);
  const session = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const dayOfYear = Math.floor((Date.UTC(year, month - 1, day) - Date.UTC(year, 0, 0)) / 86_400_000);
  const wish = DAILY_WISHES[(dayOfYear + year) % DAILY_WISHES.length].replaceAll('{name}', name);

  return `${dateLabel.charAt(0).toUpperCase()}${dateLabel.slice(1)} · ${timeLabel}  —  ${session}, ${name}! ${wish}`;
}

export default function GreetingTicker({ name }: { name: string }) {
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    const update = () => setMessage(buildMessage(name, new Date()));
    update();
    const timer = window.setInterval(update, 30_000);
    return () => window.clearInterval(timer);
  }, [name]);

  return (
    <div className="greeting-ticker" aria-live="polite">
      <span className="greeting-ticker-dot" aria-hidden="true" />
      <div className="greeting-ticker-viewport">
        {message ? (
          <div className="greeting-ticker-track">
            <span>{message}</span>
            <span aria-hidden="true">{message}</span>
          </div>
        ) : null}
      </div>
    </div>
  );
}
