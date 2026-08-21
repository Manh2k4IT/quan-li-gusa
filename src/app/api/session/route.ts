import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const session = getSession(await cookies());

  if (!session) {
    return NextResponse.json({ user: null }, { status: 401 });
  }

  const databaseUser = await prisma.user.findUnique({
    where: { email: session.email },
    select: { id: true, name: true, email: true, role: true, category: true },
  });

  return NextResponse.json({ user: { ...session, ...databaseUser } });
}
