/**
 * Catches the database up with the chain: new launches, every trade (with price), buybacks and
 * holder balances. Safe to call often; a lease keeps runs from overlapping.
 */
import { type Address, type Hex, type Log, type PublicClient, createPublicClient, decodeEventLog, getAbiItem, http, parseAbiItem } from 'viem';

import { MemecoinAbi, PositionManagerAbi, ZephyrFeeCalculatorAbi, ZephyrVaultAbi } from '@/artifacts';
import { elysium } from '@/lib/chain';
import type { SiteConfig } from '@/lib/config';

import type { BalanceDelta, Store, TokenRow, TradeRow } from './store';

const TRANSFER = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');
const ZERO = '0x0000000000000000000000000000000000000000';
const Q96 = 2 ** 96;

export function clientFor(cfg: SiteConfig): PublicClient {
  return createPublicClient({ chain: elysium(cfg.rpcUrl), transport: http(cfg.rpcUrl, { batch: true, retryCount: 2 }) }) as PublicClient;
}

/** HYPE per token from a pool's sqrtPriceX96 */
export function priceFromSqrt(sqrtPriceX96: bigint, nativeIsZero: boolean): number {
  const r = Number(sqrtPriceX96) / Q96;
  const p = r * r; // currency1 per currency0
  return nativeIsZero ? 1 / p : p;
}

type Meta = { image?: string; description?: string; website?: string; twitter?: string; telegram?: string };

