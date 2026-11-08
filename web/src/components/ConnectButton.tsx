'use client';

import { useEffect, useRef, useState } from 'react';
import { useAccount, useBalance, useChainId, useConnect, useDisconnect, useSwitchChain } from 'wagmi';

import { ELYSIUM_CHAIN_ID } from '@/lib/chain';
import { fmtNum, shortAddr } from '@/lib/format';

export function ConnectButton() {
  const { address, isConnected } = useAccount();
  const chainId = useChainId();
  const { connectors, connect, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { enabled: !!address, refetchInterval: 8000 } });
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const close = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, []);

  if (!mounted) return <div className="h-10 w-28" />;

  if (!isConnected) {
    const list = connectors.filter((c, i, arr) => arr.findIndex((x) => x.name === c.name) === i);
    return (
      <div className="relative" ref={ref}>
        <button className="btn-primary h-10 px-4" onClick={() => (list.length === 1 ? connect({ connector: list[0] }) : setOpen((o) => !o))} disabled={isPending}>
          {isPending ? 'Connecting…' : 'Connect'}
        </button>
        {open && (
          <div className="absolute right-0 mt-2 w-56 panel bg-dusk p-2 z-40">
            {list.map((c) => (
              <button key={c.uid} className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-haze" onClick={() => { connect({ connector: c }); setOpen(false); }}>
                {c.name === 'Injected' ? 'Browser wallet' : c.name}
              </button>
            ))}
            {list.length === 0 && <p className="px-3 py-2 text-sm text-mist">Open this site in your wallet&apos;s browser, or install a wallet extension.</p>}
          </div>
        )}
      </div>
    );
  }

  if (chainId !== ELYSIUM_CHAIN_ID) {
    return (
      <button className="btn h-10 px-4 bg-sell/20 text-sell border border-sell/40" onClick={() => switchChain({ chainId: ELYSIUM_CHAIN_ID })}>
        Switch to Elysium
      </button>
    );
  }

  return (
    <div className="relative" ref={ref}>
      <button className="btn-ghost h-10 px-3 gap-3" onClick={() => setOpen((o) => !o)}>
        <span className="num text-mist hidden sm:inline">{bal ? fmtNum(Number(bal.value) / 1e18, 2) : '…'} HYPE</span>
        <span>{shortAddr(address)}</span>
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-56 panel bg-dusk p-2 z-40">
          <a href="/fees" className="block px-3 py-2.5 rounded-lg hover:bg-haze">Your fees</a>
          <button className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-haze" onClick={() => navigator.clipboard.writeText(address!)}>Copy address</button>
          <button className="w-full text-left px-3 py-2.5 rounded-lg hover:bg-haze text-sell" onClick={() => { disconnect(); setOpen(false); }}>Disconnect</button>
        </div>
      )}
    </div>
  );
}
