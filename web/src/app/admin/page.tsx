'use client';

import { useEffect, useState } from 'react';
import { type Address, type Hex, isAddress } from 'viem';
import { useAccount, useChainId, usePublicClient, useSignMessage, useSwitchChain, useWalletClient, useWriteContract } from 'wagmi';

import { ZephyrDeployerAbi, ZephyrVaultAbi } from '@/artifacts';
import bytecodes from '@/artifacts/bytecode.json';
import { toast } from '@/components/Toaster';
import { DEFAULT_POOL_MANAGER, ELYSIUM_CHAIN_ID, PROTOCOL_WALLET, WHYPE } from '@/lib/chain';
import type { SiteConfig } from '@/lib/config';
import { buildDeployPlan } from '@/lib/deploy/plan';
import { shortAddr } from '@/lib/format';
import { useTx } from '@/lib/useTx';

import { useSite } from '../providers';

type Progress = { deployer?: Address; startBlock?: number; done: number };
const KEY = 'zephyr-deploy-progress';

export default function Admin() {
  const site = useSite();
  const { address } = useAccount();
  const chainId = useChainId();
  const { switchChain } = useSwitchChain();
  const client = usePublicClient();
  const { data: wallet } = useWalletClient();
  const { signMessageAsync } = useSignMessage();
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();

  const [net, setNet] = useState({ rpcUrl: site.rpcUrl, explorerUrl: site.explorerUrl, bridgeUrl: site.bridgeUrl });
  const [poolManager, setPoolManager] = useState<string>(site.addresses.poolManager ?? DEFAULT_POOL_MANAGER);
  const [keeper, setKeeper] = useState<string>('');
  const [progress, setProgress] = useState<Progress>({ done: 0 });
  const [checks, setChecks] = useState<{ pm?: boolean; whype?: boolean }>({});

  useEffect(() => {
    try {
      const p = JSON.parse(localStorage.getItem(KEY) ?? 'null');
      if (p) setProgress(p);
    } catch {}
  }, []);
  useEffect(() => {
    if (address && !keeper) setKeeper(address);
  }, [address, keeper]);
  const save = (p: Progress) => {
    setProgress(p);
    try {
      localStorage.setItem(KEY, JSON.stringify(p));
    } catch {}
  };

  const isAdmin = !!address && address.toLowerCase() === site.admin.toLowerCase();
  const onChain = chainId === ELYSIUM_CHAIN_ID;

  async function verifyChain() {
    if (!client || !isAddress(poolManager)) return;
    const [pmCode, wCode] = await Promise.all([client.getCode({ address: poolManager as Address }), client.getCode({ address: WHYPE })]);
    setChecks({ pm: !!pmCode && pmCode.length > 1000, whype: !!wCode && wCode.length > 100 });
  }
  useEffect(() => {
    if (onChain) verifyChain().catch(() => setChecks({ pm: false, whype: false }));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [onChain, poolManager, client]);

  async function saveConfig(cfg: SiteConfig) {
    const body = `Zephyr: save site config\n${JSON.stringify(cfg)}`;
    const message = `${body}\nAt: ${Math.floor(Date.now() / 1000)}`;
    const signature = await signMessageAsync({ message });
    const r = await fetch('/api/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ config: cfg, message, signature: signature as Hex }) });
    const j = await r.json();
    if (!r.ok) throw new Error(j.error ?? 'Save failed');
  }

  const plan = progress.deployer && isAddress(poolManager) && isAddress(keeper)
    ? buildDeployPlan({ deployer: progress.deployer, admin: site.admin, poolManager: poolManager as Address, whype: WHYPE, protocolFeeRecipient: PROTOCOL_WALLET, keeper: keeper as Address })
    : null;

  async function deployFactory() {
    if (!wallet || !client) return;
    const r = await run('Deploy the setup contract', () => wallet.deployContract({ abi: ZephyrDeployerAbi, bytecode: (bytecodes as Record<string, { bytecode: Hex }>).ZephyrDeployer.bytecode }), 'Setup contract deployed');
    if (r?.contractAddress) save({ deployer: r.contractAddress, startBlock: Number(r.blockNumber), done: 0 });
  }

  async function runBatch(i: number) {
    if (!plan || !progress.deployer) return;
    const b = plan.batches[i];
    const r = await run(`Step ${i + 2}: ${b.label}`, () => writeContractAsync({ address: progress.deployer!, abi: ZephyrDeployerAbi, functionName: 'run', args: [b.ops] }), `${b.label}: done`);
    if (r) save({ ...progress, done: i + 1 });
  }

  async function finish() {
    if (!plan || !client) return;
    for (const [name, a] of Object.entries(plan.addresses)) {
      const code = await client.getCode({ address: a });
      if (!code || code === '0x') {
        toast({ kind: 'err', title: `${name} is missing on-chain`, body: a });
        return;
      }
    }
    try {
      await saveConfig({ ...site, ...net, deployed: true, startBlock: progress.startBlock ?? 0, addresses: { ...plan.addresses, poolManager: poolManager as Address } });
      toast({ kind: 'ok', title: 'Zephyr is live', body: 'Launches and trading are open.' });
      setTimeout(() => location.assign('/'), 1200);
    } catch (e) {
      toast({ kind: 'err', title: 'Could not save the deployment', body: e instanceof Error ? e.message : String(e) });
    }
  }

  if (!address) return <Gate>Connect the admin wallet ({shortAddr(site.admin)}) to continue.</Gate>;
  if (!isAdmin) return <Gate>This page is for the admin wallet ({shortAddr(site.admin)}). You are connected as {shortAddr(address)}.</Gate>;

  return (
    <div className="pt-8 max-w-3xl flex flex-col gap-6">
      <div>
        <h1 className="font-display text-4xl font-extrabold tracking-tight">Admin</h1>
        <p className="mt-2 text-mist">Every step is signed by your wallet. Your keys never leave it.</p>
      </div>

      <Step n={1} title="Network settings" state={site.rpcUrl === net.rpcUrl && site.explorerUrl === net.explorerUrl ? 'saved' : 'edit'}>
        <p className="text-sm text-mist mb-3">Use the official Elysium RPC, explorer and bridge links. Save before deploying, so your wallet connects through this RPC.</p>
        {(['rpcUrl', 'explorerUrl', 'bridgeUrl'] as const).map((k) => (
          <label key={k} className="block mb-3">
            <span className="label">{k === 'rpcUrl' ? 'RPC URL' : k === 'explorerUrl' ? 'Explorer URL' : 'Bridge URL'}</span>
            <input className="field" value={net[k]} onChange={(e) => setNet({ ...net, [k]: e.target.value.trim() })} />
          </label>
        ))}
        <button className="btn-ghost" disabled={busy} onClick={() => saveConfig({ ...site, ...net }).then(() => location.reload()).catch((e) => toast({ kind: 'err', title: 'Save failed', body: String(e.message ?? e) }))}>
          Sign and save network settings
        </button>
      </Step>

      {site.deployed ? (
        <Step n={2} title="Live" state="saved">
          <p className="text-mist">Zephyr is deployed. Contracts are listed on the docs page.</p>
          <KeeperForm vault={site.addresses.vault as Address} />
        </Step>
      ) : (
        <Step n={2} title="Deploy the contracts" state={progress.done === 3 ? 'saved' : 'edit'}>
          {!onChain ? (
            <button className="btn-primary" onClick={() => switchChain({ chainId: ELYSIUM_CHAIN_ID })}>Switch your wallet to Elysium</button>
          ) : (
            <div className="flex flex-col gap-4">
              <label>
                <span className="label">Uniswap v4 PoolManager</span>
                <input className="field num" value={poolManager} onChange={(e) => setPoolManager(e.target.value.trim())} />
                <span className={`text-sm ${checks.pm ? 'text-buy' : 'text-sell'}`}>{checks.pm === undefined ? 'Checking…' : checks.pm ? 'Contract found on Elysium' : 'No contract at this address on Elysium'}</span>
              </label>
              <p className={`text-sm ${checks.whype ? 'text-buy' : 'text-sell'}`}>Wrapped HYPE {shortAddr(WHYPE)}: {checks.whype === undefined ? 'checking…' : checks.whype ? 'found' : 'not found'}</p>
              <label>
                <span className="label">Keeper wallet (runs buybacks and holder rounds)</span>
                <input className="field num" value={keeper} onChange={(e) => setKeeper(e.target.value.trim())} />
                <span className="text-sm text-mist">Use a separate hot wallet whose key you put in Vercel as KEEPER_PRIVATE_KEY. You can add more keepers later.</span>
              </label>
              <p className="text-sm text-mist">Protocol fees go to {shortAddr(PROTOCOL_WALLET)}. You will own every contract.</p>

              <ol className="flex flex-col gap-2 mt-2">
                <Action label="1. Deploy the setup contract" done={!!progress.deployer} disabled={busy || !checks.pm || !checks.whype || !!progress.deployer} onClick={deployFactory} />
                {['Core contracts', 'Uniswap v4 hook', 'Fees, vault, router and handoff'].map((l, i) => (
                  <Action key={l} label={`${i + 2}. ${l}`} done={progress.done > i} disabled={busy || !plan || progress.done !== i} onClick={() => runBatch(i)} />
                ))}
                <Action label="5. Verify and open Zephyr" done={false} disabled={busy || progress.done !== 3} onClick={finish} />
              </ol>
              {progress.deployer && (
                <button className="text-sm text-mist underline self-start" onClick={() => confirm('Start the deployment over? Only do this if a step failed permanently.') && save({ done: 0 })}>
                  Start over
                </button>
              )}
            </div>
          )}
        </Step>
      )}
    </div>
  );
}

function KeeperForm({ vault }: { vault: Address }) {
  const [k, setK] = useState('');
  const { writeContractAsync } = useWriteContract();
  const { run, busy } = useTx();
  return (
    <div className="mt-4 flex flex-col sm:flex-row gap-2">
      <input className="field num" placeholder="Keeper address" value={k} onChange={(e) => setK(e.target.value.trim())} />
      <button className="btn-ghost shrink-0" disabled={busy || !isAddress(k)} onClick={() => run('Add keeper', () => writeContractAsync({ address: vault, abi: ZephyrVaultAbi, functionName: 'setKeeper', args: [k as Address, true] }))}>
        Add keeper
      </button>
    </div>
  );
}

function Gate({ children }: { children: React.ReactNode }) {
  return <p className="pt-16 text-center text-mist max-w-md mx-auto">{children}</p>;
}

function Step({ n, title, state, children }: { n: number; title: string; state: 'edit' | 'saved'; children: React.ReactNode }) {
  return (
    <section className="panel p-5 sm:p-6">
      <h2 className="font-display text-xl font-bold flex items-center gap-3">
        <span className={`h-7 w-7 rounded-full grid place-items-center text-sm ${state === 'saved' ? 'bg-buy text-night' : 'bg-haze'}`}>{state === 'saved' ? '✓' : n}</span>
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function Action({ label, done, disabled, onClick }: { label: string; done: boolean; disabled: boolean; onClick: () => void }) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-haze px-4 py-3">
      <span className={done ? 'text-mist line-through' : ''}>{label}</span>
      {done ? <span className="text-buy text-sm">Done</span> : <button className="btn-primary h-9 px-4 text-sm" disabled={disabled} onClick={onClick}>Sign</button>}
    </li>
  );
}
