export default function Loading() {
  return (
    <div className="route-loading" aria-busy="true" aria-label="Đang tải trang">
      <div className="route-loading-bar" />
      <div className="route-loading-header">
        <span className="route-skeleton" style={{ width: '140px', height: '12px' }} />
        <span className="route-skeleton" style={{ width: '320px', height: '30px' }} />
      </div>
      <div className="route-loading-grid">
        {Array.from({ length: 4 }, (_, index) => <span key={index} className="route-skeleton route-skeleton-card" />)}
      </div>
      <span className="route-skeleton route-skeleton-panel" />
    </div>
  );
}
