/**
 * End-to-end check of the deploy plan on a local anvil chain with a real Uniswap v4 PoolManager:
 * deploy everything through the ZephyrDeployer exactly as the deploy page does, then launch a
 * token, trade it through the router, check the fee split, run a buyback and pay holders.
 *
 *   anvil --port 8546 --code-size-limit 30000 &   then   npx tsx scripts/e2e-local.ts
 */
import { readFileSync } from 'node:fs';
import {
  type Address,
  type Hex,
  createPublicClient,
  createWalletClient,
  decodeEventLog,
  encodeAbiParameters,
  formatEther,
  http,
  parseEther,
} from 'viem';
import { privateKeyToAccount } from 'viem/accounts';
import { foundry as foundryBase } from 'viem/chains';
const foundry = { ...foundryBase, id: Number(process.env.CHAIN_ID ?? 31337) };

import {
  FeeEscrowAbi,
  MemecoinAbi,
  PositionManagerAbi,
  ZephyrDeployerAbi,
  ZephyrFeeCalculatorAbi,
  ZephyrRouterAbi,
  ZephyrVaultAbi,
} from '@/artifacts';
import bytecodes from '@/artifacts/bytecode.json';
import { buildDeployPlan } from '@/lib/deploy/plan';

const RPC = process.env.RPC ?? 'http://127.0.0.1:8546';
const WHYPE: Address = '0xbA876237B0F021A6c6D852d6c26E107997cC5E81';
const PROTOCOL: Address = '0x43Dec03eb1c62063d75c37204B1ad0bbd8C80A0B';

