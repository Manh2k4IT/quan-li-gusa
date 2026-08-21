'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type SaleUser = { id: string; name: string; email: string; category: string };

type TaskRow = {
  id: string;
  sale: string;
  date: string;
  status: string;
  note: string;
  attachment: string;
  sent: boolean;
};

export default function FabricBenThanhPlanPage() {
  const [rows, setRows] = useState<TaskRow[]>([]);
  const [saleUsers, setSaleUsers] = useState<SaleUser[]>([]);
  const [isAssignOpen, setIsAssignOpen] = useState(false);
  const [selectedReport, setSelectedReport] = useState<TaskRow | null>(null);
  const [aiAnalysis, setAiAnalysis] = useState('');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [selectedSale, setSelectedSale] = useState<string>('');
  const [selectedSaleId, setSelectedSaleId] = useState<string>('');
  const [saleFilter, setSaleFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [dateFilter, setDateFilter] = useState('');
  const [draft, setDraft] = useState({
    date: new Date().toISOString().slice(0, 10),
    manager: 'Quản lý A',
    category: 'Kho vải Bến Thành',
    title: 'Báo cáo kế hoạch kho vải Bến Thành',
    status: 'Đang thực hiện',
    note: '',
    attachment: '',
  });

  const totalActive = useMemo(() => rows.filter((row) => row.status === 'Đang thực hiện').length, [rows]);
  const filteredRows = useMemo(() => rows.filter((row) => (!saleFilter || row.sale.toLowerCase().includes(saleFilter.toLowerCase())) && (!statusFilter || row.status === statusFilter) && (!dateFilter || row.date === dateFilter)), [dateFilter, rows, saleFilter, statusFilter]);

  useEffect(() => {
    fetch('/api/plan-assignments')
      .then((response) => response.json())
      .then((payload) => setRows((payload.assignments ?? []).filter((item: any) => item.category === 'Kho vải Bến Thành').map((item: any) => ({ id: item.id, sale: item.assignee?.name ?? item.assignee?.email ?? 'Sale', date: item.date, status: item.status, note: item.note, attachment: item.attachmentName ?? '', sent: true }))))
      .catch(() => setRows([]));

    fetch('/api/users?role=SALE')
      .then((response) => response.json())
      .then((payload) => setSaleUsers(Array.isArray(payload.users) ? payload.users : []))
      .catch(() => setSaleUsers([]));
  }, []);

  const saveToSalesPlan = (saleName: string, status: TaskRow['status'], note: string) => {
    try {
      const existing = JSON.parse(window.localStorage.getItem('gusa-sales-plan-assigned') ?? '[]');
      const next = [
        {
          id: `plan-${Date.now()}-${saleName}`,
          assignedDate: new Date().toISOString().slice(0, 10),
          manager: 'Quản lý A',
          salesperson: saleName,
          category: 'Kho vải Bến Thành',
          target: 150000000,
          title: 'Báo cáo kế hoạch kho vải Bến Thành',
          attachmentName: '',
          status,
          note,
        },
        ...Array.isArray(existing) ? existing.filter((item: any) => !(item.salesperson === saleName && item.category === 'Kho vải Bến Thành')) : []
      ];
      window.localStorage.setItem('gusa-sales-plan-assigned', JSON.stringify(next));
      window.dispatchEvent(new Event('gusa-plan-sync'));
    } catch {
      // no-op
    }
  };

  const handleQuickSend = (saleName: string) => {
    setRows((previous) => previous.map((row) => row.sale === saleName ? { ...row, status: 'Đang thực hiện' } : row));
    saveToSalesPlan(saleName, 'Đang thực hiện', rows.find((row) => row.sale === saleName)?.note ?? '');
  };

  const handleOpenAssign = (saleName: string) => {
    const matched = rows.find((row) => row.sale === saleName);
    setSelectedSale(saleName);
    setDraft({
      date: new Date().toISOString().slice(0, 10),
      manager: 'Quản lý A',
      category: 'Kho vải Bến Thành',
      title: matched?.note ? `${matched.note}` : 'Báo cáo kế hoạch kho vải Bến Thành',
      status: 'Đang thực hiện',
      note: matched?.note ?? '',
      attachment: matched?.attachment ?? '',
    });
    setIsAssignOpen(true);
  };

  const handleSend = async () => {
    if (!selectedSaleId) {
      window.alert('Vui lòng chọn tài khoản sale.');
      return;
    }

    const response = await fetch('/api/plan-assignments', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ assigneeId: selectedSaleId, category: draft.category, title: draft.title, note: draft.note, status: draft.status, date: draft.date, attachmentName: draft.attachment }),
    });

    if (!response.ok) {
      const payload = await response.json().catch(() => ({ message: 'Không thể gửi giao việc. Vui lòng thử lại.' }));
      window.alert(payload.message ?? 'Không thể gửi giao việc. Vui lòng thử lại.');
      return;
    }

    const payload = await response.json();
    setRows((previous) => [{ id: payload.assignment?.id ?? crypto.randomUUID(), sale: selectedSale, date: draft.date, status: draft.status, note: draft.note, attachment: draft.attachment, sent: true }, ...previous]);
    saveToSalesPlan(selectedSale, draft.status as TaskRow['status'], draft.note || (rows.find((row) => row.sale === selectedSale)?.note ?? ''));
    setIsAssignOpen(false);
  };

  const handleReview = async (row: TaskRow, status: string) => {
    const response = await fetch('/api/plan-assignments', { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: row.id, status }) });
    if (!response.ok) return;
    setRows((previous) => previous.map((item) => item.id === row.id ? { ...item, status } : item));
  };

  const analyzeReport = async () => {
    if (!selectedReport || isAnalyzing) return;
    setIsAnalyzing(true); setAiAnalysis('Đang phân tích báo cáo...');
    try { const reportContent = selectedReport.note.trim(); const response = await fetch('/api/chat', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ message: `Bạn là người kiểm tra báo cáo Sale. Hãy phân tích trực tiếp nội dung báo cáo nằm giữa hai dấu bắt đầu/kết thúc, không trả lời chung chung và không bỏ qua nội dung này.\n\nBÁO CÁO SALE: ${selectedReport.sale}\nNgày: ${selectedReport.date}\n\n--- BẮT ĐẦU NỘI DUNG BÁO CÁO ---\n${reportContent || 'Sale chưa nhập nội dung báo cáo.'}\n--- KẾT THÚC NỘI DUNG BÁO CÁO ---\n\nHãy chỉ ra báo cáo đang nói gì, vấn đề/rủi ro cụ thể trong nội dung, mức độ đầy đủ và đề xuất xử lý thực tế.` }) }); const payload = await response.json(); setAiAnalysis(response.ok ? payload.reply : (payload.message ?? 'Không thể phân tích báo cáo.')); } catch { setAiAnalysis('Không thể kết nối AI để phân tích báo cáo.'); } finally { setIsAnalyzing(false); }
  };

  return (
    <main className="page-shell">
      <aside className="sidebar">
        <div className="brand-box">
          <div className="brand-mark">G</div>
          <div>
            <p className="eyebrow">Enterprise Suite</p>
            <h1>GUSA</h1>
          </div>
        </div>

        <nav className="nav">
          <span className="nav-title">Overview</span>
          <Link href="/" className="nav-item active">
            <span>◈</span>
            Dashboard quản lý
          </Link>

          <span className="nav-title">Dashboard</span>
          <Link href="/plan/fashion-q4" className="nav-item">
            <span>▦</span>
            Bảng giao kế hoạch
          </Link>

          <div style={{ margin: '8px 0 0', paddingLeft: '12px', display: 'flex', flexDirection: 'column', gap: '6px' }}>
            <Link href="/plan/fashion-q4" className="nav-item" style={{ padding: '8px 10px', borderRadius: '10px' }}>
              <span>▣</span>
              Báo cáo kế hoạch thời trang Quận 4
            </Link>
            <Link href="/plan/fabric-q4" className="nav-item" style={{ padding: '8px 10px', borderRadius: '10px' }}>
              <span>▣</span>
              Báo cáo kế hoạch kho vải Quận 4
            </Link>
            <Link href="/plan/fabric-ben-thanh" className="nav-item" style={{ padding: '8px 10px', borderRadius: '10px', background: 'rgba(92, 132, 180, 0.08)', border: '1px solid rgba(145, 175, 215, 0.15)' }}>
              <span>▣</span>
              Báo cáo kế hoạch kho vải Bến Thành
            </Link>
          </div>

          <span className="nav-title">Sale</span>
          <Link href="/sales-reports" className="nav-item">
            <span>▣</span>
            Báo cáo Sale nhập
          </Link>
          <Link href="/sales-plan" className="nav-item">
            <span>📋</span>
            Báo cáo kế hoạch
          </Link>
        </nav>
      </aside>

      <section className="content">
        <header className="topbar">
          <div>
            <p className="eyebrow">KHO VẢI BẾN THÀNH</p>
            <h2 style={{ margin: '6px 0 0' }}>Báo cáo kế hoạch kho vải Bến Thành</h2>
          </div>

          <div className="topbar-actions">
            <button type="button" onClick={() => {
              setSelectedSale(rows[0]?.sale ?? '');
              setSelectedSaleId(saleUsers[0]?.id ?? '');
              setDraft({
                date: new Date().toISOString().slice(0, 10),
                manager: 'Quản lý A',
                category: 'Kho vải Bến Thành',
                title: 'Giao việc mới',
                status: 'Đang thực hiện',
                note: '',
                attachment: '',
              });
              setIsAssignOpen(true);
            }} style={{ background: 'linear-gradient(135deg, #5fe5c4, #4fd0c5)', border: 'none', color: '#061d2b', padding: '10px 18px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer' }}>
              Giao việc
            </button>
            <Link href="/" className="ghost-btn" style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', textDecoration: 'none' }}>
              Quay lại dashboard
            </Link>
          </div>
        </header>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '16px', marginBottom: '22px', maxWidth: '620px' }}>
          <div className="metric-card" style={{ minWidth: '180px', width: '260px' }}>
            <div className="metric-header">
              <span>Tổng</span>
            </div>
            <strong>{rows.length}</strong>
          </div>

          <div className="metric-card" style={{ minWidth: '180px', width: '260px' }}>
            <div className="metric-header">
              <span>Đang thực hiện</span>
            </div>
            <strong>{totalActive}</strong>
          </div>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'flex-end', gap: '10px', marginBottom: '12px', padding: '12px 14px', background: 'rgba(11,26,38,0.72)', border: '1px solid rgba(115,133,163,0.22)', borderRadius: '12px' }}><label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#b9d8f8', fontSize: '11px', fontWeight: 700 }}>Tên sale<input value={saleFilter} onChange={(event) => setSaleFilter(event.target.value)} placeholder="Tìm tên sale" style={{ width: '180px', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(158,176,211,0.25)', background: 'rgba(15,26,38,0.8)', color: '#edf5ff' }} /></label><label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#b9d8f8', fontSize: '11px', fontWeight: 700 }}>Trạng thái<select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} style={{ width: '170px', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(158,176,211,0.25)', background: 'rgba(15,26,38,0.8)', color: '#edf5ff' }}><option value="">Tất cả trạng thái</option><option>Đang thực hiện</option><option>Chờ xác nhận</option><option>Đã duyệt</option><option>Không duyệt</option></select></label><label style={{ display: 'flex', flexDirection: 'column', gap: '5px', color: '#b9d8f8', fontSize: '11px', fontWeight: 700 }}>Ngày<input type="date" value={dateFilter} onChange={(event) => setDateFilter(event.target.value)} style={{ width: '150px', padding: '8px 10px', borderRadius: '8px', border: '1px solid rgba(158,176,211,0.25)', background: 'rgba(15,26,38,0.8)', color: '#edf5ff' }} /></label><button type="button" onClick={() => { setSaleFilter(''); setStatusFilter(''); setDateFilter(''); }} className="ghost-btn" style={{ padding: '8px 12px', fontSize: '11px' }}>Xóa lọc</button><span style={{ marginLeft: 'auto', color: '#8db7da', fontSize: '11px' }}>{filteredRows.length} kết quả</span></div><div style={{ background: 'rgba(11,26,38,0.88)', border: '1px solid rgba(115,133,163,0.28)', borderRadius: '18px', overflow: 'hidden' }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 2fr 1.2fr 1fr', gap: '10px', padding: '12px 14px', borderBottom: '1px solid rgba(158,176,211,0.18)', color: '#edf5ff', fontWeight: 700, fontSize: '0.7rem' }}>
            <div>Sale</div>
            <div>Ngày</div>
            <div>Trạng thái</div>
            <div>Ghi chú</div>
            <div>File</div>
            <div style={{ textAlign: 'right' }}>Action</div>
          </div>

          {filteredRows.map((row) => (
            <div key={row.id} style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr 2fr 1.2fr 1fr', gap: '10px', padding: '12px 14px', borderBottom: '1px solid rgba(158,176,211,0.12)', alignItems: 'center', fontSize: '0.84rem' }}>
              <div style={{ color: '#edf5ff', fontWeight: 700 }}>{row.sale}</div>
              <div style={{ color: '#edf5ff' }}>{row.date}</div>
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '102px', padding: '8px 10px', borderRadius: '999px', background: row.status === 'Đang thực hiện' ? 'rgba(59,130,246,0.12)' : 'rgba(245,158,11,0.12)', color: row.status === 'Đang thực hiện' ? '#67b8ff' : '#ffcb6b', fontWeight: 700, fontSize: '11px' }}>{row.status}</span>
              </div>
              <div title={row.note} style={{ color: '#dfeaf7', lineHeight: 1.45, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{row.note}</div>
              <div style={{ color: '#9ad7ff', fontWeight: 600 }}>{row.attachment}</div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                {row.status === 'Chờ xác nhận' ? <div style={{ display: 'flex', flexDirection: 'row', gap: '4px', flexWrap: 'nowrap', justifyContent: 'flex-end', whiteSpace: 'nowrap' }}>
                  <button type="button" onClick={() => handleReview(row, 'Đã duyệt')} style={{ border: 'none', background: '#5fe5c4', color: '#061d2b', borderRadius: '7px', padding: '6px 7px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>Duyệt</button>
                  <button type="button" onClick={() => handleReview(row, 'Không duyệt')} style={{ border: '1px solid rgba(255, 130, 130, 0.45)', background: 'rgba(255, 100, 100, 0.12)', color: '#ffabab', borderRadius: '7px', padding: '6px 7px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>Không duyệt</button>
                  <button type="button" onClick={() => setSelectedReport(row)} style={{ border: '1px solid rgba(141, 183, 218, 0.35)', background: 'rgba(141, 183, 218, 0.12)', color: '#b9d8f8', borderRadius: '7px', padding: '6px 7px', fontWeight: 800, fontSize: '11px', cursor: 'pointer' }}>Xem báo cáo</button>
                </div> : row.status === 'Đã duyệt' || row.status === 'Không duyệt' ? <button type="button" onClick={() => setSelectedReport(row)} style={{ border: '1px solid rgba(141, 183, 218, 0.35)', background: 'rgba(141, 183, 218, 0.12)', color: '#b9d8f8', borderRadius: '7px', padding: '6px 9px', fontWeight: 800, fontSize: '11px', cursor: 'pointer', whiteSpace: 'nowrap' }}>Xem lại báo cáo</button> : <button
                  type="button"
                  onClick={() => handleQuickSend(row.sale)}
                  disabled={row.sent}
                  style={{ border: 'none', background: row.sent ? 'rgba(125, 145, 165, 0.35)' : 'linear-gradient(135deg, #5fe5c4, #4fd0c5)', color: row.sent ? '#b9c7d6' : '#061d2b', borderRadius: '10px', padding: '10px 16px', fontWeight: 800, cursor: row.sent ? 'default' : 'pointer' }}
                >
                  {row.sent ? 'Đã gửi' : 'Chưa gửi'}
                </button>}
              </div>
            </div>
          ))}
        </div>
      </section>

      {selectedReport && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 8, 16, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => setSelectedReport(null)}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: 'min(760px, calc(100vw - 32px))', maxHeight: '88vh', overflowY: 'auto', overflowX: 'hidden', boxSizing: 'border-box', background: 'rgba(15, 27, 38, 0.98)', border: '1px solid rgba(140, 160, 190, 0.25)', borderRadius: '18px', padding: '22px 20px', boxShadow: '0 24px 45px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}><div><p className="eyebrow" style={{ marginBottom: '6px' }}>SALE REPORT</p><h3 style={{ margin: 0, color: '#edf5ff', fontSize: '1.7rem' }}>Báo cáo của {selectedReport.sale}</h3></div><button type="button" onClick={() => setSelectedReport(null)} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>×</button></div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}><div><small style={{ color: '#8db7da' }}>Sale</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedReport.sale}</p></div><div><small style={{ color: '#8db7da' }}>Ngày báo cáo</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedReport.date}</p></div><div><small style={{ color: '#8db7da' }}>Trạng thái</small><p style={{ margin: '6px 0 0', color: '#ffcb6b', fontWeight: 700 }}>{selectedReport.status}</p></div><div><small style={{ color: '#8db7da' }}>File</small><p style={{ margin: '6px 0 0', color: '#9ad7ff', fontWeight: 700 }}>{selectedReport.attachment || 'Không có file'}</p></div></div>
            <div style={{ marginTop: '18px', minWidth: 0 }}><small style={{ color: '#8db7da' }}>Nội dung báo cáo</small><p style={{ margin: '8px 0 0', padding: '12px 14px', minHeight: '100px', maxHeight: '240px', overflowY: 'auto', overflowWrap: 'anywhere', color: '#dfeaf7', background: 'rgba(15, 26, 38, 0.8)', border: '1px solid rgba(158, 176, 211, 0.25)', borderRadius: '10px', whiteSpace: 'pre-wrap' }}>{selectedReport.note || 'Sale chưa nhập nội dung báo cáo.'}</p></div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '18px' }}><button type="button" onClick={analyzeReport} disabled={isAnalyzing} style={{ border: 'none', background: isAnalyzing ? 'rgba(125,145,165,0.35)' : 'linear-gradient(135deg, #8b9cff, #6f7cf0)', color: '#fff', borderRadius: '9px', padding: '9px 14px', fontWeight: 800, cursor: isAnalyzing ? 'default' : 'pointer' }}>{isAnalyzing ? 'Đang phân tích...' : 'Phân tích AI'}</button></div>
            {aiAnalysis && <div style={{ marginTop: '14px', padding: '14px', background: 'rgba(111,124,240,0.1)', border: '1px solid rgba(139,156,255,0.3)', borderRadius: '10px', color: '#dfe7ff', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}><strong style={{ color: '#aebaff' }}>Kết quả phân tích AI</strong><p style={{ margin: '8px 0 0' }}>{aiAnalysis}</p></div>}
          </div>
        </div>
      )}

      {isAssignOpen && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 8, 16, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }} onClick={() => setIsAssignOpen(false)}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '560px', background: 'rgba(15, 27, 38, 0.98)', border: '1px solid rgba(140, 160, 190, 0.25)', borderRadius: '18px', padding: '22px 20px', boxShadow: '0 24px 45px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, color: '#edf5ff', fontSize: '1.7rem' }}>Giao công việc</h3>
              <button type="button" onClick={() => setIsAssignOpen(false)} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Ngày</span>
                <input type="date" value={draft.date} onChange={(e) => setDraft((prev) => ({ ...prev, date: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Quản lý</span>
                <input value={draft.manager} readOnly style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Tên sale</span>
                <select value={selectedSaleId} onChange={(event) => { const user = saleUsers.find((item) => item.id === event.target.value); setSelectedSaleId(event.target.value); setSelectedSale(user?.name ?? ''); }} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }}>
                  <option value="">Chọn tài khoản sale</option>
                  {saleUsers.map((user) => <option key={user.id} value={user.id}>{user.name} · {user.email}</option>)}
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Phân loại</span>
                <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }}>
                  <option value="Thời trang Quận 4">Thời trang Quận 4</option>
                  <option value="Kho vải Quận 4">Kho vải Quận 4</option>
                  <option value="Kho vải Bến Thành">Kho vải Bến Thành</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>Tiêu đề</span>
              <input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>File đính kèm</span>
              <input type="file" onChange={(e) => setDraft((prev) => ({ ...prev, attachment: e.target.files && e.target.files[0] ? e.target.files[0].name : '' }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>Ghi chú</span>
              <textarea value={draft.note} onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))} rows={4} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff', resize: 'vertical' }} />
            </label>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={() => setIsAssignOpen(false)} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer' }}>Hủy</button>
              <button type="button" onClick={handleSend} style={{ background: 'linear-gradient(135deg, #5fe5c4, #4cd2da)', border: 'none', color: '#061d2b', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800 }}>Lưu giao việc</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
