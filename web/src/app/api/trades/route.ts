import { NextResponse } from 'next/server';

import { keepFresh } from '@/lib/server/fresh';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const store = getStore();
  if (!store) return NextResponse.json({ trades: [] });
  await keepFresh();
  const [trades, tokens] = await Promise.all([store.trades({ limit: 40 }), store.listTokens()]);
  const sym = new Map(tokens.map((t) => [t.address, { symbol: t.symbol, image: t.image }]));
  return NextResponse.json(
    { trades: trades.map((t) => ({ ...t, symbol: sym.get(t.token)?.symbol, image: sym.get(t.token)?.image })) },
    { headers: { 'cache-control': 'public, s-maxage=2, stale-while-revalidate=10' } },
  );
}
