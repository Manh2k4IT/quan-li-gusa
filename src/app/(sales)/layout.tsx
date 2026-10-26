export default function SalesLayout({ children }: { children: React.ReactNode }) {
  return (
    <main className="page-shell sales-report-page">
      <div className="sales-workspace-content">{children}</div>
    </main>
  );
}
