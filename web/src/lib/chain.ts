import { defineChain } from 'viem';

export const ELYSIUM_CHAIN_ID = 99901;

export function elysium(rpcUrl: string, explorerUrl?: string) {
  return defineChain({
    id: ELYSIUM_CHAIN_ID,
    name: 'Elysium',
    nativeCurrency: { name: 'HYPE', symbol: 'HYPE', decimals: 18 },
    rpcUrls: { default: { http: [rpcUrl] } },
    blockExplorers: explorerUrl ? { default: { name: 'Explorer', url: explorerUrl } } : undefined,
  });
}

export const WHYPE = '0xbA876237B0F021A6c6D852d6c26E107997cC5E81' as const;
// Uniswap v4 PoolManager on Elysium as published by other launchpads; the deploy page verifies it on-chain
export const DEFAULT_POOL_MANAGER = '0xE2e105d3F7209A9DA11f83cCf3E7398a753823F1' as const;
export const PROTOCOL_WALLET = '0x43Dec03eb1c62063d75c37204B1ad0bbd8C80A0B' as const;
export const TOKEN_SUPPLY = 1_000_000_000;
