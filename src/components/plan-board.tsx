'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { Icon } from '@/components/icons';
import UserAvatar from '@/components/user-avatar';
import { formatDate, formatVnd } from '@/components/customer-directory-view';
import { categorySlug, PLAN_CATEGORIES, planStage, STAGE_META, type PlanStage, type PlanView } from '@/lib/plan-workflow';

type Mode = 'sale' | 'manager';
type TabKey = 'action' | 'progress' | 'pending' | 'done' | 'closed' | 'all';
type Dialog =
  | { type: 'create' }
  | { type: 'report'; plan: PlanView }
  | { type: 'detail'; plan: PlanView }
  | null;

const TABS: Record<TabKey, { label: string; tone: string; stages: PlanStage[] | null }> = {
  action: { label: 'Cần xử lý', tone: 'action', stages: null },
  progress: { label: 'Đang thực hiện', tone: 'progress', stages: ['inProgress', 'revise'] },
  pending: { label: 'Chờ duyệt', tone: 'pending', stages: ['proposed', 'reported'] },
  done: { label: 'Hoàn thành', tone: 'done', stages: ['done'] },
  closed: { label: 'Không đạt / Từ chối', tone: 'rejected', stages: ['failed', 'declined'] },
  all: { label: 'Tất cả', tone: 'all', stages: null },
};

// What needs this person's attention: managers review, sales execute.
const ACTION_STAGES: Record<Mode, PlanStage[]> = { manager: ['proposed', 'reported'], sale: ['inProgress', 'revise'] };

const today = () => new Date().toISOString().slice(0, 10);

