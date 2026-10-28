import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { categorySlug, PLAN_STATUS, planStage } from '@/lib/plan-workflow';

export type AppNotification = {
  id: string;
  kind: 'plan' | 'report' | 'customer' | 'approved' | 'rejected';
  title: string;
  body: string;
  href: string;
  at: string;
};

const LOOKBACK_DAYS = 30;
const LIMIT = 30;

// Rows written through raw SQL use "YYYY-MM-DD HH:MM:SS" (UTC) while Prisma writes ISO strings.
function toIso(value: unknown) {
  if (value instanceof Date) return value.toISOString();
  const raw = String(value ?? '').trim();
  if (!raw) return new Date(0).toISOString();
  const normalized = /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(raw) ? `${raw.replace(' ', 'T')}Z` : raw;
  const date = new Date(normalized);
  return Number.isNaN(date.getTime()) ? new Date(0).toISOString() : date.toISOString();
}

const planRoute = (category: string) => `/plan?category=${categorySlug(category)}`;

const formatVnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;

type PlanRow = { id: string; title: string; category: string; status: string; source: string; feedback: string; reportedAt: string | null; updatedAt: string; createdAt: string; managerName: string; assigneeName: string };

// What a sale hears about their plan; their own proposals and reports waiting for review need no notice.
function salePlanNotice(plan: PlanRow): { kind: AppNotification['kind']; title: string; at: string } | null {
  switch (planStage(plan)) {
    case 'done': return { kind: 'approved', title: 'Kế hoạch đã được duyệt hoàn thành', at: plan.updatedAt };
    case 'failed': return { kind: 'rejected', title: 'Báo cáo kế hoạch không đạt', at: plan.updatedAt };
    case 'declined': return { kind: 'rejected', title: 'Đề xuất kế hoạch bị từ chối', at: plan.updatedAt };
    case 'revise': return { kind: 'rejected', title: `${plan.managerName ?? 'Quản lý'} yêu cầu bổ sung báo cáo`, at: plan.updatedAt };
    case 'inProgress': return plan.source === 'sale'
      ? { kind: 'approved', title: 'Đề xuất kế hoạch đã được duyệt', at: plan.updatedAt }
      : { kind: 'plan', title: `${plan.managerName ?? 'Quản lý'} giao kế hoạch mới`, at: plan.createdAt };
    default: return null;
  }
}

export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const user = await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } });
  const isManager = session.role === 'CEO' || session.role === 'MANAGER';
  const items: AppNotification[] = [];

  try {
    const plans = await prisma.$queryRawUnsafe<PlanRow[]>(
      `SELECT sa.id, sa.title, sa.category, sa.status, sa.source, sa.feedback, sa.reportedAt, sa.updatedAt, sa.createdAt, m.name AS managerName, a.name AS assigneeName
       FROM SalesAssignment sa
       LEFT JOIN User m ON m.id = sa.managerId
       LEFT JOIN User a ON a.id = sa.assigneeId
       ${isManager ? '' : 'WHERE sa.assigneeId = ?'}
       ORDER BY sa.updatedAt DESC
       LIMIT 100`,
      ...(isManager ? [] : [user?.id ?? '__none__']),
    );

    if (isManager) {
      for (const plan of plans) {
        const isReport = plan.status === PLAN_STATUS.reported;
        if (!isReport && plan.status !== PLAN_STATUS.proposed) continue;
        items.push({
          id: `plan-review-${plan.id}-${plan.updatedAt}`,
          kind: 'plan',
          title: isReport ? `${plan.assigneeName ?? 'Sale'} đã nộp báo cáo kế hoạch` : `${plan.assigneeName ?? 'Sale'} đề xuất kế hoạch mới`,
          body: `${plan.title || 'Kế hoạch'} · ${plan.category} — đang chờ duyệt`,
          href: planRoute(plan.category),
          at: toIso(plan.updatedAt),
        });
      }

      const reports = await prisma.salesReport.findMany({
        orderBy: { createdAt: 'desc' },
        take: 15,
        select: { id: true, salesperson: true, category: true, revenue: true, date: true, createdAt: true },
      });
      for (const report of reports) {
        items.push({
          id: `report-${report.id}`,
          kind: 'report',
          title: `${report.salesperson} nhập báo cáo doanh thu`,
          body: `${formatVnd(report.revenue)} · ${report.category} · ngày ${report.date}`,
          href: '/sales-reports',
          at: toIso(report.createdAt),
        });
      }
    } else {
      for (const plan of plans) {
        const notice = salePlanNotice(plan);
        if (!notice) continue;
        items.push({
          id: `plan-${plan.id}-${plan.status}-${toIso(notice.at)}`,
          kind: notice.kind,
          title: notice.title,
          body: `${plan.title || 'Kế hoạch'} · ${plan.category}`,
          href: '/sales-plan',
          at: toIso(notice.at),
        });
      }

      const assignments = await prisma.customerAssignment.findMany({
        where: { saleId: user?.id ?? '__none__' },
        orderBy: { updatedAt: 'desc' },
        take: 20,
        include: { assignedBy: { select: { name: true } } },
      });
      for (const assignment of assignments) {
        items.push({
          id: `customer-${assignment.id}-${assignment.updatedAt.getTime()}`,
          kind: 'customer',
          title: `${assignment.assignedBy.name} giao khách hàng cho bạn`,
          body: `${assignment.customerName} · mục tiêu ${formatVnd(assignment.targetRevenue)}`,
          href: '/my-customers',
          at: assignment.updatedAt.toISOString(),
        });
      }
    }

    const notifications = items
      .filter((item) => item.at >= since)
      .sort((first, second) => second.at.localeCompare(first.at))
      .slice(0, LIMIT);

    return NextResponse.json({ notifications });
  } catch (error) {
    console.error('Notifications error:', error);
    return NextResponse.json({ notifications: [] });
  }
}
