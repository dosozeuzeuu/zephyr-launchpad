'use client';

import { motion, useReducedMotion } from 'framer-motion';
import Link from 'next/link';

import { mcap } from '@/lib/data';
import { fmtNum } from '@/lib/format';
import type { TokenStats } from '@/lib/server/store';

import { TokenAvatar } from './TokenAvatar';

const MAX_H = 230;
const MIN_H = 70;

function Column({ height, delay }: { height: number; delay: number }) {
  const reduce = useReducedMotion();
  const flutes = 5;
  return (
    <motion.div
      style={{ originY: 1 }}
      initial={reduce ? false : { scaleY: 0, opacity: 0 }}
      whileInView={{ scaleY: 1, opacity: 1 }}
      viewport={{ once: true, margin: '-40px' }}
      transition={{ duration: 0.9, delay, ease: [0.2, 0.7, 0.2, 1] }}
    >
    <svg width="64" height={height} viewBox={`0 0 64 ${height}`} className="block" aria-hidden>
      <rect x="2" y="0" width="60" height="10" fill="#fff" stroke="#123F2F" strokeWidth="1.3" />
      <path d={`M6 10 h52 l-4 8 h-44 z`} fill="#fff" stroke="#123F2F" strokeWidth="1.3" />
      <rect x="12" y="18" width="40" height={Math.max(0, height - 32)} fill="#fff" stroke="#123F2F" strokeWidth="1.3" />
      {Array.from({ length: flutes }).map((_, i) => (
        <line key={i} x1={18 + i * 7} y1="22" x2={18 + i * 7} y2={height - 18} stroke="#123F2F" strokeOpacity="0.28" />
      ))}
      <rect x="6" y={height - 14} width="52" height="7" fill="#fff" stroke="#123F2F" strokeWidth="1.3" />
      <rect x="2" y={height - 7} width="60" height="7" fill="#fff" stroke="#123F2F" strokeWidth="1.3" />
    </svg>
    </motion.div>
  );
}

/** The five largest tokens by market cap, as columns of a temple. */
export function Pantheon({ tokens }: { tokens: TokenStats[] }) {
  const top = [...tokens].sort((a, b) => b.price - a.price).slice(0, 5);
  const caps = top.map((t) => mcap(t.price));
  const hi = Math.max(...caps, 0);
  const lo = Math.min(...caps, hi);
  const heightOf = (c: number) => (hi === lo ? MAX_H : MIN_H + ((c - lo) / (hi - lo)) * (MAX_H - MIN_H));

  // Order like a pediment: tallest in the middle
  const order = [3, 1, 0, 2, 4].filter((i) => i < Math.max(top.length, 5));

  return (
    <section aria-labelledby="pantheon" className="mt-20">
      <div className="flex flex-col sm:flex-row sm:items-end gap-3 justify-between">
        <div>
          <h2 id="pantheon" className="font-display text-4xl text-laurel">The Pantheon</h2>
          <p className="mt-2 text-muted max-w-[52ch]">The five largest tokens on Zephyr. Each column stands as tall as its market cap.</p>
        </div>
        <Link href="/launch" className="btn-ghost self-start sm:self-auto">
          Launch a contender
        </Link>
      </div>

      <div className="panel mt-6 px-4 pt-10 pb-0 overflow-hidden bg-[linear-gradient(180deg,#fff_0%,#F4F6F1_100%)]">
        <div className="flex items-end justify-center gap-3 sm:gap-10 min-h-[340px]">
          {order.map((idx, i) => {
            const t = top[idx];
            if (!t)
              return (
                <Link key={`empty-${idx}`} href="/launch" className="flex flex-col items-center gap-2 group w-[64px] sm:w-[110px]">
                  <span className="h-10 w-10 rounded-full border border-dashed border-laurel/40 grid place-items-center text-laurel/50 group-hover:border-laurel group-hover:text-laurel">+</span>
                  <Column height={MIN_H - 10} delay={i * 0.08} />
                  <span className="text-xs text-muted pb-3 text-center">Open plinth</span>
                </Link>
              );
            return (
              <Link key={t.address} href={`/token/${t.address}`} className="flex flex-col items-center gap-2 group w-[64px] sm:w-[110px]">
                <span className="text-xs text-bronze font-display text-[15px]">{idx === 0 ? 'I' : idx === 1 ? 'II' : idx === 2 ? 'III' : idx === 3 ? 'IV' : 'V'}</span>
                <span className="transition-transform group-hover:-translate-y-1">
                  <TokenAvatar src={t.image} symbol={t.symbol} size={idx === 0 ? 48 : 40} />
                </span>
                <Column height={heightOf(caps[idx])} delay={i * 0.08} />
                <span className="pb-3 text-center">
                  <span className="block font-medium text-sm truncate max-w-[64px] sm:max-w-[110px]">{t.symbol}</span>
                  <span className="block text-xs text-muted num">{fmtNum(caps[idx], 1)} HYPE</span>
                </span>
              </Link>
            );
          })}
        </div>
        <div className="h-3 -mx-4 bg-laurel" />
      </div>
    </section>
  );
}
