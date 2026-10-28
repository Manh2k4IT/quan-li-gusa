'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon } from '@/components/icons';

type Assignment = { saleId: string; saleName: string; targetRevenue: number; periodStart: string; periodEnd: string; note: string };
type DirectoryRow = {
  key: string;
  code: string;
  name: string;
  phone: string | null;
  group: string;
  orderCount: number;
  totalSpent: number;
  avgOrderValue: number;
  lastOrderAt: string | null;
  lastMonthRevenue: number;
  assignment: Assignment | null;
};
type SaleOption = { id: string; name: string; email: string; category: string };
type DirectoryPayload = {
  customers: DirectoryRow[];
  sales: SaleOption[];
  page: number;
  lastMonthLabel: string;
  pageCount: number;
  total: number;
  summary: { totalCustomers: number; assignedCustomers: number; buyingCustomers: number };
};

const GROUPS = ['Thời trang Quận 4', 'Vải Quận 4', 'Vải Bến Thành'];

export const formatVnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;
export const formatDate = (value: string | null) => (value ? new Date(value).toLocaleDateString('vi-VN') : '—');

function currentMonthRange() {
  const now = new Date();
  const pad = (value: number) => String(value).padStart(2, '0');
  const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0).getDate();
  const prefix = `${now.getFullYear()}-${pad(now.getMonth() + 1)}`;
  return { start: `${prefix}-01`, end: `${prefix}-${pad(lastDay)}` };
}

