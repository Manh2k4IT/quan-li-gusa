'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type SalesReport = {
  id: string;
  date: string;
  orderCode: string;
  category: string;
  salesperson: string;
  orderStatus: string;
  revenue: number;
  items?: Array<{ productName?: string; quantity?: number }>;
};

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value);

export default function SalesReportInbox() {
  const [reports, setReports] = useState<SalesReport[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;

    const loadReports = async () => {
      try {
        const response = await fetch('/api/sales-reports', { cache: 'no-store' });
        const payload = await response.json();
        if (!ignore) {
          setReports(Array.isArray(payload.reports) ? payload.reports.slice(0, 8) : []);
        }
      } catch {
        if (!ignore) setReports([]);
      } finally {
        if (!ignore) setLoading(false);
      }
    };

    void loadReports();
    const timer = window.setInterval(loadReports, 5000);
    return () => {
      ignore = true;
      window.clearInterval(timer);
    };
  }, []);

  return (
    <section className="panel" style={{ marginTop: '20px' }}>
      <div className="panel-header">
        <div>
          <p className="eyebrow">SALES REPORT INBOX</p>
          <h3>Báo cáo Sale mới nhất</h3>
        </div>
        <Link href="/daily-reports" className="ghost-btn">Xem tất cả</Link>
      </div>

      {loading ? <p className="comparison-loading">Đang tải báo cáo...</p> : !reports.length ? (
        <p className="comparison-loading">Chưa có báo cáo Sale nào được lưu trên hệ thống.</p>
      ) : (
        <div style={{ overflowX: 'auto' }}>
          <table className="data-table">
            <thead>
              <tr><th>Ngày</th><th>Sale</th><th>Mã đơn</th><th>Phân loại</th><th>Doanh thu</th><th>Trạng thái</th></tr>
            </thead>
            <tbody>
              {reports.map((report) => (
                <tr key={report.id}>
                  <td>{report.date}</td>
                  <td><strong>{report.salesperson}</strong></td>
                  <td>{report.orderCode}</td>
                  <td>{report.category}</td>
                  <td><strong>{formatVnd(Number(report.revenue) || 0)}</strong></td>
                  <td>{report.orderStatus}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
