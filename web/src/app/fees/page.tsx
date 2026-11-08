'use client';

import Link from 'next/link';
import type { Address } from 'viem';
import { useAccount, useReadContract, useReadContracts, useWriteContract } from 'wagmi';

import { FeeEscrowAbi } from '@/artifacts';
import { TokenAvatar } from '@/components/TokenAvatar';
import { useTokens } from '@/lib/data';
import { fmtNum } from '@/lib/format';
import { useTx } from '@/lib/useTx';

import { useSite } from '../providers';

export default function Fees() {
  const site = useSite();
  const escrow = site.addresses.feeEscrow as Address | undefined;
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();
  const { data: tokens = [] } = useTokens();

  const { data: owed, refetch } = useReadContract({ address: escrow, abi: FeeEscrowAbi, functionName: 'balances', args: [address!], query: { enabled: !!address && !!escrow, refetchInterval: 6000 } });
  const mine = tokens.filter((t) => address && t.creator === address.toLowerCase());
  const { data: earned } = useReadContracts({
    contracts: mine.map((t) => ({ address: escrow!, abi: FeeEscrowAbi, functionName: 'totalFeesAllocated' as const, args: [t.pool_id as `0x${string}`] })),
    query: { enabled: !!escrow && mine.length > 0 },
  });

  const amount = owed ? Number(owed) / 1e18 : 0;

  return (
    <div className="pt-8 max-w-3xl">
      <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">Your fees</h1>
      <p className="mt-3 text-muted max-w-[56ch] leading-relaxed">
        Creator fees from your launches collect here in HYPE, along with any holder rewards that couldn&apos;t be sent straight to you. Claim them whenever you like.
      </p>

      <section className="panel p-6 mt-8 flex flex-col sm:flex-row sm:items-center gap-5">
        <div className="flex-1">
          <p className="text-muted">Ready to claim</p>
          <p className="font-display text-4xl font-bold num mt-1">{address ? `${fmtNum(amount, 4)} HYPE` : '—'}</p>
        </div>
        <button
          className="btn-primary h-12 px-7"
          disabled={!address || !escrow || busy || amount === 0}
          onClick={async () => {
            const r = await run('Claim fees', () => writeContractAsync({ address: escrow!, abi: FeeEscrowAbi, functionName: 'withdrawFees', args: [address!, true] }), 'Fees claimed');
            if (r) refetch();
          }}
        >
          {!address ? 'Connect a wallet' : amount === 0 ? 'Nothing to claim yet' : busy ? 'Claiming…' : 'Claim to my wallet'}
        </button>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-2xl font-bold">Your launches</h2>
        {!address ? (
          <p className="mt-3 text-muted">Connect the wallet you launched with to see your tokens.</p>
        ) : mine.length === 0 ? (
          <p className="mt-3 text-muted">
            You haven&apos;t launched a token from this wallet. <Link href="/launch" className="text-laurel hover:underline">Launch one</Link>.
          </p>
        ) : (
          <ul className="panel mt-4 overflow-hidden">
            {mine.map((t, i) => (
              <li key={t.address} className="border-b border-line/60 last:border-0">
                <Link href={`/token/${t.address}`} className="flex items-center gap-3 px-4 py-3 hover:bg-line/40">
                  <TokenAvatar src={t.image} symbol={t.symbol} size={40} />
                  <span className="flex-1 min-w-0">
                    <span className="block font-medium truncate">{t.name}</span>
                    <span className="block text-sm text-muted">{t.symbol}</span>
                  </span>
                  <span className="text-right">
                    <span className="block num">{fmtNum(Number((earned?.[i]?.result as bigint | undefined) ?? 0n) / 1e18, 4)} HYPE</span>
                    <span className="block text-sm text-muted">earned all time</span>
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
