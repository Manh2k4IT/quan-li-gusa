import Link from 'next/link';
import { getErpWarehouseReport } from '@/lib/erp';

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value);

const formatFinancialValue = (value: number, available: boolean) => available ? formatVnd(value) : 'Chưa có dữ liệu';

type WarehouseReportProps = {
  warehouse: string;
  title: string;
  itemGroup: string;
  unitType: 'piece' | 'meter';
  year?: number;
  month?: number;
  costCenter?: string;
};

const branchOptions = [
  { value: 'CNO1 - Kho Tổng', label: 'CN01 - Kho Tổng' },
  { value: 'CNO2 - Kho vải Quận 4', label: 'CN02 - Kho vải Quận 4' },
  { value: 'CNO3 - Thời Trang Q4', label: 'CN03 - Thời Trang Q4' },
  { value: 'CNO4 - Kho vải Bến Thành', label: 'CN04 - Kho vải Bến Thành' },
];

export default async function WarehouseReport({ warehouse, title, itemGroup, unitType, year = new Date().getFullYear(), month = new Date().getMonth() + 1, costCenter }: WarehouseReportProps) {
  const selectedCostCenter = costCenter ?? 'CNO3 - Thời Trang Q4';
  let report = null;
  let loadError = 'ERP chưa phản hồi, chưa thể tải báo cáo.';
  try {
    report = await getErpWarehouseReport(warehouse, itemGroup, unitType, year, month, selectedCostCenter);
  } catch (error) {
    const message = error instanceof Error ? error.message : '';
    if (message.includes('(401)') || message.includes('(403)')) {
      loadError = 'ERP từ chối truy cập (401/403). Kiểm tra ERP_API_KEY/ERP_API_SECRET hoặc cookie phiên đăng nhập.';
    } else if (message.includes('(502)') || message.includes('(504)') || message.toLowerCase().includes('timeout')) {
      loadError = 'ERP đang timeout hoặc gateway lỗi (502/504). Vui lòng thử lại sau vài phút.';
    } else if (message) {
      loadError = `Không tải được báo cáo ERP: ${message}`;
    }
    report = null;
  }

  const suggestions = report
    ? [
        report.revenueChange < 0
          ? `Doanh thu tháng gần nhất giảm ${Math.abs(report.revenueChange).toFixed(1)}% so với tháng trước; nên rà soát nhóm sản phẩm bán chậm và hiệu quả từng kênh.`
          : `Doanh thu tháng gần nhất tăng ${report.revenueChange.toFixed(1)}%; nên duy trì nhóm sản phẩm chủ lực và chuẩn bị hàng cho kỳ tiếp theo.`,
        report.totalQuantity > 0
          ? `Kho đã bán ${report.totalQuantity.toLocaleString('vi-VN')} ${unitType === 'meter' ? 'mét' : 'sản phẩm'} trong năm; ưu tiên bổ sung các mã đóng góp doanh thu cao nhất.`
          : `Chưa có dữ liệu bán hàng; cần kiểm tra lại bộ lọc kho và nhóm ${itemGroup} trên ERP.`,
      ]
    : ['ERP chưa phản hồi. Hãy kiểm tra lại kết nối API trước khi dùng báo cáo cho quyết định chiến lược.'];
  const maxRevenue = Math.max(...(report?.monthlySummary.map((item) => item.revenue) ?? [1]), 1);
  const maxExpenses = Math.max(...(report?.monthlySummary.map((item) => item.expenses) ?? [1]), 1);
  const maxQuantity = Math.max(...(report?.monthlySummary.map((item) => item.quantity) ?? [1]), 1);
  const maxOrders = Math.max(...(report?.monthlySummary.map((item) => item.orders) ?? [1]), 1);
  const productSuggestions = report?.topProducts.length
    ? [
        `${report.topProducts[0].name} đang dẫn đầu doanh thu; nên ưu tiên duy trì tồn kho và theo dõi tốc độ bán của mã này.`,
        report.topProducts.length > 1
          ? `Nhóm sản phẩm chủ lực gồm ${report.topProducts.slice(0, 3).map((item) => item.name).join(', ')}; nên dùng làm cơ sở lập kế hoạch nhập hàng kỳ tới.`
          : 'Chưa đủ mã sản phẩm để so sánh hiệu suất; cần tiếp tục đồng bộ dữ liệu ERP.',
      ]
    : ['Chưa có dữ liệu sản phẩm từ ERP để đưa ra gợi ý.'];

  return (
    <main className="page-layout warehouse-report-page">
      <div className="page-header">
        <div><p className="eyebrow">Warehouse strategy report</p><h1>{title}</h1><p className="page-subtitle">Báo cáo doanh thu và sản lượng từ ERP, phục vụ định hướng chiến lược.</p></div>
        <div className="warehouse-report-actions"><span className={`status-badge ${!report ? 'status-disconnected' : report.dataStatus === 'stale' ? 'status-pending' : 'status-connected'}`}>{!report ? 'ERP Disconnected' : report.dataStatus === 'stale' ? 'ERP Stale Cache' : 'ERP Connected'}</span><Link href="/" className="ghost-btn">Quay lại dashboard</Link></div>
      </div>
      {!report ? <div className="panel"><p className="comparison-loading comparison-error">{loadError}</p></div> : <>
        <form className="warehouse-time-toolbar" method="get">
          <label>Tháng<select name="month" defaultValue={month}>{Array.from({ length: 12 }, (_, index) => <option key={index + 1} value={index + 1}>Tháng {index + 1}</option>)}</select></label>
          <label>Năm<select name="year" defaultValue={year}><option value="2026">2026</option><option value="2025">2025</option><option value="2024">2024</option></select></label>
          <label>Chi nhánh<select name="costCenter" defaultValue={selectedCostCenter}>{branchOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>
          <button type="submit" className="primary-btn">Cập nhật báo cáo</button>
        </form>
        <div className="warehouse-overview-grid">
          <div className="panel warehouse-performance-panel">
            <div className="panel-header"><div><p className="eyebrow">Overview</p><h3>Hiệu suất theo tháng</h3></div><span className="status-badge status-connected">ERP Connected</span></div>
            <div className="warehouse-summary-row">
              <div><span>Doanh thu</span><strong>{formatFinancialValue(report.selectedPnlRevenue, report.financialDataAvailable)}</strong></div>
              <div><span>Lợi nhuận</span><strong className={report.selectedProfit >= 0 ? 'positive' : 'negative'}>{formatFinancialValue(report.selectedProfit, report.financialDataAvailable)}</strong></div>
              <div><span>Chi phí</span><strong className="negative">{formatFinancialValue(report.selectedExpenses, report.financialDataAvailable)}</strong></div>
              <div><span>Sản lượng</span><strong>{report.selectedQuantity.toLocaleString('vi-VN')} {unitType === 'meter' ? 'mét' : 'cái'}</strong></div>
            </div>
            <div className="chart-legend"><span><i className="legend-dot revenue" /> Doanh thu</span><span><i className="legend-dot expenses" /> Chi phí</span><span><i className="legend-dot profit" /> Sản lượng</span></div>
            <div className="warehouse-month-comparison">
              <div><span>So với tháng trước</span><strong className={report.selectedRevenue >= report.selectedPreviousRevenue ? 'positive' : 'negative'}>{report.selectedRevenue >= report.selectedPreviousRevenue ? '+' : '-'}{formatVnd(Math.abs(report.selectedRevenue - report.selectedPreviousRevenue))}</strong></div>
              <div><span>Sản lượng</span><strong className={report.selectedQuantity >= report.selectedPreviousQuantity ? 'positive' : 'negative'}>{report.selectedQuantity >= report.selectedPreviousQuantity ? '+' : '-'}{Math.abs(report.selectedQuantity - report.selectedPreviousQuantity).toLocaleString('vi-VN')} {unitType === 'meter' ? 'mét' : 'cái'}</strong></div>
              <div><span>Số đơn</span><strong className={report.selectedOrders >= report.selectedPreviousOrders ? 'positive' : 'negative'}>{report.selectedOrders >= report.selectedPreviousOrders ? '+' : '-'}{Math.abs(report.selectedOrders - report.selectedPreviousOrders).toLocaleString('vi-VN')} đơn</strong></div>
            </div>
            <div className="warehouse-report-bars">{report.monthlySummary.map((item) => <div key={item.label} className="warehouse-report-bar-column"><div className="warehouse-report-bar-pair"><div className="warehouse-report-bar revenue" style={{ height: `${Math.max((item.revenue / maxRevenue) * 100, 3)}%` }} title={`${item.label}: ${formatVnd(item.revenue)}`} /><div className="warehouse-report-bar expenses" style={{ height: `${Math.max((item.expenses / maxExpenses) * 100, 3)}%` }} title={`${item.label}: ${formatVnd(item.expenses)}`} /><div className="warehouse-report-bar profit" style={{ height: `${Math.max((item.quantity / maxQuantity) * 100, 3)}%` }} title={`${item.label}: ${item.quantity} cái`} /></div><small>{item.label.replace('Tháng ', 'T')}</small></div>)}</div>
            <div className="warehouse-monthly-table">{report.monthlySummary.map((item, index) => <div key={item.label} className="warehouse-monthly-table-row"><strong>{item.label}</strong><span>{formatVnd(item.revenue)}</span><small className={item.revenue >= (report.monthlySummary[index - 1]?.revenue ?? 0) ? 'positive' : 'negative'}>{item.revenue >= (report.monthlySummary[index - 1]?.revenue ?? 0) ? '+' : '-'}{formatVnd(Math.abs(item.revenue - (report.monthlySummary[index - 1]?.revenue ?? 0)))}</small></div>)}</div>
          </div>
          <div className="panel warehouse-ai-panel"><div className="panel-header"><div><p className="eyebrow">AI guidance</p><h3>Gợi ý từ AI</h3></div><span className="badge success">Live</span></div><div className="recommendation-list">{suggestions.map((suggestion) => <div key={suggestion} className="recommendation-card"><div className="chat-avatar">AI</div><div><p>{suggestion}</p></div></div>)}</div></div>
        </div>
        <div className="bottom-grid warehouse-bottom-grid">
          <div className="panel"><div className="panel-header"><div><p className="eyebrow">Top products</p><h3>Sản phẩm tạo doanh thu</h3></div></div><div className="recommendation-list">{report.topProducts.map((item, index) => <div key={item.name} className="recommendation-card"><div className="chat-avatar">{index + 1}</div><div><h4>{item.name}</h4><p>{item.quantity.toLocaleString('vi-VN')} {unitType === 'meter' ? 'mét' : 'cái'} · {formatVnd(item.revenue)}</p></div></div>)}</div></div>
          <div className="panel"><div className="panel-header"><div><p className="eyebrow">Product strategy</p><h3>Gợi ý AI cho sản phẩm</h3></div><span className="badge success">AI</span></div><div className="recommendation-list">{productSuggestions.map((suggestion) => <div key={suggestion} className="recommendation-card"><div className="chat-avatar">AI</div><div><p>{suggestion}</p></div></div>)}</div></div>
        </div>
      </>}
    </main>
  );
}
