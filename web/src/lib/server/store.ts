/**
 * Storage for the indexer and API. Production uses Supabase (Postgres); the local end-to-end
 * test uses the in-memory store, which implements the same queries.
 */
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

import type { SiteConfig } from '@/lib/config';

export type TokenRow = {
  address: string;
  pool_id: string;
  token_id: number;
  creator: string;
  name: string;
  symbol: string;
  token_uri: string;
  image: string | null;
  description: string | null;
  website: string | null;
  twitter: string | null;
  telegram: string | null;
  swap_fee: number;
  snipe_fee: number;
  snipe_duration: number;
  starts_at: number;
  creator_share: number; // bps of the creator side (70%) paid to the creator
  holder_share: number; // bps of the remainder paid to holders (rest is buyback)
  native_is_zero: boolean;
  created_block: number;
  created_at: number;
  price: number; // HYPE per token
  volume: number; // all-time HYPE volume
  trades: number;
  last_trade_at: number;
  burned: string; // tokens burned by buybacks (wei, decimal string)
};

export type TradeRow = {
  id: string; // tx:logIndex
  token: string;
  block: number;
  ts: number;
  tx: string;
  trader: string;
  is_buy: boolean;
  hype: number;
  tokens: number;
  price: number;
};

export type TokenStats = TokenRow & { volume_24h: number; change_24h: number; holders: number };

export type BalanceDelta = { token: string; holder: string; delta: string };

export interface Store {
  getConfig(): Promise<SiteConfig | null>;
  setConfig(c: SiteConfig): Promise<void>;
  getCursor(): Promise<number>;
  setCursor(block: number): Promise<void>;
  /** Takes a short lease so only one sync runs at a time. */
  acquireLock(ms: number): Promise<boolean>;
  releaseLock(): Promise<void>;
  upsertTokens(rows: TokenRow[]): Promise<void>;
  updateToken(address: string, patch: Partial<TokenRow>): Promise<void>;
  insertTrades(rows: TradeRow[]): Promise<void>;
  applyBalances(deltas: BalanceDelta[]): Promise<void>;
  tokenAddresses(): Promise<string[]>;
  listTokens(): Promise<TokenStats[]>;
  getToken(address: string): Promise<TokenStats | null>;
  trades(opts: { token?: string; limit: number }): Promise<TradeRow[]>;
  tradesSince(token: string, since: number): Promise<TradeRow[]>;
  holders(token: string, limit: number): Promise<{ holder: string; balance: string }[]>;
}

// ---------------------------------------------------------------------------------- Supabase

class SupabaseStore implements Store {
  constructor(private db: SupabaseClient) {}

  async getConfig() {
    const { data } = await this.db.from('kv').select('value').eq('key', 'config').maybeSingle();
    return (data?.value as SiteConfig) ?? null;
  }
  async setConfig(c: SiteConfig) {
    const { error } = await this.db.from('kv').upsert({ key: 'config', value: c });
    if (error) throw error;
  }
  async getCursor() {
    const { data } = await this.db.from('kv').select('value').eq('key', 'cursor').maybeSingle();
    return Number(data?.value ?? 0);
  }
  async setCursor(block: number) {
    const { error } = await this.db.from('kv').upsert({ key: 'cursor', value: block });
    if (error) throw error;
  }
  async acquireLock(ms: number) {
    const { data, error } = await this.db.rpc('acquire_sync_lock', { lease_ms: ms });
    if (error) throw error;
    return Boolean(data);
  }
  async releaseLock() {
    await this.db.rpc('release_sync_lock');
  }
  async upsertTokens(rows: TokenRow[]) {
    if (!rows.length) return;
    const { error } = await this.db.from('tokens').upsert(rows, { onConflict: 'address', ignoreDuplicates: true });
    if (error) throw error;
  }
  async updateToken(address: string, patch: Partial<TokenRow>) {
    const { error } = await this.db.from('tokens').update(patch).eq('address', address);
    if (error) throw error;
  }
  async insertTrades(rows: TradeRow[]) {
    if (!rows.length) return;
    const { error } = await this.db.rpc('record_trades', { rows });
    if (error) throw error;
  }
  async applyBalances(deltas: BalanceDelta[]) {
    if (!deltas.length) return;
    const { error } = await this.db.rpc('apply_balance_deltas', { rows: deltas });
    if (error) throw error;
  }
  async tokenAddresses() {
    const { data, error } = await this.db.from('tokens').select('address');
    if (error) throw error;
    return (data ?? []).map((r) => r.address as string);
  }
  async listTokens() {
    const { data, error } = await this.db.from('token_stats').select('*').order('created_at', { ascending: false }).limit(500);
    if (error) throw error;
    return (data ?? []) as TokenStats[];
  }
  async getToken(address: string) {
    const { data } = await this.db.from('token_stats').select('*').eq('address', address.toLowerCase()).maybeSingle();
    return (data as TokenStats) ?? null;
  }
  async trades({ token, limit }: { token?: string; limit: number }) {
    let q = this.db.from('trades').select('*').order('block', { ascending: false }).order('id', { ascending: false }).limit(limit);
    if (token) q = q.eq('token', token.toLowerCase());
    const { data, error } = await q;
    if (error) throw error;
    return (data ?? []) as TradeRow[];
  }
  async tradesSince(token: string, since: number) {
    const { data, error } = await this.db.from('trades').select('ts,price,hype,is_buy').eq('token', token.toLowerCase()).gte('ts', since).order('ts').limit(20000);
    if (error) throw error;
    return (data ?? []) as TradeRow[];
  }
  async holders(token: string, limit: number) {
    const { data, error } = await this.db.from('balances').select('holder,balance').eq('token', token.toLowerCase()).gt('balance', 0).order('balance', { ascending: false }).limit(limit);
    if (error) throw error;
    return (data ?? []).map((r) => ({ holder: r.holder as string, balance: String(r.balance) }));
  }
}

