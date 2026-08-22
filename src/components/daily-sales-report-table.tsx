'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Category = 'Thời trang Quận 4' | 'Vải Quận 4' | 'Vải Bến Thành';

type SalesItem = { id?: string; productCode: string; productName: string; quantity: number; unitPrice: number; revenue: number };
type SalesReport = { id: string; date: string; orderCode: string; category: Category; salesperson: string; paymentMethod: string; orderStatus: string; note: string; items: SalesItem[]; revenue: number };

const categoryLabels: Record<Category, string> = {
  'Thời trang Quận 4': 'Báo cáo ngày thời trang Quận 4',
  'Vải Quận 4': 'Báo cáo ngày kho Quận 4',
  'Vải Bến Thành': 'Báo cáo ngày kho Bến Thành',
};

const normalizeReport = (item: Partial<SalesReport>): SalesReport => {
  const items = Array.isArray(item.items) ? item.items.map((entry) => ({
    id: entry.id,
    productCode: String(entry.productCode ?? 'Chưa nhập'),
    productName: String(entry.productName ?? 'Chưa nhập tên sản phẩm'),
    quantity: Number(entry.quantity ?? 0),
    unitPrice: Number(entry.unitPrice ?? 0),
    revenue: Number(entry.revenue ?? 0),
  })) : [];
  return {
    id: String(item.id ?? crypto.randomUUID()),
    date: String(item.date ?? ''),
    orderCode: String(item.orderCode ?? 'Chưa có mã đơn'),
    category: (item.category as Category) ?? 'Thời trang Quận 4',
    salesperson: String(item.salesperson ?? 'Chưa ghi tên'),
    paymentMethod: String(item.paymentMethod ?? 'Chưa có'),
    orderStatus: String(item.orderStatus ?? 'Chưa có'),
    note: String(item.note ?? ''),
    items,
    revenue: Number(item.revenue ?? items.reduce((sum, entry) => sum + entry.revenue, 0)),
  };
};

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

