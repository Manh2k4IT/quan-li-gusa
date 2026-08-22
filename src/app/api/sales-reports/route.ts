import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type SalesReportDelegate = {
  findMany: (args: { where?: Record<string, unknown>; orderBy?: Record<string, string> }) => Promise<unknown[]>;
  create: (args: { data: Record<string, unknown> }) => Promise<unknown>;
};

export async function GET() {
  try {
    const session = getSession(await cookies());
    if (!session) return NextResponse.json({ reports: [] }, { status: 401 });

    const reportDelegate = (prisma as typeof prisma & { salesReport?: SalesReportDelegate }).salesReport;
    let reports;

    if (reportDelegate?.findMany) {
      reports = await reportDelegate.findMany({
        where: session.role === 'SALE' ? { salespersonEmail: session.email } : undefined,
        orderBy: { createdAt: 'desc' },
      });
    } else {
      const rows = await prisma.$queryRawUnsafe<Array<Record<string, unknown>>>(
        `SELECT id, date, orderCode, category, team, salesperson, salespersonEmail, paymentMethod, orderStatus, target, note, items, revenue, salespersonId
         FROM SalesReport ${session.role === 'SALE' ? 'WHERE salespersonEmail = ?' : ''} ORDER BY createdAt DESC`,
        ...(session.role === 'SALE' ? [session.email] : []),
      );
      reports = rows.map((row) => ({
        ...row,
        target: Number(row.target ?? 0),
        revenue: Number(row.revenue ?? 0),
        items: typeof row.items === 'string' ? JSON.parse(row.items) : row.items,
      }));
    }

    return NextResponse.json({ reports });
  } catch (error) {
    return NextResponse.json({ reports: [], message: error instanceof Error ? error.message : 'Không thể tải báo cáo.' }, { status: 500 });
  }
}

export async function POST(request: Request) {
  try {
    const session = getSession(await cookies());
    if (!session) return NextResponse.json({ message: 'Phiên đăng nhập đã hết hạn.' }, { status: 401 });

    const body = await request.json();
    const reportData = {
        id: body.id ? String(body.id) : undefined,
        date: String(body.date ?? ''),
        orderCode: String(body.orderCode ?? ''),
        category: String(body.category ?? ''),
        team: String(body.team ?? ''),
        salesperson: session.role === 'SALE' ? session.name : String(body.salesperson ?? session.name),
        salespersonEmail: session.email,
        paymentMethod: String(body.paymentMethod ?? ''),
        orderStatus: String(body.orderStatus ?? ''),
        target: Number(body.target ?? 0),
        note: String(body.note ?? ''),
        items: Array.isArray(body.items) ? body.items : [],
        revenue: Number(body.revenue ?? 0),
        salespersonId: session.id && !session.id.includes('@') ? session.id : undefined,
    };
    const reportDelegate = (prisma as typeof prisma & { salesReport?: Pick<SalesReportDelegate, 'create'> }).salesReport;
    const report = reportDelegate?.create
      ? await reportDelegate.create({ data: reportData })
      : await prisma.$executeRawUnsafe(
          'INSERT INTO SalesReport (id, date, orderCode, category, team, salesperson, salespersonEmail, paymentMethod, orderStatus, target, note, items, revenue, salespersonId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
          reportData.id ?? crypto.randomUUID(), reportData.date, reportData.orderCode, reportData.category, reportData.team,
          reportData.salesperson, reportData.salespersonEmail, reportData.paymentMethod, reportData.orderStatus,
          reportData.target, reportData.note, JSON.stringify(reportData.items), reportData.revenue, reportData.salespersonId ?? null,
        );

    return NextResponse.json({ report });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Không thể lưu báo cáo.' }, { status: 500 });
  }
}
