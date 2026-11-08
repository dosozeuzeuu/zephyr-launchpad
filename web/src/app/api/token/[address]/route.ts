import { NextResponse } from 'next/server';

import { keepFresh } from '@/lib/server/fresh';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

const INTERVALS: Record<string, number> = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400 };

export async function GET(req: Request, ctx: { params: Promise<{ address: string }> }) {
  const { address } = await ctx.params;
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'not found' }, { status: 404 });
  await keepFresh();

  const token = await store.getToken(address);
  if (!token) return NextResponse.json({ error: 'not found' }, { status: 404 });

  const interval = INTERVALS[new URL(req.url).searchParams.get('i') ?? '5m'] ?? 300;
  const since = Math.floor(Date.now() / 1000) - interval * 500;
  const [trades, holders, history] = await Promise.all([store.trades({ token: address, limit: 60 }), store.holders(address, 25), store.tradesSince(address, since)]);

  // OHLC candles; each candle opens at the previous close so the chart has no gaps
  const candles: { time: number; open: number; high: number; low: number; close: number; volume: number }[] = [];
  let prev = 0;
  for (const t of history) {
    const time = Math.floor(t.ts / interval) * interval;
    const last = candles[candles.length - 1];
    if (last && last.time === time) {
      last.high = Math.max(last.high, t.price);
      last.low = Math.min(last.low, t.price);
      last.close = t.price;
      last.volume += t.hype;
    } else {
      const open = prev || t.price;
      candles.push({ time, open, high: Math.max(open, t.price), low: Math.min(open, t.price), close: t.price, volume: t.hype });
    }
    prev = t.price;
  }

  return NextResponse.json({ token, trades, holders, candles }, { headers: { 'cache-control': 'public, s-maxage=2, stale-while-revalidate=10' } });
}
