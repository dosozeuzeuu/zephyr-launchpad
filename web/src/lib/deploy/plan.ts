/**
 * Builds the full Zephyr deployment as batches of operations for the {ZephyrDeployer}.
 *
 * Every address is precomputed (CREATE addresses from the deployer's nonce, the hook's address
 * via CREATE2 with a mined salt), so constructor arguments can reference contracts that are
 * deployed in the same or a later batch. The deploy page and the local end-to-end test both run
 * exactly this plan.
 */
import {
  type Address,
  type Hex,
  concatHex,
  encodeAbiParameters,
  encodeFunctionData,
  getContractAddress,
  keccak256,
  toHex,
  zeroHash,
} from 'viem';

import {
  BidWallAbi,
  FeeEscrowAbi,
  FeeExemptionsAbi,
  FlaunchAbi,
  FlaunchFeeExemptionAbi,
  IndexerSubscriberAbi,
  InitialPriceAbi,
  InternalSwapPoolAbi,
  NotifierAbi,
  OracleAbi,
  PositionManagerAbi,
  TreasuryActionManagerAbi,
  ZephyrVaultAbi,
} from '@/artifacts';
import bytecodes from '@/artifacts/bytecode.json';

export type Op = { kind: number; salt: Hex; target: Address; data: Hex };
export type Batch = { label: string; ops: Op[] };

export type DeployInput = {
  deployer: Address; // the ZephyrDeployer contract
  admin: Address; // the wallet that ends up owning everything
  poolManager: Address; // Uniswap v4 PoolManager on Elysium
  whype: Address;
  protocolFeeRecipient: Address;
  keeper: Address;
  startingMarketCapWei?: bigint; // default 40 HYPE
};

export type DeployedAddresses = {
  memecoinImplementation: Address;
  flaunchFeeExemption: Address;
  initialPrice: Address;
  feeExemptions: Address;
  actionManager: Address;
  indexer: Address;
  feeEscrow: Address;
  oracle: Address;
  internalSwapPool: Address;
  flaunchLibrary: Address;
  flaunch: Address;
  memecoinTreasuryImplementation: Address;
  bidWall: Address;
  positionManager: Address;
  notifier: Address;
  feeCalculator: Address;
  vault: Address;
  router: Address;
};

const CREATE = 0;
const CREATE2 = 1;
const CALL = 2;

export const TOKEN_SUPPLY = 10n ** 27n; // 1,000,000,000 tokens with 18 decimals
export const HOOK_FLAGS = 0x25dcn; // must match PositionManager.getHookPermissions()
const HOOK_MASK = 0x3fffn;

const ORACLE_CONSUMER = keccak256(toHex('OracleConsumer'));
const POSITION_MANAGER_ROLE = keccak256(toHex('PositionManager'));
const DEFAULT_ADMIN_ROLE = zeroHash;

const bc = bytecodes as Record<string, { bytecode: Hex; linkReferences: Record<string, Record<string, { start: number; length: number }[]>> }>;

function code(name: string): Hex {
  return bc[name].bytecode;
}

function withArgs(name: string, types: readonly { type: string }[], values: readonly unknown[]): Hex {
  return concatHex([code(name), encodeAbiParameters(types as never, values as never)]);
}

/** Replaces library placeholders in a bytecode with the deployed library address. */
export function linkBytecode(bytecode: Hex, linkReferences: Record<string, Record<string, { start: number; length: number }[]>>, libs: Record<string, Address>): Hex {
  let hex = bytecode.slice(2);
  for (const file of Object.keys(linkReferences)) {
    for (const lib of Object.keys(linkReferences[file])) {
      const addr = libs[lib];
      if (!addr) throw new Error(`Missing library address for ${lib}`);
      for (const { start, length } of linkReferences[file][lib]) {
        hex = hex.slice(0, start * 2) + addr.slice(2).toLowerCase() + hex.slice((start + length) * 2);
      }
    }
  }
  return `0x${hex}`;
}

/** Integer square root for bigint. */
function isqrt(n: bigint): bigint {
  if (n < 2n) return n;
  let x = n;
  let y = (x + 1n) >> 1n;
  while (y < x) {
    x = y;
    y = (x + n / x) >> 1n;
  }
  return x;
}

/** sqrtPriceX96 for a launch at `marketCap` HYPE (wei) over the 1B supply, for both orderings. */
export function initialSqrtPrices(marketCap: bigint): { unflipped: bigint; flipped: bigint } {
  const Q192 = 1n << 192n;
  // native is currency0: price = tokens per HYPE
  const unflipped = isqrt((TOKEN_SUPPLY * Q192) / marketCap);
  // native is currency1: price = HYPE per token
  const flipped = isqrt((marketCap * Q192) / TOKEN_SUPPLY);
  return { unflipped, flipped };
}

function create2Address(factory: Address, salt: Hex, initCodeHash: Hex): Address {
  const hash = keccak256(concatHex(['0xff', factory, salt, initCodeHash]));
  return `0x${hash.slice(26)}` as Address;
}

