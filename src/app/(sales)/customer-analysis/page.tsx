'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react';

type Segment = 'VIP – mua nhiều' | 'Khách tiềm năng' | 'Mua đều / ổn định' | 'Khách mới' | 'Giảm mua / ngừng mua';
type CustomerOrder = {
  id?: string;
  date?: string | null;
  total: number;
  status?: string;
};
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
  orderHistory?: CustomerOrder[];
};
type ErpConnectionState = 'checking' | 'connected' | 'disconnected';
type CustomerGroupKey = 'fashion-q4' | 'fabric-ben-thanh' | 'fabric-q4';
type AnalysisMode = 'erp' | 'web+erp';

const customerGroups: Array<{ key: CustomerGroupKey; label: string; match: string }> = [
  { key: 'fashion-q4', label: 'Thời trang Quận 4', match: 'thoi trang quan 4' },
  { key: 'fabric-ben-thanh', label: 'Vải Bến Thành', match: 'vai ben thanh' },
  { key: 'fabric-q4', label: 'Vải Quận 4', match: 'vai quan 4' },
];

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const formatDate = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN').format(new Date(value)) : 'Chưa có đơn';
const formatShortDate = (value: string | null) => value ? new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value)) : '—';
const formatDays = (value: number | null) => value === null ? 'Chưa mua' : `${value} ngày`;
const formatAiReply = (value: string) => value
  .replace(/^#{1,6}\s*/gm, '')
  .replace(/\*\*(.*?)\*\*/g, '$1')
  .replace(/^\s*[-*]\s+/gm, '• ')
  .trim();
const normalizeGroupName = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/đ/g, 'd').replace(/[^a-z0-9]+/g, ' ').trim();

