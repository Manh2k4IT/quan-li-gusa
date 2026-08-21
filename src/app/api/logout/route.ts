import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

function getLoginUrl(request: Request) {
  const publicUrl = process.env.RENDER_EXTERNAL_URL || request.url;
  return new URL('/login', publicUrl);
}

export async function POST(request: Request) {
  const response = NextResponse.redirect(getLoginUrl(request));

  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });

  return response;
}

export async function GET(request: Request) {
  const response = NextResponse.redirect(getLoginUrl(request));

  response.cookies.set({
    name: SESSION_COOKIE,
    value: '',
    path: '/',
    httpOnly: true,
    sameSite: 'lax',
    maxAge: 0,
  });

  return response;
}
