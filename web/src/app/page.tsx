'use client';

import Link from 'next/link';

import { Frieze } from '@/components/Frieze';
import { Markets } from '@/components/Markets';
import { OrbitalCity } from '@/components/OrbitalCity';
import { Meander, RoadIcon } from '@/components/Ornaments';
import { Pantheon } from '@/components/Pantheon';
import { useTape, useTokens } from '@/lib/data';
import { fmtNum } from '@/lib/format';

import { useSite } from './providers';

const STEPS = [
  { t: 'Launch', d: 'Name it, pick a 1–5% fee and decide who earns it. One signature creates the token and its Uniswap pool at a 40 HYPE market cap.' },
  { t: 'Trade', d: 'Anyone can buy and sell from the token’s page with plain HYPE. Every trade pays the fee you set.' },
  { t: 'Earn', d: 'Fees flow on every trade: to you in HYPE, into buybacks that burn supply, or out to holders every ten minutes.' },
];

export default function Explore() {
  const site = useSite();
  const { data: tokens = [], isLoading } = useTokens();
  const { data: tape = [] } = useTape();
  const volume24 = tokens.reduce((s, t) => s + t.volume_24h, 0);
  const orbiting = [...tokens].sort((a, b) => b.volume_24h - a.volume_24h || b.price - a.price);

  return (
    <div className="flex flex-col">
      <section className="relative mt-6 overflow-hidden rounded-[22px] bg-[radial-gradient(120%_90%_at_70%_20%,#1B4D3A_0%,#123F2F_45%,#0B2419_100%)] text-paper">
        <Meander color="#F7F7F3" height={12} className="opacity-25" />
        <div className="grid lg:grid-cols-[1fr_1.1fr] items-center gap-4 px-6 sm:px-10 pt-8 lg:pt-4 pb-6">
          <div className="lg:py-16">
            <p className="font-display text-lg text-[#C9A25E]">The orbital agora of Elysium</p>
            <h1 className="mt-3 font-display text-[42px] leading-[1.03] sm:text-[64px] max-w-[13ch]">Launch a token in one transaction.</h1>
            <p className="mt-6 text-paper/75 text-lg leading-relaxed max-w-[44ch]">
              Set its fee and choose who earns it: you, buybacks that burn supply, or everyone who holds it. Every pool trades on Uniswap.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <Link href="/launch" className="btn h-12 px-7 text-[16px] bg-paper text-laurel hover:bg-white">
                Launch a token
              </Link>
              <Link href="/bridge" className="btn h-12 px-7 text-[16px] border border-paper/30 text-paper hover:bg-paper/10">
                Bridge HYPE to Elysium
              </Link>
            </div>
            {site.deployed && (
              <dl className="mt-10 flex gap-10">
                <div>
                  <dt className="text-sm text-paper/60">Tokens in orbit</dt>
                  <dd className="mt-1 text-3xl font-medium num">{fmtNum(tokens.length, 0)}</dd>
                </div>
                <div>
                  <dt className="text-sm text-paper/60">Traded today</dt>
                  <dd className="mt-1 text-3xl font-medium num">{fmtNum(volume24, 1)} HYPE</dd>
                </div>
              </dl>
            )}
          </div>
          <div className="-mx-4 sm:mx-0">
            <OrbitalCity tokens={orbiting} />
            {orbiting.length > 0 && <p className="text-center text-sm text-paper/50 -mt-2">The most traded tokens orbit the city. Tap one to open it.</p>}
          </div>
        </div>
      </section>

      <div className="relative left-1/2 -translate-x-1/2 w-screen mt-10">
        <Frieze trades={tape} />
      </div>

      {!site.deployed && (
        <div className="panel mt-8 p-5 text-muted border-bronze/40 bg-[#FBF8F1]">
          Zephyr&apos;s contracts open on Elysium very soon. Launches and trading start the moment they are live.
        </div>
      )}

      <section aria-labelledby="how" className="mt-16">
        <h2 id="how" className="font-display text-4xl text-laurel">From launch to orbit</h2>
        <ol className="mt-8 grid md:grid-cols-3 gap-4 relative">
          <svg className="hidden md:block absolute left-[16%] right-[16%] top-[30px] w-[68%] h-6 pointer-events-none" viewBox="0 0 600 24" preserveAspectRatio="none" aria-hidden>
            <path d="M0 12 C 150 -6, 450 30, 600 12" fill="none" stroke="#A9824A" strokeOpacity="0.6" strokeDasharray="3 6" />
          </svg>
          {STEPS.map((s, i) => (
            <li key={s.t} className="panel p-6 relative bg-card">
              <span className="relative z-10 grid place-items-center h-[60px] w-[60px] rounded-full border border-laurel/20 bg-paper">
                <svg width="44" height="44" viewBox="0 0 44 44" aria-hidden>
                  <circle cx="22" cy="22" r={5 + i * 2} fill="#123F2F" />
                  <ellipse cx="22" cy="22" rx="18" ry={6 + i * 2} fill="none" stroke="#A9824A" strokeWidth="1.3" transform={`rotate(${-20 + i * 20} 22 22)`} />
                  <circle cx={22 + 18 * Math.cos(0.6 + i)} cy={22 + (6 + i * 2) * Math.sin(0.6 + i)} r="2.6" fill="#A9824A" transform={`rotate(${-20 + i * 20} 22 22)`} />
                </svg>
              </span>
              <h3 className="mt-4 font-display text-2xl text-laurel">
                <span className="text-bronze mr-2">{['I', 'II', 'III'][i]}.</span>
                {s.t}
              </h3>
              <p className="mt-2 text-muted leading-relaxed">{s.d}</p>
            </li>
          ))}
        </ol>
      </section>

      <div className="mt-16">
        <Markets tokens={tokens} loading={isLoading} />
      </div>

      <Pantheon tokens={tokens} />

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

      <section className="mt-20 relative overflow-hidden rounded-[22px] bg-laurel text-paper px-6 sm:px-12 py-14 text-center">
        <svg className="absolute inset-0 w-full h-full opacity-30" viewBox="0 0 800 260" preserveAspectRatio="xMidYMid slice" aria-hidden>
          <ellipse cx="400" cy="300" rx="520" ry="150" fill="none" stroke="#C9A25E" />
          <ellipse cx="400" cy="300" rx="420" ry="110" fill="none" stroke="#F7F7F3" strokeDasharray="2 6" />
          {Array.from({ length: 40 }).map((_, i) => (
            <circle key={i} cx={(i * 197) % 800} cy={(i * 83) % 200} r={i % 7 === 0 ? 1.4 : 0.8} fill="#F7F7F3" />
          ))}
        </svg>
        <div className="relative">
          <h2 className="font-display text-4xl sm:text-5xl">Your token, in orbit by tonight.</h2>
          <p className="mt-3 text-paper/75 max-w-[46ch] mx-auto">No launch fee beyond gas. The whole supply goes into the pool, and the split you pick is set in stone.</p>
          <Link href="/launch" className="btn mt-7 h-12 px-8 text-[16px] bg-paper text-laurel hover:bg-white">
            Launch a token
          </Link>
        </div>
      </section>
    </div>
  );
}
