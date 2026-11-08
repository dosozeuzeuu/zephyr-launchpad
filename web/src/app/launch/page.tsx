'use client';

/* eslint-disable @next/next/no-img-element */
import { AnimatePresence, motion } from 'framer-motion';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { type Address, decodeEventLog, encodeAbiParameters, parseEther } from 'viem';
import { useAccount, useBalance, useChainId, useReadContract, useSwitchChain, useWriteContract } from 'wagmi';

import { PositionManagerAbi } from '@/artifacts';
import { toast } from '@/components/Toaster';
import { TokenAvatar } from '@/components/TokenAvatar';
import { ELYSIUM_CHAIN_ID } from '@/lib/chain';
import { fmtNum } from '@/lib/format';
import { useTx } from '@/lib/useTx';

import { useSite } from '../providers';

const SPLITS = [
  { name: 'All to me', v: [100, 0, 0] },
  { name: 'Balanced', v: [40, 30, 30] },
  { name: 'Community', v: [0, 50, 50] },
  { name: 'Burn it all', v: [0, 100, 0] },
] as const;

const SUPPLY = 1_000_000_000;

export default function Launch() {
  const site = useSite();
  const nav = useRouter();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const { data: bal } = useBalance({ address, query: { enabled: !!address } });
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();
  const pm = site.addresses.positionManager as Address | undefined;

  const [name, setName] = useState('');
  const [symbol, setSymbol] = useState('');
  const [description, setDescription] = useState('');
  const [image, setImage] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [links, setLinks] = useState({ website: '', twitter: '', telegram: '' });
  const [fee, setFee] = useState(2);
  const [split, setSplit] = useState<[number, number, number]>([40, 30, 30]);
  const [snipe, setSnipe] = useState(false);
  const [snipeFee, setSnipeFee] = useState(20);
  const [snipeMin, setSnipeMin] = useState(5);
  const [schedule, setSchedule] = useState(false);
  const [openAt, setOpenAt] = useState('');
  const [devBuy, setDevBuy] = useState('0.05');
  const [uploading, setUploading] = useState(false);

  const { data: startCap } = useReadContract({
    address: pm,
    abi: PositionManagerAbi,
    functionName: 'getFlaunchingMarketCap',
    args: [encodeAbiParameters([{ type: 'uint256' }], [0n])],
    query: { enabled: !!pm },
  });
  const capHype = startCap ? Number(startCap) / 1e18 : 40;

  const dev = Number(devBuy) || 0;
  const devTokens = (SUPPLY * dev) / (capHype + dev);
  const splitSum = split[0] + split[1] + split[2];

  const errors = useMemo(() => {
    const e: string[] = [];
    if (!name.trim()) e.push('Give the token a name.');
    if (!/^[A-Za-z0-9$]{1,12}$/.test(symbol)) e.push('The ticker needs 1–12 letters or numbers.');
    if (splitSum !== 100) e.push(`The split adds up to ${splitSum}%, it needs to be 100%.`);
    if (dev < 0.001) e.push('The dev buy needs at least 0.001 HYPE.');
    if (snipe && snipeFee <= fee) e.push('The anti-snipe fee must start above the swap fee.');
    if (schedule) {
      const t = new Date(openAt).getTime() / 1000;
      const now = Date.now() / 1000;
      if (!openAt || t <= now) e.push('Pick an opening time in the future.');
      else if (t > now + 30 * 86400) e.push('Trading can open at most 30 days from now.');
    }
    for (const [k, v] of Object.entries(links)) if (v && !/^https:\/\//.test(v)) e.push(`The ${k} link must start with https://`);
    return e;
  }, [name, symbol, splitSum, dev, snipe, snipeFee, fee, schedule, openAt, links]);

  function pickImage(f: File | null) {
    setImage(f);
    setPreview(f ? URL.createObjectURL(f) : null);
  }

  async function launch() {
    if (!address || !pm || errors.length) return;
    if (bal && bal.value < parseEther(devBuy as `${number}`)) {
      toast({ kind: 'err', title: 'Not enough HYPE for the dev buy', body: 'Bridge HYPE to Elysium first.' });
      return;
    }

    setUploading(true);
    let tokenUri = '';
    try {
      const fd = new FormData();
      fd.set('name', name.trim());
      fd.set('symbol', symbol.toUpperCase());
      fd.set('description', description);
      for (const [k, v] of Object.entries(links)) fd.set(k, v);
      if (image) fd.set('image', image);
      const r = await fetch('/api/upload', { method: 'POST', body: fd });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error ?? 'Upload failed');
      tokenUri = j.tokenUri;
    } catch (e) {
      toast({ kind: 'err', title: 'Could not save the token details', body: e instanceof Error ? e.message : String(e) });
      setUploading(false);
      return;
    }
    setUploading(false);

    const creatorShare = split[0] * 100;
    const rest = split[1] + split[2];
    const holderShare = rest === 0 ? 0 : Math.round((split[2] / rest) * 10_000);
    const feeParams = encodeAbiParameters(
      [{ type: 'tuple', components: [{ type: 'uint24' }, { type: 'uint24' }, { type: 'uint32' }, { type: 'uint16' }] }],
      [[Math.round(fee * 100), snipe ? snipeFee * 100 : 0, snipe ? snipeMin * 60 : 0, holderShare]],
    );
    const premine = parseEther((devTokens * 0.995).toFixed(6) as `${number}`);
    const flaunchAt = schedule ? BigInt(Math.floor(new Date(openAt).getTime() / 1000)) : 0n;

    const receipt = await run(
      `Launch ${symbol.toUpperCase()}`,
      () =>
        writeContractAsync({
          address: pm,
          abi: PositionManagerAbi,
          functionName: 'flaunch',
          args: [
            {
              name: name.trim(),
              symbol: symbol.toUpperCase(),
              tokenUri,
              premineAmount: premine,
              creator: address,
              creatorFeeAllocation: creatorShare,
              flaunchAt,
              initialPriceParams: encodeAbiParameters([{ type: 'uint256' }], [0n]),
              feeCalculatorParams: feeParams,
            },
          ],
          value: parseEther(devBuy as `${number}`),
        }),
      `${symbol.toUpperCase()} is live`,
    );
    if (!receipt) return;
    for (const log of receipt.logs) {
      try {
        const ev = decodeEventLog({ abi: PositionManagerAbi, data: log.data, topics: log.topics });
        if (ev.eventName === 'PoolCreated') return nav.push(`/token/${ev.args._memecoin.toLowerCase()}`);
      } catch {}
    }
    nav.push('/');
  }

  const ready = !!address && chainId === ELYSIUM_CHAIN_ID && !!pm && errors.length === 0;

  return (
    <div className="pt-8 grid lg:grid-cols-[1fr_360px] gap-8 items-start">
      <div className="flex flex-col gap-8 min-w-0">
        <div>
          <h1 className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight">Launch a token</h1>
          <p className="mt-3 text-mist max-w-[56ch] leading-relaxed">
            One transaction creates the token, its Uniswap pool and its fee routing. All 1,000,000,000 tokens go into the pool, which opens at a {fmtNum(capHype, 0)} HYPE market cap. There is no launch fee beyond gas.
          </p>
        </div>

        <Section title="The token">
          <div className="grid sm:grid-cols-[120px_1fr] gap-5">
            <label className="group relative h-[120px] w-[120px] rounded-2xl border border-dashed border-haze grid place-items-center cursor-pointer overflow-hidden hover:border-lilac transition-colors">
              {preview ? <img src={preview} alt="" className="absolute inset-0 h-full w-full object-cover" /> : <span className="text-sm text-mist text-center px-3">Add an image</span>}
              <input type="file" accept="image/png,image/jpeg,image/webp,image/gif" className="sr-only" onChange={(e) => pickImage(e.target.files?.[0] ?? null)} />
            </label>
            <div className="grid sm:grid-cols-2 gap-4">
              <label>
                <span className="label">Name</span>
                <input className="field" value={name} maxLength={40} onChange={(e) => setName(e.target.value)} placeholder="West Wind" />
              </label>
              <label>
                <span className="label">Ticker</span>
                <input className="field uppercase" value={symbol} maxLength={12} onChange={(e) => setSymbol(e.target.value.replace(/\s/g, ''))} placeholder="WEST" />
              </label>
              <label className="sm:col-span-2">
                <span className="label">Description (optional)</span>
                <textarea className="field h-24 py-3 resize-none" value={description} maxLength={1000} onChange={(e) => setDescription(e.target.value)} placeholder="What is it, and who is it for?" />
              </label>
            </div>
          </div>
          <div className="grid sm:grid-cols-3 gap-4 mt-4">
            {(['website', 'twitter', 'telegram'] as const).map((k) => (
              <label key={k}>
                <span className="label">{k === 'twitter' ? 'X' : k[0].toUpperCase() + k.slice(1)} (optional)</span>
                <input className="field" value={links[k]} onChange={(e) => setLinks({ ...links, [k]: e.target.value.trim() })} placeholder="https://" />
              </label>
            ))}
          </div>
        </Section>

        <Section title="Trading fee" hint="Paid on every trade, fixed for the life of the pool.">
          <div className="flex items-center gap-4">
            <input type="range" min={1} max={5} step={0.5} value={fee} onChange={(e) => setFee(Number(e.target.value))} className="flex-1 accent-[#B7A8FF]" aria-label="Trading fee" />
            <span className="num font-display text-2xl font-bold w-16 text-right">{fee}%</span>
          </div>
        </Section>

        <Section title="Who earns the fee" hint="70% of every fee follows this split, which can never be changed. The other 30% goes to the protocol.">
          <div className="flex flex-wrap gap-2 mb-4">
            {SPLITS.map((s) => {
              const on = s.v.every((x, i) => x === split[i]);
              return (
                <button key={s.name} onClick={() => setSplit([...s.v] as [number, number, number])} className={`px-4 h-9 rounded-full border text-sm transition-colors ${on ? 'bg-lilac text-night border-lilac' : 'border-haze text-mist hover:text-cloud'}`}>
                  {s.name}
                </button>
              );
            })}
          </div>
          <div className="grid grid-cols-3 gap-3">
            {['You', 'Buyback and burn', 'Holders'].map((label, i) => (
              <label key={label}>
                <span className="label">{label}</span>
                <div className="relative">
                  <input
                    inputMode="numeric"
                    className="field num pr-8"
                    value={split[i]}
                    onChange={(e) => {
                      const v = Math.max(0, Math.min(100, Number(e.target.value.replace(/\D/g, '')) || 0));
                      const next = [...split] as [number, number, number];
                      next[i] = v;
                      setSplit(next);
                    }}
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-mist">%</span>
                </div>
              </label>
            ))}
          </div>
          <div className="mt-3 flex h-2.5 rounded-full overflow-hidden bg-haze">
            <motion.span animate={{ width: `${split[0]}%` }} className="bg-lilac" />
            <motion.span animate={{ width: `${split[1]}%` }} className="bg-sell" />
            <motion.span animate={{ width: `${split[2]}%` }} className="bg-buy" />
          </div>
        </Section>

        <Section title="Launch options">
          <Toggle on={snipe} set={setSnipe} label="Anti-snipe" hint="Buys start at a higher fee that falls to your swap fee, making bot snipes expensive." />
          <AnimatePresence initial={false}>
            {snipe && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <div className="grid sm:grid-cols-2 gap-4 pt-4">
                  <label>
                    <span className="label">Starting buy fee: {snipeFee}%</span>
                    <input type="range" min={Math.ceil(fee) + 1} max={30} value={snipeFee} onChange={(e) => setSnipeFee(Number(e.target.value))} className="w-full accent-[#B7A8FF]" />
                  </label>
                  <label>
                    <span className="label">Falls to {fee}% over: {snipeMin} min</span>
                    <input type="range" min={1} max={15} value={snipeMin} onChange={(e) => setSnipeMin(Number(e.target.value))} className="w-full accent-[#B7A8FF]" />
                  </label>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
          <div className="h-px bg-haze my-5" />
          <Toggle on={schedule} set={setSchedule} label="Schedule the opening" hint="The pool is created now, and trading opens at the time you pick, up to 30 days away." />
          <AnimatePresence initial={false}>
            {schedule && (
              <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                <input type="datetime-local" className="field mt-4 sm:max-w-xs" value={openAt} onChange={(e) => setOpenAt(e.target.value)} />
              </motion.div>
            )}
          </AnimatePresence>
        </Section>

        <Section title="Dev buy" hint="Buy the first tokens yourself in the launch transaction, at the opening price.">
          <div className="relative sm:max-w-xs">
            <input inputMode="decimal" className="field num pr-16" value={devBuy} onChange={(e) => setDevBuy(e.target.value.replace(/[^0-9.]/g, ''))} />
            <span className="absolute right-4 top-1/2 -translate-y-1/2 text-mist">HYPE</span>
          </div>
          <p className="mt-2 text-sm text-mist num">
            About {fmtNum(devTokens, 2)} {symbol.toUpperCase() || 'tokens'} ({((devTokens / SUPPLY) * 100).toFixed(2)}% of supply)
          </p>
        </Section>
      </div>

      <aside className="lg:sticky lg:top-24 flex flex-col gap-4">
        <div className="panel p-5">
          <p className="text-sm text-mist">Preview</p>
          <div className="mt-3 flex items-center gap-3">
            {preview ? <img src={preview} alt="" className="h-14 w-14 rounded-xl object-cover" /> : <TokenAvatar symbol={symbol || '??'} size={56} />}
            <div className="min-w-0">
              <p className="font-display text-xl font-bold truncate">{name || 'Your token'}</p>
              <p className="text-mist">{symbol.toUpperCase() || 'TICKER'}</p>
            </div>
          </div>
          <dl className="mt-4 text-sm grid grid-cols-2 gap-y-1.5">
            <dt className="text-mist">Opening cap</dt>
            <dd className="text-right num">{fmtNum(capHype, 0)} HYPE</dd>
            <dt className="text-mist">Swap fee</dt>
            <dd className="text-right num">{fee}%</dd>
            <dt className="text-mist">You earn</dt>
            <dd className="text-right num">{((fee * 0.7 * split[0]) / 100).toFixed(2)}% of volume</dd>
            <dt className="text-mist">Dev buy</dt>
            <dd className="text-right num">{dev || 0} HYPE</dd>
          </dl>
          {errors.length > 0 && (name || symbol) && (
            <ul className="mt-4 text-sm text-sell flex flex-col gap-1">
              {errors.map((e) => (
                <li key={e}>{e}</li>
              ))}
            </ul>
          )}
          <button
            className="btn-primary w-full mt-5 h-12 text-[16px]"
            disabled={busy || uploading || (!!address && chainId === ELYSIUM_CHAIN_ID && !ready)}
            onClick={() => (!address ? undefined : chainId !== ELYSIUM_CHAIN_ID ? switchChain({ chainId: ELYSIUM_CHAIN_ID }) : launch())}
          >
            {!site.deployed ? 'Launches open soon' : !address ? 'Connect a wallet to launch' : chainId !== ELYSIUM_CHAIN_ID ? 'Switch to Elysium' : uploading ? 'Saving details…' : busy ? 'Launching…' : `Launch ${symbol.toUpperCase() || 'token'}`}
          </button>
        </div>
      </aside>
    </div>
  );
}

function Section({ title, hint, children }: { title: string; hint?: string; children: React.ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold">{title}</h2>
      {hint && <p className="mt-1 text-sm text-mist max-w-[60ch]">{hint}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Toggle({ on, set, label, hint }: { on: boolean; set: (v: boolean) => void; label: string; hint: string }) {
  return (
    <button type="button" role="switch" aria-checked={on} onClick={() => set(!on)} className="w-full flex items-start gap-4 text-left">
      <span className={`mt-0.5 relative h-6 w-11 shrink-0 rounded-full transition-colors ${on ? 'bg-lilac' : 'bg-haze'}`}>
        <motion.span layout transition={{ type: 'spring', stiffness: 500, damping: 32 }} className={`absolute top-0.5 h-5 w-5 rounded-full bg-cloud ${on ? 'right-0.5' : 'left-0.5'}`} />
      </span>
      <span>
        <span className="block font-medium">{label}</span>
        <span className="block text-sm text-mist">{hint}</span>
      </span>
    </button>
  );
}