export default function CustomerDirectoryView() {
  const [filters, setFilters] = useState({ q: '', group: '', status: '', sort: 'revenue', page: 1 });
  const [search, setSearch] = useState('');
  const [reloadToken, setReloadToken] = useState(0);
  const [result, setResult] = useState<{ requestKey: string; data?: DirectoryPayload; error?: string } | null>(null);
  const [selected, setSelected] = useState<Map<string, DirectoryRow>>(new Map());
  const [range] = useState(currentMonthRange);
  const [form, setForm] = useState({ saleId: '', targetRevenue: '', periodStart: range.start, periodEnd: range.end, note: '' });
  const [saving, setSaving] = useState(false);
  const [notice, setNotice] = useState('');

  const query = new URLSearchParams({ q: filters.q, group: filters.group, status: filters.status, sort: filters.sort, page: String(filters.page) }).toString();
  const requestKey = `${query}#${reloadToken}`;

  useEffect(() => {
    let cancelled = false;
    fetch(`/api/customer-directory?${query}`, { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Không thể tải dữ liệu.');
        if (!cancelled) setResult({ requestKey, data: payload });
      })
      .catch((loadError) => {
        if (!cancelled) setResult((current) => ({ requestKey, data: current?.data, error: loadError instanceof Error ? loadError.message : 'Không thể tải dữ liệu.' }));
      });
    return () => {
      cancelled = true;
    };
  }, [query, requestKey]);

  const data = result?.data ?? null;
  const error = result?.requestKey === requestKey ? result.error ?? '' : '';
  const loading = result?.requestKey !== requestKey;
  const load = () => setReloadToken((token) => token + 1);

  useEffect(() => {
    const timer = window.setTimeout(() => setFilters((current) => (current.q === search ? current : { ...current, q: search, page: 1 })), 350);
    return () => window.clearTimeout(timer);
  }, [search]);

  const updateFilter = (key: 'group' | 'status' | 'sort', value: string) => setFilters((current) => ({ ...current, [key]: value, page: 1 }));

  const toggle = (row: DirectoryRow) => setSelected((current) => {
    const next = new Map(current);
    if (next.has(row.key)) next.delete(row.key);
    else next.set(row.key, row);
    return next;
  });

  const pageRows = data?.customers ?? [];
  const allOnPageSelected = pageRows.length > 0 && pageRows.every((row) => selected.has(row.key));
  const togglePage = () => setSelected((current) => {
    const next = new Map(current);
    if (allOnPageSelected) pageRows.forEach((row) => next.delete(row.key));
    else pageRows.forEach((row) => next.set(row.key, row));
    return next;
  });

  const startEdit = (row: DirectoryRow) => {
    setSelected(new Map([[row.key, row]]));
    setForm({
      saleId: row.assignment?.saleId ?? '',
      targetRevenue: row.assignment ? String(row.assignment.targetRevenue) : '',
      periodStart: row.assignment?.periodStart ?? range.start,
      periodEnd: row.assignment?.periodEnd ?? range.end,
      note: row.assignment?.note ?? '',
    });
  };

  const submit = async () => {
    if (!form.saleId) {
      setNotice('Hãy chọn Sale phụ trách.');
      return;
    }
    setSaving(true);
    setNotice('');
    const response = await fetch('/api/customer-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ...form, targetRevenue: Number(form.targetRevenue) || 0, customerKeys: [...selected.keys()] }),
    });
    const payload = await response.json().catch(() => ({}));
    setSaving(false);
    if (!response.ok) {
      setNotice(payload.message ?? 'Không thể giao khách hàng.');
      return;
    }
    const saleName = data?.sales.find((sale) => sale.id === form.saleId)?.name ?? 'Sale';
    setNotice(`Đã giao ${payload.assigned} khách cho ${saleName}.`);
    setSelected(new Map());
    load();
  };

  const unassign = async (keys: string[]) => {
    if (!window.confirm(`Bỏ giao ${keys.length} khách hàng?`)) return;
    const response = await fetch('/api/customer-assignments', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ customerKeys: keys }),
    });
    if (response.ok) {
      setSelected(new Map());
      load();
    }
  };

  const summary = data?.summary;

  return (
    <main className="workspace-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Khách hàng ERP</p>
          <h1>Danh sách khách hàng</h1>
          <p className="users-subtitle">Chọn khách hàng và giao cho Sale chăm sóc, kèm mục tiêu doanh thu. Số liệu mua hàng lấy tự động từ ERP.</p>
        </div>
        <div className="topbar-actions">
          <Link href="/my-customers" className="ghost-btn">Tiến độ sale</Link>
        </div>
      </header>

      <section className="users-stats">
        <div className="users-stat"><span className="users-stat-icon"><Icon name="users" size={20} /></span><div><small>Tổng khách</small><strong>{summary ? summary.totalCustomers.toLocaleString('vi-VN') : '…'}</strong></div></div>
        <div className="users-stat users-stat-emerald"><span className="users-stat-icon"><Icon name="package" size={20} /></span><div><small>Đã từng mua</small><strong>{summary ? summary.buyingCustomers.toLocaleString('vi-VN') : '…'}</strong></div></div>
        <div className="users-stat users-stat-cyan"><span className="users-stat-icon"><Icon name="userCheck" size={20} /></span><div><small>Đã giao cho Sale</small><strong>{summary ? summary.assignedCustomers.toLocaleString('vi-VN') : '…'}</strong></div></div>
        <div className="users-stat users-stat-violet"><span className="users-stat-icon"><Icon name="target" size={20} /></span><div><small>Chưa có người chăm</small><strong>{summary ? (summary.totalCustomers - summary.assignedCustomers).toLocaleString('vi-VN') : '…'}</strong></div></div>
      </section>

      <section className="users-card">
        <div className="cx-toolbar">
          <input className="cx-search" type="search" placeholder="Tìm tên, mã khách, số điện thoại…" value={search} onChange={(event) => setSearch(event.target.value)} />
          <select value={filters.group} onChange={(event) => updateFilter('group', event.target.value)}>
            <option value="">Tất cả nhóm</option>
            {GROUPS.map((group) => <option key={group} value={group}>{group}</option>)}
          </select>
          <select value={filters.status} onChange={(event) => updateFilter('status', event.target.value)}>
            <option value="">Tất cả trạng thái</option>
            <option value="unassigned">Chưa giao</option>
            <option value="assigned">Đã giao</option>
          </select>
          <select value={filters.sort} onChange={(event) => updateFilter('sort', event.target.value)}>
            <option value="revenue">Doanh thu cao nhất</option>
            <option value="recent">Mua gần nhất</option>
            <option value="lastMonth">Mua nhiều tháng trước</option>
            <option value="orders">Nhiều đơn nhất</option>
            <option value="name">Tên A → Z</option>
          </select>
          <span className="users-count">{data ? `${data.total.toLocaleString('vi-VN')} khách` : ''}</span>
        </div>

        {error ? <div className="users-empty">{error}</div> : null}
        {!data && loading ? <div className="users-empty">Đang tải danh sách khách hàng từ ERP… Lần đầu có thể mất vài chục giây.</div> : null}

        {data ? (
          <div className="users-table-scroll" style={{ opacity: loading ? 0.55 : 1 }}>
            <table className="users-table">
              <thead>
                <tr>
                  <th className="cx-check"><input type="checkbox" checked={allOnPageSelected} onChange={togglePage} aria-label="Chọn tất cả trong trang" /></th>
                  <th>Khách hàng</th>
                  <th className="cx-num">Số đơn</th>
                  <th className="cx-num">Tổng đã mua</th>
                  <th className="cx-num">Tháng trước{data.lastMonthLabel ? ` (${data.lastMonthLabel})` : ''}</th>
                  <th>Mua gần nhất</th>
                  <th>Sale phụ trách</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {pageRows.length === 0 ? (
                  <tr><td colSpan={8} className="cx-empty-row">Không có khách hàng phù hợp bộ lọc.</td></tr>
                ) : pageRows.map((row) => (
                  <tr key={row.key} className={selected.has(row.key) ? 'cx-row-selected' : undefined}>
                    <td className="cx-check"><input type="checkbox" checked={selected.has(row.key)} onChange={() => toggle(row)} aria-label={`Chọn ${row.name}`} /></td>
                    <td>
                      <div className="users-identity">
                        <span className="users-avatar">{row.name.charAt(0).toUpperCase()}</span>
                        <div>
                          <strong>{row.name}</strong>
                          <small>{row.code.toUpperCase()}{row.phone ? ` · ${row.phone}` : ''}</small>
                          <span className="cx-group cx-group-inline">{row.group}</span>
                        </div>
                      </div>
                    </td>
                    <td className="cx-num">{row.orderCount}</td>
                    <td className="cx-num cx-strong">{formatVnd(row.totalSpent)}</td>
                    <td className={`cx-num ${row.lastMonthRevenue > 0 ? 'cx-last-month' : 'cx-muted'}`}>{row.lastMonthRevenue > 0 ? formatVnd(row.lastMonthRevenue) : '—'}</td>
                    <td className="users-date">{formatDate(row.lastOrderAt)}</td>
                    <td>
                      {row.assignment ? (
                        <div className="cx-assignee">
                          <strong>{row.assignment.saleName}</strong>
                          <small>Mục tiêu {formatVnd(row.assignment.targetRevenue)}</small>
                        </div>
                      ) : <span className="cx-unassigned">Chưa giao</span>}
                    </td>
                    <td>
                      <div className="cx-row-actions">
                        <button type="button" className="ghost-btn users-save" onClick={() => startEdit(row)}>{row.assignment ? 'Sửa' : 'Giao'}</button>
                        {row.assignment ? (
                          <button type="button" className="users-delete" onClick={() => unassign([row.key])} aria-label={`Bỏ giao ${row.name}`}><Icon name="trash" size={16} /></button>
                        ) : null}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}

        {data && data.pageCount > 1 ? (
          <div className="cx-pagination">
            <button type="button" className="ghost-btn users-save" disabled={filters.page <= 1} onClick={() => setFilters((current) => ({ ...current, page: current.page - 1 }))}>← Trước</button>
            <span>Trang {data.page} / {data.pageCount}</span>
            <button type="button" className="ghost-btn users-save" disabled={filters.page >= data.pageCount} onClick={() => setFilters((current) => ({ ...current, page: current.page + 1 }))}>Sau →</button>
          </div>
        ) : null}
      </section>

      {selected.size > 0 ? (
        <section className="cx-assign-bar">
          <div className="cx-assign-head">
            <strong>Giao {selected.size} khách hàng</strong>
            <button type="button" className="cx-link" onClick={() => setSelected(new Map())}>Bỏ chọn</button>
          </div>
          <div className="cx-assign-fields">
            <label>
              Sale phụ trách
              <select value={form.saleId} onChange={(event) => setForm({ ...form, saleId: event.target.value })}>
                <option value="">— Chọn Sale —</option>
                {data?.sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}{sale.category && sale.category !== 'Chưa phân loại' ? ` · ${sale.category}` : ''}</option>)}
              </select>
            </label>
            <label>
              Mục tiêu doanh thu / khách (VNĐ)
              <input type="number" min={0} step={100000} placeholder="VD: 50000000" value={form.targetRevenue} onChange={(event) => setForm({ ...form, targetRevenue: event.target.value })} />
            </label>
            <label>
              Từ ngày
              <input type="date" value={form.periodStart} onChange={(event) => setForm({ ...form, periodStart: event.target.value })} />
            </label>
            <label>
              Đến ngày
              <input type="date" value={form.periodEnd} onChange={(event) => setForm({ ...form, periodEnd: event.target.value })} />
            </label>
            <label className="cx-note">
              Ghi chú cho Sale
              <input type="text" placeholder="VD: Ưu tiên chào bộ sưu tập mới" value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} />
            </label>
            <button type="button" className="primary-btn" disabled={saving} onClick={submit}>{saving ? 'Đang giao…' : 'Giao khách'}</button>
          </div>
          {notice ? <p className="cx-notice">{notice}</p> : null}
        </section>
      ) : notice ? <p className="cx-notice cx-notice-floating">{notice}</p> : null}
    </main>
  );
}
