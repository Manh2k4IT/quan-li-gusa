'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';

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

export default function AIWorkflowPage() {
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [automations, setAutomations] = useState<Stat[]>([]);
  const [events, setEvents] = useState<EventItem[]>([]);
  const [loading, setLoading] = useState(true);

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

  useEffect(() => {
    const run = async () => {
      await loadData();
    };

    void run();
  }, []);

  return (
    <main className="page-layout">
      <div className="page-header">
        <div>
          <p className="eyebrow">Luồng tự động AI</p>
          <h1>Tự động hóa & điều phối</h1>
        </div>
        <Link href="/" className="primary-btn">Quay lại dashboard</Link>
      </div>

      <div className="stats-row">
        {automations.map((item) => (
          <div key={item.label} className="metric-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>

      <div className="panel">
        <div className="panel-header">
          <div>
            <p className="eyebrow">Sơ đồ tự động hóa</p>
            <h3>Workflow đang chạy</h3>
          </div>
          <span className="badge neutral">Trực tiếp</span>
        </div>

        {loading ? (
          <p>Đang tải workflow...</p>
        ) : (
          <div className="workflow-list">
            {workflows.map((workflow) => (
              <article key={workflow.id} className="workflow-card">
                <div className="operation-row">
                  <div>
                    <h4>{workflow.name}</h4>
                    <small>{workflow.owner}</small>
                  </div>
                  <span className="status-badge">{workflow.status}</span>
                </div>

                <p className="workflow-description">{workflow.description}</p>

                <div className="progress-track">
                  <span style={{ width: `${workflow.coverage}%` }} />
                </div>

                <div className="strategy-footer">
                  <span>Coverage {workflow.coverage}%</span>
                  <div className="topbar-actions" style={{ gap: '8px', marginTop: '12px' }}>
                    <button className="ghost-btn" onClick={() => updateWorkflow(workflow.id, 'Running')}>Chạy</button>
                    <button className="ghost-btn" onClick={() => updateWorkflow(workflow.id, 'Review')}>Xem lại</button>
                    <button className="ghost-btn" onClick={() => updateWorkflow(workflow.id, 'Paused')}>Tạm dừng</button>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      <div className="bottom-grid">
        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Gợi ý từ AI</p>
              <h3>Đề xuất tự động</h3>
            </div>
          </div>

          <div className="recommendation-list">
            <div className="recommendation-card">
              <div className="chat-avatar">AI</div>
              <div>
                <h4>Tự động nâng cấp lead</h4>
                <p>32 lead đang ở ngưỡng chuyển đổi; hệ thống nên tự động gán cho sales manager trong 30 phút tới.</p>
              </div>
            </div>
            <div className="recommendation-card">
              <div className="chat-avatar">AI</div>
              <div>
                <h4>Thu gọn workflow approval</h4>
                <p>Hầu hết approval ở kho và finance đang bị chậm ở bước kiểm tra cuối. Có thể rút gọn 2 bước thủ công.</p>
              </div>
            </div>
          </div>
        </div>

        <div className="panel">
          <div className="panel-header">
            <div>
              <p className="eyebrow">Sự kiện gần đây</p>
              <h3>Sự kiện vừa qua</h3>
            </div>
          </div>

          <div className="action-queue">
            {events.map((event) => (
              <div key={`${event.label}-${event.time}`} className="queue-item">
                <span>{event.label}</span>
                <strong>{event.time}</strong>
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
