import { getContractAddress } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';

import { buildDeployPlan } from '@/lib/deploy/plan';
import { DEFAULT_CONFIG } from '@/lib/config';
import { sync } from '@/lib/server/indexer';
import { MemoryStore } from '@/lib/server/store';

const admin = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const keeper = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const poolManager = getContractAddress({ from: admin.address, nonce: 0n });
const deployer = getContractAddress({ from: admin.address, nonce: 2n });
const { addresses } = buildDeployPlan({ deployer, admin: admin.address, poolManager, whype: '0xbA876237B0F021A6c6D852d6c26E107997cC5E81', protocolFeeRecipient: '0x43Dec03eb1c62063d75c37204B1ad0bbd8C80A0B', keeper: keeper.address });

const store = new MemoryStore();
const cfg = { ...DEFAULT_CONFIG, deployed: true, rpcUrl: 'http://127.0.0.1:8546', startBlock: 0, addresses };
const r = await sync(store, cfg, { chunk: 7 });
console.log('sync', r);
const [t] = await store.listTokens();
console.log('token', t.symbol, 'creator', t.creator.slice(0, 8), 'fee', t.swap_fee, 'snipe', t.snipe_fee, t.snipe_duration, 'holderShare', t.holder_share, 'creatorShare', t.creator_share, 'nativeIsZero', t.native_is_zero);
console.log('price', t.price, 'mcap HYPE', t.price * 1e9, 'volume', t.volume.toFixed(3), 'trades', t.trades, 'burned', (Number(t.burned) / 1e18).toFixed(0), 'holders', t.holders);
const trades = await store.trades({ token: t.address, limit: 20 });
for (const x of trades.slice(0, 4)) console.log(x.is_buy ? 'BUY ' : 'SELL', x.hype.toFixed(4), 'HYPE', (x.tokens / 1e6).toFixed(2) + 'M', 'price', x.price.toExponential(3), x.trader.slice(0, 8));
console.log('top holders', (await store.holders(t.address, 4)).map((h) => `${h.holder.slice(0, 8)} ${(Number(h.balance) / 1e24).toFixed(2)}M`).join(' | '));
// second sync is a no-op
console.log('resync', await sync(store, cfg, {}));
