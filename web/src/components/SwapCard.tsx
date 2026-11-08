'use client';

import { AnimatePresence, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { type Address, type Hex, formatUnits, maxUint256, parseUnits } from 'viem';
import { useAccount, useBalance, useChainId, usePublicClient, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';

import { useSite } from '@/app/providers';
import { MemecoinAbi, ZephyrFeeCalculatorAbi, ZephyrRouterAbi } from '@/artifacts';
import { ELYSIUM_CHAIN_ID } from '@/lib/chain';
import { fmtNum, pct } from '@/lib/format';
import { useTx } from '@/lib/useTx';

const DEAD = '0x000000000000000000000000000000000000dEaD' as Address;

export function SwapCard({ token, symbol, poolId, price, startsAt, onTraded }: { token: Address; symbol: string; poolId: Hex; price: number; startsAt: number; onTraded?: () => void }) {
  const site = useSite();
  const router = site.addresses.router as Address;
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();

  const [side, setSide] = useState<'buy' | 'sell'>('buy');
  const [amount, setAmount] = useState('');
  const [slippage, setSlippage] = useState(3);
  const [quote, setQuote] = useState<{ out: bigint; exact: boolean } | null>(null);
  const [quoting, setQuoting] = useState(false);
  const [now, setNow] = useState(Math.floor(Date.now() / 1000));

  useEffect(() => {
    const t = setInterval(() => setNow(Math.floor(Date.now() / 1000)), 1000);
    return () => clearInterval(t);
  }, []);

  const { data: hype, refetch: refetchHype } = useBalance({ address, query: { enabled: !!address } });
  const { data: tokenBal, refetch: refetchToken } = useReadContract({ address: token, abi: MemecoinAbi, functionName: 'balanceOf', args: [address ?? DEAD], query: { enabled: !!address } });
  const { data: allowance, refetch: refetchAllowance } = useReadContract({ address: token, abi: MemecoinAbi, functionName: 'allowance', args: [address ?? DEAD, router], query: { enabled: !!address && !!router } });
  const { data: feeBps } = useReadContract({
    address: site.addresses.feeCalculator as Address,
    abi: ZephyrFeeCalculatorAbi,
    functionName: 'currentSwapFee',
    args: [poolId, side === 'buy'],
    query: { enabled: !!site.addresses.feeCalculator, refetchInterval: 5000 },
  });

  const parsed = (() => {
    try {
      return amount ? parseUnits(amount as `${number}`, 18) : 0n;
    } catch {
      return 0n;
    }
  })();

  // Quote by simulating the router call against the live pool
  useEffect(() => {
    setQuote(null);
    if (!client || !router || parsed === 0n) return;
    let stale = false;
    setQuoting(true);
    const id = setTimeout(async () => {
      try {
        const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
        if (side === 'buy') {
          const from = address ?? DEAD;
          const sim = await client.simulateContract({
            account: from,
            address: router,
            abi: ZephyrRouterAbi,
            functionName: 'buy',
            args: [token, 0n, from, deadline],
            value: parsed,
            stateOverride: [{ address: from, balance: parsed + 10n ** 20n }],
          });
          if (!stale) setQuote({ out: sim.result, exact: true });
        } else if (address && allowance !== undefined && allowance >= parsed && tokenBal !== undefined && tokenBal >= parsed) {
          const sim = await client.simulateContract({ account: address, address: router, abi: ZephyrRouterAbi, functionName: 'sell', args: [token, parsed, 0n, address, deadline] });
          if (!stale) setQuote({ out: sim.result, exact: true });
        } else {
          const fee = Number(feeBps ?? 100) / 10_000;
          const est = (Number(parsed) / 1e18) * price * (1 - fee);
          if (!stale) setQuote({ out: parseUnits(est.toFixed(18) as `${number}`, 18), exact: false });
        }
      } catch {
        if (!stale) setQuote(null);
      } finally {
        if (!stale) setQuoting(false);
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(id);
    };
  }, [client, router, side, parsed, address, allowance, tokenBal, token, price, feeBps]);

  const notOpen = startsAt > now;
  const minOut = quote ? (quote.out * BigInt(Math.round((100 - slippage) * 100))) / 10_000n : 0n;
  const balance = side === 'buy' ? hype?.value : tokenBal;
  const tooMuch = balance !== undefined && parsed > balance;
  const needsApproval = side === 'sell' && parsed > 0n && (allowance ?? 0n) < parsed;

  async function submit() {
    if (!address || !quote) return;
    const deadline = BigInt(Math.floor(Date.now() / 1000) + 600);
    if (side === 'buy') {
      const r = await run(`Buy ${symbol}`, () => writeContractAsync({ address: router, abi: ZephyrRouterAbi, functionName: 'buy', args: [token, minOut, address, deadline], value: parsed }), `Bought ${symbol}`);
      if (r) setAmount('');
    } else {
      if (needsApproval) {
        const ok = await run(`Approve ${symbol}`, () => writeContractAsync({ address: token, abi: MemecoinAbi, functionName: 'approve', args: [router, maxUint256] }), `${symbol} approved for selling`);
        if (!ok) return;
        await refetchAllowance();
        return;
      }
      const r = await run(`Sell ${symbol}`, () => writeContractAsync({ address: router, abi: ZephyrRouterAbi, functionName: 'sell', args: [token, parsed, minOut, address, deadline] }), `Sold ${symbol}`);
      if (r) setAmount('');
    }
    refetchHype();
    refetchToken();
    onTraded?.();
  }

  const presets = side === 'buy' ? ['0.1', '0.5', '1', '5'] : ['25%', '50%', '75%', 'Max'];
  const pickPreset = (p: string) => {
    if (side === 'buy') return setAmount(p);
    if (!tokenBal) return;
    const share = p === 'Max' ? 100n : BigInt(parseInt(p));
    setAmount(formatUnits((tokenBal * share) / 100n, 18));
  };

  let cta = side === 'buy' ? `Buy ${symbol}` : needsApproval ? `Approve ${symbol} to sell` : `Sell ${symbol}`;
  let disabled = busy || !quote || parsed === 0n || tooMuch || notOpen;
  if (!address) cta = 'Connect a wallet to trade';
  else if (chainId !== ELYSIUM_CHAIN_ID) {
    cta = 'Switch to Elysium';
    disabled = false;
  } else if (notOpen) cta = 'Trading has not opened yet';
  else if (tooMuch) cta = `Not enough ${side === 'buy' ? 'HYPE' : symbol}`;
  else if (parsed === 0n) cta = 'Enter an amount';

  return (
    <div className="panel p-4 sm:p-5">
      <div className="grid grid-cols-2 p-1 rounded-full bg-night border border-haze relative">
        {(['buy', 'sell'] as const).map((s) => (
          <button key={s} onClick={() => { setSide(s); setAmount(''); }} className={`relative h-10 rounded-full font-medium capitalize ${side === s ? 'text-night' : 'text-mist'}`}>
            {side === s && <motion.span layoutId="swap-side" className={`absolute inset-0 rounded-full ${s === 'buy' ? 'bg-buy' : 'bg-sell'}`} transition={{ type: 'spring', stiffness: 420, damping: 36 }} />}
            <span className="relative">{s}</span>
          </button>
        ))}
      </div>

      <label className="mt-4 block">
        <span className="flex justify-between text-sm text-mist mb-1.5">
          <span>{side === 'buy' ? 'You pay' : 'You sell'}</span>
          {balance !== undefined && (
            <span className="num">
              Balance {fmtNum(Number(balance) / 1e18, 4)} {side === 'buy' ? 'HYPE' : symbol}
            </span>
          )}
        </span>
        <div className="relative">
          <input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.0" className="field h-14 text-xl num pr-20" />
          <span className="absolute right-4 top-1/2 -translate-y-1/2 text-mist">{side === 'buy' ? 'HYPE' : symbol}</span>
        </div>
      </label>
      <div className="mt-2 flex gap-2">
        {presets.map((p) => (
          <button key={p} onClick={() => pickPreset(p)} className="flex-1 h-8 rounded-lg border border-haze text-sm text-mist hover:text-cloud hover:border-lilac/60">
            {p}
          </button>
        ))}
      </div>

      <div className="mt-4 rounded-xl bg-night/70 border border-haze/70 p-3 text-sm flex flex-col gap-1.5">
        <div className="flex justify-between">
          <span className="text-mist">You receive{quote && !quote.exact ? ' (estimate)' : ''}</span>
          <AnimatePresence mode="wait">
            <motion.span key={quote ? quote.out.toString() : quoting ? 'q' : 'n'} initial={{ opacity: 0, y: 4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} className="num font-medium">
              {quoting && !quote ? 'Quoting…' : quote ? `${fmtNum(Number(quote.out) / 1e18, 4)} ${side === 'buy' ? symbol : 'HYPE'}` : '—'}
            </motion.span>
          </AnimatePresence>
        </div>
        <div className="flex justify-between">
          <span className="text-mist">Fee right now</span>
          <span className="num">{feeBps !== undefined ? pct(Number(feeBps)) : '—'}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-mist">Max slippage</span>
          <span className="flex gap-1">
            {[1, 3, 10].map((s) => (
              <button key={s} onClick={() => setSlippage(s)} className={`px-2 rounded-md num ${slippage === s ? 'bg-haze text-cloud' : 'text-mist'}`}>
                {s}%
              </button>
            ))}
          </span>
        </div>
      </div>

      <button
        className={`mt-4 w-full btn h-12 text-[16px] ${side === 'buy' ? 'bg-buy text-night hover:brightness-110' : 'bg-sell text-night hover:brightness-110'}`}
        disabled={!address ? true : disabled}
        onClick={() => (chainId !== ELYSIUM_CHAIN_ID ? switchChain({ chainId: ELYSIUM_CHAIN_ID }) : submit())}
      >
        {busy ? 'Working…' : cta}
      </button>
      {Number(feeBps ?? 0) > 500 && side === 'buy' && <p className="mt-3 text-sm text-lilac">Anti-snipe is on: the buy fee falls to the normal fee over the first minutes of trading.</p>}
    </div>
  );
}
