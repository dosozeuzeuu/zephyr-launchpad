'use client';

import { useQuery } from '@tanstack/react-query';

import type { TokenStats, TradeRow } from '@/lib/server/store';

export type TapeTrade = TradeRow & { symbol?: string; image?: string | null };
export type Candle = { time: number; open: number; high: number; low: number; close: number; volume: number };
export type TokenDetail = { token: TokenStats; trades: TradeRow[]; holders: { holder: string; balance: string }[]; candles: Candle[] };

async function get<T>(url: string): Promise<T> {
  const r = await fetch(url, { cache: 'no-store' });
  if (!r.ok) throw new Error(`${r.status}`);
  return r.json();
}

export function useTokens() {
  return useQuery({ queryKey: ['tokens'], queryFn: () => get<{ tokens: TokenStats[] }>('/api/tokens').then((r) => r.tokens), refetchInterval: 5000 });
}

export function useTape() {
  return useQuery({ queryKey: ['tape'], queryFn: () => get<{ trades: TapeTrade[] }>('/api/trades').then((r) => r.trades), refetchInterval: 3000 });
}

export function useToken(address: string, interval: string) {
  return useQuery({
    queryKey: ['token', address.toLowerCase(), interval],
    queryFn: () => get<TokenDetail>(`/api/token/${address}?i=${interval}`),
    refetchInterval: 3000,
    retry: (n) => n < 20,
    retryDelay: 2500,
    placeholderData: (prev) => prev,
  });
}

export const mcap = (price: number) => price * 1_000_000_000;
