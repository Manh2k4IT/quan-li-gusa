'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import UserAvatar from '@/components/user-avatar';
import { formatDate, formatVnd } from '@/components/customer-directory-view';

type HistoryEntry = {
  id: string;
  name: string;
  code: string;
  group: string;
  saleId: string;
  saleName: string;
  periodStart: string;
  periodEnd: string;
  targetRevenue: number;
  achievedRevenue: number;
  achievedOrders: number;
  reached: boolean;
  outcome: 'completed' | 'reassigned' | 'removed';
};
type SaleRate = { saleId: string; saleName: string; total: number; reached: number };
type Payload = {
  isManager: boolean;
  sales: { id: string; name: string }[];
  months: string[];
  summary: { total: number; reached: number };
  bySale: SaleRate[];
  page: number;
  pageCount: number;
  total: number;
  entries: HistoryEntry[];
};
type Filters = { saleId: string; result: '' | 'reached' | 'missed'; month: string; q: string; page: number };

const OUTCOME_LABELS: Record<HistoryEntry['outcome'], string> = {
  completed: 'Hết kỳ',
  reassigned: 'Giao lại trước hạn',
  removed: 'Bỏ giao trước hạn',
};

const percentOf = (achieved: number, target: number) => (target > 0 ? Math.round((achieved / target) * 100) : 0);
const toneOf = (percent: number) => (percent >= 100 ? 'done' : percent >= 50 ? 'mid' : 'low');
const formatMonth = (month: string) => `Tháng ${month.slice(5, 7)}/${month.slice(0, 4)}`;

