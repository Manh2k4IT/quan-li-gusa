import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import type { Prisma } from '@/generated/prisma/client';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { recordActivity } from '@/lib/activity';
import { PLAN_STATUS, type PlanView } from '@/lib/plan-workflow';

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const PLAN_INCLUDE = { assignee: { select: { id: true, name: true } }, manager: { select: { id: true, name: true } } } as const;

type PlanRecord = Prisma.SalesAssignmentGetPayload<{ include: typeof PLAN_INCLUDE }>;

function toView(plan: PlanRecord): PlanView {
  return {
    id: plan.id,
    title: plan.title,
    category: plan.category,
    note: plan.note,
    target: plan.target,
    dueDate: plan.dueDate,
    date: plan.date,
    status: plan.status,
    source: plan.source === 'sale' ? 'sale' : 'manager',
    report: plan.report,
    reportedAt: plan.reportedAt?.toISOString() ?? null,
    feedback: plan.feedback,
    attachmentName: plan.attachmentName ?? '',
    assignee: plan.assignee,
    manager: plan.manager,
  };
}

// Sessions of seeded accounts may carry the email as id, so the user is always looked up by email.
async function getActor() {
  const session = getSession(await cookies());
  if (!session) return null;
  const user = await prisma.user.findUnique({ where: { email: session.email.toLowerCase() }, select: { id: true, name: true, email: true, role: true } });
  if (!user) return null;
  return { ...user, isManager: user.role === 'CEO' || user.role === 'MANAGER' };
}

const text = (value: unknown, max: number) => String(value ?? '').trim().slice(0, max);

export async function GET() {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const plans = await prisma.salesAssignment.findMany({
    where: actor.isManager ? {} : { assigneeId: actor.id },
    orderBy: { updatedAt: 'desc' },
    include: PLAN_INCLUDE,
  });
  return NextResponse.json({ plans: plans.map(toView), isManager: actor.isManager });
}

// Managers assign a plan to a sale; a sale's plan is a proposal waiting for a manager.
export async function POST(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const title = text(body.title, 200);
  const category = text(body.category, 60);
  const note = text(body.note, 4000);
  const target = Math.max(0, Number(body.target) || 0);
  const dueDate = DATE_PATTERN.test(String(body.dueDate ?? '')) ? String(body.dueDate) : null;
  if (!title || !category) return NextResponse.json({ message: 'Vui lòng nhập tiêu đề và chọn kho.' }, { status: 400 });

  let assigneeId = actor.id;
  if (actor.isManager) {
    const sale = await prisma.user.findFirst({ where: { id: String(body.assigneeId ?? ''), role: 'SALE' }, select: { id: true } });
    if (!sale) return NextResponse.json({ message: 'Vui lòng chọn Sale nhận kế hoạch.' }, { status: 400 });
    assigneeId = sale.id;
  }

  const plan = await prisma.salesAssignment.create({
    data: {
      // A proposal has no manager yet; the proposer stands in until one approves it.
      managerId: actor.id,
      assigneeId,
      title,
      category,
      note,
      target,
      dueDate,
      date: new Date().toISOString().slice(0, 10),
      source: actor.isManager ? 'manager' : 'sale',
      status: actor.isManager ? PLAN_STATUS.inProgress : PLAN_STATUS.proposed,
    },
    include: PLAN_INCLUDE,
  });

  await recordActivity({ userEmail: actor.email, action: actor.isManager ? 'assigned_plan' : 'proposed_plan', entityType: 'plan', entityId: plan.id, details: `${title} → ${plan.assignee.name}` });
  return NextResponse.json({ plan: toView(plan) });
}

type Action = 'submit_report' | 'approve_proposal' | 'reject_proposal' | 'approve_report' | 'request_changes' | 'reject_report';

// Which status each action starts from, who may take it and where it leads.
const TRANSITIONS: Record<Action, { from: string[]; by: 'sale' | 'manager'; to: string }> = {
  submit_report: { from: [PLAN_STATUS.inProgress], by: 'sale', to: PLAN_STATUS.reported },
  approve_proposal: { from: [PLAN_STATUS.proposed], by: 'manager', to: PLAN_STATUS.inProgress },
  reject_proposal: { from: [PLAN_STATUS.proposed], by: 'manager', to: PLAN_STATUS.proposalRejected },
  approve_report: { from: [PLAN_STATUS.reported], by: 'manager', to: PLAN_STATUS.approved },
  request_changes: { from: [PLAN_STATUS.reported], by: 'manager', to: PLAN_STATUS.inProgress },
  reject_report: { from: [PLAN_STATUS.reported], by: 'manager', to: PLAN_STATUS.rejected },
};

export async function PATCH(request: Request) {
  const actor = await getActor();
  if (!actor) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const action = String(body.action ?? '') as Action;
  const transition = TRANSITIONS[action];
  if (!transition) return NextResponse.json({ message: 'Thao tác không hợp lệ.' }, { status: 400 });

  const plan = await prisma.salesAssignment.findUnique({ where: { id: String(body.id ?? '') } });
  if (!plan) return NextResponse.json({ message: 'Không tìm thấy kế hoạch.' }, { status: 404 });
  if (transition.by === 'manager' ? !actor.isManager : plan.assigneeId !== actor.id) {
    return NextResponse.json({ message: 'Bạn không có quyền thực hiện thao tác này.' }, { status: 403 });
  }
  if (!transition.from.includes(plan.status)) {
    return NextResponse.json({ message: 'Kế hoạch đã chuyển sang trạng thái khác, vui lòng tải lại.' }, { status: 409 });
  }

  const report = text(body.report, 8000);
  const feedback = text(body.feedback, 2000);
  if (action === 'submit_report' && !report) return NextResponse.json({ message: 'Vui lòng nhập nội dung báo cáo.' }, { status: 400 });
  if ((action === 'request_changes' || action === 'reject_proposal') && !feedback) {
    return NextResponse.json({ message: 'Vui lòng ghi rõ lý do để Sale biết cần làm gì.' }, { status: 400 });
  }

  const updated = await prisma.salesAssignment.update({
    where: { id: plan.id },
    data: action === 'submit_report'
      ? { status: transition.to, report, reportedAt: new Date() }
      : {
          status: transition.to,
          feedback,
          reviewedAt: new Date(),
          // The approving manager becomes the plan's manager.
          ...(action === 'approve_proposal' ? { managerId: actor.id } : {}),
        },
    include: PLAN_INCLUDE,
  });

  await recordActivity({ userEmail: actor.email, action: `plan_${action}`, entityType: 'plan', entityId: plan.id, details: plan.title });
  return NextResponse.json({ plan: toView(updated) });
}
