import { NextResponse } from 'next/server';

import { loadConfig } from '@/lib/server/config';
import { sync } from '@/lib/server/indexer';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';
export const maxDuration = 30;

export async function GET() {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'Database is not configured' }, { status: 500 });
  const result = await sync(store, await loadConfig(), { budgetMs: 20_000 });
  return NextResponse.json(result ?? { skipped: true });
}
