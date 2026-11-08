import Link from 'next/link';

import { Meander } from './Ornaments';

export function Footer() {
  return (
    <footer className="mt-24 bg-laurel text-paper">
      <Meander color="#F7F7F3" height={12} className="opacity-40" />
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-12 grid gap-10 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <p className="font-display text-3xl">Zephyr</p>
          <p className="mt-3 text-paper/70 text-sm leading-relaxed">
            Launch a token on Elysium in one transaction. Tokens are created by their launchers, not by Zephyr, and trading them carries risk.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-display text-lg text-paper/60">Trade</p>
          <Link href="/" className="hover:underline">Explore tokens</Link>
          <Link href="/launch" className="hover:underline">Launch a token</Link>
          <Link href="/bridge" className="hover:underline">Bridge HYPE</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="font-display text-lg text-paper/60">Learn</p>
          <Link href="/docs" className="hover:underline">How a launch works</Link>
          <Link href="/docs#fees" className="hover:underline">Fees and splits</Link>
          <Link href="/docs#contracts" className="hover:underline">Contracts</Link>
        </div>
      </div>
    </footer>
  );
}
