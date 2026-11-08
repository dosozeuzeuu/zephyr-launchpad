'use client';

import Link from 'next/link';

import type { TapeTrade } from '@/lib/data';
import { fmtNum } from '@/lib/format';

import { Meander } from './Ornaments';
import { TokenAvatar } from './TokenAvatar';

/** Live trades scrolling along a carved band, between two Greek-key borders. */
export function Frieze({ trades }: { trades: TapeTrade[] }) {
  const items = trades.slice(0, 24);
  return (
    <section aria-label="Live trades" className="bg-laurel text-paper">
      <Meander color="#F7F7F3" height={12} className="opacity-40" />
      <div className="relative overflow-hidden py-3">
        {items.length === 0 ? (
          <p className="text-center text-paper/70 text-sm py-1">Waiting for the first trade.</p>
        ) : (
          <div className="frieze-track flex w-max gap-10">
            {[...items, ...items].map((t, i) => (
              <Link key={`${t.id}-${i}`} href={`/token/${t.token}`} className="flex items-center gap-2.5 whitespace-nowrap text-[15px] hover:text-white">
                <span className="rounded-full ring-1 ring-paper/70"><TokenAvatar src={t.image} symbol={t.symbol ?? '?'} size={22} /></span>
                <span className="font-medium">{t.symbol}</span>
                <span className={t.is_buy ? 'text-[#9BE0BC]' : 'text-[#F2B3A4]'}>{t.is_buy ? 'bought' : 'sold'}</span>
                <span className="num text-paper/85">{fmtNum(t.hype, 3)} HYPE</span>
                <span className="text-paper/30" aria-hidden>
                  ✦
                </span>
              </Link>
            ))}
          </div>
        )}
      </div>
      <Meander color="#F7F7F3" height={12} className="opacity-40 rotate-180" />
    </section>
  );
}
