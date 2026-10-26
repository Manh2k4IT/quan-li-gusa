import { NextResponse } from 'next/server';
import { validateCredentials, SESSION_COOKIE, sessionCookieOptions } from '@/lib/auth';

export async function POST(request: Request) {
  try {
    const body = await request.json();
    const user = await validateCredentials(body.email, body.password);

    if (!user) {
      return NextResponse.json(
        { message: 'Email hoặc mật khẩu không đúng.' },
        { status: 401 },
      );
    }

    const response = NextResponse.json({ ok: true, user });
    response.cookies.set({
      name: SESSION_COOKIE,
      value: JSON.stringify(user),
      ...sessionCookieOptions,
    });

    return response;
  } catch {
    return NextResponse.json(
      { message: 'Không thể xử lý đăng nhập.' },
      { status: 500 },
    );
  }
}
