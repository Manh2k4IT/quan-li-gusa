import { randomBytes } from 'node:crypto';
import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { buildAuthorizeUrl, createPkcePair, getZaloAppConfig, publicUrl, setZaloSettings, ZALO_KEYS } from '@/lib/zalo';

// Starts the OA authorization: Zalo sends the CEO/manager back to the app's callback URL with a code.
export async function GET(request: NextRequest) {
  const session = getSession(request.cookies);
  if (!session || (session.role !== 'CEO' && session.role !== 'MANAGER')) {
    return NextResponse.redirect(publicUrl(request, '/login'));
  }
  if (!getZaloAppConfig().configured) {
    return NextResponse.redirect(publicUrl(request, `/admin/zalo?msg=${encodeURIComponent('Thiếu ZALO_APP_ID hoặc ZALO_APP_SECRET trên server.')}`));
  }

  const { verifier, challenge } = createPkcePair();
  const state = randomBytes(16).toString('hex');
  // Kept server-side: the browser cookie did not reliably survive the round trip through Zalo.
  await setZaloSettings({ [ZALO_KEYS.pendingAuth]: JSON.stringify({ verifier, state, createdAt: Date.now() }) });

  return NextResponse.redirect(buildAuthorizeUrl(publicUrl(request, '/api/zalo/callback').toString(), challenge, state));
}
