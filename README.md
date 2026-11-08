# Zephyr

A token launchpad on Elysium (chain 99901). Every launch creates a token and its Uniswap v4 pool in one
transaction; a hook takes the creator-chosen fee (1–5%) and splits it: 30% protocol, 70% between the
creator, buyback-and-burn, and holder rewards.

- `contracts/` — Solidity (Foundry). Adapted from the MIT-licensed [Flaunch](https://github.com/flayerlabs/flaunchgg-contracts)
  protocol; Zephyr additions live in `contracts/src/zephyr/`. Tests: `contracts/test/zephyr/Zephyr.t.sol`.
- `web/` — Next.js site, API, indexer and keeper. Deploy plan: `web/src/lib/deploy/plan.ts`.

## Contracts

`contracts/lib` is not committed. Restore it with `git clone https://github.com/flayerlabs/flaunchgg-contracts`
and copy its `lib/` folder in, then `forge test --match-path 'test/zephyr/*'`.

## Hosting

1. Vercel project with root directory `web`, env vars from `web/.env.example`.
2. Supabase schema: `web/supabase/schema.sql`.
3. Open `/admin` with the admin wallet: save network settings, then sign the 4 deploy steps.
4. Schedule `GET /api/keeper` (header `Authorization: Bearer $CRON_SECRET`) every couple of minutes.

## Local end-to-end

```
anvil --port 8546 --chain-id 99901 &
cd web && CHAIN_ID=99901 npx tsx scripts/e2e-local.ts
```

The contracts are not audited.