// ---------------------------------------------------------------------------------- memory

export class MemoryStore implements Store {
  config: SiteConfig | null = null;
  cursor = 0;
  tokens = new Map<string, TokenRow>();
  tradeRows: TradeRow[] = [];
  balances = new Map<string, bigint>();

  async getConfig() { return this.config; }
  async setConfig(c: SiteConfig) { this.config = c; }
  async getCursor() { return this.cursor; }
  async setCursor(b: number) { this.cursor = b; }
  async acquireLock() { return true; }
  async releaseLock() {}
  async upsertTokens(rows: TokenRow[]) { for (const r of rows) if (!this.tokens.has(r.address)) this.tokens.set(r.address, r); }
  async updateToken(a: string, p: Partial<TokenRow>) { const t = this.tokens.get(a); if (t) Object.assign(t, p); }
  async insertTrades(rows: TradeRow[]) {
    for (const r of rows) {
      if (this.tradeRows.some((t) => t.id === r.id)) continue;
      this.tradeRows.push(r);
      const t = this.tokens.get(r.token);
      if (t) { t.price = r.price; t.volume += r.hype; t.trades += 1; t.last_trade_at = r.ts; }
    }
  }
  async applyBalances(ds: BalanceDelta[]) {
    for (const d of ds) { const k = `${d.token}:${d.holder}`; this.balances.set(k, (this.balances.get(k) ?? 0n) + BigInt(d.delta)); }
  }
  async tokenAddresses() { return [...this.tokens.keys()]; }
  private stats(t: TokenRow): TokenStats {
    const day = Date.now() / 1000 - 86400;
    const recent = this.tradeRows.filter((r) => r.token === t.address && r.ts >= day);
    const first = recent[0]?.price;
    const holders = [...this.balances.entries()].filter(([k, v]) => k.startsWith(t.address + ':') && v > 0n).length;
    return { ...t, volume_24h: recent.reduce((s, r) => s + r.hype, 0), change_24h: first ? (t.price - first) / first : 0, holders };
  }
  async listTokens() { return [...this.tokens.values()].map((t) => this.stats(t)); }
  async getToken(a: string) { const t = this.tokens.get(a.toLowerCase()); return t ? this.stats(t) : null; }
  async trades({ token, limit }: { token?: string; limit: number }) {
    return this.tradeRows.filter((r) => !token || r.token === token.toLowerCase()).sort((x, y) => y.block - x.block).slice(0, limit);
  }
  async tradesSince(token: string, since: number) { return this.tradeRows.filter((r) => r.token === token.toLowerCase() && r.ts >= since).sort((x, y) => x.ts - y.ts); }
  async holders(token: string, limit: number) {
    return [...this.balances.entries()]
      .filter(([k, v]) => k.startsWith(token.toLowerCase() + ':') && v > 0n)
      .sort((a, b) => (b[1] > a[1] ? 1 : -1))
      .slice(0, limit)
      .map(([k, v]) => ({ holder: k.split(':')[1], balance: v.toString() }));
  }
}

// ---------------------------------------------------------------------------------- factory

let cached: Store | null = null;

export function getStore(): Store | null {
  if (cached) return cached;
  // Local preview: an in-memory index over a local chain, configured from a JSON file
  if (process.env.ZEPHYR_LOCAL_CONFIG) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fs = require('node:fs') as typeof import('node:fs');
    const m = new MemoryStore();
    m.config = JSON.parse(fs.readFileSync(process.env.ZEPHYR_LOCAL_CONFIG, 'utf8'));
    cached = m;
    return cached;
  }
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  cached = new SupabaseStore(createClient(url, key, { auth: { persistSession: false } }));
  return cached;
}

export function setStore(s: Store) {
  cached = s;
}
