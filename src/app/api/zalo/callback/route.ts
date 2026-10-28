import { NextRequest, NextResponse } from 'next/server';
import { recordActivity } from '@/lib/activity';
import { getSession } from '@/lib/auth';
import { exchangeAuthorizationCode, getZaloSettings, publicUrl, setZaloSettings, ZALO_KEYS } from '@/lib/zalo';

// An authorization not finished within this window has to be started again.
const PENDING_AUTH_TTL_MS = 15 * 60 * 1000;

function back(request: NextRequest, message: string) {
  return NextResponse.redirect(publicUrl(request, `/admin/zalo?msg=${encodeURIComponent(message)}`));
}

export async function GET(request: NextRequest) {
  const session = getSession(request.cookies);
  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return NextResponse.redirect(publicUrl(request, '/login'));
  }

  const code = request.nextUrl.searchParams.get('code') ?? '';
  const state = request.nextUrl.searchParams.get('state');
  let pending: { verifier?: string; state?: string; createdAt?: number } = {};
  try {
    pending = JSON.parse((await getZaloSettings())[ZALO_KEYS.pendingAuth] ?? '{}');
  } catch {
    // Treated below as an expired authorization attempt.
  }

  if (!code) return back(request, 'Zalo không trả về mã xác thực. Vui lòng bấm Kết nối Zalo OA lại.');
  if (!pending.verifier || Date.now() - (pending.createdAt ?? 0) > PENDING_AUTH_TTL_MS || (state !== null && state !== pending.state)) {
    return back(request, 'Phiên kết nối Zalo đã hết hạn hoặc không hợp lệ, vui lòng bấm Kết nối Zalo OA lại.');
  }

  try {
    await exchangeAuthorizationCode(code, pending.verifier);
  } catch (error) {
    console.error('Zalo authorization failed:', error);
    return back(request, `Kết nối Zalo thất bại: ${error instanceof Error ? error.message : String(error)}`);
  } finally {
    await setZaloSettings({ [ZALO_KEYS.pendingAuth]: null });
  }

  await recordActivity({ userEmail: session.email, action: 'connected_zalo', entityType: 'zalo', details: 'Kết nối Zalo OA' });
  return back(request, 'Đã kết nối Zalo OA. Hãy chọn nhóm nhận thông báo.');
}
