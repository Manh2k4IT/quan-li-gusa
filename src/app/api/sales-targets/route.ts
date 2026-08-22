import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

type SalesTargetDelegate = {
  findMany: (args: { orderBy?: Record<string, string> }) => Promise<unknown[]>;
  upsert: (args: { where: { category: string }; update: { amount: number }; create: { category: string; amount: number } }) => Promise<Record<string, unknown>>;
};

export async function GET() {
  try {
    const targetDelegate = (prisma as typeof prisma & { salesTarget?: SalesTargetDelegate }).salesTarget;
    const targets = targetDelegate?.findMany
      ? await targetDelegate.findMany({ orderBy: { category: 'asc' } })
      : await prisma.$queryRawUnsafe<Array<{ id: string; category: string; amount: number }>>('SELECT id, category, amount FROM SalesTarget ORDER BY category ASC');
    return NextResponse.json({ targets });
  } catch {
    return NextResponse.json({ targets: [] }, { status: 500 });
  }
}

export async function PUT(request: Request) {
  try {
    const session = getSession(await cookies());
    if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
      return NextResponse.json({ message: 'Không có quyền cập nhật mục tiêu.' }, { status: 403 });
    }

    const { category, amount } = await request.json();
    if (!category) return NextResponse.json({ message: 'Thiếu phân loại.' }, { status: 400 });

    const normalizedCategory = String(category);
    const normalizedAmount = Number(amount) || 0;
    const targetDelegate = (prisma as typeof prisma & { salesTarget?: SalesTargetDelegate }).salesTarget;
    let target: { id: string; category: string; amount: number } | undefined;

    if (targetDelegate?.upsert) {
      target = await targetDelegate.upsert({
        where: { category: normalizedCategory },
        update: { amount: normalizedAmount },
        create: { category: normalizedCategory, amount: normalizedAmount },
      });
    } else {
      const existing = await prisma.$queryRawUnsafe<Array<{ id: string }>>('SELECT id FROM SalesTarget WHERE category = ?', normalizedCategory);
      const id = existing[0]?.id ?? crypto.randomUUID();
      if (existing.length) {
        await prisma.$executeRawUnsafe('UPDATE SalesTarget SET amount = ?, updatedAt = CURRENT_TIMESTAMP WHERE category = ?', normalizedAmount, normalizedCategory);
      } else {
        await prisma.$executeRawUnsafe('INSERT INTO SalesTarget (id, category, amount, createdAt, updatedAt) VALUES (?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)', id, normalizedCategory, normalizedAmount);
      }
      target = { id, category: normalizedCategory, amount: normalizedAmount };
    }
    return NextResponse.json({ target });
  } catch (error) {
    return NextResponse.json({ message: error instanceof Error ? error.message : 'Không thể lưu mục tiêu.' }, { status: 500 });
  }
}