async function callApi(method: 'POST' | 'PATCH', body: Record<string, unknown>) {
  const response = await fetch('/api/plan-assignments', { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.message ?? 'Không thể lưu, vui lòng thử lại.');
  return payload.plan as PlanView;
}

export default function PlanBoard({ mode, initialCategory = '' }: { mode: Mode; initialCategory?: string }) {
  const [plans, setPlans] = useState<PlanView[] | null>(null);
  const [error, setError] = useState('');
  const [sales, setSales] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<TabKey>('action');
  const [category, setCategory] = useState(initialCategory);
  const [saleId, setSaleId] = useState('');
  const [query, setQuery] = useState('');
  const [dialog, setDialog] = useState<Dialog>(null);
  const isManager = mode === 'manager';

  const load = useCallback(() => {
    fetch('/api/plan-assignments', { cache: 'no-store' })
      .then(async (response) => {
        const payload = await response.json();
        if (!response.ok) throw new Error(payload.message ?? 'Không thể tải kế hoạch.');
        setPlans(payload.plans);
        setError('');
      })
      .catch((loadError) => setError(loadError instanceof Error ? loadError.message : 'Không thể tải kế hoạch.'));
  }, []);

  useEffect(() => {
    load();
    if (isManager) {
      fetch('/api/users?role=SALE').then((response) => response.json()).then((payload) => setSales(payload.users ?? [])).catch(() => setSales([]));
    }
  }, [isManager, load]);

  const replacePlan = (plan: PlanView) => setPlans((current) => [plan, ...(current ?? []).filter((item) => item.id !== plan.id)]);

  const scoped = useMemo(() => (plans ?? []).filter((plan) => {
    if (category && categorySlug(plan.category) !== category) return false;
    if (saleId && plan.assignee.id !== saleId) return false;
    if (query && !`${plan.title} ${plan.assignee.name}`.toLowerCase().includes(query.toLowerCase())) return false;
    return true;
  }), [plans, category, saleId, query]);

  const inTab = (key: TabKey, plan: PlanView) => {
    const stage = planStage(plan);
    if (key === 'all') return true;
    if (key === 'action') return ACTION_STAGES[mode].includes(stage);
    return TABS[key].stages!.includes(stage);
  };
  const visible = scoped.filter((plan) => inTab(tab, plan));

  return (
    <div className="plan-page">
      <header className="page-header">
        <div>
          <p className="eyebrow">{isManager ? 'Vận hành' : 'Kế hoạch'}</p>
          <h1>{isManager ? 'Giao & duyệt kế hoạch' : 'Kế hoạch của tôi'}</h1>
          <p className="users-subtitle">
            {isManager
              ? 'Giao kế hoạch cho Sale, duyệt kế hoạch Sale đề xuất và duyệt báo cáo thực hiện.'
              : 'Kế hoạch quản lý giao và kế hoạch bạn đề xuất. Thực hiện xong thì nộp báo cáo để quản lý duyệt.'}
          </p>
        </div>
        <div className="topbar-actions">
          <button type="button" className="ghost-btn" onClick={load}>Làm mới</button>
          <button type="button" className="primary-btn" onClick={() => setDialog({ type: 'create' })}>{isManager ? '+ Giao kế hoạch' : '+ Đề xuất kế hoạch'}</button>
        </div>
      </header>

      <ol className="plan-flow" aria-label="Quy trình kế hoạch">
        <li><span>1</span><div><strong>{isManager ? 'Giao hoặc duyệt đề xuất' : 'Nhận hoặc đề xuất'}</strong><small>{isManager ? 'Giao việc cho Sale, hoặc duyệt kế hoạch Sale đề xuất' : 'Quản lý giao, hoặc bạn tự đề xuất kế hoạch'}</small></div></li>
        <li><span>2</span><div><strong>Thực hiện</strong><small>Sale triển khai kế hoạch trước hạn</small></div></li>
        <li><span>3</span><div><strong>Nộp báo cáo</strong><small>Sale báo cáo kết quả, số liệu, khó khăn</small></div></li>
        <li><span>4</span><div><strong>Duyệt</strong><small>Hoàn thành, yêu cầu bổ sung hoặc không đạt</small></div></li>
      </ol>

      <section className="plan-status-tabs plan-status-tabs-6">
        {(Object.keys(TABS) as TabKey[]).map((key) => (
          <button key={key} type="button" className={`plan-status-tab plan-tone-${TABS[key].tone}${tab === key ? ' active' : ''}`} onClick={() => setTab(key)}>
            <small>{TABS[key].label}</small>
            <strong>{scoped.filter((plan) => inTab(key, plan)).length}</strong>
          </button>
        ))}
      </section>

      <section className="users-card">
        <div className="cx-toolbar">
          <input className="cx-search" type="search" placeholder={isManager ? 'Tìm kế hoạch hoặc tên Sale…' : 'Tìm kế hoạch…'} value={query} onChange={(event) => setQuery(event.target.value)} />
          <select value={category} onChange={(event) => setCategory(event.target.value)} aria-label="Lọc theo kho">
            <option value="">Tất cả kho</option>
            {PLAN_CATEGORIES.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}
          </select>
          {isManager ? (
            <select value={saleId} onChange={(event) => setSaleId(event.target.value)} aria-label="Lọc theo Sale">
              <option value="">Tất cả Sale</option>
              {sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}
            </select>
          ) : null}
          <span className="users-count">{visible.length} kế hoạch</span>
        </div>

        {error ? <div className="users-empty">{error}</div> : null}
        {!plans && !error ? <div className="users-empty">Đang tải kế hoạch…</div> : null}
        {plans && !visible.length ? (
          <div className="plan-empty">
            <Icon name="clipboard" size={28} />
            <strong>{tab === 'action' ? (isManager ? 'Không có gì cần duyệt' : 'Bạn không có kế hoạch cần làm') : 'Không có kế hoạch nào'}</strong>
            <span>{isManager ? 'Bấm “+ Giao kế hoạch” để giao việc mới cho Sale.' : 'Bấm “+ Đề xuất kế hoạch” để gửi ý tưởng của bạn cho quản lý.'}</span>
          </div>
        ) : null}

        <div className="plan-grid">
          {visible.map((plan) => <PlanCard key={plan.id} plan={plan} mode={mode} onOpen={(type) => setDialog(type === 'report' ? { type, plan } : { type: 'detail', plan })} />)}
        </div>
      </section>

      {dialog?.type === 'create' ? <CreateDialog mode={mode} sales={sales} defaultCategory={category} onClose={() => setDialog(null)} onSaved={(plan) => { replacePlan(plan); setDialog(null); setTab(isManager ? 'progress' : 'pending'); }} /> : null}
      {dialog?.type === 'report' ? <ReportDialog plan={dialog.plan} onClose={() => setDialog(null)} onSaved={(plan) => { replacePlan(plan); setDialog(null); }} /> : null}
      {dialog?.type === 'detail' ? <DetailDialog plan={dialog.plan} mode={mode} onClose={() => setDialog(null)} onReport={() => setDialog({ type: 'report', plan: dialog.plan })} onSaved={(plan) => { replacePlan(plan); setDialog(null); }} /> : null}
    </div>
  );
}

function StageBadge({ plan }: { plan: PlanView }) {
  const meta = STAGE_META[planStage(plan)];
  return <span className={`plan-status plan-tone-${meta.tone}`}>{meta.label}</span>;
}

function PlanMeta({ plan }: { plan: PlanView }) {
  const stage = planStage(plan);
  const overdue = plan.dueDate && plan.dueDate < today() && (stage === 'inProgress' || stage === 'revise');
  return (
    <div className="plan-card-meta">
      <span><Icon name="calendar" size={14} /> Giao {formatDate(plan.date)}</span>
      {plan.dueDate ? <span className={overdue ? 'is-overdue' : ''}><Icon name="clock" size={14} /> Hạn {formatDate(plan.dueDate)}{overdue ? ' · quá hạn' : ''}</span> : null}
      {plan.target > 0 ? <span><Icon name="target" size={14} /> {formatVnd(plan.target)}</span> : null}
    </div>
  );
}

function PlanCard({ plan, mode, onOpen }: { plan: PlanView; mode: Mode; onOpen: (type: 'report' | 'detail') => void }) {
  const stage = planStage(plan);
  const canReport = mode === 'sale' && (stage === 'inProgress' || stage === 'revise');
  const canReview = mode === 'manager' && (stage === 'proposed' || stage === 'reported');

  return (
    <article className={`plan-card plan-tone-${STAGE_META[stage].tone}`}>
      <div className="plan-card-top">
        <StageBadge plan={plan} />
        <span className="plan-source">{plan.source === 'sale' ? 'Sale đề xuất' : 'Quản lý giao'}</span>
        <span className="cx-group">{plan.category}</span>
      </div>
      <h4>{plan.title}</h4>
      {plan.note ? <p className="plan-card-note">{plan.note}</p> : null}
      {mode === 'manager' ? (
        <div className="plan-card-person"><UserAvatar name={plan.assignee.name} userId={plan.assignee.id} /><span>{plan.assignee.name}</span></div>
      ) : (
        <div className="plan-card-person"><UserAvatar name={plan.manager.name} userId={plan.manager.id} /><span>{plan.source === 'sale' && stage === 'proposed' ? 'Đang chờ quản lý duyệt' : `Quản lý: ${plan.manager.name}`}</span></div>
      )}
      <PlanMeta plan={plan} />
      {stage === 'revise' && plan.feedback ? <div className="plan-callout is-warn"><strong>Quản lý yêu cầu bổ sung</strong>{plan.feedback}</div> : null}
      {stage === 'declined' && plan.feedback ? <div className="plan-callout is-danger"><strong>Lý do từ chối</strong>{plan.feedback}</div> : null}
      <div className="plan-card-actions">
        <button type="button" className="ghost-btn" onClick={() => onOpen('detail')}>Chi tiết</button>
        {canReport ? <button type="button" className="primary-btn" onClick={() => onOpen('report')}>{stage === 'revise' ? 'Nộp lại báo cáo' : 'Nộp báo cáo'}</button> : null}
        {canReview ? <button type="button" className="primary-btn" onClick={() => onOpen('detail')}>{stage === 'proposed' ? 'Duyệt đề xuất' : 'Duyệt báo cáo'}</button> : null}
      </div>
    </article>
  );
}

function Modal({ title, eyebrow, onClose, children }: { title: string; eyebrow: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  return (
    <div className="plan-modal-overlay" onClick={onClose}>
      <div className="plan-modal" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}>
        <div className="plan-modal-head">
          <div><p className="eyebrow">{eyebrow}</p><h3>{title}</h3></div>
          <button type="button" className="plan-modal-close" onClick={onClose} aria-label="Đóng">×</button>
        </div>
        {children}
      </div>
    </div>
  );
}

function CreateDialog({ mode, sales, defaultCategory, onClose, onSaved }: { mode: Mode; sales: { id: string; name: string }[]; defaultCategory: string; onClose: () => void; onSaved: (plan: PlanView) => void }) {
  const isManager = mode === 'manager';
  const [form, setForm] = useState({
    assigneeId: '',
    category: (PLAN_CATEGORIES.find((item) => item.slug === defaultCategory) ?? PLAN_CATEGORIES[0]).label as string,
    title: '',
    target: '',
    dueDate: '',
    note: '',
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await callApi('POST', { ...form, target: Number(form.target.replace(/\D/g, '')) || 0 }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể lưu.');
      setSaving(false);
    }
  };

  return (
    <Modal eyebrow={isManager ? 'Giao việc cho Sale' : 'Gửi quản lý duyệt'} title={isManager ? 'Giao kế hoạch mới' : 'Đề xuất kế hoạch'} onClose={onClose}>
      <form className="plan-form" onSubmit={submit}>
        {isManager ? (
          <label>Sale nhận kế hoạch
            <select required value={form.assigneeId} onChange={(event) => setForm({ ...form, assigneeId: event.target.value })}>
              <option value="">— Chọn Sale —</option>
              {sales.map((sale) => <option key={sale.id} value={sale.id}>{sale.name}</option>)}
            </select>
          </label>
        ) : null}
        <label>Kho
          <select value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value })}>
            {PLAN_CATEGORIES.map((item) => <option key={item.slug} value={item.label}>{item.label}</option>)}
          </select>
        </label>
        <label className="plan-form-wide">Tên kế hoạch
          <input required maxLength={200} value={form.title} onChange={(event) => setForm({ ...form, title: event.target.value })} placeholder={isManager ? 'VD: Chăm sóc lại 20 khách vải lâu chưa mua' : 'VD: Đề xuất chạy khuyến mãi vải linen tháng 11'} />
        </label>
        <label>Mục tiêu doanh thu (không bắt buộc)
          <input inputMode="numeric" value={form.target} onChange={(event) => setForm({ ...form, target: event.target.value.replace(/\D/g, '') ? Number(event.target.value.replace(/\D/g, '')).toLocaleString('vi-VN') : '' })} placeholder="VD: 50.000.000" />
        </label>
        <label>Hạn hoàn thành
          <input type="date" min={today()} value={form.dueDate} onChange={(event) => setForm({ ...form, dueDate: event.target.value })} />
        </label>
        <label className="plan-form-wide">{isManager ? 'Yêu cầu / mô tả công việc' : 'Nội dung đề xuất'}
          <textarea rows={5} maxLength={4000} value={form.note} onChange={(event) => setForm({ ...form, note: event.target.value })} placeholder={isManager ? 'Mục tiêu, cách làm, khách hàng cần tập trung…' : 'Bạn muốn làm gì, vì sao, cần hỗ trợ gì từ quản lý…'} />
        </label>
        {error ? <p className="plan-form-error">{error}</p> : null}
        <div className="plan-modal-actions plan-form-wide">
          <button type="button" className="ghost-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Đang gửi…' : isManager ? 'Giao kế hoạch' : 'Gửi đề xuất'}</button>
        </div>
      </form>
    </Modal>
  );
}

