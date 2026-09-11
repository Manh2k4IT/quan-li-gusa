'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type Segment = 'Mua nhiều' | 'Mua ít' | 'Khách tiềm năng' | 'Giảm mua / ngừng mua';
type Customer = {
  id: string;
  name: string;
  company: string;
  status: string;
  orderCount: number;
  totalSpent: number;
  lastOrderAt: string | null;
  segment: Segment;
};

const segments: Segment[] = ['Mua nhiều', 'Mua ít', 'Khách tiềm năng', 'Giảm mua / ngừng mua'];
const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : 'Chưa có đơn';

export default function CustomerAnalysisPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeSegment, setActiveSegment] = useState<Segment | 'Tất cả'>('Tất cả');
  const [aiPrompt, setAiPrompt] = useState('Hãy phân tích nhóm khách hàng đang giảm mua hoặc ngừng mua trước, sau đó đề xuất cách Sale tiếp cận từng nhóm.');
  const [aiReply, setAiReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);

  useEffect(() => {
    fetch('/api/customer-analysis')
      .then(async (response) => response.ok ? response.json() : { customers: [] })
      .then((payload) => setCustomers(payload.customers ?? []))
      .finally(() => setLoading(false));
  }, []);

  const visibleCustomers = useMemo(() => activeSegment === 'Tất cả' ? customers : customers.filter((customer) => customer.segment === activeSegment), [activeSegment, customers]);
  const counts = segments.reduce<Record<string, number>>((result, segment) => ({ ...result, [segment]: customers.filter((customer) => customer.segment === segment).length }), {});

  async function analyzeWithAi() {
    setAiLoading(true);
    try {
      const response = await fetch('/api/customer-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt, customers: visibleCustomers }) });
      const payload = await response.json();
      setAiReply(payload.reply ?? 'AI chưa trả về kết quả.');
    } catch {
      setAiReply('Không thể kết nối AI lúc này.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="sales-analysis-page">
      <div className="page-header">
        <div><p className="eyebrow">CUSTOMER INTELLIGENCE</p><h2>Phân tích khách hàng</h2><p className="page-subtitle">Nhìn rõ ai đang mua nhiều, ai cần chăm lại và nhóm nào có thể phát triển.</p></div>
        <Link href="/sales-plan" className="ghost-btn">Về báo cáo kế hoạch</Link>
      </div>

      <div className="customer-segment-grid">
        <button className={`customer-segment-card ${activeSegment === 'Tất cả' ? 'active' : ''}`} onClick={() => setActiveSegment('Tất cả')}><span>Tổng khách</span><strong>{customers.length}</strong></button>
        {segments.map((segment) => <button key={segment} className={`customer-segment-card ${activeSegment === segment ? 'active' : ''}`} onClick={() => setActiveSegment(segment)}><span>{segment}</span><strong>{counts[segment] ?? 0}</strong></button>)}
      </div>

      <section className="panel customer-table-panel">
        <div className="panel-header"><div><p className="eyebrow">CRM SIGNALS</p><h3>{activeSegment === 'Tất cả' ? 'Tất cả khách hàng' : activeSegment}</h3></div><span className="live-status">{visibleCustomers.length} khách</span></div>
        {loading ? <p className="empty-state">Đang tải dữ liệu khách hàng...</p> : <div className="table-wrap customer-analysis-table-wrap"><table className="data-table"><thead><tr><th>Khách hàng</th><th>Công ty</th><th>Nhóm</th><th>Số đơn</th><th>Tổng mua</th><th>Lần mua gần nhất</th></tr></thead><tbody>{visibleCustomers.map((customer) => <tr key={customer.id}><td><strong>{customer.name}</strong><small className="customer-muted">{customer.status}</small></td><td>{customer.company}</td><td><span className={`customer-segment-badge segment-${customer.segment.length}`}>{customer.segment}</span></td><td>{customer.orderCount}</td><td>{formatVnd(customer.totalSpent)}</td><td>{formatDate(customer.lastOrderAt)}</td></tr>)}</tbody></table></div>}
      </section>

      <section className="panel customer-ai-panel">
        <div className="panel-header"><div><p className="eyebrow">AI CRM ADVISOR</p><h3>Phân tích AI cho khách hàng</h3></div><span className="live-status">Dùng nhóm đang chọn</span></div>
        <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Bạn muốn AI phân tích nhóm khách nào?" />
        <button className="primary-btn customer-ai-button" onClick={analyzeWithAi} disabled={aiLoading || loading}>{aiLoading ? 'Đang phân tích...' : 'Phân tích khách hàng'}</button>
        {aiReply && <div className="customer-ai-reply">{aiReply}</div>}
      </section>
    </main>
  );
}
