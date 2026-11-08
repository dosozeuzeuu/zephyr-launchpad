'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createContext, useContext, useMemo, useState } from 'react';
import { WagmiProvider, createConfig, http } from 'wagmi';
import { injected } from '@wagmi/core';

import { Toaster } from '@/components/Toaster';
import { elysium } from '@/lib/chain';
import type { SiteConfig } from '@/lib/config';

const ConfigContext = createContext<SiteConfig | null>(null);

export function useSite(): SiteConfig {
  const c = useContext(ConfigContext);
  if (!c) throw new Error('No site config');
  return c;
}

export function Providers({ config, children }: { config: SiteConfig; children: React.ReactNode }) {
  const [queryClient] = useState(() => new QueryClient({ defaultOptions: { queries: { staleTime: 2000, refetchOnWindowFocus: true } } }));
  const wagmi = useMemo(() => {
    const chain = elysium(config.rpcUrl, config.explorerUrl);
    return createConfig({ chains: [chain], connectors: [injected()], transports: { [chain.id]: http(config.rpcUrl, { batch: true }) }, ssr: true });
  }, [config.rpcUrl, config.explorerUrl]);

  return (
    <ConfigContext.Provider value={config}>
      <WagmiProvider config={wagmi}>
        <QueryClientProvider client={queryClient}>
          {children}
          <Toaster />
        </QueryClientProvider>
      </WagmiProvider>
    </ConfigContext.Provider>
  );
}
