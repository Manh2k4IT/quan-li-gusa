import { NextResponse } from 'next/server';
import { getErpFabricMonthlyComparison, getErpFabricProgress } from '@/lib/erp';

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = Number(searchParams.get('year')) || new Date().getFullYear();
  const month = Number(searchParams.get('month')) || new Date().getMonth() + 1;
  const progressOnly = searchParams.get('progressOnly') === '1';
  const comparisonOnly = searchParams.get('comparisonOnly') === '1';
  const warehouse = searchParams.get('warehouse') || 'Kho vải Quận 4 - CTTGVN';
  const fromDate = `${year}-${String(month).padStart(2, '0')}-01`;
  const toDate = `${year}-${String(month).padStart(2, '0')}-${String(new Date(year, month, 0).getDate()).padStart(2, '0')}`;

  try {
    const progress = comparisonOnly ? [] : await getCached(`fabric-progress:${warehouse}:${fromDate}:${toDate}`, () => getErpFabricProgress(fromDate, toDate, warehouse));
    const comparison = progressOnly ? [] : await getCached(`fabric-comparison:${warehouse}:${year}`, () => getErpFabricMonthlyComparison(year, warehouse));
    return NextResponse.json({ year, month, progress, comparison });
  } catch (error) {
    console.error('ERP fabric progress error:', error);
    return NextResponse.json({ year, month, progress: [], comparison: [] }, { status: 502 });
  }
}
