'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';
import UserAvatar from '@/components/user-avatar';
import { formatDate, formatVnd } from '@/components/customer-directory-view';

type AssignedCustomer = {
  key: string;
  name: string;
  code: string;
  phone: string | null;
  group: string;
  saleId: string;
  saleName: string;
  note: string;
  assignedAt: string;
  assignedByName: string;
  periodStart: string;
  periodEnd: string;
  targetRevenue: number;
  achievedRevenue: number;
  achievedOrders: number;
  previousPeriodRevenue: number;
  lastMonthRevenue: number;
  history: {
    spentBeforePeriod: number;
    ordersBeforePeriod: number;
    lifetimeSpent: number;
    lifetimeOrders: number;
    avgOrderValue: number;
    firstOrderAt: string | null;
    lastOrderAt: string | null;
  };
  recentOrders: { id: string; date: string | null; total: number; status: string }[];
  foundInErp: boolean;
};
type Payload = { customers: AssignedCustomer[]; sales: { id: string; name: string }[]; isManager: boolean; lastMonthLabel: string };
type SaleSummary = { saleId: string; saleName: string; customers: number; target: number; achieved: number; lastMonth: number; reached: number };

const formatPeriod = (start: string, end: string) => `${formatDate(start)} – ${formatDate(end)}`;
const percentOf = (achieved: number, target: number) => (target > 0 ? Math.round((achieved / target) * 100) : 0);
const toneOf = (percent: number) => (percent >= 100 ? 'done' : percent >= 50 ? 'mid' : 'low');

function daysAgo(value: string | null) {
  if (!value) return null;
  return Math.max(0, Math.floor((Date.now() - new Date(value).getTime()) / 86_400_000));
}

function summarizeBySale(customers: AssignedCustomer[]) {
  const bySale = new Map<string, SaleSummary>();
  for (const customer of customers) {
    const entry = bySale.get(customer.saleId) ?? { saleId: customer.saleId, saleName: customer.saleName, customers: 0, target: 0, achieved: 0, lastMonth: 0, reached: 0 };
    entry.customers += 1;
    entry.target += customer.targetRevenue;
    entry.achieved += customer.achievedRevenue;
    entry.lastMonth += customer.lastMonthRevenue;
    if (customer.targetRevenue > 0 && customer.achievedRevenue >= customer.targetRevenue) entry.reached += 1;
    bySale.set(customer.saleId, entry);
  }
  return [...bySale.values()].sort((first, second) => percentOf(second.achieved, second.target) - percentOf(first.achieved, first.target));
}

function exportCsv(customers: AssignedCustomer[], lastMonthLabel: string) {
  const header = ['Sale', 'Khách hàng', 'Mã khách', 'Nhóm', 'Từ ngày', 'Đến ngày', 'Mục tiêu', 'Đã đạt', '% hoàn thành', `Tháng trước (${lastMonthLabel})`, 'Mua gần nhất', 'Người giao', 'Ngày giao', 'Ghi chú'];
  const rows = customers.map((customer) => [
    customer.saleName,
    customer.name,
    customer.code.toUpperCase(),
    customer.group,
    customer.periodStart,
    customer.periodEnd,
    Math.round(customer.targetRevenue),
    Math.round(customer.achievedRevenue),
    percentOf(customer.achievedRevenue, customer.targetRevenue),
    Math.round(customer.lastMonthRevenue),
    customer.history.lastOrderAt ? customer.history.lastOrderAt.slice(0, 10) : '',
    customer.assignedByName,
    customer.assignedAt.slice(0, 10),
    customer.note,
  ]);
  const escape = (value: unknown) => `"${String(value).replaceAll('"', '""')}"`;
  const csv = [header, ...rows].map((row) => row.map(escape).join(',')).join('\r\n');
  const url = URL.createObjectURL(new Blob([`﻿${csv}`], { type: 'text/csv;charset=utf-8' }));
  const link = document.createElement('a');
  link.href = url;
  link.download = `bao-cao-giao-khach-${new Date().toISOString().slice(0, 10)}.csv`;
  link.click();
  URL.revokeObjectURL(url);
}

