export default function SalesPlanLoading() {
  return (
    <section className="content loading-page" aria-busy="true" aria-live="polite">
      <div className="loading-placeholder loading-title" />
      <section className="panel loading-plan-panel">
        <div className="loading-placeholder loading-heading" />
        <div className="loading-placeholder loading-table" />
      </section>
      <span className="loading-message">Đang tải kế hoạch...</span>
    </section>
  );
}
