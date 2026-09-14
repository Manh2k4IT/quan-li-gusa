'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

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

const productGroups: Array<{ key: ProductGroupKey; label: string }> = [
  { key: 'fashion-q4', label: 'Thời trang Quận 4' },
  { key: 'fabric-ben-thanh', label: 'Vải Bến Thành' },
  { key: 'fabric-q4', label: 'Vải Quận 4' },
];

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);
const formatNumber = (value: number) => new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 2 }).format(value);

export default function ProductAnalysisPage() {
  const [products, setProducts] = useState<ProductRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('all');
  const [sortKey, setSortKey] = useState<SortKey>('revenue');
  const [activeGroup, setActiveGroup] = useState<ProductGroupKey>(() => {
    if (typeof window === 'undefined') return 'fabric-q4';
    const group = new URLSearchParams(window.location.search).get('group');
    return productGroups.some((item) => item.key === group) ? group as ProductGroupKey : 'fabric-q4';
  });

  useEffect(() => {
    fetch('/api/product-analysis', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Không thể tải dữ liệu sản phẩm.');
        setProducts(Array.isArray(payload.products) ? payload.products : []);
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu sản phẩm.'))
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    const handleGroupChange = (event: Event) => {
      const group = (event as CustomEvent<string>).detail;
      if (productGroups.some((item) => item.key === group)) {
        setActiveGroup(group as ProductGroupKey);
        setCategory('all');
      }
    };
    window.addEventListener('product-group-change', handleGroupChange);
    return () => window.removeEventListener('product-group-change', handleGroupChange);
  }, []);

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
    </main>
  );
}
