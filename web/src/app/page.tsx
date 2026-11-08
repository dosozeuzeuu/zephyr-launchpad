'use client';

import Link from 'next/link';

import { Frieze } from '@/components/Frieze';
import { Markets } from '@/components/Markets';
import { CityTemple, Meander, RoadIcon } from '@/components/Ornaments';
import { useTape, useTokens } from '@/lib/data';
import { fmtNum } from '@/lib/format';

import { useSite } from './providers';

export default function Explore() {
  const site = useSite();
  const { data: tokens = [], isLoading } = useTokens();
  const { data: tape = [] } = useTape();
  const volume24 = tokens.reduce((s, t) => s + t.volume_24h, 0);

  return (
    <div className="flex flex-col">
      <section className="relative grid lg:grid-cols-[1.05fr_1fr] gap-6 lg:gap-10 items-center pt-10 sm:pt-14 pb-10">
        <div>
          <p className="text-bronze font-display text-lg">The agora of Elysium</p>
          <h1 className="mt-3 font-display text-[44px] leading-[1.02] sm:text-[68px] text-laurel max-w-[14ch]">Launch a token in one transaction.</h1>
          <p className="mt-6 text-muted text-lg leading-relaxed max-w-[44ch]">
            Set its fee and choose who earns it: you, buybacks that burn supply, or everyone who holds it. Every pool trades on Uniswap.
          </p>
          <div className="mt-8 flex flex-wrap gap-3">
            <Link href="/launch" className="btn-primary h-12 px-7 text-[16px]">
              Launch a token
            </Link>
            <Link href="/bridge" className="btn-ghost h-12 px-7 text-[16px]">
              Bridge HYPE to Elysium
            </Link>
          </div>
          {site.deployed && (
            <dl className="mt-10 flex gap-10">
              <div>
                <dt className="text-sm text-muted">Tokens launched</dt>
                <dd className="mt-1 text-3xl font-medium text-laurel num">{fmtNum(tokens.length, 0)}</dd>
              </div>
              <div>
                <dt className="text-sm text-muted">Traded today</dt>
                <dd className="mt-1 text-3xl font-medium text-laurel num">{fmtNum(volume24, 1)} HYPE</dd>
              </div>
            </dl>
          )}
        </div>
        <CityTemple className="w-full h-auto max-w-[620px] justify-self-center" />
      </section>

      <div className="relative left-1/2 -translate-x-1/2 w-screen">
        <Frieze trades={tape} />
      </div>

      {!site.deployed && (
        <div className="panel mt-8 p-5 text-muted border-bronze/40 bg-[#FBF8F1]">
          Zephyr&apos;s contracts open on Elysium very soon. Launches and trading start the moment they are live.
        </div>
      )}

      <div className="mt-12">
        <Markets tokens={tokens} loading={isLoading} />
      </div>

      <section aria-labelledby="split" className="mt-20">
        <div className="text-center max-w-[52ch] mx-auto">
          <h2 id="split" className="font-display text-4xl text-laurel">One fee, three roads.</h2>
          <p className="mt-3 text-muted leading-relaxed">
            Each launch sets a fee from 1% to 5%. 70% of it follows the split the launcher picks, fixed for good. The other 30% keeps Zephyr running.
          </p>
        </div>
        <Meander className="mt-8 opacity-30" height={12} />
        <div className="grid sm:grid-cols-3 border-x border-b border-line bg-card">
          {[
            { k: 'creator' as const, t: 'To the creator', d: 'Paid in HYPE to whoever holds the token’s creator pass, claimable any time.' },
            { k: 'buyback' as const, t: 'To buybacks', d: 'Buys the token on its own pool and burns it, so the supply only falls.' },
            { k: 'holders' as const, t: 'To the holders', d: 'Shared in HYPE among holders of 0.1% or more, in proportion to what they hold.' },
          ].map((x, i) => (
            <div key={x.t} className={`p-7 text-center ${i > 0 ? 'border-t sm:border-t-0 sm:border-l border-line' : ''}`}>
              <div className="flex justify-center">
                <RoadIcon kind={x.k} />
              </div>
              <h3 className="mt-3 font-display text-2xl text-laurel">{x.t}</h3>
              <p className="mt-2 text-muted leading-relaxed max-w-[30ch] mx-auto">{x.d}</p>
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
