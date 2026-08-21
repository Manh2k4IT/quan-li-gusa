import { NextRequest, NextResponse } from 'next/server';
import { getErpFashionMonthlyComparison, getErpFashionPipelineData } from '@/lib/erp';

const CACHE_TTL = 5 * 60 * 1000;
const responseCache = new Map<string, { expiresAt: number; value: unknown }>();
const pendingRequests = new Map<string, Promise<unknown>>();

async function getCached<T>(key: string, loader: () => Promise<T>) {
  const cached = responseCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.value as T;

  const pending = pendingRequests.get(key);
  if (pending) return pending as Promise<T>;

  const request = loader().then((value) => {
    responseCache.set(key, { expiresAt: Date.now() + CACHE_TTL, value });
    pendingRequests.delete(key);
    return value;
  }).catch((error) => {
    pendingRequests.delete(key);
    throw error;
  });

  pendingRequests.set(key, request);
  return request;
}

function getDateRange(request: NextRequest) {
  const requestedYear = Number(request.nextUrl.searchParams.get('year') ?? new Date().getFullYear());
  const year = Number.isFinite(requestedYear) && requestedYear > 2000 ? requestedYear : new Date().getFullYear();
  const fromMonth = Math.min(Math.max(Number(request.nextUrl.searchParams.get('fromMonth') ?? 1), 1), 12);
  const toMonth = Math.min(Math.max(Number(request.nextUrl.searchParams.get('toMonth') ?? 12), 1), 12);
  const startMonth = Math.min(fromMonth, toMonth);
  const endMonth = Math.max(fromMonth, toMonth);
  const fromDate = `${year}-${String(startMonth).padStart(2, '0')}-01`;
  const lastDay = new Date(year, endMonth, 0).getDate();
  const toDate = `${year}-${String(endMonth).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;

  return { fromDate, toDate, year };
}

export async function GET(request: NextRequest) {
  try {
    const { fromDate, toDate, year } = getDateRange(request);
    const progressOnly = request.nextUrl.searchParams.get('progressOnly') === '1';
    const comparisonOnly = request.nextUrl.searchParams.get('comparisonOnly') === '1';
    const pipeline = comparisonOnly ? [] : await getCached(`fashion-progress:${fromDate}:${toDate}`, () => getErpFashionPipelineData(fromDate, toDate));
    const comparison = progressOnly ? [] : await getCached(`fashion-comparison:${year}`, () => getErpFashionMonthlyComparison(year));
    return NextResponse.json({ fromDate, toDate, year, pipeline, comparison });
  } catch (error) {
    console.error('Pipeline ERP API error:', error);
    return NextResponse.json({ message: 'ERP chưa xác thực được API key/secret.', pipeline: [], comparison: [] }, { status: 502 });
  }
}