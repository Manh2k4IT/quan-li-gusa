'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState, type ChangeEvent } from 'react';

type Segment = 'VIP – mua nhiều' | 'Khách tiềm năng' | 'Mua đều / ổn định' | 'Khách mới' | 'Giảm mua / ngừng mua';
type Customer = {
  id: string;
  name: string;
  phone: string | null;
  company: string;
  status: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  daysSinceLastOrder: number | null;
  segment: Segment;
};

const segments: Segment[] = ['VIP – mua nhiều', 'Khách tiềm năng', 'Mua đều / ổn định', 'Khách mới', 'Giảm mua / ngừng mua'];
const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : 'Chưa có đơn';
const formatDays = (value: number | null) => value === null ? 'Chưa mua' : `${value} ngày`;

export default function CustomerAnalysisPage() {
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [activeSegment, setActiveSegment] = useState<Segment | 'Tất cả'>('Tất cả');
  const [aiPrompt, setAiPrompt] = useState('Hãy phân tích nhóm khách hàng đang giảm mua hoặc ngừng mua trước, sau đó đề xuất cách Sale tiếp cận từng nhóm.');
  const [aiReply, setAiReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [aiLoading, setAiLoading] = useState(false);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [q4Search, setQ4Search] = useState('');
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [q4Timeline, setQ4Timeline] = useState('all');
  const [purchasedTimeline, setPurchasedTimeline] = useState('all');

  async function loadCustomers() {
    setLoading(true);
    try {
      const response = await fetch('/api/customer-analysis');
      const payload = await response.json();
      setCustomers(payload.customers ?? []);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  const visibleCustomers = useMemo(() => activeSegment === 'Tất cả' ? customers : customers.filter((customer) => customer.segment === activeSegment), [activeSegment, customers]);
  const filterByTimeline = (items: Customer[], timeline: string) => {
    if (timeline === 'all') return items;
    const days = Number(timeline);
    return items.filter((customer) => customer.lastOrderAt && (Date.now() - new Date(customer.lastOrderAt).getTime()) <= days * 86400000);
  };
  const filterBySearch = (items: Customer[], search: string) => {
    const query = search.trim().toLowerCase();
    if (!query) return items;
    return items.filter((customer) => `${customer.name} ${customer.company} ${customer.status}`.toLowerCase().includes(query));
  };
  const q4Customers = useMemo(() => filterBySearch(filterByTimeline(customers.filter((customer) => customer.company.toLowerCase().includes('quận 4')), q4Timeline), q4Search), [customers, q4Search, q4Timeline]);
  const purchasedCustomers = useMemo(() => filterBySearch(filterByTimeline(customers.filter((customer) => customer.orderCount > 0), purchasedTimeline), purchasedSearch), [customers, purchasedSearch, purchasedTimeline]);
  const counts = segments.reduce<Record<string, number>>((result, segment) => ({ ...result, [segment]: customers.filter((customer) => customer.segment === segment).length }), {});

  const metrics = useMemo(() => {
    const totalRevenue = customers.reduce((sum, customer) => sum + customer.totalSpent, 0);
    const vipCount = counts['VIP – mua nhiều'] ?? 0;
    const potentialCount = counts['Khách tiềm năng'] ?? 0;
    const riskCount = counts['Giảm mua / ngừng mua'] ?? 0;
    const avgOrderValue = customers.length ? customers.reduce((sum, customer) => sum + customer.avgOrderValue, 0) / customers.length : 0;

    return {
      totalRevenue,
      vipCount,
      potentialCount,
      riskCount,
      avgOrderValue,
    };
  }, [counts, customers]);

  async function analyzeWithAi() {
    setAiLoading(true);
    try {
      const compactCustomers = visibleCustomers
        .filter((customer) => customer.orderCount > 0 || customer.segment === 'Giảm mua / ngừng mua' || customer.segment === 'Khách tiềm năng')
        .sort((first, second) => second.totalSpent - first.totalSpent)
        .slice(0, 300)
        .map(({ name, company, status, orderCount, totalSpent, lastOrderAt, daysSinceLastOrder, segment }) => ({ name, company, status, orderCount, totalSpent, lastOrderAt, daysSinceLastOrder, segment }));
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const response = await fetch('/api/customer-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt: aiPrompt, customers: compactCustomers }), signal: controller.signal });
      window.clearTimeout(timeout);
      const payload = await response.json();
      setAiReply(payload.reply ?? 'AI chưa trả về kết quả.');
    } catch (error) {
      setAiReply(error instanceof DOMException && error.name === 'AbortError' ? 'AI phản hồi quá lâu. Hãy thu hẹp nhóm khách hoặc thử lại.' : 'Không thể kết nối AI lúc này.');
    } finally {
      setAiLoading(false);
    }
  }

  async function handleImport(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setImporting(true);
    setImportMessage('');

    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/customer-analysis/import', { method: 'POST', body: formData });
      const payload = await response.json();
      setImportMessage(payload.message ?? 'Import khách hàng hoàn tất.');

      if (response.ok) {
        await loadCustomers();
      }
    } catch {
      setImportMessage('Không thể import dữ liệu khách hàng.');
    } finally {
      setImporting(false);
      event.target.value = '';
    }
  }

  return (
    <main className="sales-analysis-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">CUSTOMER INTELLIGENCE</p>
          <h2>Phân tích khách hàng</h2>
          <p className="page-subtitle">Theo dõi giá trị, độ gần gũi và rủi ro từng nhóm khách để ưu tiên chăm sóc đúng đối tượng.</p>
        </div>
        <div className="customer-header-actions">
          <label className="import-trigger">
            <input type="file" accept=".csv,.xlsx,.xls" onChange={handleImport} />
            {importing ? 'Đang import...' : 'Import Excel / CRM'}
          </label>
          <Link href="/sales-plan" className="ghost-btn">Về báo cáo kế hoạch</Link>
        </div>
      </div>

      {importMessage && <div className="customer-import-message">{importMessage}</div>}

      <div className="customer-summary-grid">
        <div className="summary-card accent-blue"><span>Tổng doanh số</span><strong>{formatVnd(metrics.totalRevenue)}</strong><small>Toàn bộ khách hàng</small></div>
        <div className="summary-card accent-green"><span>VIP – mua nhiều</span><strong>{metrics.vipCount}</strong><small>Khách giá trị cao</small></div>
        <div className="summary-card accent-violet"><span>Khách tiềm năng</span><strong>{metrics.potentialCount}</strong><small>Đáng đầu tư chăm sóc</small></div>
        <div className="summary-card accent-orange"><span>Nguy cơ giảm mua</span><strong>{metrics.riskCount}</strong><small>Đòi chăm sóc lại</small></div>
        <div className="summary-card accent-slate"><span>Giá trị TB / khách</span><strong>{formatVnd(metrics.avgOrderValue)}</strong><small>Trung bình</small></div>
      </div>

      <div className="customer-segment-grid">
        <button className={`customer-segment-card ${activeSegment === 'Tất cả' ? 'active' : ''}`} onClick={() => setActiveSegment('Tất cả')}><span>Tổng khách</span><strong>{customers.length}</strong></button>
        {segments.map((segment) => <button key={segment} className={`customer-segment-card ${activeSegment === segment ? 'active' : ''}`} onClick={() => setActiveSegment(segment)}><span>{segment}</span><strong>{counts[segment] ?? 0}</strong></button>)}
      </div>

      <section className="customer-dual-table-grid">
        {[
          { title: 'Tất cả khách hàng Quận 4', note: 'Toàn bộ hồ sơ khách thuộc nhóm Quận 4', items: q4Customers, search: q4Search, setSearch: setQ4Search, timeline: q4Timeline, setTimeline: setQ4Timeline },
          { title: 'Khách đã phát sinh đơn', note: 'Chỉ khách có hóa đơn đã ghi sổ trên ERP', items: purchasedCustomers, search: purchasedSearch, setSearch: setPurchasedSearch, timeline: purchasedTimeline, setTimeline: setPurchasedTimeline },
        ].map((list) => (
          <section className="panel customer-table-panel customer-list-panel" key={list.title}>
            <div className="panel-header">
              <div>
                <p className="eyebrow">CRM SIGNALS</p>
                <h3>{list.title}</h3>
                <span className="panel-note">{list.note}</span>
              </div>
              <span className="live-status">{list.items.length} khách</span>
            </div>
            <div className="customer-list-filters">
              <input value={list.search} onChange={(event) => list.setSearch(event.target.value)} placeholder="Tìm tên, nhóm, trạng thái..." aria-label={`Tìm kiếm ${list.title}`} />
              <select value={list.timeline} onChange={(event) => list.setTimeline(event.target.value)} aria-label={`Timeline ${list.title}`}>
                <option value="all">Mọi thời gian</option>
                <option value="30">Mua trong 30 ngày</option>
                <option value="90">Mua trong 90 ngày</option>
                <option value="180">Mua trong 6 tháng</option>
                <option value="365">Mua trong 12 tháng</option>
              </select>
            </div>
            {loading ? <p className="empty-state">Đang tải dữ liệu khách hàng...</p> : (
              <div className="table-wrap customer-analysis-table-wrap">
                <table className="data-table">
                  <thead><tr><th>Khách hàng</th><th>Số điện thoại</th><th>Nhóm</th><th>Số đơn</th><th>Tổng mua</th><th>Mua gần nhất</th></tr></thead>
                  <tbody>{list.items.map((customer) => <tr key={customer.id}>
                    <td><strong>{customer.name}</strong><small className="customer-row-status">{customer.status}</small></td>
                    <td>{customer.phone || 'Chưa có'}</td>
                    <td><span className="customer-segment-badge">{customer.company}</span></td>
                    <td>{customer.orderCount}</td>
                    <td>{formatVnd(customer.totalSpent)}</td>
                    <td>{formatDate(customer.lastOrderAt)}</td>
                  </tr>)}</tbody>
                </table>
                {!list.items.length && <p className="empty-state">Không có khách phù hợp bộ lọc.</p>}
              </div>
            )}
          </section>
        ))}
      </section>

      <section className="panel customer-ai-panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">AI CRM ADVISOR</p>
            <h3>Phân tích AI cho khách hàng</h3>
          </div>
          <span className="live-status">Dùng nhóm đang chọn</span>
        </div>
          <div className="customer-ai-workspace">
            <div className="customer-ai-input-column">
              <span className="customer-ai-column-label">Yêu cầu phân tích</span>
              <textarea value={aiPrompt} onChange={(event) => setAiPrompt(event.target.value)} placeholder="Bạn muốn AI phân tích nhóm khách nào?" />
              <button className="primary-btn customer-ai-button" onClick={analyzeWithAi} disabled={aiLoading || loading}>{aiLoading ? 'Đang phân tích...' : 'Phân tích khách hàng'}</button>
            </div>
            <div className="customer-ai-result-column">
              <span className="customer-ai-column-label">Kết quả trả lời</span>
              <div className={`customer-ai-reply ${!aiReply ? 'is-empty' : ''}`}>
                {aiReply || 'Kết quả phân tích sẽ hiển thị ở đây.'}
              </div>
            </div>
          </div>
      </section>
    </main>
  );
}
