import { NextResponse } from 'next/server';
import { type Address, type Hex, isAddress, verifyMessage } from 'viem';

import { DEFAULT_CONFIG, type SiteConfig } from '@/lib/config';
import { clearConfigCache, loadConfig } from '@/lib/server/config';
import { getStore } from '@/lib/server/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  const cfg = await loadConfig();
  return NextResponse.json({ ...cfg, hasDatabase: Boolean(getStore()) });
}

/** Saves the deployment. Only accepted with a fresh signature from the admin wallet. */
export async function POST(req: Request) {
  const store = getStore();
  if (!store) return NextResponse.json({ error: 'Database is not configured' }, { status: 500 });

  const body = (await req.json()) as { config: SiteConfig; message: string; signature: Hex };
  const current = await loadConfig();
  const admin = (current.admin ?? DEFAULT_CONFIG.admin) as Address;

  const expected = `Zephyr: save site config\n${JSON.stringify(body.config)}`;
  if (!body.message.startsWith(expected + '\nAt: ')) return NextResponse.json({ error: 'Bad message' }, { status: 400 });
  const at = Number(body.message.split('\nAt: ')[1]);
  if (!at || Math.abs(Date.now() / 1000 - at) > 600) return NextResponse.json({ error: 'Signature expired' }, { status: 400 });

  const ok = await verifyMessage({ address: admin, message: body.message, signature: body.signature });
  if (!ok) return NextResponse.json({ error: 'Not signed by the admin wallet' }, { status: 403 });

  const c = body.config;
  for (const v of Object.values(c.addresses ?? {})) if (v && !isAddress(v)) return NextResponse.json({ error: 'Bad address' }, { status: 400 });
  if (!/^https:\/\//.test(c.rpcUrl)) return NextResponse.json({ error: 'RPC must be https' }, { status: 400 });

  await store.setConfig({ ...c, admin });
  clearConfigCache();
  return NextResponse.json({ ok: true });
}
