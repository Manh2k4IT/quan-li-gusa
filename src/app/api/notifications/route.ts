import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

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

function planRoute(category: string) {
  const normalized = category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  if (normalized.includes('ben thanh')) return '/plan/fabric-ben-thanh';
  if (normalized.includes('vai')) return '/plan/fabric-q4';
  return '/plan/fashion-q4';
}

const formatVnd = (value: number) => `${Math.round(value).toLocaleString('vi-VN')} đ`;

type PlanRow = { id: string; title: string; category: string; status: string; updatedAt: string; createdAt: string; managerName: string; assigneeName: string };

export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const since = new Date(Date.now() - LOOKBACK_DAYS * 86_400_000).toISOString();
  const user = await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } });
  const isManager = session.role === 'CEO' || session.role === 'MANAGER';
  const items: AppNotification[] = [];

  try {
    const plans = await prisma.$queryRawUnsafe<PlanRow[]>(
      `SELECT sa.id, sa.title, sa.category, sa.status, sa.updatedAt, sa.createdAt, m.name AS managerName, a.name AS assigneeName
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
        if (plan.status !== 'Chờ xác nhận') continue;
        items.push({
          id: `plan-review-${plan.id}-${plan.updatedAt}`,
          kind: 'plan',
          title: `${plan.assigneeName ?? 'Sale'} đã nộp báo cáo kế hoạch`,
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
        const status = plan.status;
        const isFinal = status === 'Đã duyệt' || status === 'Không duyệt';
        items.push({
          id: `plan-${plan.id}-${status}`,
          kind: status === 'Đã duyệt' ? 'approved' : status === 'Không duyệt' ? 'rejected' : 'plan',
          title: isFinal ? `Kế hoạch ${status === 'Đã duyệt' ? 'đã được duyệt' : 'không được duyệt'}` : `${plan.managerName ?? 'Quản lý'} giao kế hoạch mới`,
          body: `${plan.title || 'Kế hoạch'} · ${plan.category}`,
          href: '/sales-plan',
          at: toIso(isFinal ? plan.updatedAt : plan.createdAt),
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
