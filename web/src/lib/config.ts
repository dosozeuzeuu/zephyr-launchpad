import type { Address } from 'viem';

export type Addresses = {
  positionManager: Address;
  router: Address;
  feeEscrow: Address;
  vault: Address;
  feeCalculator: Address;
  flaunch: Address;
  poolManager: Address;
  [k: string]: Address;
};

/** Everything the site needs to know about the live deployment. */
export type SiteConfig = {
  deployed: boolean;
  rpcUrl: string;
  explorerUrl: string;
  bridgeUrl: string;
  startBlock: number;
  admin: Address;
  addresses: Partial<Addresses>;
};

export const DEFAULT_CONFIG: SiteConfig = {
  deployed: false,
  rpcUrl: process.env.NEXT_PUBLIC_RPC_URL ?? 'https://rpc.elysium.kinetiq.xyz',
  explorerUrl: process.env.NEXT_PUBLIC_EXPLORER_URL ?? 'https://explorer.elysium.kinetiq.xyz',
  bridgeUrl: process.env.NEXT_PUBLIC_BRIDGE_URL ?? 'https://elysium.kinetiq.xyz/bridge',
  startBlock: 0,
  admin: (process.env.NEXT_PUBLIC_ADMIN ?? '0x43Dec03eb1c62063d75c37204B1ad0bbd8C80A0B') as Address,
  addresses: {},
};
