'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';

type PlanCategory = 'fashion-q4' | 'fabric-q4' | 'fabric-ben-thanh';

type PlanRow = {
  sale: string;
  date: string;
  status: string;
  note: string;
  attachment: string;
};

const planData: Record<PlanCategory, PlanRow[]> = {
  'fashion-q4': [
    { sale: 'Nguyễn Văn Sale 1', date: '20/08/2026', status: 'Đang thực hiện', note: 'Mở đợt bán mới cho khu vực Q4.', attachment: 'plan-fashion-q4.pdf' },
    { sale: 'Trần Thị Sale 2', date: '21/08/2026', status: 'Chờ xác nhận', note: 'Tăng doanh số theo nhóm sản phẩm mới.', attachment: 'marketing-q4.pdf' },
    { sale: 'Lê Văn Sale 3', date: '22/08/2026', status: 'Đang thực hiện', note: 'Theo dõi khách hàng lớn tại Q4.', attachment: 'target-q4.xlsx' },
  ],
  'fabric-q4': [
    { sale: 'Võ Anh Sale 1', date: '19/08/2026', status: 'Đang thực hiện', note: 'Cập nhật số lượng nguyên liệu theo đơn.', attachment: 'fabric-q4-1.pdf' },
    { sale: 'Phạm Nam Sale 2', date: '20/08/2026', status: 'Chờ xác nhận', note: 'Theo dõi tiến độ nhập kho vải Q4.', attachment: 'fabric-q4-2.pdf' },
    { sale: 'Dương Minh Sale 3', date: '23/08/2026', status: 'Đang thực hiện', note: 'Phối hợp kiểm kê hàng tồn kho', attachment: 'inventory-q4.xlsx' },
  ],
  'fabric-ben-thanh': [
    { sale: 'Hồ Thị Sale 1', date: '18/08/2026', status: 'Đang thực hiện', note: 'Kiểm tra đơn hàng từ Bến Thành.', attachment: 'ben-thanh-plan.pdf' },
    { sale: 'Nguyễn Hoàng Sale 2', date: '20/08/2026', status: 'Chờ xác nhận', note: 'Báo cáo tiến độ về phân phối vải.', attachment: 'ben-thanh-report.pdf' },
    { sale: 'Trương Văn Sale 3', date: '24/08/2026', status: 'Đang thực hiện', note: 'Theo dõi hàng tồn và cần bổ sung.', attachment: 'ben-thanh-stock.xlsx' },
  ],
};

const categoryMeta: Record<PlanCategory, { label: string; tone: string; accent: string }> = {
  'fashion-q4': { label: 'Báo cáo kế hoạch thời trang Quận 4', tone: 'rgba(95, 229, 196, 0.12)', accent: '#90f4dc' },
  'fabric-q4': { label: 'Báo cáo kế hoạch kho vải Quận 4', tone: 'rgba(80, 153, 255, 0.12)', accent: '#9bc5ff' },
  'fabric-ben-thanh': { label: 'Báo cáo kế hoạch kho vải Bến Thành', tone: 'rgba(245, 181, 66, 0.12)', accent: '#f4d28e' },
};

const categoryRoutes: Record<PlanCategory, string> = {
  'fashion-q4': '/plan/fashion-q4',
  'fabric-q4': '/plan/fabric-q4',
  'fabric-ben-thanh': '/plan/fabric-ben-thanh',
};

export default function PlanAssignmentSection() {
  const router = useRouter();
  const [selectedCategory, setSelectedCategory] = useState<PlanCategory | null>(null);

  const activeRows = useMemo(() => (selectedCategory ? planData[selectedCategory] : []), [selectedCategory]);

  return (
    <section id="plan-assignment" style={{ marginTop: '20px', width: '100%', background: 'rgba(11, 26, 38, 0.88)', border: '1px solid rgba(115, 133, 163, 0.28)', borderRadius: '18px', padding: '18px 20px', boxShadow: '0 16px 30px rgba(0,0,0,0.08)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8db7da', fontWeight: 700, marginBottom: '8px' }}>PLAN ASSIGNMENT</div>
          <h3 style={{ margin: 0, color: '#edf5ff', fontSize: '1.8rem', letterSpacing: '-0.04em' }}>Bảng giao kế hoạch</h3>
        </div>
      </div>

      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '12px', marginBottom: selectedCategory ? '18px' : '0' }}>
        {(Object.keys(categoryMeta) as PlanCategory[]).map((key) => (
          <button
            key={key}
            id={key}
            type="button"
            onClick={() => {
              router.push(categoryRoutes[key]);
            }}
            style={{
              border: selectedCategory === key ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(158, 176, 211, 0.25)',
              background: selectedCategory === key ? categoryMeta[key].tone : 'rgba(17, 31, 44, 0.8)',
              color: selectedCategory === key ? categoryMeta[key].accent : '#dfeaf7',
              padding: '10px 18px',
              borderRadius: '10px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.96rem',
            }}
          >
            {categoryMeta[key].label}
          </button>
        ))}
      </div>

      {selectedCategory && (
        <>
          <div style={{ background: 'rgba(17, 31, 44, 0.78)', border: '1px solid rgba(158, 176, 211, 0.22)', borderRadius: '14px', overflow: 'hidden' }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 2fr 1.2fr', gap: '12px', padding: '14px 16px', color: '#edf5ff', fontWeight: 700, fontSize: '0.8rem', borderBottom: '1px solid rgba(158,176,211,0.18)' }}>
              <div>Sale</div>
              <div>Ngày</div>
              <div>Trạng thái</div>
              <div>Ghi chú</div>
              <div>File</div>
            </div>

            {activeRows.map((row) => (
              <div key={`${selectedCategory}-${row.sale}`} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 2fr 1.2fr', gap: '12px', padding: '14px 16px', borderBottom: '1px solid rgba(158,176,211,0.12)', alignItems: 'center' }}>
                <div style={{ color: '#edf5ff', fontWeight: 700 }}>{row.sale}</div>
                <div style={{ color: '#edf5ff' }}>{row.date}</div>
                <div>
                  <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '98px', padding: '7px 10px', borderRadius: '999px', background: row.status === 'Đang thực hiện' ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)', color: row.status === 'Đang thực hiện' ? '#67b8ff' : '#ffcb6b', fontWeight: 700, fontSize: '11px' }}>{row.status}</span>
                </div>
                <div style={{ color: '#dfeaf7', lineHeight: 1.6 }}>{row.note}</div>
                <div style={{ color: '#9ad7ff', fontWeight: 600 }}>{row.attachment}</div>
              </div>
            ))}
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}>
            <button type="button" style={{ background: 'linear-gradient(135deg, #5fe5c4, #4fd0c5)', border: 'none', color: '#061d2b', borderRadius: '12px', padding: '10px 18px', fontWeight: 800, cursor: 'pointer' }}>Gửi kế hoạch</button>
          </div>
        </>
      )}
    </section>
  );
}
