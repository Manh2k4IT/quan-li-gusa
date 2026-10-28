import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildAuthorizeUrl, createPkcePair, getZaloAppConfig, ZALO_OAUTH_COOKIE } from '@/lib/zalo';

// Starts the OA authorization: Zalo sends the CEO/manager back to /api/zalo/callback with a code.
export async function GET(request: NextRequest) {
  const session = getSession(request.cookies);
  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }
  if (!getZaloAppConfig().configured) {
    return NextResponse.redirect(new URL('/admin/zalo?msg=Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trên server.', request.url));
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('hex');
  const redirectUri = new URL('/api/zalo/callback', request.url).toString();

  const response = NextResponse.redirect(buildAuthorizeUrl(redirectUri, challenge, state));
  response.cookies.set({
    name: ZALO_OAUTH_COOKIE,
    value: JSON.stringify({ verifier, state }),
    httpOnly: true,
    sameSite: 'lax',
    path: '/',
    secure: process.env.NODE_ENV === 'production',
    maxAge: 10 * 60,
  });
  return response;
}
