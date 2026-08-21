export default function AdminUsersLoading() {
  return (
    <main className="page-layout loading-page" aria-busy="true" aria-live="polite">
      <div className="loading-placeholder loading-title" />
      <div className="loading-placeholder loading-stats" />
      <section className="panel loading-panel">
        <div className="loading-placeholder loading-heading" />
        <div className="loading-placeholder loading-form" />
      </section>
      <section className="panel loading-panel">
        <div className="loading-placeholder loading-heading" />
        <div className="loading-placeholder loading-table" />
      </section>
      <span className="loading-message">Đang tải dữ liệu người dùng...</span>
    </main>
  );
}
