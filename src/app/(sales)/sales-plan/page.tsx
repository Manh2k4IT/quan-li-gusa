'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import UserAvatar from '@/components/user-avatar';

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

const PLAN_STATUS_TABS: { label: string; value: PlanReport['status'] | ''; tone: string }[] = [
  { label: 'Tất cả', value: '', tone: 'all' },
  { label: 'Đang thực hiện', value: 'Đang thực hiện', tone: 'progress' },
  { label: 'Chờ xác nhận', value: 'Chờ xác nhận', tone: 'pending' },
  { label: 'Đã duyệt', value: 'Đã duyệt', tone: 'done' },
  { label: 'Không duyệt', value: 'Không duyệt', tone: 'rejected' },
];

function statusTone(status: PlanReport['status']) {
  if (status === 'Đã duyệt' || status === 'Đã hoàn thành') return 'done';
  if (status === 'Không duyệt') return 'rejected';
  if (status === 'Chờ xác nhận') return 'pending';
  return 'progress';
}

function formatPlanDate(value: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})/.exec(value);
  return match ? `${match[3]}/${match[2]}/${match[1]}` : value;
}

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
  salespersonId?: string;
};

type AssignmentPayload = {
  id: string;
  date?: string;
  manager?: { name?: string };
  assignee?: { id?: string; name?: string; email?: string };
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
            salespersonId: assignment.assignee?.id,
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
    const refreshTimer = window.setInterval(() => { if (!document.hidden) refreshAssignments(); }, 30_000);

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

  const [statusFilter, setStatusFilter] = useState<PlanReport['status'] | ''>('');
  const visiblePlans = statusFilter ? filteredPlans.filter((plan) => plan.status === statusFilter) : filteredPlans;
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
    <div className="plan-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">Kế hoạch</p>
          <h1>Báo cáo kế hoạch</h1>
          <p className="users-subtitle">Các kế hoạch quản lý đã giao. Bấm “Nhập báo cáo” để cập nhật tiến độ, “Xem” để xem chi tiết.</p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost-btn" onClick={() => window.location.reload()}>Làm mới</button>
          <button type="button" className="primary-btn" onClick={() => openModal()}>+ Nhập kế hoạch</button>
        </div>
      </header>

      <section className="plan-status-tabs">
        {PLAN_STATUS_TABS.map((tab) => {
          const count = tab.value ? filteredPlans.filter((plan) => plan.status === tab.value).length : filteredPlans.length;
          return (
            <button
              key={tab.label}
              type="button"
              className={`plan-status-tab plan-tone-${tab.tone}${statusFilter === tab.value ? ' active' : ''}`}
              onClick={() => setStatusFilter(tab.value)}
            >
              <small>{tab.label}</small>
              <strong>{count}</strong>
            </button>
          );
        })}
      </section>

      <section className="users-card">
        <div className="users-card-header">
          <h3>{statusFilter || 'Tất cả kế hoạch'}</h3>
          <span className="users-count">{visiblePlans.length} kế hoạch</span>
        </div>

        {visiblePlans.length === 0 ? (
          <div className="users-empty">Không có kế hoạch nào{statusFilter ? ` ở trạng thái "${statusFilter}"` : ''}.</div>
        ) : (
          <div className="users-table-scroll">
            <table className="users-table plan-table">
              <thead>
                <tr>
                  <th>Ngày giao</th>
                  <th>Kế hoạch</th>
                  <th>Sale</th>
                  <th>Phân loại</th>
                  <th>Trạng thái</th>
                  <th aria-label="Thao tác" />
                </tr>
              </thead>
              <tbody>
                {visiblePlans.map((plan) => {
                  const isClosed = plan.status === 'Đã duyệt' || plan.status === 'Không duyệt';
                  return (
                    <tr key={plan.id}>
                      <td className="users-date">{formatPlanDate(plan.assignedDate)}<small className="cx-sub">bởi {plan.manager}</small></td>
                      <td className="plan-title-cell">
                        <strong>{plan.title || 'Kế hoạch được giao'}</strong>
                        {plan.note ? <small>{plan.note}</small> : null}
                      </td>
                      <td>
                        <div className="users-identity">
                          <UserAvatar name={plan.salesperson} userId={plan.salespersonId} />
                          <strong>{plan.salesperson}</strong>
                        </div>
                      </td>
                      <td><span className="cx-group">{plan.category}</span></td>
                      <td><span className={`plan-status plan-tone-${statusTone(plan.status)}`}>{plan.status}</span></td>
                      <td>
                        <div className="cx-row-actions">
                          <button type="button" className="ghost-btn users-save" onClick={() => openDetails(plan)}>Xem</button>
                          {isClosed ? null : (
                            <button type="button" className="primary-btn users-save" onClick={() => openModal(plan)}>Nhập báo cáo</button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
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
