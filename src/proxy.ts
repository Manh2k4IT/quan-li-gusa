import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionCookieOptions } from '@/lib/session-cookie';

export function proxy(request: NextRequest) {
  const session = request.cookies.get(SESSION_COOKIE)?.value;

  if (!session) {
    return NextResponse.next();
  }

  const response = request.nextUrl.pathname === '/login'
    ? NextResponse.redirect(new URL('/', request.url))
    : NextResponse.next();

  // Sliding expiry: every visit pushes the expiry another 400 days out.
  response.cookies.set({ name: SESSION_COOKIE, value: session, ...sessionCookieOptions });

  return response;
}

export const config = {
  matcher: ['/((?!api/logout|_next/static|_next/image|favicon.ico|.*\\.(?:png|jpg|jpeg|gif|svg|webp|ico)$).*)'],
};
