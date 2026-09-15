import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

const noteTypes = new Set(['Nghỉ phép', 'Đi trễ', 'Về sớm']);

function canManageAttendance(session: ReturnType<typeof getSession>) {
  return Boolean(session && (session.role === 'CEO' || session.role === 'MANAGER'));
}

export async function GET(request: Request) {
  const session = getSession(await cookies());
  if (!canManageAttendance(session)) return NextResponse.json({ message: 'Không có quyền truy cập.' }, { status: 403 });

  const url = new URL(request.url);
  const date = url.searchParams.get('date');
  const from = url.searchParams.get('from');
  const to = url.searchParams.get('to');
  const notes = await prisma.attendanceNote.findMany({
    where: {
      ...(date ? { date } : {}),
      ...(from || to ? { date: { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) } } : {}),
    },
    orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
  });
  return NextResponse.json({ notes });
}

export async function POST(request: Request) {
  const session = getSession(await cookies());
  if (!canManageAttendance(session)) return NextResponse.json({ message: 'Không có quyền cập nhật.' }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const date = String(body?.date ?? '').trim();
  const name = String(body?.name ?? '').trim();
  const department = String(body?.department ?? 'Chưa phân bộ phận').trim() || 'Chưa phân bộ phận';
  const type = String(body?.type ?? '').trim();
  const reason = String(body?.reason ?? '').trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date) || !name || !noteTypes.has(type) || !reason) {
    return NextResponse.json({ message: 'Vui lòng nhập ngày, nhân sự, loại ghi chú và lý do.' }, { status: 400 });
  }

  const note = await prisma.attendanceNote.create({ data: { date, name, department, type, reason } });
  return NextResponse.json({ note }, { status: 201 });
}

export async function DELETE(request: Request) {
  const session = getSession(await cookies());
  if (!canManageAttendance(session)) return NextResponse.json({ message: 'Không có quyền xóa.' }, { status: 403 });

  const body = await request.json().catch(() => null) as Record<string, unknown> | null;
  const id = String(body?.id ?? '').trim();
  if (!id) return NextResponse.json({ message: 'Thiếu mã ghi chú.' }, { status: 400 });
  await prisma.attendanceNote.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}