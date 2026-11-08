/**
 * Runs the vault's two jobs for every token: buyback-and-burn once a bucket passes the
 * threshold, and a holder-reward round (holders with at least 0.1% of supply, contracts left out)
 * at most every 10 minutes.
 */
import { type Address, type Hex, createWalletClient, http } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { ZephyrVaultAbi } from '@/artifacts';
import { elysium } from '@/lib/chain';
import type { SiteConfig } from '@/lib/config';

import { clientFor } from './indexer';
import type { Store } from './store';

const MIN_HOLDING = 10n ** 24n; // 1,000,000 tokens
const MAX_RECIPIENTS = 150;
const ROUND = 600;

export type KeeperReport = { token: string; action: string; detail: string }[];

export async function runKeeper(store: Store, cfg: SiteConfig, key: Hex): Promise<KeeperReport> {
  const report: KeeperReport = [];
  if (!cfg.deployed || !cfg.addresses.vault) return report;

  const client = clientFor(cfg);
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: elysium(cfg.rpcUrl), transport: http(cfg.rpcUrl) });
  const vault = cfg.addresses.vault as Address;

  const isKeeper = await client.readContract({ address: vault, abi: ZephyrVaultAbi, functionName: 'isKeeper', args: [account.address] });
  if (!isKeeper) return [{ token: '-', action: 'skip', detail: `${account.address} is not a keeper on the vault` }];

  const threshold = await client.readContract({ address: vault, abi: ZephyrVaultAbi, functionName: 'threshold' });
  const now = Math.floor(Date.now() / 1000);
  const tokens = await store.listTokens();

  for (const t of tokens) {
    const [buyback, holders, lastRound] = await client.readContract({ address: vault, abi: ZephyrVaultAbi, functionName: 'balances', args: [t.pool_id as Hex] });

    if (buyback >= threshold) {
      try {
        const sim = await client.simulateContract({ account, address: vault, abi: ZephyrVaultAbi, functionName: 'buyback', args: [t.address as Address, 0n] });
        const hash = await wallet.writeContract({ address: vault, abi: ZephyrVaultAbi, functionName: 'buyback', args: [t.address as Address, (sim.result * 97n) / 100n] });
        await client.waitForTransactionReceipt({ hash });
        report.push({ token: t.symbol, action: 'buyback', detail: hash });
      } catch (e) {
        report.push({ token: t.symbol, action: 'buyback failed', detail: String(e).slice(0, 200) });
      }
    }

    if (holders >= threshold && (lastRound === 0n || Number(lastRound) + ROUND <= now)) {
      try {
        const rows = (await store.holders(t.address, 1000)).filter((h) => BigInt(h.balance) >= MIN_HOLDING);
        const eligible: { holder: Address; balance: bigint }[] = [];
        for (const h of rows) {
          if (eligible.length >= MAX_RECIPIENTS) break;
          const code = await client.getCode({ address: h.holder as Address });
          if (code && code !== '0x') continue; // pools, routers and other contracts are not holders
          eligible.push({ holder: h.holder as Address, balance: BigInt(h.balance) });
        }
        if (!eligible.length) continue;
        const total = eligible.reduce((s, h) => s + h.balance, 0n);
        const amounts = eligible.map((h) => (holders * h.balance) / total);
        const hash = await wallet.writeContract({ address: vault, abi: ZephyrVaultAbi, functionName: 'distribute', args: [t.address as Address, eligible.map((h) => h.holder), amounts] });
        await client.waitForTransactionReceipt({ hash });
        report.push({ token: t.symbol, action: `paid ${eligible.length} holders`, detail: hash });
      } catch (e) {
        report.push({ token: t.symbol, action: 'holder round failed', detail: String(e).slice(0, 200) });
      }
    }
  }
  return report;
}
