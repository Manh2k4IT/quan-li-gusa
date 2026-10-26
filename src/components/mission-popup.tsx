'use client';

import { useEffect, useState, useSyncExternalStore } from 'react';
import { Icon, type IconName } from '@/components/icons';

// Shown once per browser session (i.e. each time the app is opened or after logging in).
const SESSION_KEY = 'gusa_mission_seen';

const CORE_VALUES: { title: string; description: string; icon: IconName }[] = [
  { title: 'Dụng tâm', description: 'Tận tâm trong từng sản phẩm và từng khách hàng.', icon: 'heart' },
  { title: 'Cộng sinh', description: 'Cùng phát triển với đối tác và cộng đồng.', icon: 'users' },
  { title: 'Học hỏi phát triển', description: 'Không ngừng học hỏi để tiến xa hơn mỗi ngày.', icon: 'bookUp' },
];

const subscribe = () => () => {};

function hasSeenThisSession() {
  try {
    return window.sessionStorage.getItem(SESSION_KEY) === '1';
  } catch {
    return true;
  }
}

function rememberSeen() {
  try {
    window.sessionStorage.setItem(SESSION_KEY, '1');
  } catch {
    // Storage blocked: the popup simply closes for this page view.
  }
}

function Leaf({ flip = false }: { flip?: boolean }) {
  return (
    <svg className="mission-leaf" width="54" height="24" viewBox="0 0 54 24" fill="none" aria-hidden="true" style={flip ? { transform: 'scaleX(-1)' } : undefined}>
      <path d="M2 12h50" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
      <path d="M14 12c2-6 8-8 12-7-2 5-7 8-12 7z" fill="currentColor" opacity="0.85" />
      <path d="M26 12c2 6 8 8 12 7-2-5-7-8-12-7z" fill="currentColor" opacity="0.6" />
      <path d="M38 12c2-5 7-7 10-6-2 4-6 7-10 6z" fill="currentColor" opacity="0.45" />
    </svg>
  );
}

export default function MissionPopup() {
  const seen = useSyncExternalStore(subscribe, hasSeenThisSession, () => true);
  const [dismissed, setDismissed] = useState(false);
  const open = !seen && !dismissed;

  const close = () => {
    rememberSeen();
    setDismissed(true);
  };

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      rememberSeen();
      setDismissed(true);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  if (!open) return null;

  return (
    <div className="mission-overlay" onClick={close}>
      <div className="mission-modal" role="dialog" aria-modal="true" aria-labelledby="mission-title" onClick={(event) => event.stopPropagation()}>
        <button type="button" className="mission-close" onClick={close} aria-label="Đóng">×</button>

        <header className="mission-brand">
          <Leaf />
          <h2 id="mission-title">GUSA</h2>
          <Leaf flip />
        </header>
        <p className="mission-tagline">Thời trang linen bền vững</p>

        <div className="mission-grid">
          <section className="mission-card">
            <span className="mission-card-icon"><Icon name="target" size={20} /></span>
            <h3>Sứ mệnh</h3>
            <p>Đồng hành cùng cộng đồng thời trang bền vững, mang đến sản phẩm linen chất lượng và kiến tạo cơ hội kinh doanh đáng tự hào.</p>
          </section>
          <section className="mission-card">
            <span className="mission-card-icon"><Icon name="sparkles" size={20} /></span>
            <h3>Tầm nhìn</h3>
            <p>Đến năm 2035, trở thành nền tảng kết nối và phát triển hệ sinh thái thời trang bền vững hàng đầu Việt Nam.</p>
          </section>
        </div>

        <section className="mission-values">
          <h3>Giá trị cốt lõi</h3>
          <div className="mission-values-grid">
            {CORE_VALUES.map((value) => (
              <div key={value.title} className="mission-value">
                <span className="mission-value-icon"><Icon name={value.icon} size={26} /></span>
                <strong>{value.title}</strong>
                <small>{value.description}</small>
              </div>
            ))}
          </div>
        </section>

        <button type="button" className="primary-btn mission-start" onClick={close}>Bắt đầu làm việc</button>
      </div>
    </div>
  );
}
