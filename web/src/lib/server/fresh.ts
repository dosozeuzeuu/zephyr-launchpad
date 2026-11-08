import { loadConfig } from './config';
import { sync } from './indexer';
import { getStore } from './store';

let lastRun = 0;

/** Catches the index up if it hasn't been touched in a few seconds, within a short time budget. */
export async function keepFresh(budgetMs = 3500) {
  const store = getStore();
  if (!store) return;
  if (Date.now() - lastRun < 3000) return;
  lastRun = Date.now();
  const cfg = await loadConfig();
  try {
    await sync(store, cfg, { budgetMs });
  } catch (e) {
    console.error('sync failed', e);
  }
}
