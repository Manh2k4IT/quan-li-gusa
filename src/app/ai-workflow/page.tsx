'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { Icon, type IconName } from '@/components/icons';

type Workflow = {
  id: string;
  name: string;
  owner: string;
  status: string;
  coverage: number;
  description: string;
};

type Stat = {
  label: string;
  value: string;
};

type EventItem = {
  label: string;
  time: string;
};

// Icons for the automation stats, in the order /api/workflows returns them.
const STAT_META: { icon: IconName; tone: string }[] = [
  { icon: 'workflow', tone: 'sky' },
  { icon: 'clock', tone: 'violet' },
  { icon: 'target', tone: 'emerald' },
  { icon: 'users', tone: 'amber' },
];

const STATUS_META: Record<string, { label: string; tone: string }> = {
  Running: { label: 'Đang chạy', tone: 'emerald' },
  Review: { label: 'Đang xem lại', tone: 'amber' },
  Paused: { label: 'Tạm dừng', tone: 'rose' },
  Healthy: { label: 'Ổn định', tone: 'sky' },
};

const ACTIONS = [
  { status: 'Running', label: 'Chạy' },
  { status: 'Review', label: 'Xem lại' },
  { status: 'Paused', label: 'Tạm dừng' },
];

const SUGGESTIONS = [
  { title: 'Tự động nâng cấp lead', detail: '32 lead đang ở ngưỡng chuyển đổi; hệ thống nên tự động gán cho sales manager trong 30 phút tới.' },
  { title: 'Thu gọn workflow approval', detail: 'Hầu hết approval ở kho và finance đang bị chậm ở bước kiểm tra cuối. Có thể rút gọn 2 bước thủ công.' },
];

export default function AIWorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [automations, setAutomations] = useState<Stat[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function loadData() {
    try {
      const response = await fetch('/api/workflows');
      const payload = await response.json();

      if (!response.ok) {
        throw new Error(payload.message ?? 'Failed to load workflows');
      }

      setWorkflows(payload.workflows ?? []);
      setAutomations(payload.automations ?? []);
      setEvents(payload.events ?? []);
    } catch {
      setWorkflows([]);
      setAutomations([]);
      setEvents([]);
    } finally {
      setLoading(false);
    }
  }

  async function updateWorkflow(workflowId: string, status: string) {
    const response = await fetch('/api/workflows', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ workflowId, status }),
    });

    const payload = await response.json();

    if (!response.ok) {
      throw new Error(payload.message ?? 'Failed to update workflow');
    }

    setWorkflows(payload.workflows ?? []);
    setEvents(payload.events ?? []);
  }

  async function handleAction(workflowId: string, status: string) {
    setPendingId(workflowId);
    try {
      await updateWorkflow(workflowId, status);
    } catch {
      // Keep the current state; the next load shows the server's view.
    } finally {
      setPendingId(null);
    }
  }

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, []);

  return (
    <main className="page-layout insight-page">
      <div className="page-header">
        <div>
          <p className="eyebrow">Luồng tự động AI</p>
          <h1>Tự động hóa & điều phối</h1>
        </div>
        <div className="topbar-actions insight-actions">
          <Link href="/" className="ghost-btn">Quay lại dashboard</Link>
        </div>
      </div>

      <div className="insight-stats insight-stats-4">
        {automations.map((item, index) => {
          const meta = STAT_META[index % STAT_META.length];
          return (
            <div key={item.label} className={`insight-stat tone-${meta.tone}`}>
              <span className="insight-stat-icon"><Icon name={meta.icon} size={20} /></span>
              <div>
                <span className="insight-stat-label">{item.label}</span>
                <strong>{item.value}</strong>
              </div>
            </div>
          );
        })}
      </div>

      <div className="insight-section-title">
        <h3>Workflow đang chạy</h3>
        <span className="insight-live"><i />Trực tiếp</span>
      </div>

      {loading ? (
        <p className="workflow-empty">Đang tải workflow...</p>
      ) : (
        <div className="insight-grid">
          {workflows.map((workflow) => {
            const status = STATUS_META[workflow.status] ?? { label: workflow.status, tone: 'violet' };
            return (
              <article key={workflow.id} className={`insight-card workflow-flow tone-${status.tone}`}>
                <div className="insight-card-head">
                  <span className="insight-card-icon"><Icon name="workflow" size={18} /></span>
                  <span className="insight-card-tag">{status.label}</span>
                </div>
                <h4>{workflow.name}</h4>
                <small className="workflow-owner">{workflow.owner}</small>
                <p>{workflow.description}</p>

                <div className="workflow-coverage">
                  <div className="workflow-coverage-head">
                    <span>Coverage</span>
                    <strong>{workflow.coverage}%</strong>
                  </div>
                  <div className="workflow-coverage-track">
                    <span style={{ width: `${workflow.coverage}%` }} />
                  </div>
                </div>

                <div className="workflow-segment" role="group" aria-label={`Trạng thái ${workflow.name}`}>
                  {ACTIONS.map((action) => (
                    <button
                      key={action.status}
                      type="button"
                      className={workflow.status === action.status ? 'active' : ''}
                      aria-pressed={workflow.status === action.status}
                      disabled={pendingId === workflow.id}
                      onClick={() => handleAction(workflow.id, action.status)}
                    >
                      {action.label}
                    </button>
                  ))}
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="workflow-bottom">
        <section>
          <div className="insight-section-title">
            <h3>Đề xuất tự động</h3>
            <small>Gợi ý từ AI</small>
          </div>
          <div className="workflow-suggestions">
            {SUGGESTIONS.map((suggestion) => (
              <article key={suggestion.title} className="workflow-suggestion">
                <span className="assistant-avatar ai"><Icon name="sparkles" size={16} /></span>
                <div>
                  <h4>{suggestion.title}</h4>
                  <p>{suggestion.detail}</p>
                </div>
              </article>
            ))}
          </div>
        </section>

        <section>
          <div className="insight-section-title">
            <h3>Sự kiện vừa qua</h3>
            <small>{events.length} sự kiện</small>
          </div>
          <ol className="workflow-timeline">
            {events.map((event) => (
              <li key={`${event.label}-${event.time}`}>
                <span>{event.label}</span>
                <small>{event.time}</small>
              </li>
            ))}
          </ol>
        </section>
      </div>
    </main>
  );
}
