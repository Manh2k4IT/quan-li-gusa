'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';

type ProductRow = {
  sku: string;
  name: string;
  category: string;
  businessGroup: string;
  unitPrice: number;
  soldQuantity: number;
  orderCount: number;
  revenue: number;
  stock: number;
  reorderPoint: number;
};

type SortKey = 'revenue' | 'soldQuantity' | 'orderCount' | 'stock';
type ProductGroupKey = 'fashion-q4' | 'fabric-ben-thanh' | 'fabric-q4';
type AnalysisMode = 'erp' | 'web+erp';
type ErpConnectionState = 'checking' | 'connected' | 'disconnected';

const productGroups: Array<{ key: ProductGroupKey; label: string }> = [
  { key: 'fashion-q4', label: 'Thời trang Quận 4' },
  { key: 'fabric-ben-thanh', label: 'Vải Bến Thành' },
  { key: 'fabric-q4', label: 'Vải Quận 4' },
];

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);
const formatAiReply = (value: string) => value.replace(/^#{1,6}\s*/gm, '').replace(/\*\*(.*?)\*\*/g, '$1').replace(/^\s*[-*]\s+/gm, '• ').trim();

export default function ProductAnalysisPage() {
  const searchParams = useSearchParams();
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadProgress, setLoadProgress] = useState(0);
  const [erpConnection, setErpConnection] = useState<ErpConnectionState>('checking');
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const aiPromptRef = useRef<HTMLTextAreaElement>(null);
  const [aiReply, setAiReply] = useState('');
  const [aiLoading, setAiLoading] = useState(false);
  const [aiMode, setAiMode] = useState('');
  const [aiSources, setAiSources] = useState<Array<{ title: string; url: string }>>([]);
  const [analysisMode, setAnalysisMode] = useState<AnalysisMode>('erp');
  const groupParam = searchParams.get('group');
  const activeGroup: ProductGroupKey = productGroups.some((item) => item.key === groupParam) ? groupParam as ProductGroupKey : 'fabric-q4';

  useEffect(() => {
    const progressTimer = window.setInterval(() => {
      setLoadProgress((current) => current < 90 ? Math.min(90, current + Math.max(1, Math.round((90 - current) / 5))) : current);
    }, 700);
    setLoadProgress(8);

    Promise.all([
      fetch('/api/erp-status', { cache: 'no-store' }).then(async (response) => ({ ok: response.ok, payload: await response.json().catch(() => null) })),
      fetch('/api/product-analysis', { cache: 'no-store' }).then(async (response) => ({ ok: response.ok, payload: await response.json() })),
    ])
      .then(([erpResult, productResult]) => {
        setErpConnection(erpResult.ok && erpResult.payload?.connected ? 'connected' : 'disconnected');
        if (!productResult.ok) throw new Error(productResult.payload.message ?? 'Không thể tải dữ liệu sản phẩm.');
        setProducts(Array.isArray(productResult.payload.products) ? productResult.payload.products : []);
        setLoadProgress(100);
      })
      .catch((loadError) => {
        setErpConnection('disconnected');
        setError(loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu sản phẩm.');
      })
      .finally(() => {
        window.clearInterval(progressTimer);
        window.setTimeout(() => setLoading(false), 250);
      });
    return () => window.clearInterval(progressTimer);
  }, []);

  useEffect(() => {
    setCategory('all');
    setAiReply('');
    setAiMode('');
    setAiSources([]);
  }, [activeGroup]);

  const selectedGroup = productGroups.find((group) => group.key === activeGroup) ?? productGroups[2];
  const groupProducts = useMemo(() => products.filter((product) => product.businessGroup === selectedGroup.label), [products, selectedGroup.label]);
  const categories = useMemo(() => [...new Set(groupProducts.map((product) => product.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'vi')), [groupProducts]);
  const visibleProducts = useMemo(() => {
    const query = search.trim().toLowerCase();
    return groupProducts
      .filter((product) => category === 'all' || product.category === category)
      .filter((product) => !query || `${product.sku} ${product.name} ${product.category}`.toLowerCase().includes(query))
      .sort((first, second) => second[sortKey] - first[sortKey]);
  }, [category, groupProducts, search, sortKey]);

  const metrics = useMemo(() => ({
    products: groupProducts.length,
    revenue: groupProducts.reduce((sum, product) => sum + product.revenue, 0),
    soldQuantity: groupProducts.reduce((sum, product) => sum + product.soldQuantity, 0),
    lowStock: groupProducts.filter((product) => product.stock <= Math.max(product.reorderPoint, 0) && product.soldQuantity > 0).length,
  }), [groupProducts]);

  async function analyzeWithAi() {
    if (aiLoading || loading || !groupProducts.length) return;
    setAiLoading(true);
    setAiSources([]);
    try {
      const prompt = aiPromptRef.current?.value.trim() || 'Phân tích sản phẩm bán tốt, bán chậm, tồn kho cần chú ý và đề xuất hành động.';
      const asksAboutStock = /tồn|kho|chậm|không bán|ứ đọng|xả hàng|thiếu hàng/.test(prompt.toLowerCase());
      const stockPriority = [...groupProducts].filter((product) => product.stock !== 0).sort((first, second) => asksAboutStock ? second.stock - first.stock || first.soldQuantity - second.soldQuantity : first.soldQuantity - second.soldQuantity || second.stock - first.stock);
      const revenuePriority = [...groupProducts].sort((first, second) => second.revenue - first.revenue);
      const selectedProducts = new Map<string, ProductRow>();
      for (const product of [...stockPriority.slice(0, 220), ...revenuePriority.slice(0, 100)]) selectedProducts.set(product.sku, product);
      const compactProducts = [...selectedProducts.values()].slice(0, 300).map(({ sku, name, category: productCategory, soldQuantity, orderCount, revenue, stock }) => ({ sku, name, category: productCategory, soldQuantity, orderCount, revenue, stock }));
      const controller = new AbortController();
      const timeout = window.setTimeout(() => controller.abort(), 30000);
      const response = await fetch('/api/product-analysis', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, businessGroup: selectedGroup.label, products: compactProducts, analysisMode }),
        signal: controller.signal,
      });
      window.clearTimeout(timeout);
      const payload = await response.json();
      setAiReply(formatAiReply(response.ok ? (payload.reply ?? 'AI chưa trả về kết quả.') : (payload.message ?? 'Không thể kết nối AI.')));
      setAiMode(response.ok ? String(payload.mode ?? '') : '');
      setAiSources(response.ok && Array.isArray(payload.sources) ? payload.sources : []);
    } catch (requestError) {
      setAiReply(requestError instanceof DOMException && requestError.name === 'AbortError' ? 'AI phản hồi quá lâu. Hãy thử lại.' : 'Không thể kết nối AI lúc này.');
    } finally {
      setAiLoading(false);
    }
  }

  return (
    <main className="sales-analysis-page product-analysis-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">ERP PRODUCT INTELLIGENCE</p>
          <h2>Phân tích sản phẩm {selectedGroup.label}</h2>
          <p className="page-subtitle">Theo dõi doanh thu, lượng bán và tồn kho {selectedGroup.label} trực tiếp từ ERP.</p>
        </div>
        <Link href="/customer-analysis" className="ghost-btn">Về phân tích khách hàng</Link>
      </div>

      <section className={`customer-sync-panel ${erpConnection}`} aria-live="polite">
        <div className="customer-sync-header">
          <div className="customer-erp-status">
            <span className="customer-erp-dot" aria-hidden="true" />
            <strong>{erpConnection === 'checking' ? 'Đang kiểm tra kết nối ERP' : erpConnection === 'connected' ? 'ERP đã kết nối' : 'ERP không kết nối'}</strong>
          </div>
          <span>{loading ? `${loadProgress}%` : `${groupProducts.length} sản phẩm ${selectedGroup.label} đã tải`}</span>
        </div>
        <div className="customer-load-track" role="progressbar" aria-label="Tiến trình tải dữ liệu sản phẩm" aria-valuemin={0} aria-valuemax={100} aria-valuenow={loading ? loadProgress : 100}>
          <span style={{ width: `${loading ? loadProgress : 100}%` }} />
        </div>
        <small>{loading ? (loadProgress < 30 ? 'Đang xác thực nguồn ERP...' : loadProgress < 90 ? 'Đang đồng bộ sản phẩm, doanh thu và tồn kho từ ERP...' : 'Đang hoàn tất dữ liệu sản phẩm...') : erpConnection === 'connected' ? `Dữ liệu sản phẩm ${selectedGroup.label} được đồng bộ từ ERP.` : 'Không thể đồng bộ dữ liệu sản phẩm từ ERP.'}</small>
      </section>

      <section className="product-analysis-metrics">
        <div><span>Sản phẩm ERP</span><strong>{metrics.products.toLocaleString('vi-VN')}</strong></div>
        <div><span>Tổng doanh thu</span><strong>{formatVnd(metrics.revenue)}</strong></div>
        <div><span>Sản lượng đã bán</span><strong>{formatNumber(metrics.soldQuantity)}</strong></div>
        <div><span>Cần kiểm tra tồn</span><strong>{metrics.lowStock.toLocaleString('vi-VN')}</strong></div>
      </section>

      <section className="panel product-analysis-panel">
        <div className="panel-header">
          <div><p className="eyebrow">ERP PRODUCT DATA</p><h3>Hiệu quả theo sản phẩm</h3></div>
          <span className="live-status">{visibleProducts.length} sản phẩm</span>
        </div>
        <div className="product-analysis-filters">
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm mã, tên hoặc nhóm sản phẩm..." aria-label="Tìm sản phẩm" />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Lọc nhóm sản phẩm">
            <option value="all">Tất cả nhóm</option>
            {categories.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
          <select value={sortKey} onChange={(event) => setSortKey(event.target.value as SortKey)} aria-label="Sắp xếp sản phẩm">
            <option value="revenue">Doanh thu cao nhất</option>
            <option value="soldQuantity">Bán nhiều nhất</option>
            <option value="orderCount">Nhiều đơn nhất</option>
            <option value="stock">Tồn kho cao nhất</option>
          </select>
        </div>

        {loading ? <div className="product-analysis-loading"><span className="customer-ai-spinner" /> Đang đồng bộ sản phẩm từ ERP...</div> : error ? <p className="product-analysis-error">{error}</p> : (
          <div className="table-wrap customer-analysis-table-wrap product-analysis-table-wrap">
            <table className="data-table">
              <thead><tr><th>Mã sản phẩm</th><th>Tên sản phẩm</th><th>Nhóm</th><th>Số đơn</th><th>Đã bán</th><th>Doanh thu</th><th>Tồn kho</th><th>Trạng thái</th></tr></thead>
              <tbody>{visibleProducts.map((product) => {
                const needsAttention = product.stock <= Math.max(product.reorderPoint, 0) && product.soldQuantity > 0;
                return <tr key={product.sku}>
                  <td><strong>{product.sku}</strong></td>
                  <td>{product.name}</td>
                  <td>{product.category}</td>
                  <td>{product.orderCount.toLocaleString('vi-VN')}</td>
                  <td>{formatNumber(product.soldQuantity)}</td>
                  <td><strong>{formatVnd(product.revenue)}</strong></td>
                  <td>{formatNumber(product.stock)}</td>
                  <td><span className={`product-stock-status ${needsAttention ? 'warning' : 'ok'}`}>{needsAttention ? 'Cần kiểm tra' : 'Ổn định'}</span></td>
                </tr>;
              })}</tbody>
            </table>
            {!visibleProducts.length && <p className="empty-state">Không có sản phẩm phù hợp bộ lọc.</p>}
          </div>
        )}
      </section>

      <section className="panel customer-ai-panel product-ai-panel">
        <div className="panel-header">
          <div><p className="eyebrow">AI PRODUCT ADVISOR</p><h3>Phân tích AI cho sản phẩm</h3></div>
          <span className="live-status">Đang dùng {selectedGroup.label}</span>
        </div>
        <div className="customer-ai-workspace">
          <div className="customer-ai-input-column">
            <span className="customer-ai-column-label">Yêu cầu phân tích</span>
            <div className="product-analysis-mode" role="group" aria-label="Chọn nguồn phân tích">
              <button type="button" className={analysisMode === 'erp' ? 'active' : ''} onClick={() => { setAnalysisMode('erp'); setAiReply(''); setAiSources([]); }}>Nội bộ GUSA</button>
              <button type="button" className={analysisMode === 'web+erp' ? 'active' : ''} onClick={() => { setAnalysisMode('web+erp'); setAiReply(''); setAiSources([]); }}>ERP + thị trường</button>
            </div>
            <small className="product-analysis-mode-note">{analysisMode === 'erp' ? 'AI chỉ dùng doanh thu, lượng bán và tồn kho trong ERP GUSA.' : 'AI tìm dữ liệu web mới nhất rồi đối chiếu với dữ liệu ERP GUSA.'}</small>
            <textarea ref={aiPromptRef} defaultValue="Phân tích sản phẩm bán tốt, sản phẩm bán chậm, tồn kho cần chú ý và đề xuất hành động cụ thể." placeholder="Bạn muốn AI phân tích sản phẩm như thế nào?" />
            <button className="primary-btn customer-ai-button" onClick={analyzeWithAi} disabled={aiLoading || loading || !groupProducts.length}>{aiLoading ? 'Đang phân tích...' : 'Phân tích sản phẩm'}</button>
          </div>
          <div className="customer-ai-result-column">
            <div className="product-ai-result-heading"><span className="customer-ai-column-label">Kết quả trả lời</span>{aiMode && <span className="product-ai-mode">{aiMode === 'web+erp' ? 'Web + ERP' : aiMode === 'web' ? 'Web' : aiMode === 'erp' ? 'ERP' : 'Hội thoại'}</span>}</div>
            <div className={`customer-ai-reply ${!aiReply ? 'is-empty' : ''}`}>
              {aiLoading ? <div className="customer-ai-loading" role="status" aria-live="polite"><span className="customer-ai-spinner" aria-hidden="true" /><div><strong>Đang phân tích dữ liệu sản phẩm...</strong><small>AI đang đọc doanh thu, lượng bán và tồn kho ERP.</small></div></div> : aiReply || 'Kết quả phân tích sản phẩm sẽ hiển thị ở đây.'}
            </div>
            {!!aiSources.length && <div className="product-ai-sources"><strong>Nguồn tham khảo</strong>{aiSources.map((source) => <a key={source.url} href={source.url} target="_blank" rel="noreferrer">{source.title}</a>)}</div>}
          </div>
        </div>
      </section>
    </main>
  );
}
