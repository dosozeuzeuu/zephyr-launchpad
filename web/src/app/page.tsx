'use client';

import Link from 'next/link';

import { Markets } from '@/components/Markets';
import { Tape } from '@/components/Tape';
import { WindField } from '@/components/WindField';
import { useTape, useTokens } from '@/lib/data';
import { fmtNum } from '@/lib/format';

import { useSite } from './providers';

export default function Explore() {
  const site = useSite();
  const { data: tokens = [], isLoading } = useTokens();
  const { data: tape = [] } = useTape();

  const volume24 = tokens.reduce((s, t) => s + t.volume_24h, 0);

  return (
    <div className="flex flex-col gap-10 pt-6">
      <section className="relative overflow-hidden rounded-[28px] border border-haze bg-[radial-gradient(120%_140%_at_0%_0%,#262D66_0%,#1B2150_40%,#131838_100%)]">
        <WindField gusts={tape.map((t) => ({ id: t.id, isBuy: t.is_buy, hype: t.hype }))} />
        <div className="relative grid lg:grid-cols-[1.25fr_1fr] gap-8 p-6 sm:p-10">
          <div className="flex flex-col justify-center min-h-[260px]">
            <h1 className="font-display font-extrabold leading-[0.95] tracking-[-0.02em] text-[44px] sm:text-[64px] max-w-[13ch]">Launch a token on Elysium in one transaction.</h1>
            <p className="mt-5 text-mist text-lg max-w-[46ch] leading-relaxed">
              You set the fee and decide who earns it: you, buybacks that burn supply, or everyone holding. Every pool trades on Uniswap.
            </p>
            <div className="mt-7 flex flex-wrap gap-3">
              <Link href="/launch" className="btn-primary h-12 px-6 text-[16px]">
                Launch a token
              </Link>
              <Link href="/bridge" className="btn-ghost h-12 px-6 text-[16px] bg-night/40">
                Bridge HYPE to Elysium
              </Link>
            </div>
            {site.deployed && (
              <p className="mt-6 text-sm text-mist num">
                {fmtNum(tokens.length, 0)} tokens launched, {fmtNum(volume24, 2)} HYPE traded in the last 24 hours
              </p>
            )}
          </div>
          <div className="rounded-2xl bg-night/55 backdrop-blur-sm border border-haze/70 p-3 self-start">
            <div className="flex items-center justify-between px-2 pb-2">
              <h2 className="font-display font-bold">Live trades</h2>
              <span className="flex items-center gap-2 text-xs text-mist">
                <span className="h-1.5 w-1.5 rounded-full bg-buy animate-pulse" /> Live
              </span>
            </div>
            <div className="max-h-[300px] overflow-hidden">
              <Tape trades={tape} compact />
            </div>
          </div>
        </div>
      </section>

      {!site.deployed && (
        <div className="panel p-5 text-mist">
          Zephyr&apos;s contracts are not live yet. Launches and trading open as soon as the deployment is finished.
        </div>
      )}

      <Markets tokens={tokens} loading={isLoading} />

      <section aria-labelledby="split" className="grid lg:grid-cols-[1fr_1.6fr] gap-6 items-start">
        <div>
          <h2 id="split" className="font-display text-3xl font-bold leading-tight">One fee, three ways to spend it.</h2>
          <p className="mt-3 text-mist leading-relaxed max-w-[44ch]">
            Each launch sets a 1–5% trading fee. 70% of it follows the split the launcher picks, fixed for good. 30% keeps Zephyr running.
          </p>
        </div>
        <div className="grid sm:grid-cols-3 gap-3">
          {[
            { t: 'To the creator', d: 'Paid in HYPE to whoever holds the token’s creator pass, claimable any time.', c: '#B7A8FF' },
            { t: 'To buybacks', d: 'Buys the token on its own pool and burns it, so the supply only falls.', c: '#FF7D9C' },
            { t: 'To holders', d: 'Shared in HYPE among holders of 0.1% or more, in proportion to what they hold.', c: '#5BE0B3' },
          ].map((x) => (
            <div key={x.t} className="panel p-5">
              <svg width="36" height="16" viewBox="0 0 36 16" aria-hidden>
                <path d="M2 10c6-6 12 4 18-2s10-4 14-2" fill="none" stroke={x.c} strokeWidth="3" strokeLinecap="round" />
              </svg>
              <h3 className="mt-3 font-display font-bold text-lg">{x.t}</h3>
              <p className="mt-1.5 text-sm text-mist leading-relaxed">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