export default function CustomerAnalysisPage() {
  const searchParams = useSearchParams();
  const [customers, setCustomers] = useState<Customer[]>([]);
  const aiPromptRef = useRef<HTMLTextAreaElement>(null);
  const [aiReply, setAiReply] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [erpConnection, setErpConnection] = useState<ErpConnectionState>('checking');
  const [aiLoading, setAiLoading] = useState(false);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('erp');
  const [aiMode, setAiMode] = useState('');
  const [aiSources, setAiSources] = useState<Array<{ title: string; url: string }>>([]);
  const [importing, setImporting] = useState(false);
  const [importMessage, setImportMessage] = useState('');
  const [q4Search, setQ4Search] = useState('');
  const [purchasedSearch, setPurchasedSearch] = useState('');
  const [q4Timeline, setQ4Timeline] = useState('all');
  const [purchasedTimeline, setPurchasedTimeline] = useState('all');
  const [expandedCustomers, setExpandedCustomers] = useState<Record<string, boolean>>({});
  const groupParam = searchParams.get('group');
  const activeGroup: CustomerGroupKey = customerGroups.some((item) => item.key === groupParam) ? groupParam as CustomerGroupKey : 'fabric-q4';

  async function loadCustomers() {
    setLoading(true);
    setLoadProgress(8);
    setErpConnection('checking');
    const progressTimer = window.setInterval(() => {
      setLoadProgress((current) => current < 88 ? Math.min(88, current + Math.max(1, Math.round((88 - current) / 5))) : current);
    }, 700);
    try {
      const erpResponse = await fetch('/api/erp-status', { cache: 'no-store' });
      const erpPayload = await erpResponse.json().catch(() => null);
      setErpConnection(erpResponse.ok && erpPayload?.connected ? 'connected' : 'disconnected');
      setLoadProgress(28);
      const response = await fetch('/api/customer-analysis');
      const payload = await response.json();
      setCustomers(payload.customers ?? []);
      setLoadProgress(100);
    } catch {
      setErpConnection('disconnected');
    } finally {
      window.clearInterval(progressTimer);
      window.setTimeout(() => setLoading(false), 250);
    }
  }

  useEffect(() => {
    loadCustomers();
  }, []);

  useEffect(() => {
    setAiReply('');
    setAiMode('');
    setAiSources([]);
  }, [activeGroup]);

  const selectedGroup = customerGroups.find((group) => group.key === activeGroup) ?? customerGroups[2];
  const groupCustomers = useMemo(() => customers.filter((customer) => normalizeGroupName(customer.company).includes(selectedGroup.match)), [customers, selectedGroup.match]);
  const visibleCustomers = groupCustomers;
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
  const allGroupCustomers = useMemo(() => filterBySearch(filterByTimeline(groupCustomers, q4Timeline), q4Search), [groupCustomers, q4Search, q4Timeline]);
  const purchasedCustomers = useMemo(() => filterBySearch(filterByTimeline(groupCustomers.filter((customer) => customer.orderCount > 0), purchasedTimeline), purchasedSearch), [groupCustomers, purchasedSearch, purchasedTimeline]);

  const toggleCustomerDetails = (customerId: string) => {
    setExpandedCustomers((current) => ({ ...current, [customerId]: !current[customerId] }));
  };

  async function analyzeWithAi() {
    setAiLoading(true);
    setAiSources([]);
    try {
      const compactCustomers = visibleCustomers
        .filter((customer) => customer.orderCount > 0 || customer.segment === 'Giảm mua / ngừng mua' || customer.segment === 'Khách tiềm năng')
        .sort((first, second) => second.totalSpent - first.totalSpent)
        .slice(0, 300)
        .map(({ name, company, status, orderCount, totalSpent, lastOrderAt, daysSinceLastOrder, segment }) => ({ name, company, status, orderCount, totalSpent, lastOrderAt, daysSinceLastOrder, segment }));
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const prompt = aiPromptRef.current?.value.trim() || 'Hãy phân tích nhóm khách hàng đang giảm mua hoặc ngừng mua trước, sau đó đề xuất cách Sale tiếp cận từng nhóm.';
      const response = await fetch('/api/customer-analysis', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ prompt, customers: compactCustomers, businessGroup: selectedGroup.label, analysisMode }), signal: controller.signal });
      window.clearTimeout(timeout);
      const payload = await response.json();
      setAiReply(formatAiReply(response.ok ? (payload.reply ?? 'AI chưa trả về kết quả.') : (payload.message ?? payload.reply ?? 'Không thể kết nối AI.')));
      setAiMode(response.ok ? String(payload.mode ?? '') : '');
      setAiSources(response.ok && Array.isArray(payload.sources) ? payload.sources : []);
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

      <section className={`customer-sync-panel ${erpConnection}`} aria-live="polite">
        <div className="customer-sync-header">
          <div className="customer-erp-status">
            <span className="customer-erp-dot" aria-hidden="true" />
            <strong>{erpConnection === 'checking' ? 'Đang kiểm tra kết nối ERP' : erpConnection === 'connected' ? 'ERP đã kết nối' : 'ERP không kết nối'}</strong>
          </div>
          <span>{loading ? `${loadProgress}%` : `${groupCustomers.length} khách ${selectedGroup.label} đã tải`}</span>
        </div>
        <div className="customer-load-track" role="progressbar" aria-label="Tiến trình tải dữ liệu khách hàng" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? loadProgress : 100}>
          <span style={{ width: `${loading ? loadProgress : 100}%` }} />
        </div>
        <small>{loading ? (loadProgress < 28 ? 'Đang xác thực nguồn dữ liệu...' : loadProgress < 88 ? 'Đang đồng bộ khách hàng và hóa đơn từ ERP...' : 'Đang hoàn tất danh sách...') : erpConnection === 'connected' ? `Dữ liệu ${selectedGroup.label} được đồng bộ từ ERP.` : 'Đang hiển thị dữ liệu đã lưu gần nhất.'}</small>
      </section>

      <section className="customer-dual-table-grid">
        {[
          { title: `Tất cả khách hàng ${selectedGroup.label}`, note: `Toàn bộ hồ sơ thuộc nhóm ${selectedGroup.label} trên ERP`, items: allGroupCustomers, search: q4Search, setSearch: setQ4Search, timeline: q4Timeline, setTimeline: setQ4Timeline },
          { title: `Khách ${selectedGroup.label} đã phát sinh đơn`, note: 'Chỉ khách có hóa đơn đã ghi sổ trên ERP', items: purchasedCustomers, search: purchasedSearch, setSearch: setPurchasedSearch, timeline: purchasedTimeline, setTimeline: setPurchasedTimeline },
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
                  <thead><tr><th>Khách hàng</th><th>Số điện thoại</th><th>Nhóm</th><th>Số đơn</th><th>Lịch sử mua</th><th>Tần suất mua</th><th>Tổng mua</th></tr></thead>
                  <tbody>{list.items.map((customer) => {
                    const validOrderDates = (customer.orderHistory ?? [])
                      .map((order) => order.date ? new Date(order.date).getTime() : null)
                      .filter((value): value is number => value !== null)
                      .sort((first, second) => first - second);
                    const gaps = validOrderDates.slice(1).map((date, index) => (date - validOrderDates[index]) / 86400000);
                    const avgGap = gaps.length ? Math.round(gaps.reduce((sum, value) => sum + value, 0) / gaps.length) : 0;
                    const previewHistory = (customer.orderHistory ?? []).slice(0, 2).map((order) => `${formatShortDate(order.date ?? null)} · ${formatVnd(order.total)}`);
                    const frequencyText = customer.orderCount > 0
                      ? (gaps.length ? `${customer.orderCount} lần / ~${avgGap} ngày/lần` : `${customer.orderCount} lần`)
                      : 'Chưa mua';
                    const isExpanded = Boolean(expandedCustomers[customer.id]);

                    return <>
                      <tr key={customer.id}>
                        <td><strong>{customer.name}</strong><small className="customer-row-status">{customer.status}</small></td>
                        <td>{customer.phone || 'Chưa có'}</td>
                        <td><span className="customer-segment-badge">{customer.company}</span></td>
                        <td>{customer.orderCount}</td>
                        <td>
                          <div className="customer-order-history-cell">
                            {previewHistory.length ? (
                              <>
                                {previewHistory.map((item) => <div key={item} className="customer-order-preview-item">{item}</div>)}
                                {(customer.orderHistory?.length ?? 0) > 2 && (
                                  <button type="button" className="customer-order-toggle" onClick={() => toggleCustomerDetails(customer.id)}>
                                    {isExpanded ? 'Thu gọn' : `Xem tất cả ${customer.orderHistory?.length ?? 0} đơn`}
                                  </button>
                                )}
                              </>
                            ) : (
                              <span>Chưa có</span>
                            )}
                          </div>
                        </td>
                        <td>{frequencyText}</td>
                        <td>{formatVnd(customer.totalSpent)}</td>
                      </tr>
                      {isExpanded && customer.orderHistory && customer.orderHistory.length > 0 && (
                        <tr key={`${customer.id}-details`} className="customer-order-details-row">
                          <td colSpan={7}>
                            <div className="customer-order-details-list">
                              {customer.orderHistory.map((order) => (
                                <div key={order.id ?? `${order.date ?? 'unknown'}-${order.total}`} className="customer-order-details-item">
                                  <span>{formatShortDate(order.date ?? null)}</span>
                                  <strong>{formatVnd(order.total)}</strong>
                                  <small>{order.status || 'Đã ghi nhận'}</small>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      )}
                    </>;
                  })}</tbody>
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
          <span className="live-status">Đang dùng {selectedGroup.label}</span>
        </div>
          <div className="customer-ai-workspace">
            <div className="customer-ai-input-column">
              <span className="customer-ai-column-label">Yêu cầu phân tích</span>
              <div className="product-analysis-mode" role="group" aria-label="Chọn nguồn phân tích khách hàng">
                <button type="button" className={analysisMode === 'erp' ? 'active' : ''} onClick={() => { setAnalysisMode('erp'); setAiReply(''); setAiSources([]); }}>Nội bộ GUSA</button>
                <button type="button" className={analysisMode === 'web+erp' ? 'active' : ''} onClick={() => { setAnalysisMode('web+erp'); setAiReply(''); setAiSources([]); }}>ERP + thị trường</button>
              </div>
              <small className="product-analysis-mode-note">{analysisMode === 'erp' ? 'AI chỉ dùng hồ sơ khách và lịch sử mua hàng trong ERP GUSA.' : 'AI tìm xu hướng thị trường rồi đối chiếu với dữ liệu khách hàng ERP.'}</small>
              <textarea ref={aiPromptRef} defaultValue="Hãy phân tích nhóm khách hàng đang giảm mua hoặc ngừng mua trước, sau đó đề xuất cách Sale tiếp cận từng nhóm." placeholder="Bạn muốn AI phân tích nhóm khách nào?" />
              <button className="primary-btn customer-ai-button" onClick={analyzeWithAi} disabled={aiLoading || loading}>{aiLoading ? 'Đang phân tích...' : 'Phân tích khách hàng'}</button>
            </div>
            <div className="customer-ai-result-column">
              <div className="product-ai-result-heading"><span className="customer-ai-column-label">Kết quả trả lời</span>{aiMode && <span className="product-ai-mode">{aiMode === 'web+erp' ? 'Web + ERP' : 'ERP'}</span>}</div>
              <div className={`customer-ai-reply ${!aiReply ? 'is-empty' : ''}`}>
                {aiLoading ? (
                  <div className="customer-ai-loading" role="status" aria-live="polite">
                    <span className="customer-ai-spinner" aria-hidden="true" />
                    <div>
                      <strong>Đang phân tích dữ liệu khách hàng...</strong>
                      <small>AI đang đọc các nhóm khách và lịch sử mua hàng.</small>
                    </div>
                  </div>
                ) : aiReply ? aiReply : 'Kết quả phân tích sẽ hiển thị ở đây.'}
              </div>
              {!!aiSources.length && <div className="product-ai-sources"><strong>Nguồn tham khảo</strong>{aiSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
            </div>
          </div>
      </section>
    </main>
  );
}
