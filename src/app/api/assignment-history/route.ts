import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { closeEndedAssignmentsSafely } from '@/lib/assignment-history';

const PAGE_SIZE = 20;

// Accent-insensitive search, so "huong" finds "Hương".
const normalize = (value: string) => value.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/đ/g, 'd');

export async function GET(request: Request) {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const isManager = session.role === 'CEO' || session.role === 'MANAGER';
  const params = new URL(request.url).searchParams;
  const saleId = params.get('saleId') ?? '';
  const result = params.get('result') ?? '';
  const month = params.get('month') ?? '';
  const query = normalize((params.get('q') ?? '').trim());
  const page = Math.max(1, Number(params.get('page')) || 1);

  const currentUser = isManager ? null : await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } });
  const scope = isManager ? (saleId ? { saleId } : {}) : { saleId: currentUser?.id ?? '__none__' };

  // Periods that ended since anyone last looked are stored before the history is read.
  await closeEndedAssignmentsSafely();

  const all = await prisma.assignmentResult.findMany({ where: scope, orderBy: [{ periodEnd: 'desc' }, { recordedAt: 'desc' }] });
  // Taken from the history itself so sales whose account was deleted can still be filtered.
  const sales = isManager
    ? [...new Map((await prisma.assignmentResult.findMany({ select: { saleId: true, saleName: true }, orderBy: { saleName: 'asc' } })).map((entry) => [entry.saleId, { id: entry.saleId, name: entry.saleName }])).values()]
    : [];
  const months = [...new Set(all.map((entry) => entry.periodEnd.slice(0, 7)))].sort().reverse();

  // Counts and the per-sale table follow every filter except reached/missed, so the tabs show both numbers.
  const base = all.filter((entry) => {
    if (month && !entry.periodEnd.startsWith(month)) return false;
    if (query && !normalize(entry.customerName).includes(query) && !entry.customerCode.toLowerCase().includes(query)) return false;
    return true;
  });
  const filtered = base.filter((entry) => (result === 'reached' ? entry.reached : result === 'missed' ? !entry.reached : true));
  const pageCount = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const currentPage = Math.min(page, pageCount);

  const bySaleMap = new Map<string, { saleId: string; saleName: string; total: number; reached: number }>();
  for (const entry of base) {
    const sale = bySaleMap.get(entry.saleId) ?? { saleId: entry.saleId, saleName: entry.saleName, total: 0, reached: 0 };
    sale.total += 1;
    if (entry.reached) sale.reached += 1;
    bySaleMap.set(entry.saleId, sale);
  }
  const bySale = isManager ? [...bySaleMap.values()].sort((first, second) => second.reached / second.total - first.reached / first.total || second.total - first.total) : [];

  return NextResponse.json({
    isManager,
    sales,
    months,
    summary: { total: base.length, reached: base.filter((entry) => entry.reached).length },
    bySale,
    page: currentPage,
    pageCount,
    total: filtered.length,
    entries: filtered.slice((currentPage - 1) * PAGE_SIZE, currentPage * PAGE_SIZE).map((entry) => ({
      id: entry.id,
      name: entry.customerName,
      code: entry.customerCode,
      group: entry.businessGroup,
      saleId: entry.saleId,
      saleName: entry.saleName,
      periodStart: entry.periodStart,
      periodEnd: entry.periodEnd,
      targetRevenue: entry.targetRevenue,
      achievedRevenue: entry.achievedRevenue,
      achievedOrders: entry.achievedOrders,
      reached: entry.reached,
      outcome: entry.outcome,
    })),
  });
}
