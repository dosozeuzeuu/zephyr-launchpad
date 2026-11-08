import { NextResponse } from 'next/server';

import { keepFresh } from '@/lib/server/fresh';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = getStore();
  if (!store) return NextResponse.json({ tokens: [] });
  await keepFresh();
  const tokens = await store.listTokens();
  return NextResponse.json({ tokens }, { headers: { 'cache-control': 'public, s-maxage=2, stale-while-revalidate=10' } });
}
