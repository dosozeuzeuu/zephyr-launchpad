import { DEFAULT_CONFIG, type SiteConfig } from '@/lib/config';

import { getStore } from './store';

let memo: { at: number; cfg: SiteConfig } | null = null;

/** The live config: saved deployment from the database, falling back to env defaults. */
export async function loadConfig(): Promise<SiteConfig> {
  if (memo && Date.now() - memo.at < 15_000) return memo.cfg;
  const store = getStore();
  let cfg = DEFAULT_CONFIG;
  if (store) {
    try {
      const saved = await store.getConfig();
      if (saved) cfg = { ...DEFAULT_CONFIG, ...saved, addresses: { ...saved.addresses } };
    } catch {}
  }
  memo = { at: Date.now(), cfg };
  return cfg;
}

export function clearConfigCache() {
  memo = null;
}
