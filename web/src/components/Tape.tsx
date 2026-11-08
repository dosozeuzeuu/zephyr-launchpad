'use client';

import { AnimatePresence, motion } from 'framer-motion';
import Link from 'next/link';

import type { TapeTrade } from '@/lib/data';
import { fmtNum, shortAddr, timeAgo } from '@/lib/format';

import { TokenAvatar } from './TokenAvatar';

export function Tape({ trades, showToken = true, compact = false }: { trades: TapeTrade[]; showToken?: boolean; compact?: boolean }) {
  if (!trades.length) return <p className="text-muted text-sm px-1 py-6">Waiting for the next trade.</p>;
  return (
    <ul className="flex flex-col">
      <AnimatePresence initial={false}>
        {trades.slice(0, compact ? 12 : 60).map((t) => (
          <motion.li
            key={t.id}
            layout
            initial={{ opacity: 0, backgroundColor: t.is_buy ? 'rgba(28,122,80,0.12)' : 'rgba(176,67,46,0.12)' }}
            animate={{ opacity: 1, backgroundColor: 'rgba(255,255,255,0)' }}
            transition={{ duration: 0.9 }}
            className="grid grid-cols-[auto_1fr_auto] items-center gap-3 px-2 py-2 rounded-lg"
          >
            {showToken ? (
              <Link href={`/token/${t.token}`} className="flex items-center gap-2 min-w-0">
                <TokenAvatar src={t.image} symbol={t.symbol ?? '?'} size={26} />
                <span className="font-medium truncate max-w-[90px]">{t.symbol}</span>
              </Link>
            ) : (
              <span className={`text-sm font-medium ${t.is_buy ? 'text-buy' : 'text-sell'}`}>{t.is_buy ? 'Buy' : 'Sell'}</span>
            )}
            <span className="text-sm text-muted truncate">
              {showToken && <span className={t.is_buy ? 'text-buy' : 'text-sell'}>{t.is_buy ? 'bought' : 'sold'} </span>}
              <span className="num text-ink">{fmtNum(t.hype, 3)} HYPE</span>
              {!compact && <span className="num"> for {fmtNum(t.tokens, 2)}</span>}
              <span className={compact ? 'hidden sm:inline' : ''}> by {shortAddr(t.trader)}</span>
            </span>
            <span className="text-xs text-muted num">{timeAgo(t.ts)}</span>
          </motion.li>
        ))}
      </AnimatePresence>
    </ul>
  );
}
