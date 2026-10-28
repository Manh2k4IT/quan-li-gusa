import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { getSession } from '@/lib/auth';
import { prisma } from '@/lib/prisma';

// Avatars of every user that has one, keyed by user id, for lists that show people.
export async function GET() {
  const session = getSession(await cookies());
  if (!session) return NextResponse.json({ message: 'Unauthorized' }, { status: 401 });

  const users = await prisma.user.findMany({ where: { avatar: { not: null } }, select: { id: true, avatar: true } });
  return NextResponse.json({ avatars: Object.fromEntries(users.map((user) => [user.id, user.avatar])) });
}
