export default function SalesReportsLoading() {
  return (
    <section className="content loading-page" aria-busy="true" aria-live="polite">
      <div className="loading-placeholder loading-title" />
      <div className="loading-placeholder loading-stats" />
      <section className="panel loading-report-panel">
        <div className="loading-placeholder loading-heading" />
        <div className="loading-placeholder loading-table" />
      </section>
      <span className="loading-message">Đang tải báo cáo Sale...</span>
    </section>
  );
}
