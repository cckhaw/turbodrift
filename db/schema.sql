-- Reference copy of the schema. The API creates it automatically on first request (api/_core.ts),
-- so running this by hand is optional.
create table if not exists scores (
  id          bigint generated always as identity primary key,
  client_id   uuid        not null,
  name        text        not null check (char_length(name) between 1 and 12),
  world       int         not null,
  seed        int         not null check (seed between 1 and 999999999),
  mode        text        not null default 'trial',
  lap_ms      int         not null check (lap_ms between 1000 and 600000),
  total_ms    int         not null check (total_ms between 1000 and 3600000),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create unique index if not exists scores_client_track_mode_idx on scores (client_id, world, seed, mode);
create index if not exists scores_board_idx on scores (world, seed, lap_ms);
create index if not exists scores_world_idx on scores (world, lap_ms);

-- cloud save (progress that follows a player via a secret sync code)
create table if not exists saves (
  code        text        primary key,
  data        jsonb       not null,
  ip_hash     text,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);
create index if not exists saves_ip_idx on saves (ip_hash, created_at);
