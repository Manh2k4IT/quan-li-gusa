import { createHash, randomBytes } from 'node:crypto';
import { prisma } from '@/lib/prisma';

const OAUTH_URL = 'https://oauth.zaloapp.com/v4/oa';
const API_URL = 'https://openapi.zalo.me';
// Access tokens live 25 hours; refresh a little early so a send never races the expiry.
const REFRESH_SKEW_MS = 5 * 60 * 1000;
// Zalo refuses text messages over 2000 characters.
const MAX_TEXT_LENGTH = 2000;
const TOKEN_ERRORS = new Set([-216, -220]);

// The server listens on 0.0.0.0 behind Render's proxy, so request.url is not the address the browser used.
export function publicUrl(request: Request, path: string) {
  const host = request.headers.get('x-forwarded-host') ?? request.headers.get('host');
  if (!host) return new URL(path, request.url);
  const proto = request.headers.get('x-forwarded-proto')?.split(',')[0] ?? (host.startsWith('localhost') ? 'http' : 'https');
  return new URL(path, `${proto}://${host}`);
}

export const ZALO_KEYS = {
  accessToken: 'accessToken',
  accessTokenExpiresAt: 'accessTokenExpiresAt',
  refreshToken: 'refreshToken',
  groupId: 'groupId',
  groupName: 'groupName',
  watchStartedAt: 'watchStartedAt',
  lastWeeklyReport: 'lastWeeklyReport',
  lastError: 'lastError',
  // PKCE verifier and state between /api/zalo/connect and the callback.
  pendingAuth: 'pendingAuth',
} as const;

export type ZaloGroup = { group_id: string; name: string; status: string; total_member?: number };

export function getZaloAppConfig() {
  const appId = process.env.ZALO_APP_ID?.trim() ?? '';
  const appSecret = process.env.ZALO_APP_SECRET?.trim() ?? '';
  return { appId, appSecret, configured: Boolean(appId && appSecret) };
}

export async function getZaloSettings() {
  const rows = await prisma.zaloSetting.findMany();
  return Object.fromEntries(rows.map((row) => [row.key, row.value])) as Partial<Record<string, string>>;
}

export async function setZaloSettings(values: Record<string, string | null>) {
  await prisma.$transaction(Object.entries(values).map(([key, value]) => (
    value === null
      ? prisma.zaloSetting.deleteMany({ where: { key } })
      : prisma.zaloSetting.upsert({ where: { key }, update: { value }, create: { key, value } })
  )));
}

export function createPkcePair() {
  const verifier = randomBytes(32).toString('base64url');
  const challenge = createHash('sha256').update(verifier).digest('base64url');
  return { verifier, challenge };
}

export function buildAuthorizeUrl(redirectUri: string, codeChallenge: string, state: string) {
  const params = new URLSearchParams({ app_id: getZaloAppConfig().appId, redirect_uri: redirectUri, code_challenge: codeChallenge, state });
  return `${OAUTH_URL}/permission?${params}`;
}

type TokenResponse = { access_token?: string; refresh_token?: string; expires_in?: string | number; error?: number; error_name?: string; error_description?: string };

async function requestTokens(params: Record<string, string>) {
  const { appId, appSecret } = getZaloAppConfig();
  const response = await fetch(`${OAUTH_URL}/access_token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded', secret_key: appSecret },
    body: new URLSearchParams({ app_id: appId, ...params }).toString(),
    cache: 'no-store',
  });
  const data = (await response.json().catch(() => ({}))) as TokenResponse;
  if (!data.access_token || !data.refresh_token) {
    throw new Error(`Zalo token request failed: ${data.error_description || data.error_name || data.error || response.status}`);
  }

  const expiresAt = Date.now() + (Number(data.expires_in) || 90_000) * 1000;
  // Refresh tokens are single-use, so the new pair must be stored before anything else can run.
  await setZaloSettings({
    [ZALO_KEYS.accessToken]: data.access_token,
    [ZALO_KEYS.refreshToken]: data.refresh_token,
    [ZALO_KEYS.accessTokenExpiresAt]: String(expiresAt),
    [ZALO_KEYS.lastError]: null,
  });
  return data.access_token;
}

export function exchangeAuthorizationCode(code: string, codeVerifier: string) {
  return requestTokens({ code, code_verifier: codeVerifier, grant_type: 'authorization_code' });
}

let refreshInFlight: Promise<string> | null = null;

// Concurrent callers share one refresh; otherwise all but the first would spend an already-used refresh token.
function refreshAccessToken() {
  refreshInFlight ??= (async () => {
    const refreshToken = (await getZaloSettings())[ZALO_KEYS.refreshToken];
    if (!refreshToken) throw new Error('Chưa kết nối Zalo OA.');
    return requestTokens({ refresh_token: refreshToken, grant_type: 'refresh_token' });
  })().finally(() => { refreshInFlight = null; });
  return refreshInFlight;
}

async function getAccessToken() {
  const settings = await getZaloSettings();
  const token = settings[ZALO_KEYS.accessToken];
  const expiresAt = Number(settings[ZALO_KEYS.accessTokenExpiresAt]) || 0;
  return token && Date.now() < expiresAt - REFRESH_SKEW_MS ? token : refreshAccessToken();
}

type ApiEnvelope<T> = { error?: number; message?: string; data?: T };

async function zaloApi<T>(path: string, init: { method: 'GET' | 'POST'; body?: unknown }, retried = false): Promise<T> {
  const response = await fetch(`${API_URL}/${path}`, {
    method: init.method,
    headers: { access_token: await getAccessToken(), ...(init.body ? { 'Content-Type': 'application/json' } : {}) },
    body: init.body ? JSON.stringify(init.body) : undefined,
    cache: 'no-store',
  });
  const envelope = (await response.json().catch(() => ({}))) as ApiEnvelope<T>;

  if (!retried && envelope.error !== undefined && TOKEN_ERRORS.has(envelope.error)) {
    await refreshAccessToken();
    return zaloApi(path, init, true);
  }
  // Zalo reports failures as HTTP 200 with a non-zero `error`.
  if (envelope.error !== 0) throw new Error(`Zalo API ${path} failed: ${envelope.message ?? response.status} (error ${envelope.error})`);
  return envelope.data as T;
}

export async function listZaloGroups() {
  const data = await zaloApi<{ groups?: ZaloGroup[] }>('v3.0/oa/group/getgroupsofoa?offset=0&count=50', { method: 'GET' });
  return Array.isArray(data?.groups) ? data.groups : [];
}

// Splits on line breaks so a long report never cuts a line in half.
function chunkText(text: string) {
  const chunks: string[] = [];
  let current = '';
  for (const line of text.split('\n')) {
    const next = current ? `${current}\n${line}` : line;
    if (next.length > MAX_TEXT_LENGTH && current) {
      chunks.push(current);
      current = line.slice(0, MAX_TEXT_LENGTH);
    } else {
      current = next.slice(0, MAX_TEXT_LENGTH);
    }
  }
  if (current) chunks.push(current);
  return chunks;
}

export async function sendZaloGroupText(text: string, groupId?: string) {
  const target = groupId ?? (await getZaloSettings())[ZALO_KEYS.groupId];
  if (!target) throw new Error('Chưa chọn nhóm Zalo nhận thông báo.');
  for (const chunk of chunkText(text)) {
    await zaloApi('v3.0/oa/group/message', { method: 'POST', body: { recipient: { group_id: target }, message: { text: chunk } } });
  }
}
