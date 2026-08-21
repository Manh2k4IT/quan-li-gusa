import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';

const workflowsSeed = [
  {
    id: 'lead-qualification',
    name: 'Lead Qualification Flow',
    owner: 'Sales Automation',
    status: 'Running',
    coverage: 88,
    description: 'Tự động scoring khách hàng tiềm năng và gửi thông báo cho sales lead.',
  },
  {
    id: 'inventory-reorder',
    name: 'Inventory Reorder Automation',
    owner: 'Ops Team',
    status: 'Review',
    coverage: 72,
    description: 'Khi tồn kho thấp hơn mức tối thiểu, hệ thống sẽ tạo workflow đặt hàng và cảnh báo.',
  },
  {
    id: 'support-routing',
    name: 'Customer Support Routing',
    owner: 'Support Team',
    status: 'Healthy',
    coverage: 94,
    description: 'Phân loại ticket và giao cho bộ phận phù hợp theo độ ưu tiên và loại vấn đề.',
  },
];

const eventsSeed = [
  { label: 'Sales lead approved', time: '12 min ago' },
  { label: 'Low-stock alert sent', time: '27 min ago' },
  { label: 'Customer support triage', time: '46 min ago' },
];

const automationsSeed = [
  { label: 'Tasks processed today', value: '2,314' },
  { label: 'Avg. response time', value: '4.6m' },
  { label: 'Workflow success rate', value: '97.2%' },
  { label: 'Human escalations', value: '18' },
];

export async function GET() {
  const session = getSession(await cookies());

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  return NextResponse.json({
    workflows: workflowsSeed,
    automations: automationsSeed,
    events: eventsSeed,
  });
}

export async function POST(request: Request) {
  const session = getSession(await cookies());

  if (!session) {
    return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });
  }

  const body = await request.json();
  const workflowId = String(body?.workflowId ?? '');
  const status = String(body?.status ?? 'Running');

  if (!workflowId) {
    return NextResponse.json({ message: 'workflowId is required.' }, { status: 400 });
  }

  const updated = workflowsSeed.map((workflow) =>
    workflow.id === workflowId ? { ...workflow, status } : workflow,
  );

  return NextResponse.json({
    workflows: updated,
    automations: automationsSeed,
    events: [
      { label: `Workflow ${workflowId} changed to ${status}`, time: 'just now' },
      ...eventsSeed,
    ],
  });
}
