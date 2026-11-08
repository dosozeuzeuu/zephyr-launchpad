import { readFileSync } from 'node:fs';

import { sync } from '@/lib/server/indexer';
import { runKeeper } from '@/lib/server/keeper';
import { MemoryStore } from '@/lib/server/store';

const cfg = JSON.parse(readFileSync(process.env.WRITE_CONFIG!, 'utf8'));
const store = new MemoryStore();
console.log('sync', await sync(store, cfg, { budgetMs: 60_000 }));
const report = await runKeeper(store, cfg, '0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d');
for (const r of report) console.log(r.token, '|', r.action, '|', r.detail.slice(0, 90));
await sync(store, cfg, { budgetMs: 60_000 });
for (const t of await store.listTokens()) console.log(t.symbol, 'burned', (Number(t.burned) / 1e18).toFixed(0));
