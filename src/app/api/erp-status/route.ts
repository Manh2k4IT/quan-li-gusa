import { NextResponse } from 'next/server';
import { checkErpConnection, getErpConfigStatus } from '@/lib/erp';

export async function GET() {
  const [connection, config] = await Promise.all([
    checkErpConnection(),
    Promise.resolve(getErpConfigStatus()),
  ]);

  return NextResponse.json({
    ...connection,
    source: config.source,
    apiKeyConfigured: config.apiKeyConfigured,
    apiSecretConfigured: config.apiSecretConfigured,
  });
}