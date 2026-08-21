import { NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { cookies } from 'next/headers';
import { prisma } from '@/lib/prisma';

export async function GET() {
  try {
    const session = getSession(await cookies());
    if (session?.role === 'SALE' && !session.id) {
      const saleByEmail = session?.email
        ? await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } })
        : null;

      if (!saleByEmail?.id) {
        return NextResponse.json({ assignments: [] });
      }

      const assignments = await prisma.salesAssignment.findMany({
        where: { assigneeId: saleByEmail.id },
        orderBy: { createdAt: 'desc' },
        include: {
          assignee: { select: { id: true, name: true, email: true, category: true } },
          manager: { select: { id: true, name: true, email: true } },
        },
      });

      return NextResponse.json({ assignments });
    }

    const where = session?.role === 'SALE' ? { assigneeId: session.id } : {};

    const assignments = await prisma.salesAssignment.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        assignee: { select: { id: true, name: true, email: true, category: true } },
        manager: { select: { id: true, name: true, email: true } },
      },
    });

    return NextResponse.json({ assignments });
  } catch {
    try {
      const session = getSession(await cookies());
      const saleId = session?.role === 'SALE'
        ? (session.id ?? (session.email ? (await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } }))?.id : undefined))
        : undefined;
      const assignments = await prisma.$queryRawUnsafe<Array<Record<string, string>>>(
        `SELECT sa.id, sa.date, sa.category, sa.title, sa.note, sa.status, sa.attachmentName,
                assignee.id AS assigneeId, assignee.name AS assigneeName, assignee.email AS assigneeEmail,
                manager.id AS managerId, manager.name AS managerName, manager.email AS managerEmail
         FROM SalesAssignment sa
         JOIN User assignee ON assignee.id = sa.assigneeId
         JOIN User manager ON manager.id = sa.managerId
         ${saleId ? 'WHERE sa.assigneeId = ?' : ''}
         ORDER BY sa.createdAt DESC`,
        ...(saleId ? [saleId] : []),
      );

      return NextResponse.json({ assignments: assignments.map((assignment) => ({
        id: assignment.id,
        date: assignment.date,
        category: assignment.category,
        title: assignment.title,
        note: assignment.note,
        status: assignment.status,
        attachmentName: assignment.attachmentName,
        assignee: { id: assignment.assigneeId, name: assignment.assigneeName, email: assignment.assigneeEmail },
        manager: { id: assignment.managerId, name: assignment.managerName, email: assignment.managerEmail },
      })) });
    } catch {
      return NextResponse.json({ assignments: [] }, { status: 500 });
    }
  }
}

export async function POST(request: Request) {
  try {
    const session = getSession(await cookies());
    const body = await request.json();
    const { assigneeId, category, title, note, status, date, attachmentName } = body ?? {};

    if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
      return NextResponse.json({ message: 'Không có quyền giao việc.' }, { status: 403 });
    }

    if (!assigneeId || !category || !title) {
      return NextResponse.json({ message: 'Thiếu dữ liệu giao việc.' }, { status: 400 });
    }

    const managerBySessionId = session.id
      ? await prisma.user.findUnique({ where: { id: session.id }, select: { id: true } })
      : null;
    const managerByEmail = !managerBySessionId && session.email
      ? await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } })
      : null;
    const managerId = managerBySessionId?.id ?? managerByEmail?.id;

    if (!managerId) {
      return NextResponse.json({ message: 'Không tìm thấy tài khoản quản lý trong hệ thống. Vui lòng đăng nhập lại.' }, { status: 400 });
    }

    const assignee = await prisma.user.findUnique({
      where: { id: String(assigneeId) },
      select: { id: true, role: true },
    });

    if (!assignee || assignee.role !== 'SALE') {
      return NextResponse.json({ message: 'Tài khoản nhận việc không hợp lệ.' }, { status: 400 });
    }

    const assignmentData = {
      managerId,
      assigneeId,
      category,
      title,
      note: note ?? '',
      status: status ?? 'Đang thực hiện',
      date: date ?? new Date().toISOString().slice(0, 10),
      attachmentName: attachmentName ?? '',
    };
    const assignmentDelegate = (prisma as typeof prisma & { salesAssignment?: { create: Function } }).salesAssignment;
    let assignment;

    if (assignmentDelegate?.create) {
      assignment = await assignmentDelegate.create({
        data: assignmentData,
        include: {
          assignee: { select: { id: true, name: true, email: true, category: true } },
          manager: { select: { id: true, name: true, email: true } },
        },
      });
    } else {
      const id = crypto.randomUUID();
      await prisma.$executeRawUnsafe(
        'INSERT INTO SalesAssignment (id, managerId, assigneeId, category, title, note, status, date, attachmentName, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        id,
        assignmentData.managerId,
        assignmentData.assigneeId,
        assignmentData.category,
        assignmentData.title,
        assignmentData.note,
        assignmentData.status,
        assignmentData.date,
        assignmentData.attachmentName,
      );
      assignment = { id, ...assignmentData };
    }

    return NextResponse.json({ assignment });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể gửi giao việc.';
    return NextResponse.json({ message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  try {
    const session = getSession(await cookies());
    const body = await request.json();
    const { id, status, note } = body ?? {};

    if (!session || !id || !status) {
      return NextResponse.json({ message: 'Thiếu dữ liệu cập nhật.' }, { status: 400 });
    }

    const assignmentDelegate = (prisma as typeof prisma & { salesAssignment?: { findUnique: Function; update: Function } }).salesAssignment;
    const assignment = assignmentDelegate?.findUnique
      ? await assignmentDelegate.findUnique({
          where: { id: String(id) },
          select: { id: true, assigneeId: true, status: true },
        })
      : (await prisma.$queryRawUnsafe<Array<{ id: string; assigneeId: string; status: string }>>('SELECT id, assigneeId, status FROM SalesAssignment WHERE id = ?', String(id)))[0];

    if (!assignment) {
      return NextResponse.json({ message: 'Không tìm thấy công việc.' }, { status: 404 });
    }

    if (assignment.status === 'Đã duyệt' || assignment.status === 'Không duyệt') {
      return NextResponse.json({ message: 'Công việc đã có kết quả cuối và không thể thay đổi.' }, { status: 409 });
    }

    const saleId = session.id ?? (session.email
      ? (await prisma.user.findUnique({ where: { email: session.email }, select: { id: true } }))?.id
      : undefined);
    const canUpdate = session.role === 'CEO' || session.role === 'MANAGER' || saleId === assignment.assigneeId;

    if (!canUpdate) {
      return NextResponse.json({ message: 'Bạn không có quyền cập nhật công việc này.' }, { status: 403 });
    }

    const updated = assignmentDelegate?.update
      ? await assignmentDelegate.update({
          where: { id: String(id) },
          data: {
            status: String(status),
            ...(typeof note === 'string' ? { note } : {}),
          },
        })
      : await prisma.$executeRawUnsafe(
          'UPDATE SalesAssignment SET status = ?, note = ?, updatedAt = CURRENT_TIMESTAMP WHERE id = ?',
          String(status),
          typeof note === 'string' ? note : '',
          String(id),
        );

    return NextResponse.json({ assignment: updated });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể cập nhật công việc.';
    return NextResponse.json({ message }, { status: 500 });
  }
}
