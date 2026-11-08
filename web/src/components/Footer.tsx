import Link from 'next/link';

import { Logo } from './Logo';

export function Footer() {
  return (
    <footer className="border-t border-haze/60 mt-10">
      <div className="mx-auto max-w-[1240px] px-4 sm:px-6 py-10 grid gap-8 sm:grid-cols-[1.4fr_1fr_1fr]">
        <div className="max-w-sm">
          <Logo />
          <p className="mt-3 text-mist text-sm leading-relaxed">
            Launch a token on Elysium in one transaction. Tokens are created by their launchers, not by Zephyr, and trading them carries risk.
          </p>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-mist">Trade</p>
          <Link href="/" className="hover:text-lilac">Explore tokens</Link>
          <Link href="/launch" className="hover:text-lilac">Launch a token</Link>
          <Link href="/bridge" className="hover:text-lilac">Bridge HYPE</Link>
        </div>
        <div className="flex flex-col gap-2 text-sm">
          <p className="text-mist">Learn</p>
          <Link href="/docs" className="hover:text-lilac">How a launch works</Link>
          <Link href="/docs#fees" className="hover:text-lilac">Fees and splits</Link>
          <Link href="/docs#contracts" className="hover:text-lilac">Contracts</Link>
        </div>
      </div>
    </footer>
  );
}