// anvil default keys
const admin = privateKeyToAccount('0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80');
const keeper = privateKeyToAccount('0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
const trader = privateKeyToAccount('0x5de4111afa1a4b94908f83103eb1f1706367c2e68ca870fc3fb9a804cdab365a');

const test = JSON.parse(readFileSync(new URL('./test-artifacts.json', import.meta.url), 'utf8'));
const bc = bytecodes as Record<string, { bytecode: Hex }>;

const pub = createPublicClient({ chain: foundry, transport: http(RPC) });
const wallet = (account = admin) => createWalletClient({ account, chain: foundry, transport: http(RPC) });

let failures = 0;
function check(cond: boolean, msg: string) {
  console.log(`${cond ? '✓' : '✗'} ${msg}`);
  if (!cond) failures++;
}

async function deployRaw(abi: unknown[], bytecode: Hex, args: unknown[] = []) {
  const hash = await wallet().deployContract({ abi: abi as never, bytecode, args: args as never });
  const r = await pub.waitForTransactionReceipt({ hash });
  if (!r.contractAddress) throw new Error('deploy failed');
  return r.contractAddress;
}

async function main() {
  // ---- Uniswap v4 PoolManager and WHYPE at its real Elysium address
  const poolManager = await deployRaw(test.PoolManager.abi, test.PoolManager.bytecode, [admin.address]);
  const wethTmp = await deployRaw(test.WETH9.abi, test.WETH9.bytecode);
  const wethCode = await pub.getCode({ address: wethTmp });
  await pub.request({ method: 'anvil_setCode' as never, params: [WHYPE, wethCode] as never });

  // ---- 1. deploy the ZephyrDeployer, 2-4. run the three batches
  const deployer = await deployRaw(ZephyrDeployerAbi as never, bc.ZephyrDeployer.bytecode);
  const t0 = Date.now();
  const { batches, addresses: a } = buildDeployPlan({
    deployer,
    admin: admin.address,
    poolManager,
    whype: WHYPE,
    protocolFeeRecipient: PROTOCOL,
    keeper: keeper.address,
  });
  console.log(`plan built (hook salt mined) in ${Date.now() - t0}ms; hook at ${a.positionManager}`);

  for (const batch of batches) {
    const hash = await wallet().writeContract({ address: deployer, abi: ZephyrDeployerAbi, functionName: 'run', args: [batch.ops] });
    const r = await pub.waitForTransactionReceipt({ hash });
    check(r.status === 'success', `batch "${batch.label}" (${batch.ops.length} ops, gas ${r.gasUsed})`);
  }

  for (const [name, addr] of Object.entries(a)) {
    const code = await pub.getCode({ address: addr as Address });
    if (!code || code === '0x') check(false, `${name} has code at ${addr}`);
  }
  check(true, 'every precomputed address has code');

  const owner = await pub.readContract({ address: a.positionManager, abi: PositionManagerAbi, functionName: 'owner' });
  check(owner.toLowerCase() === admin.address.toLowerCase(), 'admin wallet owns the hook');

  // ---- launch a token with a dev buy
  const feeParams = encodeAbiParameters(
    [{ type: 'tuple', components: [{ type: 'uint24' }, { type: 'uint24' }, { type: 'uint32' }, { type: 'uint16' }] }],
    [[300, 2000, 300, 5000]],
  );
  const launchHash = await wallet(trader).writeContract({
    address: a.positionManager,
    abi: PositionManagerAbi,
    functionName: 'flaunch',
    args: [
      {
        name: 'Gale',
        symbol: 'GALE',
        tokenUri: 'https://zephyr.example/meta/gale.json',
        premineAmount: parseEther('10000000'),
        creator: trader.address,
        creatorFeeAllocation: 5000,
        flaunchAt: 0n,
        initialPriceParams: encodeAbiParameters([{ type: 'uint256' }], [0n]),
        feeCalculatorParams: feeParams,
      },
    ],
    value: parseEther('1'),
  });
  const lr = await pub.waitForTransactionReceipt({ hash: launchHash });
  check(lr.status === 'success', `launch (gas ${lr.gasUsed})`);

  let token: Address | undefined;
  let poolId: Hex | undefined;
  for (const log of lr.logs) {
    try {
      const ev = decodeEventLog({ abi: PositionManagerAbi, data: log.data, topics: log.topics });
      if (ev.eventName === 'PoolCreated') {
        token = ev.args._memecoin;
        poolId = ev.args._poolId;
      }
    } catch {}
  }
  check(!!token, `PoolCreated gives token ${token}`);
  if (!token || !poolId) throw new Error('no token');

  const devBal = await pub.readContract({ address: token, abi: MemecoinAbi, functionName: 'balanceOf', args: [trader.address] });
  check(devBal === parseEther('10000000'), 'dev buy delivered');

  const mcap = await pub.readContract({ address: a.positionManager, abi: PositionManagerAbi, functionName: 'getFlaunchingMarketCap', args: [encodeAbiParameters([{ type: 'uint256' }], [0n])] });
  check(mcap === parseEther('40'), `starting market cap ${formatEther(mcap)} HYPE`);

  const fee = await pub.readContract({ address: a.feeCalculator, abi: ZephyrFeeCalculatorAbi, functionName: 'currentSwapFee', args: [poolId, true] });
  check(fee > 300 && fee <= 2000, `anti-snipe buy fee active (${Number(fee) / 100}%)`);

  // ---- trade through the router: quote by simulation, then send
  const deadline = BigInt(Math.floor(Date.now() / 1000) + 3600);
  for (let i = 0; i < 12; i++) {
    const sim = await pub.simulateContract({ account: trader, address: a.router, abi: ZephyrRouterAbi, functionName: 'buy', args: [token, 0n, trader.address, deadline + 10_000n], value: parseEther('1') });
    const minOut = (sim.result * 99n) / 100n;
    const h = await wallet(trader).writeContract({ address: a.router, abi: ZephyrRouterAbi, functionName: 'buy', args: [token, minOut, trader.address, deadline + 10_000n], value: parseEther('1') });
    await pub.waitForTransactionReceipt({ hash: h });
  }
  check(true, '12 router buys with 1% slippage limits');

  const bal = await pub.readContract({ address: token, abi: MemecoinAbi, functionName: 'balanceOf', args: [trader.address] });
  await pub.waitForTransactionReceipt({ hash: await wallet(trader).writeContract({ address: token, abi: MemecoinAbi, functionName: 'approve', args: [a.router, bal] }) });
  const before = await pub.getBalance({ address: trader.address });
  const sellHash = await wallet(trader).writeContract({ address: a.router, abi: ZephyrRouterAbi, functionName: 'sell', args: [token, bal / 4n, 1n, trader.address, deadline + 10_000n] });
  const sr = await pub.waitForTransactionReceipt({ hash: sellHash });
  const after = await pub.getBalance({ address: trader.address });
  check(sr.status === 'success' && after + sr.gasUsed * sr.effectiveGasPrice > before, 'router sell paid out HYPE');

  // ---- fees reached everyone
  const protocolBal = await pub.readContract({ address: a.feeEscrow, abi: FeeEscrowAbi, functionName: 'balances', args: [PROTOCOL] });
  const creatorBal = await pub.readContract({ address: a.feeEscrow, abi: FeeEscrowAbi, functionName: 'balances', args: [trader.address] });
  const [buyback, holders] = await pub.readContract({ address: a.vault, abi: ZephyrVaultAbi, functionName: 'balances', args: [poolId] });
  console.log(`  protocol ${formatEther(protocolBal)}  creator ${formatEther(creatorBal)}  buyback ${formatEther(buyback)}  holders ${formatEther(holders)}`);
  check(protocolBal > 0n, 'protocol wallet earned');
  check(creatorBal > 0n, 'creator earned');
  check(buyback > 0n && holders > 0n, 'vault buckets filled');

  // ---- keeper: buyback and a holder round
  const supplyBefore = await pub.readContract({ address: token, abi: MemecoinAbi, functionName: 'totalSupply' });
  const bbSim = await pub.simulateContract({ account: keeper, address: a.vault, abi: ZephyrVaultAbi, functionName: 'buyback', args: [token, 0n] });
  await pub.waitForTransactionReceipt({
    hash: await wallet(keeper).writeContract({ address: a.vault, abi: ZephyrVaultAbi, functionName: 'buyback', args: [token, (bbSim.result * 98n) / 100n] }),
  });
  const supplyAfter = await pub.readContract({ address: token, abi: MemecoinAbi, functionName: 'totalSupply' });
  check(supplyAfter < supplyBefore, `buyback burned ${formatEther(supplyBefore - supplyAfter)} tokens`);

  const [, holdersNow] = await pub.readContract({ address: a.vault, abi: ZephyrVaultAbi, functionName: 'balances', args: [poolId] });
  const holderBefore = await pub.getBalance({ address: trader.address });
  await pub.waitForTransactionReceipt({
    hash: await wallet(keeper).writeContract({ address: a.vault, abi: ZephyrVaultAbi, functionName: 'distribute', args: [token, [trader.address], [holdersNow]] }),
  });
  const holderAfter = await pub.getBalance({ address: trader.address });
  check(holderAfter - holderBefore === holdersNow, `holder round paid ${formatEther(holdersNow)} HYPE`);

  // ---- protocol wallet claims as native HYPE (impersonated locally)
  await pub.request({ method: 'anvil_impersonateAccount' as never, params: [PROTOCOL] as never });
  await pub.request({ method: 'anvil_setBalance' as never, params: [PROTOCOL, '0xDE0B6B3A7640000'] as never });
  const owed = await pub.readContract({ address: a.feeEscrow, abi: FeeEscrowAbi, functionName: 'balances', args: [PROTOCOL] });
  const pBefore = await pub.getBalance({ address: PROTOCOL });
  const claim = await createWalletClient({ account: PROTOCOL, chain: foundry, transport: http(RPC) }).writeContract({
    address: a.feeEscrow,
    abi: FeeEscrowAbi,
    functionName: 'withdrawFees',
    args: [PROTOCOL, true],
  });
  const cr = await pub.waitForTransactionReceipt({ hash: claim });
  const pAfter = await pub.getBalance({ address: PROTOCOL });
  check(owed >= protocolBal && pAfter + cr.gasUsed * cr.effectiveGasPrice - pBefore === owed, `protocol wallet claimed ${formatEther(owed)} HYPE`);

  console.log(failures === 0 ? '\nALL CHECKS PASSED' : `\n${failures} CHECK(S) FAILED`);
  if (process.env.WRITE_CONFIG) (await import('node:fs')).writeFileSync(process.env.WRITE_CONFIG, JSON.stringify({ deployed: true, rpcUrl: RPC, explorerUrl: 'https://explorer.example', bridgeUrl: 'https://bridge.example', startBlock: 0, admin: admin.address, addresses: { ...a, poolManager } }));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
