'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type SalesItem = {
  id: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitPrice: number;
  revenue: number;
};

type SalesReport = {
  id: string;
  date: string;
  orderCode: string;
  category: 'Vải Bến Thành' | 'Vải Quận 4' | 'Thời trang Quận 4';
  team: 'Thời trang' | 'Vải';
  salesperson: string;
  paymentMethod: string;
  orderStatus: string;
  target: number;
  note: string;
  items: SalesItem[];
  revenue: number;
};

const storageKey = 'gusa-sales-reports';
const emptyForm = {
  date: new Date().toISOString().slice(0, 10),
  category: 'Thời trang Quận 4' as SalesReport['category'],
  salesperson: '',
  revenue: '',
  note: '',
};

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value);

const normalizeLegacyReport = (item: Partial<SalesReport> & { productCode?: string; productName?: string; quantity?: number | string; unitPrice?: number | string; revenue?: number }): SalesReport => {
  const legacyItems = Array.isArray(item.items) && item.items.length
    ? item.items
    : [{
        id: crypto.randomUUID(),
        productCode: String(item.productCode ?? 'Chưa nhập'),
        productName: String(item.productName ?? 'Chưa nhập tên sản phẩm'),
        quantity: Number(item.quantity ?? 0),
        unitPrice: Number(item.unitPrice ?? 0),
        revenue: Number(item.revenue ?? ((Number(item.quantity ?? 0) || 0) * (Number(item.unitPrice ?? 0) || 0))),
      }];

  const normalizedItems = legacyItems.map((entry) => ({
    id: String(entry.id ?? crypto.randomUUID()),
    productCode: String(entry.productCode ?? 'Chưa nhập'),
    productName: String(entry.productName ?? 'Chưa nhập tên sản phẩm'),
    quantity: Number(entry.quantity ?? 0),
    unitPrice: Number(entry.unitPrice ?? 0),
    revenue: Number(entry.revenue ?? ((Number(entry.quantity ?? 0) || 0) * (Number(entry.unitPrice ?? 0) || 0))),
  }));

  const totalRevenue = Number(item.revenue ?? normalizedItems.reduce((sum, entry) => sum + entry.revenue, 0));

  return {
    id: String(item.id ?? crypto.randomUUID()),
    date: String(item.date ?? new Date().toISOString().slice(0, 10)),
    orderCode: String(item.orderCode ?? `CHUA-NHAP-${Date.now()}`),
    category: (item.category as SalesReport['category']) ?? 'Thời trang Quận 4',
    team: (item.team as SalesReport['team']) ?? ((item.category === 'Thời trang Quận 4') ? 'Thời trang' : 'Vải'),
    salesperson: String(item.salesperson ?? 'Chưa ghi tên'),
    paymentMethod: String(item.paymentMethod ?? 'Chuyển khoản'),
    orderStatus: String(item.orderStatus ?? 'Đang xử lý'),
    target: Number(item.target ?? 0),
    note: String(item.note ?? ''),
    items: normalizedItems,
    revenue: totalRevenue,
  };
};

