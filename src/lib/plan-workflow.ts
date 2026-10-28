// Plan workflow shared by the API and the plan board. Status values are stored as-is in SalesAssignment.status;
// "Chờ xác nhận" and "Đã hoàn thành" predate this workflow and keep their meaning.
export const PLAN_STATUS = {
  proposed: 'Chờ duyệt đề xuất',
  proposalRejected: 'Từ chối đề xuất',
  inProgress: 'Đang thực hiện',
  reported: 'Chờ xác nhận',
  approved: 'Đã duyệt',
  legacyApproved: 'Đã hoàn thành',
  rejected: 'Không duyệt',
} as const;

export const PLAN_CATEGORIES = [
  { slug: 'fashion-q4', label: 'Thời trang Quận 4' },
  { slug: 'fabric-q4', label: 'Vải Quận 4' },
  { slug: 'fabric-ben-thanh', label: 'Vải Bến Thành' },
] as const;

export type PlanStage = 'proposed' | 'inProgress' | 'revise' | 'reported' | 'done' | 'failed' | 'declined';

export type PlanView = {
  id: string;
  title: string;
  category: string;
  note: string;
  target: number;
  dueDate: string | null;
  date: string;
  status: string;
  source: 'manager' | 'sale';
  report: string;
  reportedAt: string | null;
  feedback: string;
  attachmentName: string;
  assignee: { id: string; name: string };
  manager: { id: string; name: string };
};

// Older plans used "Kho vải Quận 4" and similar labels, so categories are matched loosely.
export function categorySlug(category: string) {
  const normalized = category.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');
  if (normalized.includes('ben thanh')) return 'fabric-ben-thanh';
  if (normalized.includes('vai')) return 'fabric-q4';
  return 'fashion-q4';
}

export function planStage(plan: Pick<PlanView, 'status' | 'feedback' | 'reportedAt'>): PlanStage {
  switch (plan.status) {
    case PLAN_STATUS.proposed: return 'proposed';
    case PLAN_STATUS.proposalRejected: return 'declined';
    case PLAN_STATUS.reported: return 'reported';
    case PLAN_STATUS.approved:
    case PLAN_STATUS.legacyApproved: return 'done';
    case PLAN_STATUS.rejected: return 'failed';
    // Back in progress after a report means the manager asked for changes.
    default: return plan.feedback && plan.reportedAt ? 'revise' : 'inProgress';
  }
}

export const STAGE_META: Record<PlanStage, { label: string; tone: string }> = {
  proposed: { label: 'Chờ duyệt đề xuất', tone: 'pending' },
  inProgress: { label: 'Đang thực hiện', tone: 'progress' },
  revise: { label: 'Cần bổ sung', tone: 'revise' },
  reported: { label: 'Chờ duyệt báo cáo', tone: 'pending' },
  done: { label: 'Hoàn thành', tone: 'done' },
  failed: { label: 'Không đạt', tone: 'rejected' },
  declined: { label: 'Từ chối đề xuất', tone: 'rejected' },
};
