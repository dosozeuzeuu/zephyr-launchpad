import { NextResponse } from 'next/server';
import type { Hex } from 'viem';

import { loadConfig } from '@/lib/server/config';
import { sync } from '@/lib/server/indexer';
import { runKeeper } from '@/lib/server/keeper';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Called on a schedule: catches the index up, then runs buybacks and holder rounds. */
export async function GET(req: Request) {
  const secret = process.env.CRON_SECRET;
  const auth = req.headers.get('authorization') ?? `Bearer ${new URL(req.url).searchParams.get('secret') ?? ''}`;
  if (!secret || auth !== `Bearer ${secret}`) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  const store = getStore();
  const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  if (!store || !key) return NextResponse.json({ error: 'Database or keeper key not configured' }, { status: 500 });

  const cfg = await loadConfig();
  const synced = await sync(store, cfg, { budgetMs: 20_000 });
  const report = await runKeeper(store, cfg, key);
  return NextResponse.json({ synced, report });
}