function DetailTable({ customers, showSale = false }: { customers: AssignedCustomer[]; showSale?: boolean }) {
  return (
    <div className="users-table-scroll">
      <table className="users-table">
        <thead>
          <tr>
            <th>Khách hàng</th>
            {showSale ? <th>Sale</th> : null}
            <th className="cx-num">Mục tiêu</th>
            <th className="cx-num">Đã đạt</th>
            <th>Tiến độ</th>
            <th className="cx-num">Tháng trước</th>
            <th>Mua gần nhất</th>
          </tr>
        </thead>
        <tbody>
          {customers.map((customer) => {
            const percent = percentOf(customer.achievedRevenue, customer.targetRevenue);
            const lastDays = daysAgo(customer.history.lastOrderAt);
            return (
              <tr key={customer.key}>
                <td>
                  <div className="users-identity">
                    <span className="users-avatar">{customer.name.charAt(0).toUpperCase()}</span>
                    <div>
                      <strong>{customer.name}</strong>
                      <small>{customer.code.toUpperCase()}{!showSale && customer.phone ? ` · ${customer.phone}` : ''}</small>
                      <span className="cx-group cx-group-inline">{customer.group}</span>
                    </div>
                  </div>
                </td>
                {showSale ? (
                  <td>
                    <span className="cx-group cx-group-sale">{customer.saleName}</span>
                    <small className="cx-sub">Giao bởi {customer.assignedByName} · {formatDate(customer.assignedAt)}</small>
                  </td>
                ) : null}
                <td className="cx-num">{formatVnd(customer.targetRevenue)}<small className="cx-sub">{formatPeriod(customer.periodStart, customer.periodEnd)}</small></td>
                <td className="cx-num cx-strong">{formatVnd(customer.achievedRevenue)}<small className="cx-sub">{customer.achievedOrders} đơn</small></td>
                <td>
                  <div className="cx-progress-cell">
                    <div className="cx-progress"><span className={`cx-progress-${toneOf(percent)}`} style={{ width: `${Math.min(100, percent)}%` }} /></div>
                    <strong className={`cx-percent-${toneOf(percent)}`}>{percent}%</strong>
                  </div>
                </td>
                <td className={`cx-num ${customer.lastMonthRevenue > 0 ? 'cx-last-month' : 'cx-muted'}`}>{customer.lastMonthRevenue > 0 ? formatVnd(customer.lastMonthRevenue) : '—'}</td>
                <td className="users-date">{formatDate(customer.history.lastOrderAt)}{lastDays !== null ? <small className="cx-sub">{lastDays} ngày trước</small> : null}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function MyCustomersView({ saleId }: { saleId?: string }) {
  const router = useRouter();
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{ token: number; data?: Payload; error?: string } | null>(null);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [saleView, setSaleView] = useState<'table' | 'cards'>('table');

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/my-customers${saleId ? `?saleId=${encodeURIComponent(saleId)}` : ''}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Không thể tải dữ liệu.');
        if (!cancelled) setResult({ token: reloadToken, data: payload });
      })
      .catch((loadError) => {
        if (!cancelled) setResult((current) => ({ token: reloadToken, data: current?.data, error: loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu.' }));
      });
    return () => {
      cancelled = true;
    };
  }, [reloadToken, saleId]);

  const data = result?.data ?? null;
  const loading = result?.token !== reloadToken;
  const error = !loading ? result?.error ?? '' : '';
  const isManager = data?.isManager ?? false;
  const lastMonthLabel = data?.lastMonthLabel ?? '';
  const allCustomers = data?.customers ?? [];
  const customers = allCustomers;
  const saleSummaries = summarizeBySale(allCustomers);
  // Manager drill-down page for one Sale.
  const isSalePage = isManager && Boolean(saleId);
  const saleName = data?.sales.find((sale) => sale.id === saleId)?.name ?? customers[0]?.saleName ?? 'Sale';

  const totalTarget = customers.reduce((sum, customer) => sum + customer.targetRevenue, 0);
  const totalAchieved = customers.reduce((sum, customer) => sum + customer.achievedRevenue, 0);
  const totalLastMonth = customers.reduce((sum, customer) => sum + customer.lastMonthRevenue, 0);
  const reached = customers.filter((customer) => customer.targetRevenue > 0 && customer.achievedRevenue >= customer.targetRevenue).length;
  const overallPercent = percentOf(totalAchieved, totalTarget);

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isSalePage ? <Link href="/my-customers" className="cx-back">← Báo cáo giao khách</Link> : isManager ? 'Báo cáo giao khách' : 'Chăm sóc khách hàng'}</p>
          <h1>{isSalePage ? `Khách đã giao cho ${saleName}` : isManager ? 'Báo cáo khách đã giao cho Sale' : 'Khách hàng của tôi'}</h1>
          <p className="users-subtitle">
            {isSalePage
              ? `Danh sách khách ${saleName} đang chăm sóc, mục tiêu và doanh thu đạt được từ ERP.`
              : isManager
              ? 'Bấm vào một Sale để xem danh sách khách được giao. Doanh thu đạt được tự động lấy từ ERP.'
              : 'Mục tiêu do quản lý đặt ra cho từng khách. Doanh thu đạt được và lịch sử mua tự động lấy từ ERP.'}
          </p>
        </div>
        <div className="topbar-actions">
          {isManager ? (
            <>
              <Link href={isSalePage ? `/customer-history?saleId=${encodeURIComponent(saleId ?? '')}` : '/customer-history'} className="ghost-btn">Lịch sử kết quả</Link>
              <button type="button" className="ghost-btn" disabled={!customers.length} onClick={() => exportCsv(customers, lastMonthLabel)}>Xuất Excel</button>
              <Link href="/customers" className="primary-btn">Giao thêm khách</Link>
            </>
          ) : null}
          <button type="button" className="ghost-btn" onClick={() => setReloadToken((token) => token + 1)} disabled={loading}>{loading ? 'Đang tải…' : 'Làm mới'}</button>
        </div>
      </header>

      <section className="users-stats">
        <div className="users-stat"><span className="users-stat-icon"><Icon name="users" size={20} /></span><div><small>Khách được giao</small><strong>{customers.length}</strong></div></div>
        <div className="users-stat users-stat-violet"><span className="users-stat-icon"><Icon name="target" size={20} /></span><div><small>Tổng mục tiêu</small><strong className="cx-stat-money">{formatVnd(totalTarget)}</strong></div></div>
        <div className="users-stat users-stat-emerald"><span className="users-stat-icon"><Icon name="chart" size={20} /></span><div><small>Đã đạt ({overallPercent}%)</small><strong className="cx-stat-money">{formatVnd(totalAchieved)}</strong></div></div>
        {isManager ? (
          <div className="users-stat users-stat-cyan"><span className="users-stat-icon"><Icon name="calendar" size={20} /></span><div><small>Tháng trước ({lastMonthLabel})</small><strong className="cx-stat-money">{formatVnd(totalLastMonth)}</strong></div></div>
        ) : (
          <div className="users-stat users-stat-cyan"><span className="users-stat-icon"><Icon name="userCheck" size={20} /></span><div><small>Khách đạt mục tiêu</small><strong>{reached} / {customers.length}</strong></div></div>
        )}
      </section>

      {error ? <div className="users-empty">{error}</div> : null}
      {!data && loading ? <div className="users-empty">Đang tải dữ liệu khách hàng từ ERP…</div> : null}
      {data && allCustomers.length === 0 ? (
        <div className="users-empty">{isSalePage ? `${saleName} chưa được giao khách nào.` : isManager ? 'Chưa có khách hàng nào được giao. Vào "Danh sách khách hàng" để giao khách cho Sale.' : 'Bạn chưa được giao khách hàng nào.'}</div>
      ) : null}

      {isManager && !isSalePage && allCustomers.length > 0 ? (
        <>
          <section className="users-card cx-report-section">
            <div className="users-card-header">
              <h3>Tổng hợp theo Sale</h3>
              <span className="users-count">Bấm vào một Sale để mở danh sách khách</span>
            </div>
            <div className="users-table-scroll">
              <table className="users-table">
                <thead>
                  <tr>
                    <th>Sale</th>
                    <th className="cx-num">Số khách</th>
                    <th className="cx-num">Tổng mục tiêu</th>
                    <th className="cx-num">Đã đạt</th>
                    <th>Tiến độ</th>
                    <th className="cx-num">Tháng trước ({lastMonthLabel})</th>
                    <th className="cx-num">Khách đạt MT</th>
                  </tr>
                </thead>
                <tbody>
                  {saleSummaries.map((sale) => {
                    const percent = percentOf(sale.achieved, sale.target);
                    const href = `/my-customers/${sale.saleId}`;
                    return (
                      <tr key={sale.saleId} className="cx-clickable" onClick={() => router.push(href)}>
                        <td>
                          <div className="users-identity">
                            <UserAvatar name={sale.saleName} userId={sale.saleId} />
                            <Link href={href} className="cx-sale-link" onClick={(event) => event.stopPropagation()}>{sale.saleName} →</Link>
                          </div>
                        </td>
                        <td className="cx-num">{sale.customers}</td>
                        <td className="cx-num">{formatVnd(sale.target)}</td>
                        <td className="cx-num cx-strong">{formatVnd(sale.achieved)}</td>
                        <td>
                          <div className="cx-progress-cell">
                            <div className="cx-progress"><span className={`cx-progress-${toneOf(percent)}`} style={{ width: `${Math.min(100, percent)}%` }} /></div>
                            <strong className={`cx-percent-${toneOf(percent)}`}>{percent}%</strong>
                          </div>
                        </td>
                        <td className="cx-num cx-last-month">{formatVnd(sale.lastMonth)}</td>
                        <td className="cx-num">{sale.reached} / {sale.customers}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>

        </>
      ) : null}

      {isSalePage && customers.length > 0 ? (
        <section className="users-card cx-report-section">
          <div className="users-card-header">
            <h3>Danh sách khách được giao</h3>
            <span className="users-count">{customers.length} khách</span>
          </div>
          <DetailTable customers={customers} />
        </section>
      ) : null}

      {!isManager && customers.length > 0 ? (
        <section className="users-card cx-report-section">
          <div className="users-card-header">
            <h3>Chi tiết khách được giao</h3>
            <div className="cx-view-toggle" role="tablist" aria-label="Kiểu hiển thị">
              <button type="button" className={saleView === 'table' ? 'active' : ''} onClick={() => setSaleView('table')}>Dạng bảng</button>
              <button type="button" className={saleView === 'cards' ? 'active' : ''} onClick={() => setSaleView('cards')}>Dạng thẻ</button>
            </div>
          </div>
          {saleView === 'table' ? <DetailTable customers={customers} /> : null}
        </section>
      ) : null}

      {!isManager && saleView === 'cards' ? (
        <div className="cx-cards">
          {customers.map((customer) => {
            const percent = percentOf(customer.achievedRevenue, customer.targetRevenue);
            const remaining = Math.max(0, customer.targetRevenue - customer.achievedRevenue);
            const tone = toneOf(percent);
            const lastDays = daysAgo(customer.history.lastOrderAt);
            const isOpen = expanded === customer.key;

            return (
              <article key={customer.key} className="cx-card">
                <div className="cx-card-head">
                  <div className="users-identity">
                    <span className="users-avatar">{customer.name.charAt(0).toUpperCase()}</span>
                    <div>
                      <strong>{customer.name}</strong>
                      <small>{customer.code.toUpperCase()}{customer.phone ? ` · ${customer.phone}` : ''}</small>
                    </div>
                  </div>
                  <div className="cx-card-tags">
                    <span className="cx-group">{customer.group}</span>
                  </div>
                </div>

                <div className="cx-target">
                  <div className="cx-target-row">
                    <span>Mục tiêu <small>{formatPeriod(customer.periodStart, customer.periodEnd)}</small></span>
                    <strong className={`cx-percent cx-percent-${tone}`}>{percent}%</strong>
                  </div>
                  <div className="cx-progress"><span className={`cx-progress-${tone}`} style={{ width: `${Math.min(100, percent)}%` }} /></div>
                  <div className="cx-target-row cx-target-numbers">
                    <span>Đã đạt <strong>{formatVnd(customer.achievedRevenue)}</strong> · {customer.achievedOrders} đơn</span>
                    <span>/ {formatVnd(customer.targetRevenue)}</span>
                  </div>
                  <small className="cx-remaining">{remaining > 0 ? `Còn thiếu ${formatVnd(remaining)}` : customer.targetRevenue > 0 ? 'Đã đạt mục tiêu 🎉' : 'Chưa đặt mục tiêu doanh thu'}</small>
                </div>

                <dl className="cx-history">
                  <div><dt>Đã mua trước kỳ</dt><dd>{formatVnd(customer.history.spentBeforePeriod)}</dd></div>
                  <div><dt>Số đơn trước kỳ</dt><dd>{customer.history.ordersBeforePeriod}</dd></div>
                  <div><dt>Tháng trước ({lastMonthLabel})</dt><dd className="cx-last-month">{formatVnd(customer.lastMonthRevenue)}</dd></div>
                  <div><dt>Giá trị TB / đơn</dt><dd>{formatVnd(customer.history.avgOrderValue)}</dd></div>
                  <div><dt>Mua gần nhất</dt><dd>{formatDate(customer.history.lastOrderAt)}{lastDays !== null ? <small> · {lastDays} ngày trước</small> : null}</dd></div>
                  <div><dt>Tổng từ trước tới nay</dt><dd>{formatVnd(customer.history.lifetimeSpent)}</dd></div>
                </dl>

                {customer.note ? <p className="cx-card-note"><Icon name="message" size={14} /> {customer.note}</p> : null}
                {!customer.foundInErp ? <p className="cx-card-note cx-card-warning">Không tìm thấy khách này trên ERP.</p> : null}

                {customer.recentOrders.length ? (
                  <div className="cx-orders">
                    <button type="button" className="cx-link" onClick={() => setExpanded(isOpen ? null : customer.key)}>
                      {isOpen ? 'Ẩn đơn gần đây' : `Xem ${customer.recentOrders.length} đơn gần đây`}
                    </button>
                    {isOpen ? (
                      <ul>
                        {customer.recentOrders.map((order) => (
                          <li key={order.id}>
                            <span>{formatDate(order.date)}</span>
                            <span className="cx-order-id">{order.id}</span>
                            <span className="cx-order-status">{order.status}</span>
                            <strong>{formatVnd(order.total)}</strong>
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      ) : null}

    </main>
  );
}