/** Finds a CREATE2 salt that gives an address carrying the hook permission flags. */
export function mineHookSalt(factory: Address, initCode: Hex, start = 0n): { salt: Hex; address: Address } {
  const initCodeHash = keccak256(initCode);
  for (let i = start; i < start + 2_000_000n; i++) {
    const salt = toHex(i, { size: 32 });
    const address = create2Address(factory, salt, initCodeHash);
    if ((BigInt(address) & HOOK_MASK) === HOOK_FLAGS) return { salt, address };
  }
  throw new Error('No hook salt found');
}

function call(target: Address, abi: readonly unknown[], functionName: string, args: readonly unknown[]): Op {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const data = (encodeFunctionData as any)({ abi, functionName, args }) as Hex;
  return { kind: CALL, salt: zeroHash, target, data };
}

export function buildDeployPlan(input: DeployInput): { batches: Batch[]; addresses: DeployedAddresses } {
  const { deployer, admin, poolManager, whype, protocolFeeRecipient, keeper } = input;
  const marketCap = input.startingMarketCapWei ?? 40n * 10n ** 18n;

  // The deployer contract's nonce starts at 1 and rises with every CREATE and CREATE2
  let nonce = 1n;
  const next = () => getContractAddress({ from: deployer, nonce: nonce++ });

  const create = (initCode: Hex): Op => ({ kind: CREATE, salt: zeroHash, target: deployer, data: initCode });

  // ---------------------------------------------------------------- batch 1: core contracts
  const a = {} as DeployedAddresses;
  const b1: Op[] = [];

  a.memecoinImplementation = next();
  b1.push(create(code('Memecoin')));

  a.flaunchFeeExemption = next();
  b1.push(create(code('FlaunchFeeExemption')));

  a.initialPrice = next();
  b1.push(create(withArgs('InitialPrice', [{ type: 'uint256' }, { type: 'address' }, { type: 'address' }], [0n, deployer, a.flaunchFeeExemption])));

  a.feeExemptions = next();
  b1.push(create(withArgs('FeeExemptions', [{ type: 'address' }], [deployer])));

  a.actionManager = next();
  b1.push(create(withArgs('TreasuryActionManager', [{ type: 'address' }], [deployer])));

  a.indexer = next();
  b1.push(create(code('IndexerSubscriber')));

  a.feeEscrow = next();
  b1.push(create(withArgs('FeeEscrow', [{ type: 'address' }, { type: 'address' }], [whype, a.indexer])));

  a.oracle = next();
  b1.push(create(withArgs('Oracle', [{ type: 'address' }], [deployer])));

  a.internalSwapPool = next();
  b1.push(create(withArgs('InternalSwapPool', [{ type: 'address' }, { type: 'address' }, { type: 'address' }], [poolManager, a.oracle, deployer])));

  a.flaunchLibrary = next();
  b1.push(create(code('FlaunchLibrary')));

  a.flaunch = next();
  b1.push(create(withArgs('Flaunch', [{ type: 'address' }, { type: 'string' }], [a.memecoinImplementation, ''])));

  a.memecoinTreasuryImplementation = next();
  b1.push(create(code('MemecoinTreasury')));

  // ---------------------------------------------------------------- batch 2: hook
  const b2: Op[] = [];

  a.bidWall = next();
  b2.push(create(withArgs('BidWall', [{ type: 'address' }, { type: 'address' }, { type: 'address' }], [whype, poolManager, deployer])));

  const pmCode = linkBytecode(code('PositionManager'), bc.PositionManager.linkReferences, { FlaunchLibrary: a.flaunchLibrary });
  const pmArgs = encodeAbiParameters(
    [
      {
        type: 'tuple',
        components: [
          { name: 'nativeToken', type: 'address' },
          { name: 'poolManager', type: 'address' },
          {
            name: 'feeDistribution',
            type: 'tuple',
            components: [
              { name: 'swapFee', type: 'uint24' },
              { name: 'referrer', type: 'uint24' },
              { name: 'protocol', type: 'uint24' },
              { name: 'active', type: 'bool' },
            ],
          },
          { name: 'initialPrice', type: 'address' },
          { name: 'protocolOwner', type: 'address' },
          { name: 'protocolFeeRecipient', type: 'address' },
          { name: 'flayGovernance', type: 'address' },
          { name: 'feeEscrow', type: 'address' },
          { name: 'feeExemptions', type: 'address' },
          { name: 'actionManager', type: 'address' },
          { name: 'bidWall', type: 'address' },
          { name: 'internalSwapPool', type: 'address' },
          { name: 'oracle', type: 'address' },
        ],
      },
    ],
    [
      {
        nativeToken: whype,
        poolManager,
        feeDistribution: { swapFee: 100, referrer: 0, protocol: 3000, active: true },
        initialPrice: a.initialPrice,
        protocolOwner: deployer,
        protocolFeeRecipient,
        flayGovernance: admin,
        feeEscrow: a.feeEscrow,
        feeExemptions: a.feeExemptions,
        actionManager: a.actionManager,
        bidWall: a.bidWall,
        internalSwapPool: a.internalSwapPool,
        oracle: a.oracle,
      },
    ],
  );
  const pmInit = concatHex([pmCode, pmArgs]);
  const mined = mineHookSalt(deployer, pmInit);
  a.positionManager = mined.address;
  nonce++; // CREATE2 also increments the deployer's nonce
  b2.push({ kind: CREATE2, salt: mined.salt, target: deployer, data: pmInit });

  // The PositionManager deploys its Notifier in its constructor (its own nonce 1)
  a.notifier = getContractAddress({ from: a.positionManager, nonce: 1n });

  const prices = initialSqrtPrices(marketCap);
  b2.push(call(a.initialPrice, InitialPriceAbi, 'setSqrtPriceX96', [{ unflipped: prices.unflipped, flipped: prices.flipped }]));
  b2.push(call(a.oracle, OracleAbi, 'grantRole', [ORACLE_CONSUMER, a.internalSwapPool]));
  b2.push(call(a.oracle, OracleAbi, 'grantRole', [ORACLE_CONSUMER, a.positionManager]));
  b2.push(call(a.internalSwapPool, InternalSwapPoolAbi, 'grantRole', [POSITION_MANAGER_ROLE, a.positionManager]));
  b2.push(call(a.bidWall, BidWallAbi, 'grantRole', [POSITION_MANAGER_ROLE, a.positionManager]));
  b2.push(call(a.flaunch, FlaunchAbi, 'initialize', [a.positionManager, a.memecoinTreasuryImplementation]));
  b2.push(call(a.positionManager, PositionManagerAbi, 'setFlaunch', [a.flaunch]));

  // ---------------------------------------------------------------- batch 3: Zephyr + handoff
  const b3: Op[] = [];

  a.feeCalculator = next();
  b3.push(create(withArgs('ZephyrFeeCalculator', [{ type: 'address' }, { type: 'address' }], [a.positionManager, whype])));

  a.vault = next();
  b3.push(
    create(
      withArgs(
        'ZephyrVault',
        [{ type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }, { type: 'address' }],
        [poolManager, a.positionManager, whype, a.feeCalculator, a.feeEscrow, deployer],
      ),
    ),
  );

  a.router = next();
  b3.push(create(withArgs('ZephyrRouter', [{ type: 'address' }, { type: 'address' }, { type: 'address' }], [poolManager, a.positionManager, whype])));

  b3.push(call(a.positionManager, PositionManagerAbi, 'setFeeCalculator', [a.feeCalculator]));
  b3.push(call(a.vault, ZephyrVaultAbi, 'setKeeper', [keeper, true]));
  b3.push(call(a.positionManager, PositionManagerAbi, 'setVault', [a.vault]));
  b3.push(call(a.feeExemptions, FeeExemptionsAbi, 'setFeeExemption', [a.vault, 0]));
  b3.push(call(a.notifier, NotifierAbi, 'subscribe', [a.indexer, '0x']));
  b3.push(call(a.indexer, IndexerSubscriberAbi, 'setNotifierFlaunch', [a.notifier, a.flaunch]));
  b3.push(call(a.indexer, IndexerSubscriberAbi, 'addVerifiedFlaunch', [a.flaunch]));

  // Hand every Ownable contract to the admin wallet
  const ownable: [Address, readonly unknown[]][] = [
    [a.flaunchFeeExemption, FlaunchFeeExemptionAbi],
    [a.initialPrice, InitialPriceAbi],
    [a.feeExemptions, FeeExemptionsAbi],
    [a.actionManager, TreasuryActionManagerAbi],
    [a.indexer, IndexerSubscriberAbi],
    [a.feeEscrow, FeeEscrowAbi],
    [a.flaunch, FlaunchAbi],
    [a.bidWall, BidWallAbi],
    [a.notifier, NotifierAbi],
    [a.vault, ZephyrVaultAbi],
    [a.positionManager, PositionManagerAbi],
  ];
  for (const [target, abi] of ownable) b3.push(call(target, abi, 'transferOwnership', [admin]));

  // Hand every AccessControl admin role to the admin wallet, then drop the deployer's
  const roles: [Address, readonly unknown[]][] = [
    [a.oracle, OracleAbi],
    [a.internalSwapPool, InternalSwapPoolAbi],
    [a.bidWall, BidWallAbi],
  ];
  for (const [target, abi] of roles) {
    b3.push(call(target, abi, 'grantRole', [DEFAULT_ADMIN_ROLE, admin]));
    b3.push(call(target, abi, 'renounceRole', [DEFAULT_ADMIN_ROLE, deployer]));
  }

  return {
    batches: [
      { label: 'Core contracts', ops: b1 },
      { label: 'Uniswap v4 hook', ops: b2 },
      { label: 'Fees, vault, router and handoff', ops: b3 },
    ],
    addresses: a,
  };
}