function ReportDialog({ plan, onClose, onSaved }: { plan: PlanView; onClose: () => void; onSaved: (plan: PlanView) => void }) {
  const [report, setReport] = useState(plan.report);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError('');
    try {
      onSaved(await callApi('PATCH', { id: plan.id, action: 'submit_report', report }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể nộp báo cáo.');
      setSaving(false);
    }
  };

  return (
    <Modal eyebrow="Nộp báo cáo kế hoạch" title={plan.title} onClose={onClose}>
      <form className="plan-form" onSubmit={submit}>
        {plan.note ? <div className="plan-form-wide plan-block"><small>Yêu cầu của kế hoạch</small><p>{plan.note}</p></div> : null}
        {plan.feedback && plan.reportedAt ? <div className="plan-form-wide plan-callout is-warn"><strong>Quản lý yêu cầu bổ sung</strong>{plan.feedback}</div> : null}
        <label className="plan-form-wide">Nội dung báo cáo
          <textarea required rows={8} maxLength={8000} value={report} onChange={(event) => setReport(event.target.value)} placeholder={'Đã làm được gì, kết quả và số liệu cụ thể, khó khăn gặp phải, đề xuất bước tiếp theo…'} />
        </label>
        {error ? <p className="plan-form-error">{error}</p> : null}
        <div className="plan-modal-actions plan-form-wide">
          <button type="button" className="ghost-btn" onClick={onClose}>Hủy</button>
          <button type="submit" className="primary-btn" disabled={saving}>{saving ? 'Đang nộp…' : 'Nộp báo cáo'}</button>
        </div>
      </form>
    </Modal>
  );
}

function DetailDialog({ plan, mode, onClose, onReport, onSaved }: { plan: PlanView; mode: Mode; onClose: () => void; onReport: () => void; onSaved: (plan: PlanView) => void }) {
  const stage = planStage(plan);
  const reviewing = mode === 'manager' && (stage === 'proposed' || stage === 'reported');
  const [feedback, setFeedback] = useState('');
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [analysis, setAnalysis] = useState('');

  const act = async (action: string) => {
    setBusy(action);
    setError('');
    try {
      onSaved(await callApi('PATCH', { id: plan.id, action, feedback }));
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Không thể lưu.');
      setBusy('');
    }
  };

  const analyze = async () => {
    setBusy('analyze');
    setAnalysis('Đang phân tích báo cáo…');
    try {
      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: `Bạn là người kiểm tra báo cáo Sale. Phân tích trực tiếp báo cáo dưới đây so với yêu cầu của kế hoạch, không trả lời chung chung.\n\nKẾ HOẠCH: ${plan.title}\nYÊU CẦU: ${plan.note || '(không ghi)'}\nMỤC TIÊU: ${plan.target > 0 ? formatVnd(plan.target) : '(không đặt)'}\nSALE: ${plan.assignee.name}\n\n--- BÁO CÁO ---\n${plan.report}\n--- HẾT BÁO CÁO ---\n\nHãy nêu: báo cáo đã đáp ứng yêu cầu chưa, số liệu có cụ thể không, rủi ro/vấn đề, và đề xuất Duyệt / Yêu cầu bổ sung / Không đạt kèm lý do.` }),
      });
      const payload = await response.json();
      setAnalysis(response.ok ? payload.reply : payload.message ?? 'Không thể phân tích báo cáo.');
    } catch {
      setAnalysis('Không thể kết nối AI để phân tích báo cáo.');
    } finally {
      setBusy('');
    }
  };

  return (
    <Modal eyebrow={plan.source === 'sale' ? 'Kế hoạch Sale đề xuất' : 'Kế hoạch quản lý giao'} title={plan.title} onClose={onClose}>
      <div className="plan-detail">
        <div className="plan-card-top"><StageBadge plan={plan} /><span className="cx-group">{plan.category}</span></div>
        <dl className="plan-detail-grid">
          <div><dt>Sale thực hiện</dt><dd>{plan.assignee.name}</dd></div>
          <div><dt>{plan.source === 'sale' ? 'Người duyệt' : 'Người giao'}</dt><dd>{plan.source === 'sale' && stage === 'proposed' ? 'Chưa duyệt' : plan.manager.name}</dd></div>
          <div><dt>Ngày tạo</dt><dd>{formatDate(plan.date)}</dd></div>
          <div><dt>Hạn hoàn thành</dt><dd>{plan.dueDate ? formatDate(plan.dueDate) : 'Không đặt'}</dd></div>
          <div><dt>Mục tiêu doanh thu</dt><dd>{plan.target > 0 ? formatVnd(plan.target) : 'Không đặt'}</dd></div>
          {plan.attachmentName ? <div><dt>Tệp cũ</dt><dd>{plan.attachmentName}</dd></div> : null}
        </dl>

        <div className="plan-block"><small>{plan.source === 'sale' ? 'Nội dung đề xuất' : 'Yêu cầu / mô tả'}</small><p>{plan.note || 'Không có mô tả.'}</p></div>
        {plan.report ? <div className="plan-block is-report"><small>Báo cáo của Sale{plan.reportedAt ? ` · ${formatDate(plan.reportedAt)}` : ''}</small><p>{plan.report}</p></div> : null}
        {plan.feedback && !reviewing ? <div className={`plan-callout ${stage === 'done' ? 'is-ok' : stage === 'revise' ? 'is-warn' : 'is-danger'}`}><strong>Phản hồi của quản lý</strong>{plan.feedback}</div> : null}

        {mode === 'manager' && plan.report ? (
          <div className="plan-ai">
            <button type="button" className="ghost-btn" onClick={analyze} disabled={busy === 'analyze'}><Icon name="sparkles" size={14} /> {busy === 'analyze' ? 'Đang phân tích…' : 'Phân tích báo cáo bằng AI'}</button>
            {analysis ? <p>{analysis}</p> : null}
          </div>
        ) : null}

        {reviewing ? (
          <div className="plan-review">
            <label>Phản hồi cho Sale {stage === 'proposed' ? '(bắt buộc khi từ chối)' : '(bắt buộc khi yêu cầu bổ sung)'}
              <textarea rows={3} maxLength={2000} value={feedback} onChange={(event) => setFeedback(event.target.value)} placeholder="Góp ý, điều cần sửa hoặc lý do…" />
            </label>
            {error ? <p className="plan-form-error">{error}</p> : null}
            <div className="plan-modal-actions">
              {stage === 'proposed' ? (
                <>
                  <button type="button" className="ghost-btn plan-btn-danger" disabled={Boolean(busy)} onClick={() => act('reject_proposal')}>Từ chối</button>
                  <button type="button" className="primary-btn" disabled={Boolean(busy)} onClick={() => act('approve_proposal')}>{busy === 'approve_proposal' ? 'Đang duyệt…' : 'Duyệt & giao thực hiện'}</button>
                </>
              ) : (
                <>
                  <button type="button" className="ghost-btn plan-btn-danger" disabled={Boolean(busy)} onClick={() => act('reject_report')}>Không đạt</button>
                  <button type="button" className="ghost-btn plan-btn-warn" disabled={Boolean(busy)} onClick={() => act('request_changes')}>Yêu cầu bổ sung</button>
                  <button type="button" className="primary-btn" disabled={Boolean(busy)} onClick={() => act('approve_report')}>{busy === 'approve_report' ? 'Đang duyệt…' : 'Duyệt hoàn thành'}</button>
                </>
              )}
            </div>
          </div>
        ) : mode === 'sale' && (stage === 'inProgress' || stage === 'revise') ? (
          <div className="plan-modal-actions">
            <button type="button" className="primary-btn" onClick={onReport}>{stage === 'revise' ? 'Nộp lại báo cáo' : 'Nộp báo cáo'}</button>
          </div>
        ) : null}
      </div>
    </Modal>
  );
}
