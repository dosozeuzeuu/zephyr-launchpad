-- Zephyr indexer schema. Only the server (service role) writes; the site reads through the API.

create table if not exists kv (
  key text primary key,
  value jsonb not null,
  updated_at timestamptz not null default now()
);

create table if not exists tokens (
  address text primary key,
  pool_id text not null,
  token_id bigint not null,
  creator text not null,
  name text not null,
  symbol text not null,
  token_uri text not null default '',
  image text,
  description text,
  website text,
  twitter text,
  telegram text,
  swap_fee int not null,
  snipe_fee int not null default 0,
  snipe_duration int not null default 0,
  starts_at bigint not null,
  creator_share int not null,
  holder_share int not null,
  native_is_zero boolean not null,
  created_block bigint not null,
  created_at bigint not null,
  price double precision not null default 0,
  volume double precision not null default 0,
  trades int not null default 0,
  last_trade_at bigint not null default 0,
  burned numeric not null default 0
);
create index if not exists tokens_created_at on tokens (created_at desc);

create table if not exists trades (
  id text primary key,
  token text not null references tokens (address),
  block bigint not null,
  ts bigint not null,
  tx text not null,
  trader text not null,
  is_buy boolean not null,
  hype double precision not null,
  tokens double precision not null,
  price double precision not null
);
create index if not exists trades_token_block on trades (token, block desc);
create index if not exists trades_block on trades (block desc);
create index if not exists trades_token_ts on trades (token, ts);

create table if not exists balances (
  token text not null,
  holder text not null,
  balance numeric not null default 0,
  primary key (token, holder)
);
create index if not exists balances_token_balance on balances (token, balance desc);

-- Inserts trades once each and rolls them into the token's running stats
create or replace function record_trades(rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
declare r jsonb;
begin
  for r in select * from jsonb_array_elements(rows) loop
    insert into trades (id, token, block, ts, tx, trader, is_buy, hype, tokens, price)
    values (r->>'id', r->>'token', (r->>'block')::bigint, (r->>'ts')::bigint, r->>'tx', r->>'trader',
            (r->>'is_buy')::boolean, (r->>'hype')::float8, (r->>'tokens')::float8, (r->>'price')::float8)
    on conflict (id) do nothing;
    if found then
      update tokens set price = (r->>'price')::float8,
                        volume = volume + (r->>'hype')::float8,
                        trades = trades + 1,
                        last_trade_at = greatest(last_trade_at, (r->>'ts')::bigint)
      where address = r->>'token';
    end if;
  end loop;
end $$;

create or replace function apply_balance_deltas(rows jsonb) returns void
language plpgsql security definer set search_path = public as $$
begin
  insert into balances (token, holder, balance)
  select x->>'token', x->>'holder', sum((x->>'delta')::numeric)
  from jsonb_array_elements(rows) x
  group by 1, 2
  on conflict (token, holder) do update set balance = balances.balance + excluded.balance;
end $$;

-- A lease so only one sync runs at a time
create or replace function acquire_sync_lock(lease_ms int) returns boolean
language plpgsql security definer set search_path = public as $$
declare ok boolean;
begin
  insert into kv (key, value, updated_at) values ('lock', to_jsonb(0), now())
  on conflict (key) do update set updated_at = now()
  where kv.updated_at < now() - make_interval(secs => lease_ms / 1000.0)
  returning true into ok;
  return coalesce(ok, false);
end $$;

create or replace function release_sync_lock() returns void
language sql security definer set search_path = public as $$
  update kv set updated_at = now() - interval '1 hour' where key = 'lock';
$$;

create or replace view token_stats as
select t.*,
  coalesce(d.volume_24h, 0) as volume_24h,
  case when d.open_price is null or d.open_price = 0 then 0 else (t.price - d.open_price) / d.open_price end as change_24h,
  coalesce(h.holders, 0) as holders
from tokens t
left join lateral (
  select sum(hype) as volume_24h,
         (array_agg(price order by ts asc))[1] as open_price
  from trades tr
  where tr.token = t.address and tr.ts >= extract(epoch from now())::bigint - 86400
) d on true
left join lateral (
  select count(*) as holders from balances b where b.token = t.address and b.balance > 0
) h on true;

-- Lock everything down: no direct access for anon/authenticated roles
alter table kv enable row level security;
alter table tokens enable row level security;
alter table trades enable row level security;
alter table balances enable row level security;
revoke all on function record_trades(jsonb) from public, anon, authenticated;
revoke all on function apply_balance_deltas(jsonb) from public, anon, authenticated;
revoke all on function acquire_sync_lock(int) from public, anon, authenticated;
revoke all on function release_sync_lock() from public, anon, authenticated;

-- Public storage for token images and metadata
insert into storage.buckets (id, name, public) values ('tokens', 'tokens', true) on conflict (id) do nothing;
revoke all on token_stats from anon, authenticated;
grant execute on function record_trades(jsonb), apply_balance_deltas(jsonb), acquire_sync_lock(int), release_sync_lock() to service_role;
grant select on token_stats to service_role;
