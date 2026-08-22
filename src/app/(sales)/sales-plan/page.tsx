'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';

type AssignmentRecord = {
  id: string;
  assignedDate: string;
  manager: string;
  salesperson: string;
  category: 'Vải Bến Thành' | 'Vải Quận 4' | 'Thời trang Quận 4';
  target: number;
  title?: string;
  attachmentName?: string;
  status: 'Đang thực hiện' | 'Chờ xác nhận' | 'Đã duyệt' | 'Không duyệt' | 'Đã hoàn thành';
  note: string;
  assigneeId?: string;
};

type PlanReport = {
  id: string;
  assignedDate: string;
  manager: string;
  salesperson: string;
  category: 'Vải Bến Thành' | 'Vải Quận 4' | 'Thời trang Quận 4';
  target: number;
  title?: string;
  attachmentName?: string;
  status: 'Đang thực hiện' | 'Chờ xác nhận' | 'Đã duyệt' | 'Không duyệt' | 'Đã hoàn thành';
  note: string;
};

type AssignmentPayload = {
  id: string;
  date?: string;
  manager?: { name?: string };
  assignee?: { name?: string; email?: string };
  category?: string;
  title?: string;
  attachmentName?: string;
  status?: string;
  note?: string;
};

const storageKey = 'gusa-sales-plan-assigned';

const seedPlans: PlanReport[] = [
  {
    id: 'plan-1',
    assignedDate: '2026-08-20',
    manager: 'Quản lý A',
    salesperson: 'Nguyễn Văn Sale 1',
    category: 'Thời trang Quận 4',
    target: 150000000,
    status: 'Chờ xác nhận',
    note: 'Mở đợt bán mới cho cửa hàng khu vực Q4.',
  },
  {
    id: 'plan-2',
    assignedDate: '2026-08-18',
    manager: 'Quản lý B',
    salesperson: 'Trần Thị Sale 2',
    category: 'Vải Quận 4',
    target: 200000000,
    status: 'Đang thực hiện',
    note: 'Tập trung theo đơn hàng lớn và khách hàng lâu năm.',
  },
  {
    id: 'plan-3',
    assignedDate: '2026-08-15',
    manager: 'Quản lý C',
    salesperson: 'Lê Văn Sale 3',
    category: 'Vải Bến Thành',
    target: 120000000,
    status: 'Chờ xác nhận',
    note: 'Khuyến khích khách hàng xả hàng theo nhóm sản phẩm.',
  },
];

const formatVnd = (value: number) => new Intl.NumberFormat('vi-VN', {
  style: 'currency',
  currency: 'VND',
  maximumFractionDigits: 0,
}).format(value);

