/** Adds a few launches and a stream of trades to the local chain, for previewing the site. */
import { readFileSync } from 'node:fs';
import { type Address, createPublicClient, createWalletClient, encodeAbiParameters, http, parseEther } from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry as base } from 'viem/chains';

import { MemecoinAbi, PositionManagerAbi, ZephyrRouterAbi } from '@/artifacts';

const chain = { ...base, id: Number(process.env.CHAIN_ID ?? 31337) };
const RPC = 'http://127.0.0.1:8546';
const cfg = JSON.parse(readFileSync(process.env.WRITE_CONFIG!, 'utf8'));
const pm = cfg.addresses.positionManager as Address;
const router = cfg.addresses.router as Address;
const keys = [
  '0x7c852118294e51e653712a81e05800f419141751be58f605c371e15141b007a6',
  '0x47e179ec197488593b187f80a00eb0da91f1b9d0b13f8733639f19c30a34926a',
  '0x8b3a350cf5c34c9194ca85829a2df0ec3153be0318b5e2d3348e872092edffba',
  '0x92db14e403b83dfe3df233f83dfa3a0d7096f21ca9b0d6d6b8d88b2b4ec1564e',
  '0x4bbbf85ce3377467afe5d46f804f221813b2bb87f24d81f60f1fcdbf7cbf4356',
] as const;
const accts = keys.map((k) => privateKeyToAccount(k));
const pub = createPublicClient({ chain, transport: http(RPC) });
const w = (i: number) => createWalletClient({ account: accts[i], chain, transport: http(RPC) });
const fee = (f: number, s: number, d: number, h: number) =>
  encodeAbiParameters([{ type: 'tuple', components: [{ type: 'uint24' }, { type: 'uint24' }, { type: 'uint32' }, { type: 'uint16' }] }], [[f, s, d, h]]);

const LAUNCHES = [
  { name: 'Westerly', symbol: 'WEST', f: 200, c: 4000, h: 5000 },
  { name: 'Cirrus Club', symbol: 'CIRRUS', f: 300, c: 0, h: 5000 },
  { name: 'Hyper Kite', symbol: 'KITE', f: 100, c: 10000, h: 0 },
  { name: 'Doldrums', symbol: 'DOLD', f: 500, c: 2000, h: 10000 },
  { name: 'Sail Season', symbol: 'SAIL', f: 250, c: 5000, h: 3000 },
];

const tokens: Address[] = [];
for (const [i, l] of LAUNCHES.entries()) {
  const hash = await w(i).writeContract({
    address: pm,
    abi: PositionManagerAbi,
    functionName: 'flaunch',
    args: [{ name: l.name, symbol: l.symbol, tokenUri: '', premineAmount: parseEther('2000000'), creator: accts[i].address, creatorFeeAllocation: l.c, flaunchAt: 0n, initialPriceParams: encodeAbiParameters([{ type: 'uint256' }], [0n]), feeCalculatorParams: fee(l.f, 0, 0, l.h) }],
    value: parseEther('1'),
  });
  const r = await pub.waitForTransactionReceipt({ hash });
  const ev = r.logs.find((x) => x.address.toLowerCase() === pm.toLowerCase() && x.topics.length === 2);
  const token = (`0x${ev!.data.slice(26, 66)}`) as Address;
  tokens.push(token);
  console.log('launched', l.symbol, token);
}

const deadline = BigInt(Math.floor(Date.now() / 1000) + 10 * 86400);
for (let round = 0; round < 60; round++) {
  await pub.request({ method: 'evm_increaseTime' as never, params: [97] as never });
  const ti = round % tokens.length;
  const token = tokens[ti];
  const ai = (round * 3) % accts.length;
  const bias = [1.6, 1.1, 2.4, 0.6, 1.3][ti];
  if (Math.random() < 0.72) {
    const amt = parseEther((Math.random() * bias + 0.05).toFixed(3));
    await pub.waitForTransactionReceipt({ hash: await w(ai).writeContract({ address: router, abi: ZephyrRouterAbi, functionName: 'buy', args: [token, 1n, accts[ai].address, deadline], value: amt }) });
  } else {
    const bal = await pub.readContract({ address: token, abi: MemecoinAbi, functionName: 'balanceOf', args: [accts[ai].address] });
    if (bal === 0n) continue;
    await pub.waitForTransactionReceipt({ hash: await w(ai).writeContract({ address: token, abi: MemecoinAbi, functionName: 'approve', args: [router, bal] }) });
    await pub.waitForTransactionReceipt({ hash: await w(ai).writeContract({ address: router, abi: ZephyrRouterAbi, functionName: 'sell', args: [token, bal / 3n, 1n, accts[ai].address, deadline] }) });
  }
}
console.log('seeded');
