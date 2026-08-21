import { NextResponse } from 'next/server';
import { SESSION_COOKIE } from '@/lib/auth';

export async function POST(request: Request) {
  const response = NextResponse.redirect(new URL('/login', request.url));

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
  const response = NextResponse.redirect(new URL('/login', request.url));

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