async function fetchMeta(uri: string): Promise<Meta> {
  if (!/^https:\/\//.test(uri)) return {};
  try {
    const res = await fetch(uri, { signal: AbortSignal.timeout(4000) });
    if (!res.ok) return {};
    const j = await res.json();
    const s = (v: unknown, max = 500) => (typeof v === 'string' ? v.slice(0, max) : undefined);
    return { image: s(j.image), description: s(j.description, 2000), website: s(j.website), twitter: s(j.twitter), telegram: s(j.telegram) };
  } catch {
    return {};
  }
}

async function getLogsAdaptive(client: PublicClient, params: { address: Address | Address[]; fromBlock: bigint; toBlock: bigint; events?: unknown[] }): Promise<Log[]> {
  try {
    return (await client.getLogs({ address: params.address, fromBlock: params.fromBlock, toBlock: params.toBlock, events: params.events as never })) as Log[];
  } catch (e) {
    if (params.toBlock - params.fromBlock < 10n) throw e;
    const mid = (params.fromBlock + params.toBlock) / 2n;
    const a = await getLogsAdaptive(client, { ...params, toBlock: mid });
    const b = await getLogsAdaptive(client, { ...params, fromBlock: mid + 1n });
    return [...a, ...b];
  }
}

export type SyncResult = { from: number; to: number; head: number; launches: number; trades: number; caughtUp: boolean };

export async function sync(store: Store, cfg: SiteConfig, opts: { budgetMs?: number; chunk?: number; client?: PublicClient } = {}): Promise<SyncResult | null> {
  if (!cfg.deployed || !cfg.addresses.positionManager) return null;
  if (!(await store.acquireLock(30_000))) return null;

  const client = opts.client ?? clientFor(cfg);
  const pm = cfg.addresses.positionManager.toLowerCase() as Address;
  const calc = cfg.addresses.feeCalculator!.toLowerCase() as Address;
  const vault = cfg.addresses.vault!.toLowerCase() as Address;
  const budget = Date.now() + (opts.budgetMs ?? 8000);
  const chunk = BigInt(opts.chunk ?? 50_000);

  let launches = 0;
  let tradeCount = 0;
  const startCursor = await store.getCursor();
  let cursor = BigInt(Math.max(startCursor, cfg.startBlock - 1));
  const head = await client.getBlockNumber();

  try {
    // poolId -> token, loaded lazily from the db
    const known = await store.listTokens();
    const byPool = new Map<string, { address: string; nativeIsZero: boolean }>();
    for (const t of known) byPool.set(t.pool_id.toLowerCase(), { address: t.address, nativeIsZero: t.native_is_zero });

    while (cursor < head && Date.now() < budget) {
      const from = cursor + 1n;
      const to = from + chunk - 1n < head ? from + chunk - 1n : head;

      const events = [
        getAbiItem({ abi: PositionManagerAbi, name: 'PoolCreated' }),
        getAbiItem({ abi: PositionManagerAbi, name: 'PoolSwap' }),
        getAbiItem({ abi: PositionManagerAbi, name: 'PoolStateUpdated' }),
        getAbiItem({ abi: ZephyrFeeCalculatorAbi, name: 'PoolConfigured' }),
        getAbiItem({ abi: ZephyrVaultAbi, name: 'BuybackExecuted' }),
      ];
      const logs = await getLogsAdaptive(client, { address: [pm, calc, vault], fromBlock: from, toBlock: to, events });
      logs.sort((a, b) => Number(a.blockNumber! - b.blockNumber!) || a.logIndex! - b.logIndex!);

      // Block timestamps for every block with activity
      const blocks = [...new Set(logs.map((l) => l.blockNumber!))];
      const ts = new Map<bigint, number>();
      await Promise.all(blocks.map(async (bn) => ts.set(bn, Number((await client.getBlock({ blockNumber: bn })).timestamp))));

      const newTokens: TokenRow[] = [];
      const configs = new Map<string, { swapFee: number; snipeFee: number; snipeDuration: number; startsAt: number; holderShare: number }>();
      const swaps: { log: Log; args: Record<string, bigint | Hex> }[] = [];
      const lastSqrt = new Map<string, bigint>(); // `${tx}:${poolId}` -> sqrt after the latest swap in that tx
      const burns: { token: string; amount: bigint }[] = [];

      for (const log of logs) {
        const addr = log.address.toLowerCase();
        const abi = addr === pm ? PositionManagerAbi : addr === calc ? ZephyrFeeCalculatorAbi : ZephyrVaultAbi;
        let ev;
        try {
          ev = decodeEventLog({ abi, data: log.data, topics: log.topics }) as { eventName: string; args: Record<string, unknown> };
        } catch {
          continue;
        }
        const a = ev.args;
        if (ev.eventName === 'PoolConfigured') {
          configs.set(String(a._poolId).toLowerCase(), {
            swapFee: Number(a._swapFee),
            snipeFee: Number(a._snipeFee),
            snipeDuration: Number(a._snipeDuration),
            startsAt: Number(a._startsAt),
            holderShare: Number(a._holderShare),
          });
        } else if (ev.eventName === 'PoolCreated') {
          const p = a._params as { name: string; symbol: string; tokenUri: string; creator: string; creatorFeeAllocation: number; flaunchAt: bigint };
          const poolId = String(a._poolId).toLowerCase();
          const address = String(a._memecoin).toLowerCase();
          const nativeIsZero = !a._currencyFlipped;
          byPool.set(poolId, { address, nativeIsZero });
          newTokens.push({
            address,
            pool_id: poolId,
            token_id: Number(a._tokenId),
            creator: p.creator.toLowerCase(),
            name: p.name.slice(0, 64),
            symbol: p.symbol.slice(0, 16),
            token_uri: p.tokenUri,
            image: null,
            description: null,
            website: null,
            twitter: null,
            telegram: null,
            swap_fee: 0,
            snipe_fee: 0,
            snipe_duration: 0,
            starts_at: Math.max(Number(p.flaunchAt), ts.get(log.blockNumber!) ?? 0),
            creator_share: Number(p.creatorFeeAllocation),
            holder_share: 0,
            native_is_zero: nativeIsZero,
            created_block: Number(log.blockNumber),
            created_at: ts.get(log.blockNumber!) ?? 0,
            price: 0,
            volume: 0,
            trades: 0,
            last_trade_at: 0,
            burned: '0',
          });
        } else if (ev.eventName === 'PoolSwap') {
          swaps.push({ log, args: a as Record<string, bigint | Hex> });
        } else if (ev.eventName === 'PoolStateUpdated') {
          lastSqrt.set(`${log.transactionHash}:${String(a._poolId).toLowerCase()}`, a._sqrtPriceX96 as bigint);
        } else if (ev.eventName === 'BuybackExecuted') {
          burns.push({ token: String(a._token).toLowerCase(), amount: a._tokensBurned as bigint });
        }
      }

      // Launches, with fee config and metadata
      for (const t of newTokens) {
        const c = configs.get(t.pool_id);
        if (c) Object.assign(t, { swap_fee: c.swapFee, snipe_fee: c.snipeFee, snipe_duration: c.snipeDuration, starts_at: c.startsAt, holder_share: c.holderShare });
        const m = await fetchMeta(t.token_uri);
        Object.assign(t, { image: m.image ?? null, description: m.description ?? null, website: m.website ?? null, twitter: m.twitter ?? null, telegram: m.telegram ?? null });
        const initial = lastSqrt.get(`${(logs.find((l) => l.blockNumber === BigInt(t.created_block))?.transactionHash) ?? ''}:${t.pool_id}`);
        if (initial) t.price = priceFromSqrt(initial, t.native_is_zero);
      }
      await store.upsertTokens(newTokens);
      launches += newTokens.length;

      // Trades: net amounts to the trader across the internal fill and the Uniswap swap
      const txFrom = new Map<string, string>();
      await Promise.all(
        [...new Set(swaps.map((s) => s.log.transactionHash!))].map(async (h) => txFrom.set(h, (await client.getTransaction({ hash: h })).from.toLowerCase())),
      );
      const trades: TradeRow[] = [];
      for (const { log, args } of swaps) {
        const poolId = String(args.poolId).toLowerCase();
        const tok = byPool.get(poolId);
        if (!tok) continue;
        const n0 = (args.ispAmount0 as bigint) + (args.ispFee0 as bigint) + (args.uniAmount0 as bigint) + (args.uniFee0 as bigint);
        const n1 = (args.ispAmount1 as bigint) + (args.ispFee1 as bigint) + (args.uniAmount1 as bigint) + (args.uniFee1 as bigint);
        const native = tok.nativeIsZero ? n0 : n1;
        const tokens = tok.nativeIsZero ? n1 : n0;
        if (native === 0n && tokens === 0n) continue;
        const hype = Math.abs(Number(native)) / 1e18;
        const amount = Math.abs(Number(tokens)) / 1e18;
        const sqrt = lastSqrt.get(`${log.transactionHash}:${poolId}`);
        trades.push({
          id: `${log.transactionHash}:${log.logIndex}`,
          token: tok.address,
          block: Number(log.blockNumber),
          ts: ts.get(log.blockNumber!) ?? 0,
          tx: log.transactionHash!,
          trader: txFrom.get(log.transactionHash!) ?? ZERO,
          is_buy: native < 0n,
          hype,
          tokens: amount,
          price: sqrt ? priceFromSqrt(sqrt, tok.nativeIsZero) : amount > 0 ? hype / amount : 0,
        });
      }
      await store.insertTrades(trades);
      tradeCount += trades.length;

      for (const b of burns) {
        const t = await store.getToken(b.token);
        if (t) await store.updateToken(b.token, { burned: (BigInt(t.burned || '0') + b.amount).toString() });
      }

      // Holder balances from every launched token's transfers
      const addrs = (await store.tokenAddresses()) as Address[];
      for (let i = 0; i < addrs.length; i += 200) {
        const tlogs = await getLogsAdaptive(client, { address: addrs.slice(i, i + 200), fromBlock: from, toBlock: to, events: [TRANSFER] });
        const deltas: BalanceDelta[] = [];
        for (const l of tlogs) {
          const { args } = decodeEventLog({ abi: MemecoinAbi, data: l.data, topics: l.topics, eventName: 'Transfer' }) as { args: { from: string; to: string; value: bigint } };
          const token = l.address.toLowerCase();
          if (args.from !== ZERO) deltas.push({ token, holder: args.from.toLowerCase(), delta: (-args.value).toString() });
          if (args.to !== ZERO) deltas.push({ token, holder: args.to.toLowerCase(), delta: args.value.toString() });
        }
        await store.applyBalances(deltas);
      }

      cursor = to;
      await store.setCursor(Number(cursor));
    }
  } finally {
    await store.releaseLock();
  }

  return { from: startCursor, to: Number(cursor), head: Number(head), launches, trades: tradeCount, caughtUp: cursor >= head };
}
