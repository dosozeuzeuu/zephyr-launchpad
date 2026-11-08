'use client';

import { useSite } from '../providers';

const NAMES: Record<string, string> = {
  positionManager: 'Launch hook (Uniswap v4)',
  router: 'Trade router',
  feeEscrow: 'Fee escrow',
  vault: 'Buyback and holder vault',
  feeCalculator: 'Fee settings',
  flaunch: 'Creator pass (ERC-721)',
  poolManager: 'Uniswap v4 PoolManager',
  internalSwapPool: 'Internal swap pool',
  oracle: 'Price oracle',
  indexer: 'Pool index',
  notifier: 'Notifier',
  initialPrice: 'Opening price',
  feeExemptions: 'Fee exemptions',
  bidWall: 'Bid wall (unused)',
  actionManager: 'Treasury actions',
  flaunchLibrary: 'Launch library',
  memecoinImplementation: 'Token implementation',
  memecoinTreasuryImplementation: 'Token treasury implementation',
  flaunchFeeExemption: 'Launch fee exemption',
};

export default function Docs() {
  const site = useSite();
  const explorer = site.explorerUrl;
  return (
    <div className="pt-8 grid lg:grid-cols-[200px_1fr] gap-10">
      <nav className="hidden lg:block sticky top-24 self-start text-sm">
        <ul className="flex flex-col gap-2 text-muted">
          {[
            ['launch', 'Launching a token'],
            ['fees', 'Fees'],
            ['rewards', 'Buybacks and holder rewards'],
            ['trading', 'Trading'],
            ['network', 'Network'],
            ['contracts', 'Contracts'],
          ].map(([id, l]) => (
            <li key={id}>
              <a href={`#${id}`} className="hover:text-ink">{l}</a>
            </li>
          ))}
        </ul>
      </nav>
      <article className="max-w-[68ch] leading-relaxed [&_h2]:font-display [&_h2]:text-2xl [&_h2]:font-bold [&_h2]:mt-12 [&_h2]:mb-3 [&_h2]:scroll-mt-24 [&_p]:text-muted [&_p]:mb-3 [&_li]:text-muted [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1.5">
        <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">How Zephyr works</h1>
        <p className="mt-4 text-lg">
          Zephyr launches tokens straight into Uniswap v4 pools on Elysium. A hook on each pool takes the fee and sends it where the launcher chose.
        </p>

        <h2 id="launch">Launching a token</h2>
        <p>One transaction creates the token, its pool and its fee routing. Every token has a supply of 1,000,000,000, and all of it goes into the pool: nothing is held back for the team.</p>
        <ul>
          <li>The pool opens at a 40 HYPE market cap and prices like a constant-product pool: about 40 HYPE buys half the supply.</li>
          <li>The launcher picks a swap fee from 1% to 5%. It is fixed for the life of the pool.</li>
          <li>Anti-snipe is optional: buys start at a higher fee (up to 30%) that falls to the swap fee over up to 15 minutes.</li>
          <li>Trading can be scheduled to open up to 30 days after the launch.</li>
          <li>The dev buy is the launcher&apos;s own first purchase, made in the launch transaction at the opening price.</li>
          <li>The launcher receives a creator pass (an NFT). Whoever holds it receives the creator share of the fees.</li>
        </ul>

        <h2 id="fees">Fees</h2>
        <p>Every trade pays the pool&apos;s fee. 30% goes to the protocol. The other 70% follows the split the launcher set, which can never be changed:</p>
        <ul>
          <li>Creator: paid in HYPE to the creator pass holder, claimable on the fees page.</li>
          <li>Buyback and burn: buys the token on its own pool and burns it.</li>
          <li>Holders: paid in HYPE to the token&apos;s holders.</li>
        </ul>
        <p>Fees taken in the token on a buy are sold back to the next buyers before their trade reaches the pool, turning them into HYPE without pushing the price.</p>

        <h2 id="rewards">Buybacks and holder rewards</h2>
        <p>The buyback and holder shares wait in the vault until a pool has collected at least 0.01 HYPE. The vault can spend them on exactly two things: buying the token and burning all of it, or paying its holders. Nobody, including the protocol, can withdraw them.</p>
        <p>Holder rewards run in rounds, at most one every 10 minutes per pool. A wallet needs at least 1,000,000 tokens (0.1% of supply) to be paid, in proportion to what it holds. Pools, routers and other contracts are left out. If a payment can&apos;t be delivered, it is credited on the fees page instead.</p>

        <h2 id="trading">Trading</h2>
        <p>Each token page quotes your trade by running it against the live pool, then sends it with your slippage limit and a 10 minute deadline. Selling a token the first time needs one approval.</p>

        <h2 id="network">Network</h2>
        <ul>
          <li>Network: Elysium (chain id 99901)</li>
          <li>Currency: HYPE</li>
          <li>RPC: {site.rpcUrl}</li>
          <li>Explorer: {site.explorerUrl}</li>
        </ul>

        <h2 id="contracts">Contracts</h2>
        {site.deployed ? (
          <ul className="!list-none !pl-0">
            {Object.entries(site.addresses).map(([k, v]) => (
              <li key={k} className="flex flex-col sm:flex-row sm:justify-between gap-0.5 py-1.5 border-b border-line/60">
                <span className="text-ink">{NAMES[k] ?? k}</span>
                <a href={`${explorer}/address/${v}`} target="_blank" rel="noreferrer" className="num text-sm text-laurel break-all hover:underline">
                  {v}
                </a>
              </li>
            ))}
          </ul>
        ) : (
          <p>Contract addresses appear here once the deployment is live.</p>
        )}
        <p className="mt-6 text-sm">Zephyr&apos;s launch contracts are adapted from the MIT-licensed Flaunch protocol. They have not been independently audited.</p>
      </article>
    </div>
  );
}
