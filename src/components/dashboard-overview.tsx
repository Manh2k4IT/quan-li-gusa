'use client';

import { useEffect, useMemo, useState } from 'react';
import type { ErpDashboardPayload } from '@/lib/erp';

const monthlyRevenue = [38, 46, 52, 60, 58, 74, 82, 88, 80, 94, 98, 106];
const monthlyProfit = [18, 24, 29, 34, 31, 41, 46, 50, 48, 58, 62, 70];
const monthlyExpenses = [20, 22, 24, 26, 27, 30, 34, 36, 35, 39, 40, 42];

const monthLabels = ['Th1', 'Th2', 'Th3', 'Th4', 'Th5', 'Th6', 'Th7', 'Th8', 'Th9', 'Th10', 'Th11', 'Th12'];

const formatVnd = (value: number) =>
  new Intl.NumberFormat('vi-VN', { style: 'currency', currency: 'VND', maximumFractionDigits: 0 }).format(value);

const fallbackOrderComparison = monthLabels.map((label, index) => ({
  label: `Tháng ${index + 1}`,
  total: 0,
  quantity: 0,
  delta: 0,
  change: '+0%',
}));

const fallbackOrderProgress = [
  { name: 'Khách hàng mới', progress: 82, count: 0, quantity: 0, status: 'Đang tăng', owner: 'Sales Ops' },
  { name: 'Đang giao hàng', progress: 68, count: 0, quantity: 0, status: 'Ổn định', owner: 'Logistics' },
  { name: 'Đã xác nhận', progress: 74, count: 0, quantity: 0, status: 'Tốt', owner: 'Order Desk' },
  { name: 'Hồ sơ hoàn tất', progress: 91, count: 0, quantity: 0, status: 'Xuất sắc', owner: 'Finance' },
];

const fallbackFabricProgress = [
  { name: 'Đơn vải mới', progress: 0, count: 0 },
  { name: 'Đang chuẩn bị vải', progress: 0, count: 0 },
  { name: 'Chờ xuất hóa đơn', progress: 0, count: 0 },
  { name: 'Đã hoàn tất', progress: 0, count: 0 },
  { name: 'Đã hủy', progress: 0, count: 0 },
];

const fallbackFabricComparison = monthLabels.map((label) => ({ label: label.replace('Th', 'Tháng '), total: 0, delta: 0, meters: 0, deltaMeters: 0 }));

const fallbackAiSuggestions = [
  { title: 'Tăng doanh thu', detail: 'Tập trung vào nhóm khách hàng B2B với ROI cao hơn 16%, ưu tiên đầu tư kênh LinkedIn và Meta.' },
  { title: 'Cắt chi phí', detail: 'Giảm chi phí vận chuyển ở khu vực miền Trung bằng cách gom đơn và tối ưu lộ trình giao hàng.' },
  { title: 'Tồn kho', detail: 'Đặt lại 12% nguyên liệu gốc cho sản phẩm A và B để tránh thiếu hàng trong 2 tuần tới.' },
];

const yearOptions = [2024, 2025, 2026];