export default function DailySalesReportTable({ category }: { category: Category }) {
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [fromDate, setFromDate] = useState('');
  const [toDate, setToDate] = useState('');
  const [saleFilter, setSaleFilter] = useState('');
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [targetCategory, setTargetCategory] = useState<Category>(category);
  const [targetAmount, setTargetAmount] = useState('');
  const [savedTarget, setSavedTarget] = useState(false);

  useEffect(() => {
    const loadTarget = async () => {
      try {
        const response = await fetch('/api/sales-targets');
        const payload = response.ok ? await response.json() : { targets: [] };
        const target = (payload.targets ?? []).find((item: { category: string }) => item.category === category);
        setTargetAmount(target ? String(target.amount) : '');
        setSavedTarget(false);
      } catch {
        setTargetAmount('');
        setSavedTarget(false);
      }
    };

    queueMicrotask(() => {
      void loadTarget();
    });
  }, [category]);

  const loadReports = async () => {
    try {
      const response = await fetch('/api/sales-reports', { cache: 'no-store' });
      if (response.ok) {
        const payload = await response.json();
        setReports(Array.isArray(payload.reports) ? payload.reports.map(normalizeReport) : []);
        return;
      }
    } catch {
      // Fall back to the legacy browser cache while the API is unavailable.
    }

    try {
      const stored = window.localStorage.getItem('gusa-sales-reports');
      const parsed = stored ? JSON.parse(stored) : [];
      setReports(Array.isArray(parsed) ? parsed.map(normalizeReport) : []);
    } catch {
      setReports([]);
    }
  };

  useEffect(() => {
    const sync = () => {
      void loadReports();
    };

    queueMicrotask(sync);
    const timer = window.setInterval(sync, 2000);
    window.addEventListener('storage', sync);
    window.addEventListener('focus', sync);
    return () => {
      window.removeEventListener('storage', sync);
      window.removeEventListener('focus', sync);
      window.clearInterval(timer);
    };
  }, []);

  const visibleReports = useMemo(() => reports.filter((report) => (
    report.category === category
    && (!fromDate || report.date >= fromDate)
    && (!toDate || report.date <= toDate)
    && (!saleFilter || report.salesperson.toLowerCase().includes(saleFilter.toLowerCase()))
  )), [category, fromDate, reports, saleFilter, toDate]);
  const totalRevenue = visibleReports.reduce((sum, report) => sum + report.revenue, 0);
  const leaderboard = useMemo(() => {
    const totals = new Map<string, { name: string; revenue: number; orders: number; quantity: number }>();
    visibleReports.forEach((report) => {
      const current = totals.get(report.salesperson) ?? { name: report.salesperson, revenue: 0, orders: 0, quantity: 0 };
      current.revenue += report.revenue;
      current.orders += 1;
      current.quantity += report.items.reduce((sum, item) => sum + item.quantity, 0);
      totals.set(report.salesperson, current);
    });
    return [...totals.values()].sort((left, right) => right.revenue - left.revenue);
  }, [visibleReports]);

  const analyzeVisibleReports = async () => {
    if (isAnalyzing || !visibleReports.length) return;
    setIsAnalyzing(true);
    setAiAnalysis('Đang phân tích dữ liệu...');
    const reportData = visibleReports.map((report) => ({
      date: report.date,
      salesperson: report.salesperson,
      orderCode: report.orderCode,
      category: report.category,
      paymentMethod: report.paymentMethod,
      orderStatus: report.orderStatus,
      revenue: report.revenue,
      note: report.note || 'Không có ghi chú',
      items: report.items.map((item) => ({
        productCode: item.productCode,
        productName: item.productName,
        quantity: item.quantity,
        unitPrice: item.unitPrice,
        revenue: item.revenue,
      })),
    }));
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: `Phân tích các báo cáo Sale nhập của ${category}. Hãy tổng hợp doanh thu, sản lượng, hiệu suất từng Sale, điểm bất thường và đưa ra phương án hành động cụ thể. Chỉ sử dụng dữ liệu báo cáo được gửi kèm, không sử dụng dữ liệu CRM, dữ liệu mẫu hoặc số liệu ngoài danh sách.`,
          reportData,
        }),
      });
      const payload = await response.json();
      setAiAnalysis(response.ok ? payload.reply : (payload.message ?? 'Không thể phân tích.'));
    } catch { setAiAnalysis('Không thể kết nối AI.'); }
    finally { setIsAnalyzing(false); }
  };

  const saveTarget = () => {
    fetch('/api/sales-targets', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ category: targetCategory, amount: Number(targetAmount) || 0 }) })
      .then((response) => setSavedTarget(response.ok))
      .catch(() => setSavedTarget(false));
  };

  return (
    <main className="page-layout">
      <div className="page-header">
        <div><p className="eyebrow">DAILY SALES REPORT</p><h1>{categoryLabels[category]}</h1></div>
        <Link href="/" className="primary-btn">Về dashboard</Link>
      </div>

      <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))' }}>
        <div className="metric-card"><span>Số báo cáo</span><strong>{visibleReports.length}</strong></div>
        <div className="metric-card"><span>Tổng doanh thu</span><strong>{formatVnd(totalRevenue)}</strong></div>
        <section className="metric-card" style={{ padding: '18px 20px', borderColor: 'rgba(245, 215, 110, 0.42)', background: 'linear-gradient(145deg, rgba(83, 62, 13, 0.48), rgba(24, 28, 25, 0.9))' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '10px', marginBottom: '10px' }}><span style={{ color: '#f5d76e', fontWeight: 800 }}>Mục tiêu doanh thu</span>{savedTarget && <small style={{ color: '#9ce8b9' }}>Đã lưu</small>}</div>
          <select value={targetCategory} onChange={(event) => setTargetCategory(event.target.value as Category)} style={{ width: '100%', boxSizing: 'border-box', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(245,215,110,0.35)', background: 'rgba(20, 22, 18, 0.82)', color: '#fff1b0', fontWeight: 700, marginBottom: '8px' }}>
            <option value="Thời trang Quận 4">Thời trang Quận 4</option>
            <option value="Vải Quận 4">Kho vải Quận 4</option>
            <option value="Vải Bến Thành">Kho vải Bến Thành</option>
          </select>
          <div style={{ display: 'flex', gap: '8px' }}><input type="number" min="0" value={targetAmount} onChange={(event) => { setTargetAmount(event.target.value); setSavedTarget(false); }} placeholder="Nhập mục tiêu (VNĐ)" style={{ minWidth: 0, flex: 1, boxSizing: 'border-box', padding: '9px 10px', borderRadius: '8px', border: '1px solid rgba(245,215,110,0.35)', background: 'rgba(20, 22, 18, 0.82)', color: '#fff1b0' }} /><button type="button" onClick={saveTarget} style={{ border: 'none', borderRadius: '8px', padding: '9px 11px', background: '#f5d76e', color: '#302405', fontWeight: 800, cursor: 'pointer' }}>Lưu</button></div>
        </section>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1.25fr) minmax(300px, 0.75fr)', gap: '18px', marginBottom: '18px' }}>
        <section className="panel" style={{ minHeight: '250px' }}>
          <div className="panel-header"><div><p className="eyebrow">AI INSIGHT</p><h3>Phân tích báo cáo</h3></div><button type="button" onClick={analyzeVisibleReports} disabled={isAnalyzing || !visibleReports.length} className="primary-btn" style={{ padding: '9px 13px', fontSize: '0.78rem' }}>{isAnalyzing ? 'Đang phân tích...' : 'Phân tích AI'}</button></div>
          <p style={{ color: '#b9d8f8', lineHeight: 1.6, whiteSpace: 'pre-wrap', margin: 0 }}>{aiAnalysis || 'Chọn bộ lọc rồi bấm Phân tích AI để xem nhận xét về các báo cáo đang hiển thị.'}</p>
        </section>
        <section className="panel" style={{ minHeight: '250px' }}>
          <div className="panel-header"><div><p className="eyebrow">SALES LEADERBOARD</p><h3>Doanh thu theo thành viên</h3></div><span className="badge success">{leaderboard.length} người</span></div>
          {!leaderboard.length ? <p className="comparison-loading">Chưa có dữ liệu.</p> : <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>{leaderboard.slice(0, 5).map((member, index) => { const maxRevenue = leaderboard[0]?.revenue || 1; return <div key={member.name} style={{ display: 'grid', gridTemplateColumns: '24px 1fr auto', gap: '8px', alignItems: 'center' }}><strong style={{ color: '#f5d76e' }}>{index + 1}</strong><div><strong style={{ color: '#edf5ff', fontSize: '0.85rem' }}>{member.name}</strong><div style={{ height: '7px', marginTop: '5px', background: 'rgba(141,183,218,0.16)', borderRadius: '999px', overflow: 'hidden' }}><span style={{ display: 'block', width: `${Math.max(5, (member.revenue / maxRevenue) * 100)}%`, height: '100%', background: 'linear-gradient(90deg, #5fe5c4, #5d8bff)', borderRadius: '999px' }} /></div></div><span style={{ color: '#9ad7ff', fontSize: '0.75rem', fontWeight: 700 }}>{formatVnd(member.revenue)}</span></div>; })}</div>}
        </section>
      </div>

      <div className="panel" style={{ marginBottom: '18px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px', marginBottom: '12px' }}>
          <span style={{ color: '#edf5ff', fontSize: '0.95rem', fontWeight: 800 }}>Bộ lọc báo cáo</span>
          <span style={{ color: '#8db7da', fontSize: '0.78rem' }}>Lọc theo khoảng ngày hoặc Sale</span>
        </div>
        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '12px' }}>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '175px', color: '#b9d8f8', fontSize: '0.75rem', fontWeight: 700 }}><span>Từ ngày</span><input type="date" value={fromDate} onChange={(event) => setFromDate(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid rgba(141,183,218,0.3)', background: 'rgba(8,20,32,0.8)', color: '#edf5ff' }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '175px', color: '#b9d8f8', fontSize: '0.75rem', fontWeight: 700 }}><span>Đến ngày</span><input type="date" value={toDate} onChange={(event) => setToDate(event.target.value)} style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid rgba(141,183,218,0.3)', background: 'rgba(8,20,32,0.8)', color: '#edf5ff' }} /></label>
          <label style={{ display: 'flex', flexDirection: 'column', gap: '6px', minWidth: '220px', color: '#b9d8f8', fontSize: '0.75rem', fontWeight: 700 }}><span>Tên Sale</span><input value={saleFilter} onChange={(event) => setSaleFilter(event.target.value)} placeholder="Tìm theo tên Sale" style={{ width: '100%', boxSizing: 'border-box', padding: '10px 12px', borderRadius: '9px', border: '1px solid rgba(141,183,218,0.3)', background: 'rgba(8,20,32,0.8)', color: '#edf5ff' }} /></label>
          <button type="button" onClick={() => { setFromDate(''); setToDate(''); setSaleFilter(''); }} style={{ padding: '10px 15px', borderRadius: '9px', border: '1px solid rgba(141,183,218,0.3)', background: 'rgba(141,183,218,0.1)', color: '#dfeaf7', fontWeight: 800, cursor: 'pointer' }}>Xóa bộ lọc</button>
        </div>
      </div>

      <div className="panel sales-report-table-panel" style={{ overflowX: 'auto' }}>
        <div className="panel-header"><h3>Danh sách Sale đã nhập báo cáo</h3><span className="badge neutral">{visibleReports.length} báo cáo</span></div>
        {!visibleReports.length ? <p className="comparison-loading">Chưa có báo cáo Sale cho ngày và khu vực này.</p> : (
          <div className="sales-report-table-scroll" style={{ maxHeight: '620px', overflowY: visibleReports.length > 10 ? 'auto' : 'visible', overflowX: 'auto' }}>
            <table className="data-table">
              <thead><tr><th>Ngày</th><th>Sale</th><th>Mã đơn</th><th>Sản phẩm</th><th>Doanh thu</th><th>Trạng thái đơn</th><th>Ghi chú</th></tr></thead>
              <tbody>{visibleReports.map((report) => <tr key={report.id}>
                <td>{report.date}</td>
                <td><strong>{report.salesperson}</strong></td>
                <td>{report.orderCode}</td>
                <td>{report.items.map((item) => <div key={item.id ?? item.productCode} style={{ marginBottom: '4px' }}>{item.productName} × {item.quantity}</div>)}</td>
                <td><strong>{formatVnd(report.revenue)}</strong></td>
                <td>{report.orderStatus}</td>
                <td title={report.note} style={{ maxWidth: '220px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{report.note || 'Không có ghi chú'}</td>
              </tr>)}</tbody>
            </table>
          </div>
        )}
      </div>
    </main>
  );
}
