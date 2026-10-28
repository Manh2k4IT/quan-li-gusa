import type { Prisma } from '@/generated/prisma/client';
import { prisma } from '@/lib/prisma';
import { getCustomerDirectory, sumOrdersBetween } from '@/lib/customer-directory';

// Why a period's result was recorded: it ran to its end, or a manager replaced or removed it early.
export type AssignmentOutcome = 'completed' | 'reassigned' | 'removed';

function vnToday() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Ho_Chi_Minh', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
}

// Stores the result of every matching assignment whose period has started. A period already recorded keeps its first result.
export async function recordAssignmentResults(where: Prisma.CustomerAssignmentWhereInput, outcome: AssignmentOutcome) {
  const today = vnToday();
  const assignments = await prisma.customerAssignment.findMany({
    where: { AND: [where, { periodStart: { lte: today } }] },
    include: { sale: { select: { name: true } } },
  });
  if (!assignments.length) return 0;

  const byKey = new Map((await getCustomerDirectory()).map((customer) => [customer.key, customer]));
  let recorded = 0;

  for (const assignment of assignments) {
    const { customerKey, saleId, periodStart, periodEnd, targetRevenue } = assignment;
    const exists = await prisma.assignmentResult.findUnique({ where: { customerKey_saleId_periodStart_periodEnd: { customerKey, saleId, periodStart, periodEnd } }, select: { id: true } });
    if (exists) continue;

    const period = sumOrdersBetween(byKey.get(customerKey)?.orders ?? [], periodStart, periodEnd);
    await prisma.assignmentResult.create({
      data: {
        customerKey,
        customerCode: assignment.customerCode,
        customerName: byKey.get(customerKey)?.name ?? assignment.customerName,
        businessGroup: assignment.businessGroup,
        saleId,
        saleName: assignment.sale.name,
        targetRevenue,
        achievedRevenue: period.total,
        achievedOrders: period.count,
        periodStart,
        periodEnd,
        reached: targetRevenue > 0 && period.total >= targetRevenue,
        // A period that already ended counts as completed, whatever happens to the assignment now.
        outcome: periodEnd < today ? 'completed' : outcome,
      },
    });
    recorded += 1;
  }

  return recorded;
}

// The day after a period ends, the customer stops being assigned. Only assignments whose result is
// already stored are released, so a failed ERP read leaves them in place for the next run.
export async function closeEndedAssignments() {
  const today = vnToday();
  await recordAssignmentResults({ periodEnd: { lt: today } }, 'completed');

  const ended = await prisma.customerAssignment.findMany({ where: { periodEnd: { lt: today } }, select: { id: true, customerKey: true, saleId: true, periodStart: true, periodEnd: true } });
  const closable: string[] = [];
  for (const { id, customerKey, saleId, periodStart, periodEnd } of ended) {
    const stored = await prisma.assignmentResult.findUnique({ where: { customerKey_saleId_periodStart_periodEnd: { customerKey, saleId, periodStart, periodEnd } }, select: { id: true } });
    if (stored) closable.push(id);
  }
  if (closable.length) await prisma.customerAssignment.deleteMany({ where: { id: { in: closable } } });
  return closable.length;
}

export async function closeEndedAssignmentsSafely() {
  try {
    await closeEndedAssignments();
  } catch (error) {
    console.error('Closing ended assignments failed:', error);
  }
}

// Used by the actions that end assignments early; history is a side record, so it never blocks them.
export async function recordAssignmentResultsSafely(where: Prisma.CustomerAssignmentWhereInput, outcome: AssignmentOutcome) {
  try {
    await recordAssignmentResults(where, outcome);
  } catch (error) {
    console.error('Recording assignment results failed:', error);
  }
}