export default function DashboardOverview({ erpData }: { erpData: ErpDashboardPayload | null }) {
  const [year, setYear] = useState(2026);
  const [month, setMonth] = useState(8);
  const [liveErpData, setLiveErpData] = useState<ErpDashboardPayload | null>(erpData);
  const resolvedErpData = liveErpData ?? erpData;
  const erpConnected = Boolean(resolvedErpData);
  const erpConnectionLabel = erpConnected ? 'ERP Connected' : 'Chưa kết nối ERP';

  useEffect(() => {
    let ignore = false;

    const loadLiveErpData = async () => {
      try {
        const csrfToken = (window as typeof window & { frappe?: { csrf_token?: string } })?.frappe?.csrf_token;
        if (!csrfToken || erpData) {
          return;
        }

        const filters = {
          company: 'CONG TY TNHH GUSA VIET NAM',
          from_fiscal_year: String(year),
          to_fiscal_year: String(year),
          from_date: `${year}-01-01`,
          to_date: `${year}-12-31`,
          periodicity: 'Yearly',
          filter_based_on: 'Fiscal Year',
          include_default_book_entries: 1,
        };

        const response = await fetch('https://gusaz.com/api/method/frappe.desk.query_report.run', {
          method: 'POST',
          credentials: 'include',
          headers: {
            Accept: 'application/json',
            'X-Requested-With': 'XMLHttpRequest',
            'Content-Type': 'application/x-www-form-urlencoded',
            'X-Frappe-CSRF-Token': csrfToken,
          },
          body: new URLSearchParams({
            report_name: 'Profit and Loss Statement',
            filters: JSON.stringify(filters),
            ignore_prepared_report: 'true',
          }).toString(),
          cache: 'no-store',
        });

        if (!response.ok || ignore) {
          return;
        }

        const payload = await response.json() as { message?: { report_summary?: Array<{ label?: string; value?: number | string }>; chart?: { labels?: string[]; datasets?: Array<{ name?: string; values?: Array<number | string> }> } } };
        const summary = payload.message?.report_summary ?? [];
        const dataset = payload.message?.chart?.datasets ?? [];
        const labels = payload.message?.chart?.labels ?? [];
        const findSummaryValue = (...keys: string[]) => {
          const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const targetKeys = keys.map(normalized);
          const match = summary.find((entry) => {
            const label = normalized(String(entry.label ?? ''));
            return targetKeys.some((key) => label.includes(key) || key.includes(label));
          });
          return Number(match?.value ?? 0) || 0;
        };

        const revenue = findSummaryValue('Doanh thu', 'Thu nhap', 'Income', 'Revenue', 'Total Income');
        const profit = findSummaryValue('Loi nhuan', 'Profit', 'Net Profit', 'Net Income');
        const getMonthlyValues = (...keys: string[]) => {
          const normalized = (value: string) => value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase();
          const targets = keys.map(normalized);
          const match = dataset.find((entry) => {
            const name = normalized(String(entry.name ?? ''));
            return targets.some((key) => name.includes(key) || key.includes(name));
          });
          return (match?.values ?? []).map((value) => Number(value) || 0);
        };

        const revenueValues = getMonthlyValues('Revenue', 'Thu nhap', 'Income', 'Doanh thu');
        const expenseValues = getMonthlyValues('Expense', 'Chi phi', 'Expenses', 'Cost');
        const profitValues = getMonthlyValues('Profit', 'Loi nhuan', 'Net Income');

        const monthlyPerformance = labels.map((label, index) => ({
          label,
          revenue: revenueValues[index] ?? 0,
          expenses: expenseValues[index] ?? 0,
          profit: profitValues[index] ?? 0,
        }));

        if (!ignore) {
          setLiveErpData({
            metrics: [
              { label: 'Doanh thu lũy kế 2026', value: formatVnd(revenue), change: '+0.0%', tone: 'up' },
              { label: 'Lợi nhuận lũy kế 2026', value: formatVnd(profit), change: '+0.0%', tone: 'up' },
              { label: 'Khách hàng', value: 'Đang đồng bộ', change: 'Live', tone: 'up' },
              { label: 'Mặt hàng', value: 'Đang đồng bộ', change: 'Live', tone: 'up' },
            ],
            monthlyPerformance,
            pipeline: [],
            aiPlan: ['Dữ liệu đang được đồng bộ trực tiếp từ ERP.', 'Các chỉ số sẽ cập nhật trong vài giây tiếp theo.', 'Tiếp tục theo dõi ở module báo cáo ERP.'],
            aiMessages: ['Dữ liệu ERP đang được đồng bộ trực tiếp từ Frappe.', `Doanh thu: ${formatVnd(revenue)}`, `Lợi nhuận: ${formatVnd(profit)}`],
            revenueBars: monthlyPerformance.map((item) => item.revenue),
          });
        }
      } catch {
        // keep the existing fallback when the live ERP session is unavailable
      }
    };

    if (!erpData) {
      loadLiveErpData();
    }

    return () => {
      ignore = true;
    };
  }, [erpData, year]);

  const chartData = useMemo(
    () => {
      const source = liveErpData ?? erpData;

      if (source?.monthlyPerformance?.length) {
        return source.monthlyPerformance.map((item) => ({
          label: item.label,
          revenue: item.revenue,
          expenses: item.expenses,
          profit: item.profit,
        }));
      }

      if (erpConnected) {
        return monthLabels.map((label) => ({
          label,
          revenue: 0,
          expenses: 0,
          profit: 0,
        }));
      }

      return monthLabels.map((label, index) => ({
        label,
        revenue: monthlyRevenue[index],
        expenses: monthlyExpenses[index],
        profit: monthlyProfit[index],
      }));
    },
    [erpConnected, erpData, liveErpData],
  );

  const currentMonth = chartData[month - 1] ?? chartData[0];
  const previousMonth = chartData[Math.max(month - 2, 0)] ?? chartData[0];
  const chartMaxValue = Math.max(
    ...chartData.flatMap((item) => [Math.abs(item.revenue), Math.abs(item.expenses), Math.abs(item.profit)]),
    1,
  );

  const revenueDelta = currentMonth.revenue - previousMonth.revenue;
  const profitDelta = currentMonth.profit - previousMonth.profit;
  const revenueChange = previousMonth.revenue !== 0 ? (revenueDelta / previousMonth.revenue) * 100 : 0;
  const profitChange = previousMonth.profit !== 0 ? (profitDelta / previousMonth.profit) * 100 : 0;
  const comparisonBadge = `${profitDelta >= 0 ? '+' : ''}${profitChange.toFixed(1)}%`;
  const topMetrics = (resolvedErpData?.metrics?.length ? resolvedErpData.metrics.slice(0, 4) : [
        { label: 'Doanh thu lũy kế 2026', value: 'Chưa có dữ liệu', change: '—' },
        { label: 'Lợi nhuận lũy kế 2026', value: 'Chưa có dữ liệu', change: '—' },
        { label: 'Khách hàng', value: 'Chưa có dữ liệu', change: '—' },
        { label: 'Mặt hàng', value: 'Chưa có dữ liệu', change: '—' },
      ]);

  const [pipelineState, setPipelineState] = useState(() => {
    if (resolvedErpData?.pipeline?.length) {
      const maxValue = Math.max(...resolvedErpData.pipeline.map((item: { value: number }) => item.value), 1);
      return resolvedErpData.pipeline.slice(0, 5).map((item: { name: string; value: number; quantity?: number }) => ({
        name: item.name,
        progress: Math.round((item.value / maxValue) * 100),
        count: item.value,
        quantity: item.quantity ?? 0,
        status: item.value > 0 ? 'Đang xử lý' : 'Chưa có đơn',
        owner: 'ERP GUSAZ',
      }));
    }

    if (erpConnected) {
      return fallbackOrderProgress.map((item) => ({ ...item, progress: 0, count: 0, quantity: 0 }));
    }

    return fallbackOrderProgress;
  });
  const [fashionComparison, setFashionComparison] = useState(fallbackOrderComparison);
  const [fashionQuantity, setFashionQuantity] = useState(0);
  const [fabricProgress, setFabricProgress] = useState(fallbackFabricProgress);
  const [fabricComparison, setFabricComparison] = useState(fallbackFabricComparison);
  const [benThanhProgress, setBenThanhProgress] = useState(fallbackFabricProgress);
  const [benThanhComparison, setBenThanhComparison] = useState(fallbackFabricComparison);
  const [fabricComparisonLoading, setFabricComparisonLoading] = useState(true);
  const [benThanhComparisonLoading, setBenThanhComparisonLoading] = useState(true);
  const [fashionComparisonLoading, setFashionComparisonLoading] = useState(true);
  const [fashionComparisonError, setFashionComparisonError] = useState(false);
  const [aiSuggestions, setAiSuggestions] = useState(fallbackAiSuggestions);
  const [aiInsightsLoading, setAiInsightsLoading] = useState(true);

  useEffect(() => {
    const warehouse = encodeURIComponent('Kho vải Bến Thành - CTTGVN');
    let ignore = false;

    const loadDashboardData = async () => {
      setFashionComparisonLoading(true);
      setFabricComparisonLoading(true);
      setBenThanhComparisonLoading(true);
      setFashionComparisonError(false);

      try {
        const [pipelineProgressRes, pipelineComparisonRes, fabricProgressRes, fabricComparisonRes, benThanhProgressRes, benThanhComparisonRes] = await Promise.all([
          fetch(`/api/pipeline?year=${year}&fromMonth=${month}&toMonth=${month}&progressOnly=1`, { cache: 'no-store' }),
          fetch(`/api/pipeline?year=${year}&fromMonth=${month}&toMonth=${month}&comparisonOnly=1`, { cache: 'no-store' }),
          fetch(`/api/fabric-progress?year=${year}&month=${month}&progressOnly=1`, { cache: 'no-store' }),
          fetch(`/api/fabric-progress?year=${year}&month=${month}&comparisonOnly=1`, { cache: 'no-store' }),
          fetch(`/api/fabric-progress?year=${year}&month=${month}&progressOnly=1&warehouse=${warehouse}`, { cache: 'no-store' }),
          fetch(`/api/fabric-progress?year=${year}&month=${month}&comparisonOnly=1&warehouse=${warehouse}`, { cache: 'no-store' }),
        ]);

        const [pipelineProgress, pipelineComparison, fabricProgress, fabricComparison, benThanhProgress, benThanhComparison] = await Promise.all([
          pipelineProgressRes.ok ? pipelineProgressRes.json() : null,
          pipelineComparisonRes.ok ? pipelineComparisonRes.json() : null,
          fabricProgressRes.ok ? fabricProgressRes.json() : null,
          fabricComparisonRes.ok ? fabricComparisonRes.json() : null,
          benThanhProgressRes.ok ? benThanhProgressRes.json() : null,
          benThanhComparisonRes.ok ? benThanhComparisonRes.json() : null,
        ]);

        if (ignore) return;

        const nextPipeline = Array.isArray(pipelineProgress?.pipeline) ? pipelineProgress.pipeline : [];
        if (nextPipeline.length) {
          const maxValue = Math.max(...nextPipeline.map((item: { value?: number | string }) => Number(item.value) || 0), 1);
          setPipelineState(nextPipeline.slice(0, 5).map((item: { name?: string; value?: number | string; quantity?: number | string }) => ({
            name: item.name ?? 'Không tên',
            progress: Math.round(((Number(item.value) || 0) / maxValue) * 100),
            count: Number(item.value) || 0,
            quantity: Number(item.quantity) || 0,
            status: (Number(item.value) || 0) > 0 ? 'Đang xử lý' : 'Chưa có đơn',
            owner: 'ERP GUSAZ',
          })));
          setFashionQuantity(Number(nextPipeline[0]?.totalFashionQuantity) || 0);
        }

        if (Array.isArray(pipelineComparison?.comparison) && pipelineComparison.comparison.length) {
          setFashionComparison(pipelineComparison.comparison);
        }

        if (Array.isArray(fabricProgress?.progress)) {
          setFabricProgress(fabricProgress.progress);
        }

        if (Array.isArray(fabricComparison?.comparison)) {
          setFabricComparison(fabricComparison.comparison);
        }

        if (Array.isArray(benThanhProgress?.progress)) {
          setBenThanhProgress(benThanhProgress.progress);
        }

        if (Array.isArray(benThanhComparison?.comparison)) {
          setBenThanhComparison(benThanhComparison.comparison);
        }

        if (!Array.isArray(pipelineComparison?.comparison) || !pipelineComparison.comparison.length) {
          setFashionComparisonError(true);
        }
      } catch {
        if (!ignore) {
          setFashionComparisonError(true);
        }
      } finally {
        if (!ignore) {
          setFashionComparisonLoading(false);
          setFabricComparisonLoading(false);
          setBenThanhComparisonLoading(false);
        }
      }
    };

    loadDashboardData();

    return () => {
      ignore = true;
    };
  }, [month, year]);

  useEffect(() => {
    let ignore = false;

    fetch('/api/dashboard-insights', { cache: 'no-store' })
      .then(async (response) => response.ok ? response.json() : null)
      .then((payload) => {
        if (!ignore && Array.isArray(payload?.insights) && payload.insights.length) {
          setAiSuggestions(payload.insights);
        }
      })
      .catch(() => undefined)
      .finally(() => {
        if (!ignore) setAiInsightsLoading(false);
      });

    return () => {
      ignore = true;
    };
  }, []);

  const orderProgress = pipelineState;

  return (
    <>
      <div className="stats-row" style={{ marginBottom: '20px', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))' }}>
        {topMetrics.map((metric) => (
          <div key={metric.label} className="metric-card" style={{ minHeight: '180px', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
            <span style={{ fontSize: '1.05rem', color: '#dfe9f8' }}>{metric.label}</span>
            <strong style={{ marginTop: '10px', fontSize: 'clamp(1.6rem, 2vw, 2.8rem)', lineHeight: 1.08, letterSpacing: '-0.03em', maxWidth: '100%', overflowWrap: 'anywhere', wordBreak: 'break-word', whiteSpace: 'normal' }}>{metric.value}</strong>
            <small className={(metric.change ?? '').startsWith('-') ? 'text-down' : 'text-up'} style={{ fontSize: '1rem', display: 'inline-block', marginTop: '8px' }}>{metric.change ?? '0%'}</small>
          </div>
        ))}
      </div>

      <div className="monthly-dashboard-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Overview</p>
              <h3>Hiệu suất theo tháng</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-badge ${erpConnected ? 'status-connected' : 'status-disconnected'}`}>{erpConnectionLabel}</span>
              <span className={`badge ${profitChange >= 0 ? 'success' : 'neutral'}`}>
                {comparisonBadge}
              </span>
            </div>
          </div>

          <div className="comparison-toolbar">
            <label>
              Tháng
              <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
                {monthLabels.map((label, index) => (
                  <option key={label} value={index + 1}>{label}</option>
                ))}
              </select>
            </label>

            <label>
              Năm
              <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
                {yearOptions.map((option) => (
                  <option key={option} value={option}>{option}</option>
                ))}
              </select>
            </label>
          </div>

          <div className="chart-legend" aria-label="legend">
            <span><i className="legend-dot revenue" /> Doanh thu</span>
            <span><i className="legend-dot expenses" /> Chi phí</span>
            <span><i className="legend-dot profit" /> Lợi nhuận</span>
          </div>

          <div className="comparison-summary" style={{ marginTop: '10px', marginBottom: '14px' }}>
            <div>
              <span>Doanh thu</span>
              <strong>{formatVnd(currentMonth.revenue)}</strong>
            </div>
            <div>
              <span>Lợi nhuận</span>
              <strong>{formatVnd(currentMonth.profit)}</strong>
            </div>
            <div>
              <span>Chi phí</span>
              <strong className="negative">{formatVnd(currentMonth.expenses)}</strong>
            </div>
            <div>
              <span>So với tháng trước</span>
              <strong className={revenueDelta >= 0 ? 'positive' : 'negative'}>
                {revenueDelta >= 0 ? '+' : '-'}{formatVnd(Math.abs(revenueDelta))}
              </strong>
            </div>
            <div>
              <span>Tỷ lệ thay đổi</span>
              <strong className={profitChange >= 0 ? 'positive' : 'negative'}>
                {profitChange >= 0 ? '+' : '-'}{Math.abs(profitChange).toFixed(1)}%
              </strong>
            </div>
          </div>

          <div className="monthly-bars">
            {chartData.map((item) => (
              <div key={item.label} className="monthly-column">
                <div className="monthly-bar-pair">
                  <span
                    className="monthly-bar revenue"
                    style={{ height: `${Math.max(item.revenue > 0 ? 8 : 3, (Math.abs(item.revenue) / chartMaxValue) * 100)}%` }}
                    title={`${item.label}: ${formatVnd(item.revenue)}`}
                  />
                  <span
                    className="monthly-bar expenses"
                    style={{ height: `${Math.max(item.expenses > 0 ? 8 : 3, (Math.abs(item.expenses) / chartMaxValue) * 100)}%` }}
                    title={`${item.label}: ${formatVnd(item.expenses)} chi phí`}
                  />
                  <span
                    className="monthly-bar profit"
                    style={{ height: `${Math.max(item.profit > 0 ? 8 : 3, (Math.abs(item.profit) / chartMaxValue) * 100)}%` }}
                    title={`${item.label}: ${formatVnd(item.profit)} lợi nhuận`}
                  />
                </div>
                <span className="monthly-label">{item.label}</span>
              </div>
            ))}
          </div>

          <div className="monthly-table">
            {chartData.map((item) => (
              <div key={item.label} className="monthly-row">
                <strong>{item.label}</strong>
                <span>{formatVnd(item.revenue)}</span>
                <span className={item.profit >= 0 ? 'positive' : 'negative'}>{formatVnd(item.profit)}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="panel ai-panel" style={{ padding: '18px 18px 16px', minHeight: '420px', display: 'flex', flexDirection: 'column' }}>
          <div className="panel-header" style={{ marginBottom: '12px' }}>
            <div>
              <p className="eyebrow" style={{ letterSpacing: '0.12em', fontSize: '0.68rem' }}>AI guidance</p>
              <h3 style={{ marginTop: '4px', fontSize: '1.05rem', fontWeight: 700 }}>Gợi ý từ AI</h3>
            </div>
            <span className="badge success" style={{ fontSize: '0.68rem', padding: '5px 10px' }}>{aiInsightsLoading ? 'Đang tải' : 'Live'}</span>
          </div>

          <div className="ai-shell" style={{ display: 'flex', flexDirection: 'column', gap: '10px', flex: 1 }}>
            {aiInsightsLoading ? (
              <div className="ai-loading-state">Đang tổng hợp báo cáo Sale, kế hoạch và dữ liệu ERP...</div>
            ) : aiSuggestions.map((item, index) => (
              <div key={item.title} className="ai-suggestion" style={{
                border: '1px solid rgba(148,163,184,0.15)',
                background: index === 0 ? 'rgba(96,165,250,0.08)' : index === 1 ? 'rgba(245,158,11,0.06)' : 'rgba(34,197,94,0.07)',
                borderRadius: '12px',
                padding: '12px 12px 10px',
                display: 'flex',
                gap: '10px',
                alignItems: 'flex-start',
                minHeight: '86px'
              }}>
                <span className="ai-pill" style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '8px',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  background: 'rgba(255,255,255,0.04)',
                  color: '#f5d88a',
                  fontWeight: 700,
                  fontSize: '0.7rem',
                  border: '1px solid rgba(255,255,255,0.06)'
                }}>AI</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, color: '#f3f6fd', marginBottom: '6px', fontSize: '0.94rem' }}>{item.title}</div>
                  <div style={{ color: '#b9c9dd', lineHeight: 1.55, fontSize: '0.9rem' }}>{item.detail}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="monthly-dashboard-grid operations-dashboard-grid" style={{ marginTop: '20px' }}>
        <div className="panel operations-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Operations</p>
              <h3>Kho thời trang Quận 4</h3>
              <small className="panel-note">Thời trang · {fashionQuantity.toLocaleString('vi-VN')} cái trong tháng</small>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-badge ${erpConnected ? 'status-connected' : 'status-disconnected'}`}>{erpConnectionLabel}</span>
              <span className="badge success">Live</span>
            </div>
          </div>

          <div className="timeline-selector">
            <label>
              Chọn thời gian
              <input type="month" value={`${year}-${String(month).padStart(2, '0')}`} onChange={(event) => {
                const [nextYear, nextMonth] = event.target.value.split('-');
                setYear(Number(nextYear));
                setMonth(Number(nextMonth));
              }} />
            </label>
          </div>

          <div className="operation-list">
            {orderProgress.map((item) => (
              <div key={item.name} className="operation-card">
                <div className="operation-row">
                  <div>
                    <h4>{item.name}</h4>
                  </div>
                  <span className="status-badge">{item.count} đơn · {(item.quantity ?? 0).toLocaleString('vi-VN')} cái</span>
                </div>

                <div className="progress-track">
                  <span style={{ width: `${item.progress}%` }} />
                </div>

              </div>
            ))}
          </div>

        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Comparison</p>
              <h3>So sánh thời trang bán thành công</h3>
            </div>
          </div>

          {fashionComparisonLoading ? (
            <p className="comparison-loading">Đang tải dữ liệu ERP...</p>
          ) : fashionComparisonError ? (
            <p className="comparison-loading comparison-error">ERP chưa phản hồi, dữ liệu cũ được giữ lại.</p>
          ) : (
            <div className="monthly-orders-table" style={{ flex: 1, minHeight: 0 }}>
              {fashionComparison.map((item) => (
                <div key={item.label} className="monthly-order-row fashion-monthly-order-row">
                  <strong>{item.label}</strong>
                  <span>{item.total} đơn</span>
                  <span>{(item.quantity ?? 0).toLocaleString('vi-VN')} cái</span>
                  <small className={item.delta >= 0 ? 'positive' : 'negative'}>
                    {item.delta >= 0 ? '+' : ''}{item.delta} đơn
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="monthly-dashboard-grid operations-dashboard-grid fabric-dashboard-grid" style={{ marginTop: '20px' }}>
        <div className="panel operations-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fabric operations</p>
              <h3>Kho vải Quận 4</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-badge ${erpConnected ? 'status-connected' : 'status-disconnected'}`}>{erpConnectionLabel}</span>
              <span className="badge success">Live</span>
            </div>
          </div>

          <div className="operation-list fabric-progress-list">
            {fabricProgress.map((item) => (
              <div key={item.name} className="operation-card">
                <div className="operation-row">
                  <h4>{item.name}</h4>
                  <span className="status-badge">{item.count} đơn vải</span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fabric comparison</p>
              <h3>So sánh vải bán thành công</h3>
            </div>
          </div>

          {fabricComparisonLoading ? (
            <p className="comparison-loading">Đang tải dữ liệu ERP...</p>
          ) : (
            <div className="monthly-orders-table fabric-monthly-orders-table" style={{ flex: 1, minHeight: 0 }}>
              {fabricComparison.map((item) => (
                <div key={item.label} className="monthly-order-row">
                  <strong>{item.label}</strong>
                  <span>{item.total} đơn vải</span>
                  <span>{item.meters.toLocaleString('vi-VN')} mét</span>
                  <small className={item.delta >= 0 ? 'positive' : 'negative'}>
                    {item.delta >= 0 ? '+' : ''}{item.delta} đơn
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="monthly-dashboard-grid operations-dashboard-grid fabric-dashboard-grid" style={{ marginTop: '20px' }}>
        <div className="panel operations-panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fabric operations</p>
              <h3>Kho vải Bến Thành</h3>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span className={`status-badge ${erpConnected ? 'status-connected' : 'status-disconnected'}`}>{erpConnectionLabel}</span>
              <span className="badge success">Live</span>
            </div>
          </div>

          <div className="operation-list fabric-progress-list">
            {benThanhProgress.map((item) => (
              <div key={item.name} className="operation-card">
                <div className="operation-row">
                  <h4>{item.name}</h4>
                  <span className="status-badge">{item.count} đơn vải</span>
                </div>
                <div className="progress-track">
                  <span style={{ width: `${item.progress}%` }} />
                </div>
              </div>
            ))}
          </div>
        </div>

        <div className="panel" style={{ display: 'flex', flexDirection: 'column', height: '100%' }}>
          <div className="panel-header">
            <div>
              <p className="eyebrow">Fabric comparison</p>
              <h3>So sánh vải Bến Thành bán thành công</h3>
            </div>
          </div>

          {benThanhComparisonLoading ? (
            <p className="comparison-loading">Đang tải dữ liệu ERP...</p>
          ) : (
            <div className="monthly-orders-table fabric-monthly-orders-table" style={{ flex: 1, minHeight: 0 }}>
              {benThanhComparison.map((item) => (
                <div key={item.label} className="monthly-order-row">
                  <strong>{item.label}</strong>
                  <span>{item.total} đơn vải</span>
                  <span>{item.meters.toLocaleString('vi-VN')} mét</span>
                  <small className={item.delta >= 0 ? 'positive' : 'negative'}>
                    {item.delta >= 0 ? '+' : ''}{item.delta} đơn
                  </small>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
