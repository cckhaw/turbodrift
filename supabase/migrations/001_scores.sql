-- Turbo Drift global leaderboard.
-- Anonymous clients can only (a) read the `leaderboard` view and (b) call `submit_score`.
-- They cannot touch the `scores` table directly, so scores can't be edited or deleted from the browser.

create table if not exists public.world_limits (
  world       int primary key,
  min_lap_ms  int not null  -- fastest physically plausible lap (top speed + permanent boost, minus 10%)
);

insert into public.world_limits (world, min_lap_ms) values
  (1, 26000),
  (2, 30000),
  (3, 32000)
on conflict (world) do update set min_lap_ms = excluded.min_lap_ms;

create table if not exists public.scores (
  id          bigint generated always as identity primary key,
  client_id   uuid        not null,
  name        text        not null check (char_length(name) between 1 and 12),
  world       int         not null references public.world_limits (world),
  seed        int         not null check (seed between 1 and 999999999),
  lap_ms      int         not null check (lap_ms between 1000 and 600000),
  total_ms    int         not null check (total_ms between 1000 and 3600000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now(),
  unique (client_id, world, seed)
);

create index if not exists scores_board_idx on public.scores (world, seed, lap_ms);
create index if not exists scores_world_idx on public.scores (world, lap_ms);

alter table public.scores enable row level security;      -- no policies => no direct access
alter table public.world_limits enable row level security;
revoke all on public.scores, public.world_limits from anon, authenticated;

-- Public read model: no client ids.
create or replace view public.leaderboard as
  select name, world, seed, lap_ms, total_ms, updated_at from public.scores;
grant select on public.leaderboard to anon, authenticated;

-- Validated upsert that only ever improves a player's stored time.
create or replace function public.submit_score(
  p_client   uuid,
  p_name     text,
  p_world    int,
  p_seed     int,
  p_lap_ms   int,
  p_total_ms int
) returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_min int;
  v_name text := left(btrim(regexp_replace(coalesce(p_name, ''), '[[:cntrl:]]', '', 'g')), 12);
begin
  select min_lap_ms into v_min from world_limits where world = p_world;
  if v_min is null then raise exception 'unknown world'; end if;
  if v_name = '' then v_name := 'YOU'; end if;
  if p_lap_ms < v_min or p_lap_ms > 600000 then raise exception 'implausible lap time'; end if;
  if p_total_ms < p_lap_ms + 2 * v_min then raise exception 'implausible race time'; end if;

  insert into scores (client_id, name, world, seed, lap_ms, total_ms)
  values (p_client, v_name, p_world, p_seed, p_lap_ms, p_total_ms)
  on conflict (client_id, world, seed) do update
    set name       = excluded.name,
        lap_ms     = least(scores.lap_ms, excluded.lap_ms),
        total_ms   = least(scores.total_ms, excluded.total_ms),
        updated_at = now();
end;
$$;

revoke all on function public.submit_score(uuid, text, int, int, int, int) from public;
grant execute on function public.submit_score(uuid, text, int, int, int, int) to anon, authenticated;
