import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const role = searchParams.get('role');

    const users = await prisma.user.findMany({
      where: role ? { role: role as 'CEO' | 'MANAGER' | 'SALE' } : undefined,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        category: true,
      },
      orderBy: { name: 'asc' },
    });

    return NextResponse.json({ users });
  } catch {
    return NextResponse.json({ users: [] }, { status: 500 });
  }
}
