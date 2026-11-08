'use client';

import { motion } from 'framer-motion';
import { use, useState } from 'react';
import type { Address, Hex } from 'viem';
import { isAddress } from 'viem';
import { useReadContracts } from 'wagmi';

import { MemecoinAbi } from '@/artifacts';
import { Chart } from '@/components/Chart';
import { SwapCard } from '@/components/SwapCard';
import { Tape } from '@/components/Tape';
import { TokenAvatar } from '@/components/TokenAvatar';
import { useToken, mcap } from '@/lib/data';
import { fmtNum, fmtPrice, pct, shortAddr, timeAgo } from '@/lib/format';

import { useSite } from '../../providers';

const INTERVALS = ['1m', '5m', '15m', '1h', '4h'];

export default function TokenPage({ params }: { params: Promise<{ address: string }> }) {
  const { address } = use(params);
  const site = useSite();
  const [interval, setInterval] = useState('5m');
  const [tab, setTab] = useState<'trades' | 'holders'>('trades');
  const valid = isAddress(address);
  const { data, isError, refetch } = useToken(address, interval);

  const { data: onchain } = useReadContracts({
    contracts: [
      { address: address as Address, abi: MemecoinAbi, functionName: 'name' },
      { address: address as Address, abi: MemecoinAbi, functionName: 'symbol' },
    ],
    query: { enabled: valid && !data },
  });

  if (!valid) return <Empty title="That isn’t a token address." />;

  if (!data) {
    const name = onchain?.[0]?.result as string | undefined;
    return (
      <div className="pt-16 text-center">
        <div className="mx-auto h-10 w-10 rounded-full border-2 border-lilac border-t-transparent animate-spin" />
        <h1 className="mt-5 font-display text-2xl font-bold">{name ? `Loading ${name}` : isError ? 'Looking for this token' : 'Loading token'}</h1>
        <p className="mt-2 text-mist">New launches appear within a few seconds.</p>
      </div>
    );
  }

  const t = data.token;
  const creatorSide = 70;
  const creatorPct = (creatorSide * t.creator_share) / 10_000;
  const rest = creatorSide - creatorPct;
  const holdersPct = (rest * t.holder_share) / 10_000;
  const buybackPct = rest - holdersPct;
  const burned = Number(BigInt(t.burned || '0')) / 1e18;

  const stats = [
    { k: 'Market cap', v: `${fmtNum(mcap(t.price), 2)} HYPE` },
    { k: 'Price', v: `${fmtPrice(t.price)} HYPE` },
    { k: '24h volume', v: `${fmtNum(t.volume_24h, 2)} HYPE` },
    { k: 'Holders', v: fmtNum(t.holders, 0) },
    { k: 'Swap fee', v: pct(t.swap_fee) },
    { k: 'Burned', v: burned > 0 ? fmtNum(burned, 2) : '0' },
  ];

  return (
    <div className="pt-6 grid lg:grid-cols-[1fr_380px] gap-6 items-start">
      <div className="flex flex-col gap-6 min-w-0">
        <header className="flex items-start gap-4">
          <TokenAvatar src={t.image} symbol={t.symbol} size={64} />
          <div className="min-w-0">
            <h1 className="font-display text-3xl sm:text-4xl font-extrabold tracking-tight truncate">{t.name}</h1>
            <p className="text-mist flex flex-wrap gap-x-3 gap-y-1 items-center mt-1">
              <span className="text-cloud font-medium">{t.symbol}</span>
              <button className="hover:text-cloud num" onClick={() => navigator.clipboard.writeText(t.address)} title="Copy address">
                {shortAddr(t.address)}
              </button>
              <span>by {shortAddr(t.creator)}</span>
              <span>{timeAgo(t.created_at)} ago</span>
              {t.website && <a className="text-lilac hover:underline" href={t.website} target="_blank" rel="noreferrer">Website</a>}
              {t.twitter && <a className="text-lilac hover:underline" href={t.twitter} target="_blank" rel="noreferrer">X</a>}
              {t.telegram && <a className="text-lilac hover:underline" href={t.telegram} target="_blank" rel="noreferrer">Telegram</a>}
            </p>
          </div>
        </header>

        <dl className="grid grid-cols-2 sm:grid-cols-3 xl:grid-cols-6 gap-px rounded-card overflow-hidden border border-haze bg-haze">
          {stats.map((s) => (
            <div key={s.k} className="bg-dusk px-4 py-3">
              <dt className="text-sm text-mist">{s.k}</dt>
              <dd className="num font-medium mt-0.5 whitespace-nowrap">
                <motion.span key={s.v} initial={{ opacity: 0.4 }} animate={{ opacity: 1 }}>
                  {s.v}
                </motion.span>
              </dd>
            </div>
          ))}
        </dl>

        <section className="panel p-3 sm:p-4">
          <div className="flex items-center justify-between mb-2">
            <h2 className="font-display font-bold px-1">Market cap</h2>
            <div className="flex gap-1">
              {INTERVALS.map((i) => (
                <button key={i} onClick={() => setInterval(i)} className={`px-2.5 py-1 rounded-md text-sm num ${interval === i ? 'bg-haze text-cloud' : 'text-mist hover:text-cloud'}`}>
                  {i}
                </button>
              ))}
            </div>
          </div>
          <Chart candles={data.candles} />
        </section>

        <div className="lg:hidden">
          <SwapCard token={t.address as Address} symbol={t.symbol} poolId={t.pool_id as Hex} price={t.price} startsAt={t.starts_at} onTraded={() => refetch()} />
        </div>

        <section className="panel p-3 sm:p-4">
          <div className="flex gap-1 mb-2">
            {(['trades', 'holders'] as const).map((x) => (
              <button key={x} onClick={() => setTab(x)} className={`px-3.5 py-1.5 rounded-full text-sm capitalize ${tab === x ? 'bg-haze text-cloud' : 'text-mist hover:text-cloud'}`}>
                {x}
              </button>
            ))}
          </div>
          {tab === 'trades' ? (
            <Tape trades={data.trades} showToken={false} />
          ) : (
            <ul className="flex flex-col">
              {data.holders.map((h, i) => {
                const share = Number(BigInt(h.balance)) / 1e27;
                const label = h.holder === site.addresses.poolManager?.toLowerCase() ? 'Uniswap pool' : h.holder === t.creator ? `${shortAddr(h.holder)} (creator)` : shortAddr(h.holder);
                return (
                  <li key={h.holder} className="grid grid-cols-[2rem_1fr_auto] items-center gap-3 px-2 py-2">
                    <span className="text-mist num text-sm">{i + 1}</span>
                    <span className="min-w-0">
                      <span className="block truncate">{label}</span>
                      <span className="block h-1.5 mt-1 rounded-full bg-haze overflow-hidden">
                        <span className="block h-full bg-lilac/70 rounded-full" style={{ width: `${Math.max(1, share * 100)}%` }} />
                      </span>
                    </span>
                    <span className="num text-sm">{(share * 100).toFixed(2)}%</span>
                  </li>
                );
              })}
              {!data.holders.length && <p className="text-mist text-sm px-2 py-6">No holders yet.</p>}
            </ul>
          )}
        </section>
      </div>

      <aside className="flex flex-col gap-4 lg:sticky lg:top-24">
        <div className="hidden lg:block">
          <SwapCard token={t.address as Address} symbol={t.symbol} poolId={t.pool_id as Hex} price={t.price} startsAt={t.starts_at} onTraded={() => refetch()} />
        </div>

        <section className="panel p-4 sm:p-5">
          <h2 className="font-display font-bold">Where the {pct(t.swap_fee)} fee goes</h2>
          <div className="mt-3 flex h-3 rounded-full overflow-hidden" role="img" aria-label="Fee split">
            <span style={{ width: `${creatorPct}%` }} className="bg-lilac" />
            <span style={{ width: `${buybackPct}%` }} className="bg-sell" />
            <span style={{ width: `${holdersPct}%` }} className="bg-buy" />
            <span style={{ width: '30%' }} className="bg-haze" />
          </div>
          <ul className="mt-3 text-sm flex flex-col gap-1.5">
            <Row c="bg-lilac" k="Creator" v={creatorPct} />
            <Row c="bg-sell" k="Buyback and burn" v={buybackPct} />
            <Row c="bg-buy" k="Holders" v={holdersPct} />
            <Row c="bg-haze" k="Protocol" v={30} />
          </ul>
          {t.snipe_fee > 0 && (
            <p className="mt-3 text-sm text-mist">
              Anti-snipe: buys started at {pct(t.snipe_fee)}, falling to {pct(t.swap_fee)} over {Math.round(t.snipe_duration / 60)} min.
            </p>
          )}
        </section>

        {t.description && (
          <section className="panel p-4 sm:p-5">
            <h2 className="font-display font-bold">About</h2>
            <p className="mt-2 text-mist leading-relaxed whitespace-pre-wrap break-words">{t.description}</p>
          </section>
        )}
      </aside>
    </div>
  );
}

function Row({ c, k, v }: { c: string; k: string; v: number }) {
  return (
    <li className="flex items-center gap-2">
      <span className={`h-2.5 w-2.5 rounded-sm ${c}`} />
      <span className="text-mist">{k}</span>
      <span className="ml-auto num">{v.toFixed(v % 1 ? 1 : 0)}%</span>
    </li>
  );
}

function Empty({ title }: { title: string }) {
  return <p className="pt-16 text-center font-display text-2xl">{title}</p>;
}
