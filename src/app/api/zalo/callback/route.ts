import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { getSession } from '@/lib/auth';
import { exchangeAuthorizationCode, ZALO_OAUTH_COOKIE } from '@/lib/zalo';

function back(request: NextRequest, message: string) {
  const response = NextResponse.redirect(new URL(`/admin/zalo?msg=${encodeURIComponent(message)}`, request.url));
  response.cookies.delete(ZALO_OAUTH_COOKIE);
  return response;
}

export async function GET(request: NextRequest) {
  const session = getSession(request.cookies);
  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return NextResponse.redirect(new URL('/login', request.url));
  }

  const code = request.nextUrl.searchParams.get('code') ?? '';
  const state = request.nextUrl.searchParams.get('state') ?? '';
  let pending: { verifier?: string; state?: string } = {};
  try {
    pending = JSON.parse(request.cookies.get(ZALO_OAUTH_COOKIE)?.value ?? '{}');
  } catch {
    // Treated below as an expired authorization attempt.
  }

  if (!code || !pending.verifier || pending.state !== state) {
    return back(request, 'Phiên kết nối Zalo đã hết hạn hoặc không hợp lệ, vui lòng thử lại.');
  }

  try {
    await exchangeAuthorizationCode(code, pending.verifier);
  } catch (error) {
    console.error('Zalo authorization failed:', error);
    return back(request, `Kết nối Zalo thất bại: ${error instanceof Error ? error.message : String(error)}`);
  }

  await recordActivity({ userEmail: session.email, action: 'connected_zalo', entityType: 'zalo', details: 'Kết nối Zalo OA' });
  return back(request, 'Đã kết nối Zalo OA. Hãy chọn nhóm nhận thông báo.');
}