export default function SalesPlanPage() {
  const [sessionUser, setSessionUser] = useState<{ id?: string; name?: string; email?: string; role?: string } | null>(null);
  const [draft, setDraft] = useState({
    assignedDate: new Date().toISOString().slice(0, 10),
    manager: 'Quản lý A',
    salesperson: 'Nguyễn Văn Sale 1',
    category: 'Thời trang Quận 4',
    title: '',
    target: '150000000',
    status: 'Đang thực hiện',
    note: '',
  });

  useEffect(() => {
    fetch('/api/session')
      .then((response) => response.ok ? response.json() : { user: null })
      .then((payload) => {
        const user = payload.user ?? null;
        setSessionUser(user);
        setDraft((previous) => ({ ...previous, salesperson: user?.name ?? previous.salesperson }));
      })
      .catch(() => setSessionUser(null));
  }, []);

  const syncPlans = () => {
    try {
      void fetch('/api/plan-assignments')
        .then(async (response) => response.ok ? response.json() : { assignments: [] })
        .then((payload) => {
          const items = Array.isArray(payload.assignments) ? payload.assignments : [];
          const mapped: PlanReport[] = items.map((assignment: AssignmentPayload) => ({
            id: assignment.id,
            assignedDate: assignment.date,
            manager: assignment.manager?.name ?? 'Quản lý',
            salesperson: assignment.assignee?.name ?? assignment.assignee?.email ?? 'Sale',
            category: (assignment.category as PlanReport['category']) ?? 'Thời trang Quận 4',
            target: 0,
            title: assignment.title,
            attachmentName: assignment.attachmentName ?? '',
            status: (assignment.status as PlanReport['status']) ?? 'Đang thực hiện',
            note: assignment.note ?? '',
          }));

          if (!mapped.length && !sessionUser?.id) {
            setPlans(seedPlans);
            return;
          }

          setPlans(mapped.length ? mapped : []);
        })
        .catch(() => setPlans(seedPlans));
    } catch {
      setPlans(seedPlans);
    }
  };

  const [plans, setPlans] = useState<PlanReport[]>(() => {
    try {
      const stored = window.localStorage.getItem(storageKey);
      if (!stored) {
        window.localStorage.setItem(storageKey, JSON.stringify(seedPlans));
        return seedPlans;
      }
      return JSON.parse(stored) as PlanReport[];
    } catch {
      return seedPlans;
    }
  });

  useEffect(() => {
    syncPlans();

    const handleStorage = () => syncPlans();
    const handleLocalSync = () => syncPlans();
    const refreshAssignments = () => syncPlans();
    const refreshTimer = window.setInterval(refreshAssignments, 3000);

    window.addEventListener('storage', handleStorage);
    window.addEventListener('gusa-plan-sync', handleLocalSync);
    window.addEventListener('focus', refreshAssignments);

    return () => {
      window.removeEventListener('storage', handleStorage);
      window.removeEventListener('gusa-plan-sync', handleLocalSync);
      window.removeEventListener('focus', refreshAssignments);
      window.clearInterval(refreshTimer);
    };
  }, [sessionUser?.id]);

  const filteredPlans = !sessionUser?.id
    ? plans
    : plans.filter((plan) => {
        const assigneeId = (plan as AssignmentRecord & { assigneeId?: string }).assigneeId;
        return !assigneeId || assigneeId === sessionUser.id;
      });

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isDetailOpen, setIsDetailOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<PlanReport | null>(null);
  const [selectedPlanId, setSelectedPlanId] = useState<string | null>(null);
  const [selectedFileName, setSelectedFileName] = useState('');

  const openModal = (plan?: PlanReport) => {
    if (plan) {
      setSelectedPlanId(plan.id);
      setDraft({
        assignedDate: new Date().toISOString().slice(0, 10),
        manager: '',
        salesperson: sessionUser?.name ?? '',
        category: plan.category,
        title: '',
        target: '0',
        status: 'Chờ xác nhận',
        note: '',
      });
      setSelectedFileName('');
    } else {
      setSelectedPlanId(null);
      setDraft({
        assignedDate: new Date().toISOString().slice(0, 10),
        manager: 'Quản lý A',
        salesperson: sessionUser?.name ?? '',
        category: 'Thời trang Quận 4',
        title: '',
        target: '0',
        status: 'Đang thực hiện',
        note: '',
      });
      setSelectedFileName('');
    }
    setIsModalOpen(true);
  };

  const closeModal = () => setIsModalOpen(false);

  const openDetails = (plan: PlanReport) => {
    setSelectedPlan(plan);
    setIsDetailOpen(true);
  };

  const handleSave = async () => {
    const normalizedPlan: PlanReport = {
      id: selectedPlanId ?? `plan-${Date.now()}`,
      assignedDate: draft.assignedDate,
      manager: draft.manager,
      salesperson: draft.salesperson,
      category: draft.category as PlanReport['category'],
      target: Number(draft.target) || 0,
      title: draft.title.trim(),
      attachmentName: selectedFileName || undefined,
      status: draft.status as PlanReport['status'],
      note: draft.note,
    };

    if (selectedPlanId) {
      const response = await fetch('/api/plan-assignments', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: selectedPlanId, status: normalizedPlan.status, note: normalizedPlan.note }),
      });

      if (!response.ok) {
        const payload = await response.json().catch(() => ({ message: 'Không thể cập nhật trạng thái.' }));
        window.alert(payload.message ?? 'Không thể cập nhật trạng thái.');
        return;
      }

      setPlans((previous) => previous.map((plan) => plan.id === selectedPlanId ? { ...plan, status: normalizedPlan.status, note: normalizedPlan.note } : plan));
      closeModal();
      return;
    }

    setPlans((previous) => {
      const next = selectedPlanId
        ? previous.map((plan) => plan.id === selectedPlanId ? normalizedPlan : plan)
        : [normalizedPlan, ...previous];
      window.localStorage.setItem(storageKey, JSON.stringify(next));
      return next;
    });

    closeModal();
  };

  return (
    <div style={{ flex: 1, maxWidth: '1360px', fontFamily: 'Inter, "Segoe UI", sans-serif' }}>
      <header style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '20px' }}>
        <div>
          <div style={{ fontSize: '0.72rem', letterSpacing: '0.14em', textTransform: 'uppercase', color: '#8db7da', fontWeight: 700, marginBottom: '8px' }}>PLAN</div>
          <h1 style={{ margin: 0, fontSize: '2.3rem', lineHeight: 1.08, letterSpacing: '-0.05em', color: '#edf5ff', fontWeight: 800 }}>Nhập báo cáo kế hoạch</h1>
        </div>

        <div style={{ display: 'flex', gap: '12px', marginTop: '8px' }}>
          <button type="button" onClick={() => openModal()} style={{ background: 'linear-gradient(135deg, #5fe5c4, #4fd0c5)', border: 'none', color: '#061d2b', padding: '10px 18px', borderRadius: '12px', fontWeight: 800, cursor: 'pointer', minWidth: '118px', boxShadow: '0 8px 18px rgba(79, 208, 197, 0.25)', fontSize: '0.95rem' }}>Form nhập</button>
          <button type="button" onClick={() => window.location.reload()} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.35)', color: '#edf5ff', padding: '10px 18px', borderRadius: '12px', fontWeight: 700, cursor: 'pointer', minWidth: '104px', fontSize: '0.95rem' }}>Refresh</button>
        </div>
      </header>

      <section className="sales-plan-panel" style={{ width: '100%', maxWidth: '1100px', background: 'rgba(11, 26, 38, 0.88)', border: '1px solid rgba(115, 133, 163, 0.28)', borderRadius: '16px', padding: '20px 20px 18px', minHeight: '420px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <div>
            <div style={{ fontSize: '0.72rem', letterSpacing: '0.12em', textTransform: 'uppercase', color: '#8db7da', fontWeight: 700, marginBottom: '8px' }}>PLAN REPORT</div>
            <h2 style={{ margin: 0, fontSize: '1.7rem', color: '#edf5ff', fontWeight: 800, letterSpacing: '-0.04em' }}>Nhập thông tin kế hoạch</h2>
          </div>
          <button type="button" onClick={() => openModal()} style={{ background: 'rgba(234, 179, 8, 0.12)', border: '1px solid rgba(234, 179, 8, 0.25)', color: '#f5d76e', borderRadius: '14px', padding: '8px 16px', fontWeight: 700, cursor: 'pointer', fontSize: '0.9rem' }}>Mới</button>
        </div>

        <div className="sales-plan-table-header" style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr 0.9fr 1.2fr', gap: '12px', padding: '0 4px 10px', color: '#edf5ff', fontWeight: 700, fontSize: '0.78rem', alignItems: 'end', letterSpacing: '0.02em' }}>
          <div>Ngày</div>
          <div>Quản lý</div>
          <div>Sale</div>
          <div>Phân loại</div>
          <div>Trạng thái</div>
          <div style={{ textAlign: 'right' }}></div>
        </div>

        <div className="sales-plan-table-list" style={{ display: 'flex', flexDirection: 'column', gap: '14px', padding: '0 4px 4px' }}>
          {filteredPlans.map((plan) => (
            <div className="sales-plan-table-row" key={plan.id} style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1fr 1.4fr 0.9fr 1.2fr', gap: '12px', alignItems: 'center', background: 'rgba(26, 45, 58, 0.7)', border: '1px solid rgba(158, 176, 211, 0.2)', borderRadius: '14px', padding: '16px 14px', minHeight: '70px', boxShadow: '0 6px 16px rgba(2, 8, 23, 0.12)' }}>
              <div style={{ color: '#edf5ff', fontWeight: 700, fontSize: '1.1rem', whiteSpace: 'pre-line', lineHeight: '1.25' }}>{plan.assignedDate.replace(/-/g, '\n').replace(/^(\d{4})\n(\d{2})\n(\d{2})$/, '$1-\n$2-$3')}</div>
              <div style={{ color: '#edf5ff', fontWeight: 700, fontSize: '1rem', whiteSpace: 'pre-line', lineHeight: '1.35' }}>{plan.manager}</div>
              <div style={{ color: '#edf5ff', fontWeight: 700, fontSize: '1rem', whiteSpace: 'pre-line', lineHeight: '1.35' }}>{plan.salesperson}</div>
              <div style={{ color: '#edf5ff', fontWeight: 700, fontSize: '1rem', whiteSpace: 'pre-line', lineHeight: '1.35' }}>{plan.category}</div>
              <div>
                <span style={{ display: 'inline-flex', alignItems: 'center', justifyContent: 'center', minWidth: '86px', padding: '7px 10px', borderRadius: '999px', background: plan.status === 'Đã duyệt' || plan.status === 'Đã hoàn thành' ? 'rgba(52,211,153,0.12)' : plan.status === 'Không duyệt' ? 'rgba(255,100,100,0.12)' : plan.status === 'Chờ xác nhận' ? 'rgba(245,158,11,0.12)' : 'rgba(59,130,246,0.12)', color: plan.status === 'Đã duyệt' || plan.status === 'Đã hoàn thành' ? '#59e1a4' : plan.status === 'Không duyệt' ? '#ffabab' : plan.status === 'Chờ xác nhận' ? '#ffcb6b' : '#67b8ff', fontWeight: 700, fontSize: '11px' }}>{plan.status}</span>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button type="button" onClick={() => openDetails(plan)} style={{ background: 'rgba(141, 183, 218, 0.12)', border: '1px solid rgba(141, 183, 218, 0.35)', color: '#b9d8f8', padding: '10px 14px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', fontSize: '0.92rem' }}>Xem</button>
                  {plan.status === 'Đã duyệt' || plan.status === 'Không duyệt' ? (
                    <button type="button" disabled style={{ background: 'rgba(125, 145, 165, 0.35)', border: 'none', color: plan.status === 'Đã duyệt' ? '#8ff0c9' : '#ffabab', padding: '10px 16px', borderRadius: '10px', fontWeight: 800, cursor: 'default', minWidth: '128px', fontSize: '0.92rem' }}>{plan.status}</button>
                  ) : (
                    <button type="button" onClick={() => openModal(plan)} style={{ background: 'linear-gradient(135deg, #5fe5c4, #46d0c9)', border: 'none', color: '#061d2b', padding: '10px 16px', borderRadius: '10px', fontWeight: 800, cursor: 'pointer', minWidth: '128px', boxShadow: '0 8px 20px rgba(92, 229, 196, 0.2)', fontSize: '0.92rem' }}>Nhập báo cáo</button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      </section>

      {isDetailOpen && selectedPlan && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(2, 8, 16, 0.7)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 60 }} onClick={() => setIsDetailOpen(false)}>
          <div onClick={(event) => event.stopPropagation()} style={{ width: '560px', background: 'rgba(15, 27, 38, 0.98)', border: '1px solid rgba(140, 160, 190, 0.25)', borderRadius: '18px', padding: '22px 20px', boxShadow: '0 24px 45px rgba(0,0,0,0.28)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <p className="eyebrow" style={{ marginBottom: '6px' }}>Chi tiết công việc</p>
                <h3 style={{ margin: 0, color: '#edf5ff', fontSize: '1.7rem' }}>{selectedPlan.title || 'Công việc được giao'}</h3>
              </div>
              <button type="button" onClick={() => setIsDetailOpen(false)} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>×</button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <div><small style={{ color: '#8db7da' }}>Người giao</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedPlan.manager}</p></div>
              <div><small style={{ color: '#8db7da' }}>Ngày giao</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedPlan.assignedDate}</p></div>
              <div><small style={{ color: '#8db7da' }}>Sale nhận</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedPlan.salesperson}</p></div>
              <div><small style={{ color: '#8db7da' }}>Phân loại</small><p style={{ margin: '6px 0 0', color: '#edf5ff', fontWeight: 700 }}>{selectedPlan.category}</p></div>
            </div>

            <div style={{ marginTop: '18px' }}><small style={{ color: '#8db7da' }}>Nội dung / ghi chú</small><p style={{ margin: '8px 0 0', padding: '12px 14px', minHeight: '72px', color: '#dfeaf7', background: 'rgba(15, 26, 38, 0.8)', border: '1px solid rgba(158, 176, 211, 0.25)', borderRadius: '10px', whiteSpace: 'pre-wrap' }}>{selectedPlan.note || 'Không có nội dung ghi chú.'}</p></div>
            <div style={{ marginTop: '16px' }}><small style={{ color: '#8db7da' }}>File đính kèm</small><p style={{ margin: '8px 0 0', color: selectedPlan.attachmentName ? '#9ad7ff' : '#9aaabd', fontWeight: 700 }}>{selectedPlan.attachmentName || 'Không có file đính kèm.'}</p></div>
          </div>
        </div>
      )}

      {isModalOpen && (
        <div className="sales-plan-modal-overlay" onClick={closeModal}>
          <div className="sales-plan-modal" onClick={(event) => event.stopPropagation()}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <h3 style={{ margin: 0, color: '#edf5ff', fontSize: '1.7rem' }}>Báo cáo kế hoạch</h3>
              <button type="button" onClick={closeModal} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', width: '32px', height: '32px', borderRadius: '8px', cursor: 'pointer' }}>×</button>
            </div>

            <div className="sales-plan-modal-fields" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '14px' }}>
              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Ngày</span>
                <input type="date" value={draft.assignedDate} onChange={(e) => setDraft((prev) => ({ ...prev, assignedDate: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Quản lý</span>
                <input readOnly value={draft.manager} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Tên sale</span>
                <input value={draft.salesperson} readOnly placeholder="Tên tài khoản đang đăng nhập" style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Phân loại</span>
                <select value={draft.category} onChange={(e) => setDraft((prev) => ({ ...prev, category: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }}>
                  <option value="Thời trang Quận 4">Thời trang Quận 4</option>
                  <option value="Kho vải Quận 4">Kho vải Quận 4</option>
                  <option value="Kho vải Bến Thành">Kho vải Bến Thành</option>
                </select>
              </label>

              <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7' }}>
                <span>Trạng thái</span>
                <select value={draft.status} onChange={(e) => setDraft((prev) => ({ ...prev, status: e.target.value }))} style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }}>
                  <option value="Đang thực hiện">Đang thực hiện</option>
                  <option value="Chờ xác nhận">Chờ xác nhận</option>
                </select>
              </label>
            </div>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>Tiêu đề</span>
              <input value={draft.title} onChange={(e) => setDraft((prev) => ({ ...prev, title: e.target.value }))} placeholder="Nhập tiêu đề báo cáo" style={{ width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }} />
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>File đính kèm</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff' }}>
                <input
                  type="file"
                  onChange={(e) => setSelectedFileName(e.target.files && e.target.files[0] ? e.target.files[0].name : '')}
                  style={{ flex: 1, color: '#edf5ff' }}
                />
              </div>
              {selectedFileName && (
                <small style={{ color: '#9ec2e8' }}>Đã chọn: {selectedFileName}</small>
              )}
            </label>

            <label style={{ display: 'flex', flexDirection: 'column', gap: '8px', color: '#dfeaf7', marginTop: '16px' }}>
              <span>Ghi chú</span>
              <textarea value={draft.note} onChange={(e) => setDraft((prev) => ({ ...prev, note: e.target.value }))} placeholder="Nhập ghi chú kế hoạch..." rows={5} style={{ width: '100%', padding: '12px 14px', borderRadius: '10px', border: '1px solid rgba(158, 176, 211, 0.25)', background: 'rgba(15, 26, 38, 0.8)', color: '#edf5ff', resize: 'vertical' }} />
            </label>

            <div className="sales-plan-modal-actions" style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
              <button type="button" onClick={closeModal} style={{ background: 'transparent', border: '1px solid rgba(158, 176, 211, 0.25)', color: '#edf5ff', padding: '10px 18px', borderRadius: '10px', cursor: 'pointer' }}>Hủy</button>
              <button type="button" onClick={handleSave} style={{ background: 'linear-gradient(135deg, #5fe5c4, #4cd2da)', border: 'none', color: '#061d2b', padding: '10px 20px', borderRadius: '10px', cursor: 'pointer', fontWeight: 800 }}>Lưu báo cáo</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