export default function SalesReportsPage() {
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [sessionUser, setSessionUser] = useState<{ name?: string; email?: string; role?: string; category?: string } | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [period, setPeriod] = useState<'day' | 'week' | 'month'>('day');
  const [saved, setSaved] = useState(false);
  const [managerTarget, setManagerTarget] = useState(0);

  const accountCategory = sessionUser?.category === 'Kho vải Quận 4' ? 'Vải Quận 4' : sessionUser?.category === 'Kho vải Bến Thành' ? 'Vải Bến Thành' : sessionUser?.category === 'Thời trang Quận 4' ? 'Thời trang Quận 4' : null;

  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.ok ? response.json() : { user: null })
      .then((payload) => {
        const user = payload.user ?? null;
        setSessionUser(user);
        if (user?.role === 'SALE') {
          setForm((current) => ({ ...current, salesperson: user.name ?? user.email ?? '', category: (user.category === 'Kho vải Quận 4' ? 'Vải Quận 4' : user.category === 'Kho vải Bến Thành' ? 'Vải Bến Thành' : 'Thời trang Quận 4') as SalesReport['category'] }));
        }
      })
      .catch(() => setSessionUser(null));
  }, []);

  useEffect(() => {
    const loadTarget = () => fetch('/api/sales-targets')
      .then(async (response) => response.ok ? response.json() : { targets: [] })
      .then((payload) => {
        const target = (payload.targets ?? []).find((item: { category: string }) => item.category === form.category);
        setManagerTarget(Number(target?.amount ?? 0));
      })
      .catch(() => setManagerTarget(0));
    loadTarget();
    const timer = window.setInterval(loadTarget, 3000);
    return () => window.clearInterval(timer);
  }, [form.category]);

  useEffect(() => {
    fetch('/api/sales-reports')
      .then(async (response) => {
        if (!response.ok) throw new Error('Không thể tải báo cáo');
        const payload = await response.json();
        const remoteReports: SalesReport[] = Array.isArray(payload.reports) ? payload.reports.map(normalizeLegacyReport) : [];
        setReports(remoteReports);
        window.localStorage.setItem(storageKey, JSON.stringify(remoteReports));
      })
      .catch(() => {
        try {
          const stored = window.localStorage.getItem(storageKey);
          const parsed = stored ? JSON.parse(stored) : [];
          setReports(Array.isArray(parsed) ? parsed.map(normalizeLegacyReport) : []);
        } catch {
          setReports([]);
        }
      });
  }, []);

  const visibleReports = useMemo(() => {
    const now = new Date(`${form.date}T12:00:00`);
    return reports.filter((report) => {
      const isOwnSaleReport = sessionUser?.role !== 'SALE' || report.salesperson === sessionUser.name || report.salesperson === sessionUser.email;
      const isOwnCategory = !accountCategory || report.category === accountCategory;
      if (!isOwnSaleReport || !isOwnCategory) return false;
      const date = new Date(`${report.date}T12:00:00`);
      if (period === 'day') return report.date === form.date;
      if (period === 'month') return date.getFullYear() === now.getFullYear() && date.getMonth() === now.getMonth();
      const start = new Date(now);
      const day = start.getDay() || 7;
      start.setDate(start.getDate() - day + 1);
      const end = new Date(start);
      end.setDate(end.getDate() + 6);
      return date >= start && date <= end;
    });
  }, [accountCategory, form.date, period, reports, sessionUser]);

  const totals = useMemo(() => visibleReports.reduce((result, report) => ({
    revenue: result.revenue + report.revenue,
    reports: result.reports + 1,
    target: result.target,
  }), { revenue: 0, reports: 0, target: managerTarget }), [managerTarget, visibleReports]);

  const completion = totals.target ? Math.round((totals.revenue / totals.target) * 100) : 0;

  const memberPerformance = useMemo(() => {
    const members = new Map<string, { name: string; revenue: number; reports: number }>();
    for (const report of visibleReports) {
      const current = members.get(report.salesperson) ?? { name: report.salesperson, revenue: 0, reports: 0 };
      current.revenue += report.revenue;
      current.reports += 1;
      members.set(report.salesperson, current);
    }
    return [...members.values()].sort((left, right) => right.revenue - left.revenue);
  }, [visibleReports]);

  const chartMaxRevenue = Math.max(memberPerformance[0]?.revenue ?? 0, 1);

  const updateForm = (field: keyof typeof emptyForm, value: string) => {
    setForm((current) => ({ ...current, [field]: value }));
    setSaved(false);
  };

  const saveReport = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const dailyRevenue = Number(form.revenue) || 0;
    if (dailyRevenue <= 0) return;

    const nextReport: SalesReport = {
      id: crypto.randomUUID(),
      date: form.date,
      orderCode: `BAO-CAO-NGAY-${form.date}-${Date.now()}`,
      category: form.category,
      team: form.category === 'Thời trang Quận 4' ? 'Thời trang' : 'Vải',
      salesperson: form.salesperson.trim() || 'Chưa ghi tên',
      paymentMethod: 'Tổng hợp ngày',
      orderStatus: 'Đã báo cáo',
      target: 0,
      note: form.note.trim(),
      items: [],
      revenue: dailyRevenue,
    };

    const response = await fetch('/api/sales-reports', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(nextReport),
    });
    if (!response.ok) {
      setSaved(false);
      const payload = await response.json().catch(() => ({ message: 'Không thể lưu báo cáo lên hệ thống.' }));
      window.alert(payload.message ?? 'Không thể lưu báo cáo lên hệ thống.');
      return;
    }

    const payload = await response.json().catch(() => null) as { report?: Partial<SalesReport> } | null;
    const savedReport = payload?.report ? normalizeLegacyReport(payload.report) : nextReport;
    const nextReports = [savedReport, ...reports.filter((report) => report.id !== savedReport.id)];
    setReports(nextReports);
    window.localStorage.setItem(storageKey, JSON.stringify(nextReports));
    window.dispatchEvent(new Event('gusa-sales-report-sync'));
    setForm({ ...emptyForm, date: form.date, category: form.category });
    setSaved(true);
  };

  return (
    <section className="content">
      <header className="topbar">
        <div>
          <p className="eyebrow">Sales performance</p>
          <h2>Báo cáo Sale nhập</h2>
        </div>

        <div className="topbar-actions">
          <span className="status-badge status-connected">Sale nhập thủ công</span>
          <Link href="/sales-reports" className="ghost-btn">Refresh</Link>
        </div>
      </header>

      <div className="sales-dashboard-layout">
        <div className="sales-report-main">
          <div className="comparison-toolbar">
            <label>Ngày xem<input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} /></label>
            <label>Khoảng báo cáo<select value={period} onChange={(event) => setPeriod(event.target.value as typeof period)}><option value="day">Báo cáo ngày</option><option value="week">Báo cáo tuần</option><option value="month">Báo cáo tháng</option></select></label>
          </div>

          <div className="stats-row" style={{ gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', width: '100%', marginBottom: '20px' }}>
            <div className="metric-card"><span>Doanh thu thực tế</span><strong>{formatVnd(totals.revenue)}</strong><small>{completion}% kế hoạch</small></div>
            <div className="metric-card"><span>Số báo cáo ngày</span><strong>{totals.reports.toLocaleString('vi-VN')}</strong><small>Theo khoảng đang xem</small></div>
            <div className="metric-card"><span>Trung bình / báo cáo</span><strong>{formatVnd(totals.reports ? totals.revenue / totals.reports : 0)}</strong><small>Doanh thu bình quân</small></div>
          </div>

          <div className="sales-entry-layout" id="report-form">
            <section className="panel">
              <div className="panel-header"><div><p className="eyebrow">Input</p><h3>Nhập báo cáo Sale</h3></div></div>
              <form className="sales-report-form" onSubmit={saveReport}>
                <label>Ngày báo cáo<input type="date" value={form.date} onChange={(event) => updateForm('date', event.target.value)} required /></label>
                <label>Phân loại<select value={form.category} disabled={sessionUser?.role === 'SALE'} onChange={(event) => updateForm('category', event.target.value)}><option>Vải Bến Thành</option><option>Vải Quận 4</option><option>Thời trang Quận 4</option></select></label>
                <label>Nhân viên Sale<input value={form.salesperson} readOnly={sessionUser?.role === 'SALE'} onChange={(event) => updateForm('salesperson', event.target.value)} placeholder="Tên nhân viên" /></label>
                <label>Doanh thu trong ngày<input type="number" min="1" value={form.revenue} onChange={(event) => updateForm('revenue', event.target.value)} placeholder="Nhập tổng doanh thu (VNĐ)" required /></label>
                <label>Ghi chú<textarea value={form.note} onChange={(event) => updateForm('note', event.target.value)} placeholder="Tình hình, lý do thiếu/vượt kế hoạch" rows={3} /></label>

                <button type="submit" className="primary-btn" style={{ gridColumn: '1 / -1' }}>Lưu báo cáo</button>
                {saved && <span className="text-up" style={{ gridColumn: '1 / -1' }}>Đã lưu báo cáo trên thiết bị này.</span>}
              </form>
            </section>
          </div>

          <div className="bottom-grid sales-report-layout" id="report-list">
            <section className="panel sales-report-list-panel">
              <div className="panel-header"><div><p className="eyebrow">Actual vs target</p><h3>Danh sách báo cáo</h3></div><span className={`badge ${completion >= 100 ? 'success' : 'neutral'}`}>{completion}%</span></div>
              <div className="recommendation-list">
                {!visibleReports.length && <p className="comparison-loading">Chưa có báo cáo trong khoảng thời gian này.</p>}
                {visibleReports.map((report) => (
                  <div className="recommendation-card" key={report.id}>
                    <div className="chat-avatar">{report.team === 'Vải' ? 'V' : 'T'}</div>
                    <div>
                      <strong>{report.date} · {report.category}</strong>
                      <p style={{ marginTop: '8px' }}>
                        Doanh thu ngày: <strong>{formatVnd(report.revenue)}</strong>
                      </p>
                      <small>Sale: {report.salesperson}{report.note ? ` · ${report.note}` : ''}</small>
                    </div>
                  </div>
                ))}
              </div>
            </section>
          </div>
        </div>

        <aside className="sales-insight-sidebar">
          <section className="panel sales-member-chart">
            <div className="panel-header"><div><p className="eyebrow">Sales leaderboard</p><h3>Doanh thu theo thành viên</h3></div><span className="badge success">{memberPerformance.length} người</span></div>
            {!memberPerformance.length ? <p className="comparison-loading">Chưa có dữ liệu thành viên trong khoảng thời gian này.</p> : <div className="member-chart-list">
              {memberPerformance.map((member, index) => <div className="member-chart-row" key={member.name}>
                <div className="member-chart-value">{formatVnd(member.revenue)}</div>
                <div className="member-chart-track"><span style={{ height: `${Math.max((member.revenue / chartMaxRevenue) * 100, 3)}%` }} /></div>
                <div className="member-chart-heading"><span className="member-rank">{index + 1}</span><strong>{member.name}</strong></div>
                <small>{member.reports} báo cáo ngày</small>
              </div>)}
            </div>}
          </section>

          <section className="panel sales-target-card">
            <div className="panel-header"><div><p className="eyebrow">Target</p><h3>Mục tiêu doanh thu</h3></div><span className="badge neutral">{completion}%</span></div>
            <div className="sales-target-numbers"><strong>{formatVnd(totals.revenue)}</strong><span>/ {formatVnd(totals.target)}</span></div>
            <div className="sales-target-track"><span style={{ width: `${Math.min(completion, 100)}%` }} /></div>
            <p>{completion >= 100 ? 'Đã đạt hoặc vượt mục tiêu.' : `Còn ${formatVnd(Math.max(totals.target - totals.revenue, 0))} để đạt mục tiêu.`}</p>
          </section>
        </aside>
      </div>
    </section>
  );
}
