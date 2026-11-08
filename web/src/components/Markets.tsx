'use client';

import { motion } from 'framer-motion';
import Link from 'next/link';
import { useMemo, useState } from 'react';

import { mcap } from '@/lib/data';
import { fmtNum, fmtPrice, pct, timeAgo } from '@/lib/format';
import type { TokenStats } from '@/lib/server/store';

import { TokenAvatar } from './TokenAvatar';

const TABS = [
  { id: 'trending', label: 'Trending' },
  { id: 'new', label: 'New' },
  { id: 'top', label: 'Top' },
  { id: 'soon', label: 'Opening soon' },
] as const;
type Tab = (typeof TABS)[number]['id'];

export function Markets({ tokens, loading }: { tokens: TokenStats[]; loading: boolean }) {
  const [tab, setTab] = useState<Tab>('trending');
  const [q, setQ] = useState('');
  const now = Date.now() / 1000;

  const rows = useMemo(() => {
    const term = q.trim().toLowerCase();
    let list = tokens.filter((t) => !term || t.name.toLowerCase().includes(term) || t.symbol.toLowerCase().includes(term) || t.address === term);
    if (tab === 'soon') list = list.filter((t) => t.starts_at > now);
    else list = list.filter((t) => t.starts_at <= now);
    if (tab === 'trending') list.sort((a, b) => b.volume_24h - a.volume_24h || b.last_trade_at - a.last_trade_at);
    if (tab === 'new') list.sort((a, b) => b.created_at - a.created_at);
    if (tab === 'top') list.sort((a, b) => b.price - a.price);
    if (tab === 'soon') list.sort((a, b) => a.starts_at - b.starts_at);
    return list.slice(0, 100);
  }, [tokens, tab, q, now]);

  return (
    <section aria-labelledby="markets">
      <div className="flex flex-col sm:flex-row sm:items-center gap-3 mb-3">
        <h2 id="markets" className="font-display text-2xl font-bold">Markets</h2>
        <div className="flex gap-1 overflow-x-auto -mx-1 px-1 sm:ml-4" role="tablist">
          {TABS.map((t) => (
            <button key={t.id} role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className={`relative px-3.5 py-1.5 rounded-full text-sm whitespace-nowrap ${tab === t.id ? 'text-night' : 'text-mist hover:text-cloud'}`}>
              {tab === t.id && <motion.span layoutId="market-tab" className="absolute inset-0 rounded-full bg-lilac" transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
              <span className="relative">{t.label}</span>
            </button>
          ))}
        </div>
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, ticker or address" className="field h-10 sm:ml-auto sm:max-w-[280px]" aria-label="Search tokens" />
      </div>

      <div className="panel overflow-hidden">
        <div className="hidden sm:grid grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.7fr] gap-3 px-4 py-3 text-sm text-mist border-b border-haze">
          <span>Token</span>
          <span className="text-right">Market cap</span>
          <span className="text-right">24h volume</span>
          <span className="text-right">24h</span>
          <span className="text-right">Holders</span>
          <span className="text-right">Fee</span>
        </div>
        {loading && !tokens.length ? (
          <div className="p-4 flex flex-col gap-3">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="h-12 rounded-xl bg-haze/50 animate-pulse" />
            ))}
          </div>
        ) : rows.length === 0 ? (
          <div className="px-4 py-12 text-center">
            <p className="text-mist">{q ? 'No token matches that search.' : tab === 'soon' ? 'No launches are scheduled.' : 'No tokens yet.'}</p>
            {!q && (
              <Link href="/launch" className="btn-primary mt-4">
                Launch the first one
              </Link>
            )}
          </div>
        ) : (
          <ul>
            {rows.map((t) => (
              <motion.li key={t.address} layout transition={{ type: 'spring', stiffness: 500, damping: 42 }} className="border-b border-haze/60 last:border-0">
                <Link href={`/token/${t.address}`} className="grid grid-cols-[1fr_auto] sm:grid-cols-[2fr_1fr_1fr_1fr_0.8fr_0.7fr] gap-3 items-center px-4 py-3 hover:bg-haze/40 transition-colors">
                  <span className="flex items-center gap-3 min-w-0">
                    <TokenAvatar src={t.image} symbol={t.symbol} size={40} />
                    <span className="min-w-0">
                      <span className="block font-medium truncate">{t.name}</span>
                      <span className="block text-sm text-mist">
                        {t.symbol} · {tab === 'soon' ? `opens in ${timeAgo(2 * now - t.starts_at)}` : `${timeAgo(t.created_at)} old`}
                      </span>
                    </span>
                  </span>
                  <span className="text-right num">
                    <span className="block">{fmtNum(mcap(t.price), 1)} HYPE</span>
                    <span className={`block sm:hidden text-sm ${t.change_24h >= 0 ? 'text-buy' : 'text-sell'}`}>{(t.change_24h * 100).toFixed(1)}%</span>
                  </span>
                  <span className="hidden sm:block text-right num">{fmtNum(t.volume_24h, 2)}</span>
                  <span className={`hidden sm:block text-right num ${t.change_24h >= 0 ? 'text-buy' : 'text-sell'}`}>
                    {t.change_24h >= 0 ? '+' : ''}
                    {(t.change_24h * 100).toFixed(1)}%
                  </span>
                  <span className="hidden sm:block text-right num">{fmtNum(t.holders, 0)}</span>
                  <span className="hidden sm:block text-right num text-mist" title={`Price ${fmtPrice(t.price)} HYPE`}>{pct(t.swap_fee)}</span>
                </Link>
              </motion.li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
