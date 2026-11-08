'use client';

import { useSite } from '../providers';

export default function Bridge() {
  const site = useSite();
  return (
    <div className="pt-8 max-w-2xl">
      <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">Bridge HYPE to Elysium</h1>
      <p className="mt-3 text-muted leading-relaxed">
        Elysium uses HYPE for gas and for trading on Zephyr. Move HYPE from HyperEVM with the official Elysium bridge, then come back to trade or launch.
      </p>
      <ol className="mt-8 flex flex-col gap-3">
        {[
          'Open the official bridge and connect the same wallet you use here.',
          'Choose HyperEVM as the source and Elysium as the destination, then enter how much HYPE to move.',
          'Confirm in your wallet. When the HYPE arrives, your balance shows at the top of this site.',
        ].map((s, i) => (
          <li key={s} className="panel p-4 flex gap-4">
            <span className="font-display font-bold text-laurel">{i + 1}</span>
            <span>{s}</span>
          </li>
        ))}
      </ol>
      <a href={site.bridgeUrl} target="_blank" rel="noreferrer" className="btn-primary h-12 px-7 mt-8">
        Open the official bridge
      </a>
      <p className="mt-4 text-sm text-muted">Only bridge through the link Elysium itself publishes. Zephyr never asks you to send funds to an address.</p>
    </div>
  );
}