export default function CustomerHistoryView({ initialSaleId }: { initialSaleId: string }) {
  const [filters, setFilters] = useState<Filters>({ saleId: initialSaleId, result: '', month: '', q: '', page: 1 });
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<{ key: string; data?: Payload; error?: string } | null>(null);

  // Typing settles for a moment before it becomes a filter.
  useEffect(() => {
    const timer = setTimeout(() => setFilters((current) => (current.q === search.trim() ? current : { ...current, q: search.trim(), page: 1 })), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const key = JSON.stringify(filters);
  useEffect(() => {
    let cancelled = false;
    const params = new URLSearchParams(Object.entries(filters).filter(([, value]) => value !== '' && value !== 1).map(([name, value]) => [name, String(value)]));
    fetch(`/api/assignment-history?${params}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Không thể tải lịch sử.');
        if (!cancelled) setResult({ key, data: payload });
      })
      .catch((loadError) => {
        if (!cancelled) setResult((current) => ({ key, data: current?.data, error: loadError instanceof Error ? loadError.message : 'Không thể tải lịch sử.' }));
      });
    return () => {
      cancelled = true;
    };
  }, [filters, key]);

  const data = result?.data ?? null;
  const loading = result?.key !== key;
  const isManager = data?.isManager ?? false;
  const summary = data?.summary ?? { total: 0, reached: 0 };
  const missed = summary.total - summary.reached;
  const selectedSale = data?.sales.find((sale) => sale.id === filters.saleId)?.name;
  const update = (patch: Partial<Filters>) => setFilters((current) => ({ ...current, ...patch, page: patch.page ?? 1 }));

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isManager ? <Link href="/my-customers" className="cx-back">← Báo cáo giao khách</Link> : 'Chăm sóc khách hàng'}</p>
          <h1>{isManager ? (selectedSale ? `Lịch sử giao khách · ${selectedSale}` : 'Lịch sử giao khách') : 'Lịch sử chăm khách'}</h1>
          <p className="users-subtitle">Kết quả từng kỳ giao khách, tự lưu khi hết kỳ hoặc khi giao lại / bỏ giao. Tiến độ tính theo doanh thu ERP trong kỳ.</p>
        </div>
      </header>

      <section className="users-stats">
        <div className="users-stat"><span className="users-stat-icon"><Icon name="clock" size={20} /></span><div><small>Số kỳ đã kết thúc</small><strong>{summary.total}</strong></div></div>
        <div className="users-stat users-stat-emerald"><span className="users-stat-icon"><Icon name="target" size={20} /></span><div><small>Đạt mục tiêu</small><strong>{summary.reached}</strong></div></div>
        <div className="users-stat users-stat-rose"><span className="users-stat-icon"><Icon name="close" size={20} /></span><div><small>Không đạt</small><strong>{missed}</strong></div></div>
        <div className="users-stat users-stat-violet"><span className="users-stat-icon"><Icon name="chart" size={20} /></span><div><small>Tỷ lệ đạt</small><strong>{percentOf(summary.reached, summary.total)}%</strong></div></div>
      </section>

      {isManager && !filters.saleId && data && data.bySale.length > 0 ? (
        <section className="users-card cx-report-section">
          <div className="users-card-header">
            <h3>Tỷ lệ đạt theo Sale</h3>
            <span className="users-count">Bấm vào một Sale để lọc lịch sử</span>
          </div>
          <div className="users-table-scroll">
            <table className="users-table">
              <thead>
                <tr>
                  <th>Sale</th>
                  <th className="cx-num">Số kỳ</th>
                  <th className="cx-num">Đạt</th>
                  <th className="cx-num">Không đạt</th>
                  <th>Tỷ lệ đạt</th>
                </tr>
              </thead>
              <tbody>
                {data.bySale.map((sale) => {
                  const rate = percentOf(sale.reached, sale.total);
                  return (
                    <tr key={sale.saleId} className="cx-clickable" onClick={() => update({ saleId: sale.saleId })}>
                      <td><div className="users-identity"><UserAvatar name={sale.saleName} userId={sale.saleId} /><strong className="cx-sale-link">{sale.saleName} →</strong></div></td>
                      <td className="cx-num">{sale.total}</td>
                      <td className="cx-num cx-percent-done">{sale.reached}</td>
                      <td className="cx-num cx-percent-low">{sale.total - sale.reached}</td>
                      <td>
                        <div className="cx-progress-cell">
                          <div className="cx-progress"><span className={`cx-progress-${toneOf(rate)}`} style={{ width: `${rate}%` }} /></div>
                          <strong className={`cx-percent-${toneOf(rate)}`}>{rate}%</strong>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <section className="users-card cx-report-section">
        <div className="cx-toolbar">
          <input className="cx-search" type="search" placeholder="Tìm tên hoặc mã khách…" value={search} onChange={(event) => setSearch(event.target.value)} />
          {isManager ? (
            <select value={filters.saleId} onChange={(event) => update({ saleId: event.target.value })} aria-label="Lọc theo Sale">
              <option value="">Tất cả Sale</option>
              {data?.sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}
            </select>
          ) : null}
          <select value={filters.month} onChange={(event) => update({ month: event.target.value })} aria-label="Lọc theo tháng kết thúc kỳ">
            <option value="">Mọi tháng kết thúc</option>
            {data?.months.map((month) => <option key={month} value={month}>{formatMonth(month)}</option>)}
          </select>
          <div className="cx-view-toggle" role="tablist" aria-label="Lọc kết quả">
            <button type="button" className={filters.result === '' ? 'active' : ''} onClick={() => update({ result: '' })}>Tất cả ({summary.total})</button>
            <button type="button" className={filters.result === 'reached' ? 'active' : ''} onClick={() => update({ result: 'reached' })}>Đạt ({summary.reached})</button>
            <button type="button" className={filters.result === 'missed' ? 'active' : ''} onClick={() => update({ result: 'missed' })}>Không đạt ({missed})</button>
          </div>
        </div>

        {result?.error ? <div className="users-empty">{result.error}</div> : null}
        {!data && loading ? <div className="users-empty">Đang tải lịch sử…</div> : null}
        {data && data.total === 0 ? (
          <div className="users-empty">{summary.total === 0 && !filters.month && !filters.q ? 'Chưa có kỳ giao khách nào kết thúc. Kết quả sẽ tự lưu vào đây khi hết kỳ.' : 'Không có kỳ nào phù hợp bộ lọc.'}</div>
        ) : null}

        {data && data.total > 0 ? (
          <div className="users-table-scroll" style={{ opacity: loading ? 0.55 : 1 }}>
            <table className="users-table">
              <thead>
                <tr>
                  <th>Khách hàng</th>
                  {isManager && !filters.saleId ? <th>Sale</th> : null}
                  <th>Kỳ mục tiêu</th>
                  <th className="cx-num">Mục tiêu</th>
                  <th className="cx-num">Đã đạt</th>
                  <th className="cx-num">Tiến độ</th>
                  <th>Kết quả</th>
                </tr>
              </thead>
              <tbody>
                {data.entries.map((entry) => {
                  const percent = percentOf(entry.achievedRevenue, entry.targetRevenue);
                  return (
                    <tr key={entry.id}>
                      <td>
                        <div className="users-identity">
                          <span className="users-avatar">{entry.name.charAt(0).toUpperCase()}</span>
                          <div>
                            <strong>{entry.name}</strong>
                            <small>{entry.code.toUpperCase()}</small>
                            <span className="cx-group cx-group-inline">{entry.group}</span>
                            {/* Phones scroll the table sideways, so the verdict is repeated under the name. */}
                            <span className={`cx-result cx-result-inline ${entry.reached ? 'cx-result-done' : 'cx-result-miss'}`}>{entry.reached ? '✓ Đạt' : '✕ Không đạt'} · {percent}% · {formatDate(entry.periodStart)} – {formatDate(entry.periodEnd)}</span>
                          </div>
                        </div>
                      </td>
                      {isManager && !filters.saleId ? <td><span className="cx-group cx-group-sale">{entry.saleName}</span></td> : null}
                      <td className="users-date">{formatDate(entry.periodStart)} – {formatDate(entry.periodEnd)}<small className="cx-sub">{OUTCOME_LABELS[entry.outcome]}</small></td>
                      <td className="cx-num">{formatVnd(entry.targetRevenue)}</td>
                      <td className="cx-num cx-strong">{formatVnd(entry.achievedRevenue)}<small className="cx-sub">{entry.achievedOrders} đơn</small></td>
                      <td className={`cx-num cx-strong cx-percent-${toneOf(percent)}`}>{percent}%</td>
                      <td><span className={`cx-result ${entry.reached ? 'cx-result-done' : 'cx-result-miss'}`}>{entry.reached ? '✓ Đạt' : '✕ Không đạt'}</span></td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && data.pageCount > 1 ? (
          <div className="cx-pagination">
            <button type="button" className="ghost-btn users-save" disabled={data.page <= 1} onClick={() => update({ page: data.page - 1 })}>← Trước</button>
            <span>Trang {data.page} / {data.pageCount} · {data.total} kỳ</span>
            <button type="button" className="ghost-btn users-save" disabled={data.page >= data.pageCount} onClick={() => update({ page: data.page + 1 })}>Sau →</button>
          </div>
        ) : null}
      </section>
    </main>
  );
}
