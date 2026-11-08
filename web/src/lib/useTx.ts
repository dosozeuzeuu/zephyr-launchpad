'use client';

import { useState } from 'react';
import type { Hash, TransactionReceipt } from 'viem';
import { usePublicClient } from 'wagmi';

import { useSite } from '@/app/providers';
import { dismiss, toast } from '@/components/Toaster';

/** Wraps a wallet call with pending/success/error toasts and waits for the receipt. */
export function useTx() {
  const client = usePublicClient();
  const site = useSite();
  const [busy, setBusy] = useState(false);

  async function run(label: string, send: () => Promise<Hash>, done?: string): Promise<TransactionReceipt | null> {
    setBusy(true);
    let waitId = 0;
    try {
      waitId = toast({ kind: 'wait', title: `${label}: confirm in your wallet` });
      const hash = await send();
      dismiss(waitId);
      waitId = toast({ kind: 'wait', title: `${label}: waiting for the chain` });
      const receipt = await client!.waitForTransactionReceipt({ hash, timeout: 120_000 });
      dismiss(waitId);
      if (receipt.status !== 'success') throw new Error('The transaction reverted');
      toast({ kind: 'ok', title: done ?? `${label}: done`, href: site.explorerUrl ? `${site.explorerUrl}/tx/${hash}` : undefined });
      return receipt;
    } catch (e) {
      dismiss(waitId);
      const msg = e instanceof Error ? e.message : String(e);
      const short = /User rejected|denied/i.test(msg) ? 'You cancelled it in your wallet.' : (msg.split('\n')[0] ?? msg).slice(0, 160);
      toast({ kind: 'err', title: `${label} failed`, body: short }, 9000);
      return null;
    } finally {
      setBusy(false);
    }
  }

  return { run, busy };
}
